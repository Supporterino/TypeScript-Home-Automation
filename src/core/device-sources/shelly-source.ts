/**
 * The Shelly `DeviceSource` (design.md D3, D22; tasks 6.7, 6.7b).
 *
 * Preserves the transport split already established for the HomeKit-facing
 * Shelly source: an MQTT-transport device is push-backed from its
 * `NotifyStatus` and `online` (LWT) topics and excluded from polling; an
 * HTTP-transport device is refreshed on a configurable interval. Devices
 * registered after the source has started are picked up without a restart.
 *
 * Shelly publishes no capability schema, so each device's description comes
 * from `shellyCapabilitiesFor()` — an authored, per-type description that
 * satisfies the rich descriptor requirement in full.
 */
import type { Logger } from "pino";
import type {
  ShellyCoverStatus,
  ShellyDeviceType,
  ShellySwitchStatus,
} from "../../types/shelly.js";
import type { MqttMessageHandler, MqttService } from "../mqtt/mqtt-service.js";
import type { ShellyDevice, ShellyService } from "../services/shelly-service.js";
import { validateCommand } from "./command-validation.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceObservation,
  DeviceSource,
} from "./device-source.js";
import { qualifyDeviceId } from "./device-source.js";
import { shellyCapabilitiesFor } from "./shelly-capabilities.js";

export const SHELLY_SOURCE_ID = "shelly";

/** Default poll interval for HTTP-transport Shelly devices, in milliseconds. */
export const DEFAULT_SHELLY_SOURCE_POLL_MS = 10000;

/** Per-device tracked runtime state, normalised to the shared property names in `shelly-capabilities.ts`. */
interface TrackedShellyState {
  state: Record<string, unknown>;
  reachable: boolean;
  observation: DeviceObservation;
}

/** Per-device MQTT subscription handles, tracked so `stop()` can unsubscribe them. */
interface MqttSubscriptionHandles {
  eventsTopic: string;
  eventsHandler: MqttMessageHandler;
  onlineTopic: string;
  onlineHandler: MqttMessageHandler;
}

export class ShellyDeviceSource implements DeviceSource {
  readonly id = SHELLY_SOURCE_ID;

  private readonly listeners: Set<DeviceChangeListener> = new Set();
  private readonly tracked: Map<string, TrackedShellyState> = new Map();
  private readonly mqttSubscriptions: Map<string, MqttSubscriptionHandles> = new Map();
  private onRegisteredCb: ((device: ShellyDevice) => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly shelly: ShellyService | null,
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = DEFAULT_SHELLY_SOURCE_POLL_MS,
  ) {}

  get available(): boolean {
    return this.shelly !== null;
  }

  start(): void {
    if (!this.shelly) return;

    for (const device of this.shelly.getDevices()) {
      this.addDevice(device);
    }

    this.onRegisteredCb = (device) => this.addDevice(device);
    this.shelly.onDeviceRegistered(this.onRegisteredCb);

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.onRegisteredCb && this.shelly) {
      this.shelly.offDeviceRegistered(this.onRegisteredCb);
    }
    this.onRegisteredCb = null;
    for (const name of Array.from(this.mqttSubscriptions.keys())) {
      this.removeMqttSubscriptions(name);
    }
    this.tracked.clear();
    this.listeners.clear();
  }

  list(): DeviceDescriptor[] {
    if (!this.shelly) return [];
    return this.shelly.getDevices().map((device) => this.toDescriptor(device));
  }

  get(deviceId: string): DeviceDescriptor | undefined {
    const device = this.shelly?.getDevices().find((d) => d.name === deviceId);
    return device ? this.toDescriptor(device) : undefined;
  }

  async command(
    deviceId: string,
    properties: Record<string, unknown>,
  ): Promise<DeviceCommandOutcome> {
    if (!this.shelly) return { status: "unavailable" };
    const device = this.shelly.getDevices().find((d) => d.name === deviceId);
    if (!device) return { status: "not_found" };

    const validation = validateCommand(shellyCapabilitiesFor(device.type), properties);
    if (!validation.ok) return { status: "invalid", error: validation.error };

    try {
      if (device.type === "cover") {
        if (typeof properties.position === "number") {
          await this.shelly.coverGoToPosition(device.name, properties.position);
        }
      } else if (typeof properties.on === "boolean") {
        if (properties.on) {
          await this.shelly.turnOn(device.name);
        } else {
          await this.shelly.turnOff(device.name);
        }
      }
    } catch (err) {
      this.logger.error({ err, device: device.name }, "Shelly command dispatch failed");
      throw err;
    }
    return { status: "ok" };
  }

  subscribe(listener: DeviceChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private addDevice(device: ShellyDevice): void {
    if (this.tracked.has(device.name)) return;

    this.tracked.set(device.name, {
      state: {},
      reachable: true,
      observation:
        device.transport === "mqtt"
          ? { mode: "push", observedAt: Date.now() }
          : { mode: "polled", observedAt: Date.now(), refreshIntervalMs: this.pollIntervalMs },
    });

    if (device.transport === "mqtt" && device.topicPrefix) {
      this.addMqttSubscriptions(device);
    }
  }

  private addMqttSubscriptions(device: ShellyDevice): void {
    const topicPrefix = device.topicPrefix as string;
    const eventsTopic = `${topicPrefix}/events/rpc`;
    const onlineTopic = `${topicPrefix}/online`;

    const eventsHandler: MqttMessageHandler = (_topic, payload) => {
      this.handleNotifyStatus(device, payload as Record<string, unknown>);
    };
    const onlineHandler: MqttMessageHandler = (_topic, payload) => {
      this.handleOnline(device, payload as unknown);
    };

    this.mqtt.subscribe(eventsTopic, eventsHandler);
    this.mqtt.subscribe(onlineTopic, onlineHandler);

    this.mqttSubscriptions.set(device.name, {
      eventsTopic,
      eventsHandler,
      onlineTopic,
      onlineHandler,
    });
  }

  private removeMqttSubscriptions(deviceName: string): void {
    const handles = this.mqttSubscriptions.get(deviceName);
    if (!handles) return;
    this.mqtt.unsubscribe(handles.eventsTopic, handles.eventsHandler);
    this.mqtt.unsubscribe(handles.onlineTopic, handles.onlineHandler);
    this.mqttSubscriptions.delete(deviceName);
  }

  private handleNotifyStatus(device: ShellyDevice, payload: Record<string, unknown>): void {
    if (payload?.method !== "NotifyStatus") return;
    const params = payload.params;
    if (params === null || typeof params !== "object") {
      this.logger.warn(
        { device: device.name, payload },
        "Received malformed Shelly NotifyStatus (missing params) — skipping",
      );
      return;
    }

    const componentKey = device.type === "cover" ? "cover:0" : "switch:0";
    const component = (params as Record<string, unknown>)[componentKey];
    if (component === undefined || component === null || typeof component !== "object") {
      return;
    }

    const state = this.normalize(device.type, component as Record<string, unknown>);
    this.updateTracked(device, { state, observation: { mode: "push", observedAt: Date.now() } });
  }

  private handleOnline(device: ShellyDevice, payload: unknown): void {
    if (typeof payload !== "boolean") {
      this.logger.warn(
        { device: device.name, payload },
        "Received malformed Shelly online payload — skipping",
      );
      return;
    }
    this.updateTracked(device, { reachable: payload });
  }

  /**
   * One poll tick: iterate the *live* list of HTTP-transport devices only —
   * MQTT-transport devices are bridged via push status/presence instead —
   * fetch each device's status, normalize it, and notify. Per-device errors
   * are caught, logged, and marked unreachable so one unreachable device
   * cannot abort the tick or block the others.
   */
  private async poll(): Promise<void> {
    if (!this.shelly) return;
    for (const device of this.shelly.getDevices()) {
      if (device.transport !== "http") continue;

      try {
        const raw =
          device.type === "cover"
            ? await this.shelly.getCoverStatus(device.name)
            : await this.shelly.getStatus(device.name);
        const state = this.normalize(device.type, raw as unknown as Record<string, unknown>);
        this.updateTracked(device, {
          state,
          reachable: true,
          observation: {
            mode: "polled",
            observedAt: Date.now(),
            refreshIntervalMs: this.pollIntervalMs,
          },
        });
      } catch (err) {
        this.logger.error({ err, device: device.name }, "Shelly poll failed for device — skipping");
        this.updateTracked(device, { reachable: false });
      }
    }
  }

  private normalize(type: ShellyDeviceType, raw: Record<string, unknown>): Record<string, unknown> {
    if (type === "cover") {
      const cover = raw as unknown as ShellyCoverStatus;
      return { position: cover.current_pos, state: cover.state };
    }
    const sw = raw as unknown as ShellySwitchStatus;
    return { on: sw.output, power: sw.apower, voltage: sw.voltage, current: sw.current };
  }

  private updateTracked(device: ShellyDevice, patch: Partial<TrackedShellyState>): void {
    const existing = this.tracked.get(device.name) ?? {
      state: {},
      reachable: true,
      observation: { mode: "polled" as const, observedAt: Date.now() },
    };
    const updated: TrackedShellyState = {
      state: patch.state ?? existing.state,
      reachable: patch.reachable ?? existing.reachable,
      observation: patch.observation ?? existing.observation,
    };
    this.tracked.set(device.name, updated);
    this.notify(device);
  }

  private notify(device: ShellyDevice): void {
    const descriptor = this.toDescriptor(device);
    for (const listener of this.listeners) {
      try {
        listener(descriptor);
      } catch (err) {
        this.logger.error({ err, device: device.name }, "Error in device change listener");
      }
    }
  }

  private toDescriptor(device: ShellyDevice): DeviceDescriptor {
    const tracked = this.tracked.get(device.name) ?? {
      state: {},
      reachable: true,
      observation: { mode: "polled" as const, observedAt: Date.now() },
    };
    return {
      source: this.id,
      id: device.name,
      qualifiedId: qualifyDeviceId(this.id, device.name),
      displayName: device.name,
      state: tracked.state,
      capabilities: shellyCapabilitiesFor(device.type),
      reachable: tracked.reachable,
      observation: tracked.observation,
    };
  }
}
