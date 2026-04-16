import type { Logger } from "pino";
import type { Config } from "../../config.js";
import type { BridgeEventPayload, ZigbeeDevice } from "../../types/zigbee/bridge.js";
import type { MqttMessageHandler, MqttService } from "../mqtt/mqtt-service.js";

export type DeviceStateChangeHandler = (
  state: Record<string, unknown>,
  prev: Record<string, unknown> | undefined,
) => void;

export type DeviceAddedHandler = (device: ZigbeeDevice) => void;
export type DeviceRemovedHandler = (device: ZigbeeDevice) => void;

/**
 * Discovers Zigbee2MQTT devices and tracks their state.
 *
 * When enabled, this service:
 * 1. Subscribes to `{prefix}/bridge/devices` to build a device list.
 * 2. Subscribes to `{prefix}/bridge/event` to react to join/leave events.
 * 3. Maintains per-device MQTT subscriptions to track live state.
 *
 * Device state updates are **merged** — a partial update (e.g. only `brightness`)
 * is applied on top of the previously-known state, mirroring Zigbee2MQTT behaviour.
 */
export class DeviceRegistry {
  /** Keyed by `friendly_name`. */
  private readonly devices: Map<string, ZigbeeDevice> = new Map();

  /** Last-known state per device, keyed by `friendly_name`. */
  private readonly deviceStates: Map<string, Record<string, unknown>> = new Map();

  /** Per-device state change handlers. */
  private readonly stateHandlers: Map<string, Set<DeviceStateChangeHandler>> = new Map();

  /** Handlers fired when a device is added to the registry. */
  private readonly deviceAddedHandlers: Set<DeviceAddedHandler> = new Set();

  /** Handlers fired when a device is removed from the registry. */
  private readonly deviceRemovedHandlers: Set<DeviceRemovedHandler> = new Set();

  /**
   * Active per-device MQTT handlers, keyed by `friendly_name`.
   * Stored so they can be passed to `mqtt.unsubscribe()` during cleanup.
   */
  private readonly mqttDeviceHandlers: Map<string, MqttMessageHandler> = new Map();

  /** Handler for the `bridge/devices` topic — stored for unsubscribe. */
  private bridgeDevicesHandler: MqttMessageHandler | null = null;

  /** Handler for the `bridge/event` topic — stored for unsubscribe. */
  private bridgeEventHandler: MqttMessageHandler | null = null;

  constructor(
    private readonly mqtt: MqttService,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to bridge topics and begin tracking devices.
   * Must be called after the MQTT client is connected.
   */
  start(): void {
    const prefix = this.config.zigbee2mqttPrefix;

    // Subscribe to the retained device list
    this.bridgeDevicesHandler = (_topic, payload) => {
      this.handleBridgeDevices(payload as unknown as ZigbeeDevice[]);
    };
    this.mqtt.subscribe(`${prefix}/bridge/devices`, this.bridgeDevicesHandler);

    // Subscribe to real-time join/leave events
    this.bridgeEventHandler = (_topic, payload) => {
      this.handleBridgeEvent(payload as unknown as BridgeEventPayload);
    };
    this.mqtt.subscribe(`${prefix}/bridge/event`, this.bridgeEventHandler);

    this.logger.info("Device registry started");
  }

  /**
   * Unsubscribe all topics and clear internal state.
   */
  stop(): void {
    const prefix = this.config.zigbee2mqttPrefix;

    if (this.bridgeDevicesHandler) {
      this.mqtt.unsubscribe(`${prefix}/bridge/devices`, this.bridgeDevicesHandler);
      this.bridgeDevicesHandler = null;
    }

    if (this.bridgeEventHandler) {
      this.mqtt.unsubscribe(`${prefix}/bridge/event`, this.bridgeEventHandler);
      this.bridgeEventHandler = null;
    }

    // Unsubscribe all per-device topics
    for (const [friendlyName, handler] of this.mqttDeviceHandlers) {
      this.mqtt.unsubscribe(`${prefix}/${friendlyName}`, handler);
    }

    this.mqttDeviceHandlers.clear();
    this.devices.clear();
    this.deviceStates.clear();

    this.logger.info("Device registry stopped");
  }

  // ---------------------------------------------------------------------------
  // Discovery API
  // ---------------------------------------------------------------------------

  /** Return all tracked non-coordinator devices. */
  getDevices(): ZigbeeDevice[] {
    return Array.from(this.devices.values());
  }

  /** Return a single device by `friendly_name`, or `undefined` if not found. */
  getDevice(friendlyName: string): ZigbeeDevice | undefined {
    return this.devices.get(friendlyName);
  }

  /** Return `true` if the named device is currently tracked. */
  hasDevice(friendlyName: string): boolean {
    return this.devices.has(friendlyName);
  }

  // ---------------------------------------------------------------------------
  // State API
  // ---------------------------------------------------------------------------

  /**
   * Return the last-known merged state for a device, or `undefined` if no
   * state has been received yet.
   */
  getDeviceState(friendlyName: string): Record<string, unknown> | undefined {
    return this.deviceStates.get(friendlyName);
  }

  /**
   * Register a handler that fires whenever a device's state changes.
   * The handler receives the **full merged** new state and the previous state.
   */
  onDeviceStateChange(friendlyName: string, handler: DeviceStateChangeHandler): void {
    let handlers = this.stateHandlers.get(friendlyName);
    if (!handlers) {
      handlers = new Set();
      this.stateHandlers.set(friendlyName, handlers);
    }
    handlers.add(handler);
  }

  /** Remove a previously-registered state change handler. */
  offDeviceStateChange(friendlyName: string, handler: DeviceStateChangeHandler): void {
    this.stateHandlers.get(friendlyName)?.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Device list change listeners
  // ---------------------------------------------------------------------------

  /** Register a handler called whenever a new device is added to the registry. */
  onDeviceAdded(handler: DeviceAddedHandler): void {
    this.deviceAddedHandlers.add(handler);
  }

  /** Remove a previously-registered device-added handler. */
  offDeviceAdded(handler: DeviceAddedHandler): void {
    this.deviceAddedHandlers.delete(handler);
  }

  /** Register a handler called whenever a device is removed from the registry. */
  onDeviceRemoved(handler: DeviceRemovedHandler): void {
    this.deviceRemovedHandlers.add(handler);
  }

  /** Remove a previously-registered device-removed handler. */
  offDeviceRemoved(handler: DeviceRemovedHandler): void {
    this.deviceRemovedHandlers.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Handle a payload from `{prefix}/bridge/devices`.
   * Diffs the incoming list against the current registry and subscribes /
   * unsubscribes per-device topics as needed.
   */
  private handleBridgeDevices(incoming: ZigbeeDevice[]): void {
    if (!Array.isArray(incoming)) {
      this.logger.warn("bridge/devices payload is not an array — ignoring");
      return;
    }

    // Build a set of incoming friendly names (excluding coordinators)
    const incomingMap = new Map<string, ZigbeeDevice>();
    for (const device of incoming) {
      if (device.type === "Coordinator") continue;
      incomingMap.set(device.friendly_name, device);
    }

    // Detect removals — devices in current registry but not in the new list
    for (const [friendlyName, device] of this.devices) {
      if (!incomingMap.has(friendlyName)) {
        this.removeDevice(friendlyName, device);
      }
    }

    // Detect additions and updates
    for (const [friendlyName, device] of incomingMap) {
      if (this.devices.has(friendlyName)) {
        // Update device definition in place (e.g. after rename or re-interview)
        this.devices.set(friendlyName, device);
      } else {
        this.addDevice(device);
      }
    }
  }

  /**
   * Handle a payload from `{prefix}/bridge/event`.
   * On join or leave events, re-request the full device list to keep the
   * registry consistent with the broker's authoritative state.
   */
  private handleBridgeEvent(event: BridgeEventPayload): void {
    if (event.type === "device_joined" || event.type === "device_leave") {
      this.logger.info(
        { type: event.type, friendlyName: event.data.friendly_name },
        "Bridge device event — refreshing device list",
      );
      // Request a fresh bridge/devices publish
      const prefix = this.config.zigbee2mqttPrefix;
      this.mqtt.publish(`${prefix}/bridge/request/devices`, {});
    }
  }

  /**
   * Add a device to the registry: store metadata, subscribe to its topic,
   * and fire `onDeviceAdded` listeners.
   */
  private addDevice(device: ZigbeeDevice): void {
    const { friendly_name } = device;
    const prefix = this.config.zigbee2mqttPrefix;

    this.devices.set(friendly_name, device);

    const handler: MqttMessageHandler = (_topic, payload) => {
      this.handleDeviceState(friendly_name, payload);
    };
    this.mqttDeviceHandlers.set(friendly_name, handler);
    this.mqtt.subscribe(`${prefix}/${friendly_name}`, handler);

    this.logger.debug({ friendlyName: friendly_name }, "Device added to registry");

    for (const cb of this.deviceAddedHandlers) {
      try {
        cb(device);
      } catch (err) {
        this.logger.error({ err, friendlyName: friendly_name }, "Error in onDeviceAdded handler");
      }
    }
  }

  /**
   * Remove a device from the registry: clear its state, unsubscribe from its
   * topic, and fire `onDeviceRemoved` listeners.
   */
  private removeDevice(friendlyName: string, device: ZigbeeDevice): void {
    const prefix = this.config.zigbee2mqttPrefix;

    this.devices.delete(friendlyName);
    this.deviceStates.delete(friendlyName);

    const handler = this.mqttDeviceHandlers.get(friendlyName);
    if (handler) {
      this.mqtt.unsubscribe(`${prefix}/${friendlyName}`, handler);
      this.mqttDeviceHandlers.delete(friendlyName);
    }

    this.logger.debug({ friendlyName }, "Device removed from registry");

    for (const cb of this.deviceRemovedHandlers) {
      try {
        cb(device);
      } catch (err) {
        this.logger.error({ err, friendlyName }, "Error in onDeviceRemoved handler");
      }
    }
  }

  /**
   * Merge an incoming device state payload into the current state and notify
   * any registered handlers.
   */
  private handleDeviceState(friendlyName: string, payload: Record<string, unknown>): void {
    const prev = this.deviceStates.get(friendlyName);
    const next = { ...prev, ...payload };
    this.deviceStates.set(friendlyName, next);

    const handlers = this.stateHandlers.get(friendlyName);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(next, prev);
      } catch (err) {
        this.logger.error({ err, friendlyName }, "Error in device state change handler");
      }
    }
  }
}
