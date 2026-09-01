/**
 * The Zigbee `DeviceSource`, layered over the `DeviceRegistry` (design.md
 * D2, D22; task 6.3).
 *
 * A device's stable identity is its IEEE address, which does not change
 * when Zigbee2MQTT renames it — the display name and command dispatch both
 * key on the *current* friendly name, looked up by IEEE address, so a
 * rename in Zigbee2MQTT is invisible to a consumer holding the qualified
 * identifier.
 */
import type { Logger } from "pino";
import type { Capability } from "../../types/capabilities.js";
import type { ZigbeeDevice } from "../../types/zigbee/bridge.js";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type {
  DeviceAddedHandler,
  DeviceRegistry,
  DeviceRemovedHandler,
  DeviceStateChangeHandler,
} from "../zigbee/device-registry.js";
import { validateCommand } from "./command-validation.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "./device-source.js";
import { qualifyDeviceId } from "./device-source.js";

export const ZIGBEE_SOURCE_ID = "zigbee";

export class ZigbeeDeviceSource implements DeviceSource {
  readonly id = ZIGBEE_SOURCE_ID;

  private readonly listeners: Set<DeviceChangeListener> = new Set();
  private readonly stateHandlers: Map<string, DeviceStateChangeHandler> = new Map();
  private onAddedCb: DeviceAddedHandler | null = null;
  private onRemovedCb: DeviceRemovedHandler | null = null;

  constructor(
    private readonly registry: DeviceRegistry | null,
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
  ) {}

  get available(): boolean {
    return this.registry !== null;
  }

  start(): void {
    if (!this.registry) return;

    for (const device of this.registry.getDevices()) {
      this.subscribeDevice(device);
    }

    this.onAddedCb = (device) => {
      this.subscribeDevice(device);
      this.notify(device);
    };
    this.onRemovedCb = (device) => {
      this.unsubscribeDevice(device.friendly_name);
    };
    this.registry.onDeviceAdded(this.onAddedCb);
    this.registry.onDeviceRemoved(this.onRemovedCb);
  }

  stop(): void {
    if (this.registry) {
      if (this.onAddedCb) this.registry.offDeviceAdded(this.onAddedCb);
      if (this.onRemovedCb) this.registry.offDeviceRemoved(this.onRemovedCb);
      for (const [friendlyName, handler] of this.stateHandlers) {
        this.registry.offDeviceStateChange(friendlyName, handler);
      }
    }
    this.onAddedCb = null;
    this.onRemovedCb = null;
    this.stateHandlers.clear();
    this.listeners.clear();
  }

  list(): DeviceDescriptor[] {
    if (!this.registry) return [];
    return this.registry.getDevices().map((device) => this.toDescriptor(device));
  }

  get(deviceId: string): DeviceDescriptor | undefined {
    const device = this.findByIeeeAddress(deviceId);
    return device ? this.toDescriptor(device) : undefined;
  }

  async command(
    deviceId: string,
    properties: Record<string, unknown>,
  ): Promise<DeviceCommandOutcome> {
    if (!this.registry) return { status: "unavailable" };
    const device = this.findByIeeeAddress(deviceId);
    if (!device) return { status: "not_found" };

    const validation = validateCommand(device.definition?.exposes ?? [], properties);
    if (!validation.ok) return { status: "invalid", error: validation.error };

    this.mqtt.publishToDevice(device.friendly_name, properties);
    return { status: "ok" };
  }

  subscribe(listener: DeviceChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private findByIeeeAddress(ieeeAddress: string): ZigbeeDevice | undefined {
    return this.registry?.getDevices().find((d) => d.ieee_address === ieeeAddress);
  }

  private subscribeDevice(device: ZigbeeDevice): void {
    if (!this.registry) return;
    if (this.stateHandlers.has(device.friendly_name)) return;

    const handler: DeviceStateChangeHandler = () => {
      const current = this.findByIeeeAddress(device.ieee_address);
      if (current) this.notify(current);
    };
    this.stateHandlers.set(device.friendly_name, handler);
    this.registry.onDeviceStateChange(device.friendly_name, handler);
  }

  private unsubscribeDevice(friendlyName: string): void {
    const handler = this.stateHandlers.get(friendlyName);
    if (!handler || !this.registry) return;
    this.registry.offDeviceStateChange(friendlyName, handler);
    this.stateHandlers.delete(friendlyName);
  }

  private notify(device: ZigbeeDevice): void {
    const descriptor = this.toDescriptor(device);
    for (const listener of this.listeners) {
      try {
        listener(descriptor);
      } catch (err) {
        this.logger.error({ err, device: device.friendly_name }, "Error in device change listener");
      }
    }
  }

  private toDescriptor(device: ZigbeeDevice): DeviceDescriptor {
    const state = this.registry?.getDeviceState(device.friendly_name) ?? {};
    const capabilities: Capability[] = device.definition?.exposes ?? [];
    return {
      source: this.id,
      id: device.ieee_address,
      qualifiedId: qualifyDeviceId(this.id, device.ieee_address),
      displayName: device.friendly_name,
      state,
      capabilities,
      reachable: true,
      observation: { mode: "push", observedAt: Date.now() },
      // Stamped by `AggregateDeviceSource` (design.md D8) — a source does
      // not know a user's visibility preference for its own devices.
      hidden: false,
    };
  }
}
