/**
 * The Zigbee `DeviceSource`, layered over the `DeviceRegistry`. A device's stable
 * identity is its IEEE address, so a Zigbee2MQTT rename is invisible to a consumer
 * holding the qualified identifier.
 */

import type { Capability } from "@ts-ha/shared";
import type { ZigbeeDevice } from "@ts-ha/shared/types";
import type { Logger } from "pino";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type {
  DeviceAddedHandler,
  DeviceRegistry,
  DeviceRemovedHandler,
  DeviceStateChangeHandler,
} from "../zigbee/device-registry.js";
import { translateCommandProperties, validateCommand } from "./command-validation.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "./device-source.js";
import { qualifyDeviceId } from "./device-source.js";
import type { DeviceStateStore } from "./device-state-store.js";

export const ZIGBEE_SOURCE_ID = "zigbee";

export class ZigbeeDeviceSource implements DeviceSource {
  readonly id = ZIGBEE_SOURCE_ID;

  private readonly listeners: Set<DeviceChangeListener> = new Set();
  private readonly stateHandlers: Map<string, DeviceStateChangeHandler> = new Map();
  private readonly setChangedListeners: Set<() => void> = new Set();
  private onAddedCb: DeviceAddedHandler | null = null;
  private onRemovedCb: DeviceRemovedHandler | null = null;
  private onListAppliedCb: (() => void) | null = null;

  constructor(
    private readonly registry: DeviceRegistry | null,
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
    private readonly deviceStateStore?: DeviceStateStore,
  ) {}

  get available(): boolean {
    return this.registry !== null;
  }

  /** True once the registry has received an authoritative `bridge/devices` array. */
  get hasEnumerated(): boolean {
    return this.registry?.hasReceivedDeviceList ?? false;
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
    this.onListAppliedCb = () => {
      for (const listener of this.setChangedListeners) {
        try {
          listener();
        } catch (err) {
          this.logger.error({ err }, "Error in device set change listener");
        }
      }
    };
    this.registry.onDeviceListApplied(this.onListAppliedCb);
  }

  stop(): void {
    if (this.registry) {
      if (this.onAddedCb) this.registry.offDeviceAdded(this.onAddedCb);
      if (this.onRemovedCb) this.registry.offDeviceRemoved(this.onRemovedCb);
      if (this.onListAppliedCb) this.registry.offDeviceListApplied(this.onListAppliedCb);
      for (const [friendlyName, handler] of this.stateHandlers) {
        this.registry.offDeviceStateChange(friendlyName, handler);
      }
    }
    this.onAddedCb = null;
    this.onRemovedCb = null;
    this.onListAppliedCb = null;
    this.stateHandlers.clear();
    this.setChangedListeners.clear();
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

    const capabilities = device.definition?.exposes ?? [];
    const validation = validateCommand(capabilities, properties);
    if (!validation.ok) return { status: "invalid", error: validation.error };

    // Translate a real boolean into the capability's declared encoding before dispatch.
    this.mqtt.publishToDevice(
      device.friendly_name,
      translateCommandProperties(capabilities, properties),
    );
    return { status: "ok" };
  }

  subscribe(listener: DeviceChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to authoritative device-list changes that emit no descriptor notification. */
  onDeviceSetChanged(listener: () => void): () => void {
    this.setChangedListeners.add(listener);
    return () => this.setChangedListeners.delete(listener);
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
    // Recorded for durability/pruning: when `toDescriptor` seeded from the store, this
    // re-record writes the same state and the stored observation, leaving the seed intact.
    this.deviceStateStore?.record(descriptor.qualifiedId, descriptor.state, descriptor.observation);
    for (const listener of this.listeners) {
      try {
        listener(descriptor);
      } catch (err) {
        this.logger.error({ err, device: device.friendly_name }, "Error in device change listener");
      }
    }
  }

  private toDescriptor(device: ZigbeeDevice): DeviceDescriptor {
    const qualifiedId = qualifyDeviceId(this.id, device.ieee_address);
    const registryState = this.registry?.getDeviceState(device.friendly_name);
    // `=== undefined`, not truthiness: a real `{}` payload from the registry is a fresh
    // observation and must win over a stored seed.
    const stored =
      registryState === undefined ? this.deviceStateStore?.get(qualifiedId) : undefined;
    const state = registryState ?? stored?.state ?? {};
    const capabilities: Capability[] = device.definition?.exposes ?? [];
    return {
      source: this.id,
      id: device.ieee_address,
      qualifiedId,
      displayName: device.friendly_name,
      state,
      capabilities,
      reachable: true,
      observation: stored?.observation ?? { mode: "push", observedAt: Date.now() },
      // Stamped by `AggregateDeviceSource`; a source does not know visibility preferences.
      hidden: false,
    };
  }
}
