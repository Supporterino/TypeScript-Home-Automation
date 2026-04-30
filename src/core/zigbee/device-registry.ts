import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "pino";
import type { Config } from "../../config.js";
import type { BridgeEventPayload, ZigbeeDevice } from "../../types/zigbee/bridge.js";
import type { MqttMessageHandler, MqttService } from "../mqtt/mqtt-service.js";

/**
 * Persistence options for the `DeviceRegistry`.
 *
 * When `persist` is `true`, both the device list and last-known device states
 * are saved to a JSON file on shutdown and restored on startup. Incoming MQTT
 * data always overwrites restored values on arrival, so persisted data is
 * never a source of truth — it is only a cold-start seed.
 */
export interface DeviceRegistryPersistenceOptions {
  /**
   * Whether to persist the device list and state to disk on shutdown
   * and restore them on startup.
   *
   * @default false
   */
  persist?: boolean;

  /**
   * Path to the JSON file for device registry persistence.
   * Only used when `persist` is `true`.
   *
   * @default "./device-registry.json"
   */
  filePath?: string;
}

export type DeviceStateChangeHandler = (
  state: Record<string, unknown>,
  prev: Record<string, unknown> | undefined,
) => void;

export type DeviceAddedHandler = (device: ZigbeeDevice) => void;
export type DeviceRemovedHandler = (device: ZigbeeDevice) => void;

/**
 * Human-readable name mappings for Zigbee2MQTT devices.
 *
 * Resolution order in `DeviceRegistry.getNiceName()`:
 * 1. Explicit per-device entry in `devices`
 * 2. Result of `transform(friendlyName)` if provided
 * 3. Raw `friendly_name` as-is
 *
 * @example
 * ```ts
 * const engine = createEngine({
 *   automationsDir: "...",
 *   deviceRegistry: {
 *     names: {
 *       devices: {
 *         "kitchen_motion_0x1a2b": "Kitchen Motion Sensor",
 *         "living_room_bulb": "Living Room Lamp",
 *       },
 *       transform: (name) => name.replace(/_/g, " "),
 *     },
 *   },
 * });
 * ```
 */
export interface DeviceNiceNames {
  /**
   * Per-device overrides. Key is the Zigbee2MQTT `friendly_name`,
   * value is the human-readable display name.
   */
  devices?: Record<string, string>;

  /**
   * Global fallback transform applied when no per-device entry exists.
   * Receives the raw `friendly_name` and returns a display name.
   */
  transform?: (friendlyName: string) => string;
}

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

  private readonly persist: boolean;
  private readonly filePath: string;

  constructor(
    private readonly mqtt: MqttService,
    private readonly config: Config,
    private readonly logger: Logger,
    private readonly niceNames: DeviceNiceNames = {},
    persistenceOptions: DeviceRegistryPersistenceOptions = {},
  ) {
    this.persist = persistenceOptions.persist ?? false;
    this.filePath = persistenceOptions.filePath ?? "./device-registry.json";
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Restore persisted device list and state from disk (if persistence is enabled).
   * Must be called before `start()` so that the registry is seeded before MQTT
   * subscriptions fire. Incoming MQTT data always wins over persisted data.
   */
  async load(): Promise<void> {
    if (!this.persist) return;

    try {
      const data = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(data) as {
        devices?: Record<string, ZigbeeDevice>;
        states?: Record<string, Record<string, unknown>>;
      };

      // Restore last-known device states
      for (const [name, state] of Object.entries(parsed.states ?? {})) {
        this.deviceStates.set(name, state);
      }

      // Restore device metadata and register per-device MQTT subscriptions.
      // Coordinator is never persisted, but guard anyway.
      // We do this after states so that if a state handler fires immediately
      // on subscription it already has the restored state to merge into.
      const prefix = this.config.zigbee2mqttPrefix;
      for (const device of Object.values(parsed.devices ?? {})) {
        if (device.type === "Coordinator") continue;
        this.devices.set(device.friendly_name, device);
        const { friendly_name } = device;
        const handler: MqttMessageHandler = (_topic, payload) => {
          this.handleDeviceState(friendly_name, payload);
        };
        this.mqttDeviceHandlers.set(friendly_name, handler);
        this.mqtt.subscribe(`${prefix}/${friendly_name}`, handler);
      }

      this.logger.info(
        { devices: this.devices.size, states: this.deviceStates.size, file: this.filePath },
        "Device registry restored from disk",
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger.debug(
          { file: this.filePath },
          "No persisted device registry found, starting fresh",
        );
      } else {
        this.logger.error({ err, file: this.filePath }, "Failed to load persisted device registry");
      }
    }
  }

  /**
   * Persist the current device list and state to disk (if persistence is enabled).
   * Called by the engine before `stop()` on shutdown.
   */
  async save(): Promise<void> {
    if (!this.persist) return;

    try {
      const devicesObj: Record<string, ZigbeeDevice> = {};
      for (const [name, device] of this.devices) {
        devicesObj[name] = device;
      }

      const statesObj: Record<string, Record<string, unknown>> = {};
      for (const [name, state] of this.deviceStates) {
        statesObj[name] = state;
      }

      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(
        this.filePath,
        JSON.stringify({ devices: devicesObj, states: statesObj }, null, 2),
        "utf-8",
      );

      this.logger.info(
        { devices: this.devices.size, states: this.deviceStates.size, file: this.filePath },
        "Device registry persisted to disk",
      );
    } catch (err) {
      this.logger.error({ err, file: this.filePath }, "Failed to persist device registry");
    }
  }

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

  /**
   * Return a human-readable display name for the given `friendly_name`.
   *
   * Resolution order:
   * 1. Explicit per-device entry from `DeviceNiceNames.devices`
   * 2. Result of `DeviceNiceNames.transform(friendlyName)`
   * 3. Raw `friendly_name` as-is
   *
   * Works even before the device has been seen on the network.
   */
  getNiceName(friendlyName: string): string {
    return (
      this.niceNames.devices?.[friendlyName] ??
      this.niceNames.transform?.(friendlyName) ??
      friendlyName
    );
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
      // Basic structural validation — skip malformed entries
      if (!device || typeof device !== "object" || typeof device.friendly_name !== "string") {
        continue;
      }
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
    if (!event || typeof event !== "object" || typeof event.type !== "string") {
      this.logger.warn("bridge/event payload is malformed — ignoring");
      return;
    }

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
