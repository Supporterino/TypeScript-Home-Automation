/**
 * The Nanoleaf `DeviceSource` (design.md D17, D22; tasks 6.5, 6.6).
 *
 * Nanoleaf has no push transport, so every device is refreshed on a
 * configurable interval; one unreachable device is marked unreachable and
 * logged without disrupting the refresh cycle for the others.
 *
 * The effect list is described as an enumerated writable capability whose
 * permitted values are the device's own reported effect list, refreshed
 * whenever that list changes — so the generic renderer needs no
 * Nanoleaf-specific handling to present it as a select control.
 */

import type { Capability } from "@ts-ha/shared";
import type { Logger } from "pino";
import type { NanoleafService } from "../services/nanoleaf-service.js";
import { validateCommand } from "./command-validation.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceObservation,
  DeviceSource,
} from "./device-source.js";
import { qualifyDeviceId } from "./device-source.js";
import type { DeviceStateStore } from "./device-state-store.js";

export const NANOLEAF_SOURCE_ID = "nanoleaf";

/** Default poll interval for Nanoleaf devices, in milliseconds. */
export const DEFAULT_NANOLEAF_SOURCE_POLL_MS = 10000;

interface TrackedNanoleafState {
  state: Record<string, unknown>;
  effects: string[];
  reachable: boolean;
  observation: DeviceObservation;
}

function nanoleafCapabilities(effects: string[]): Capability[] {
  return [
    {
      kind: "switch",
      property: "on",
      access: { readable: true, writable: true },
      valueType: "boolean",
      valueOn: true,
      valueOff: false,
    },
    {
      kind: "numeric",
      property: "brightness",
      access: { readable: true, writable: true },
      valueType: "numeric",
      range: { min: 0, max: 100 },
    },
    {
      kind: "numeric",
      property: "hue",
      access: { readable: true, writable: true },
      valueType: "numeric",
      range: { min: 0, max: 360 },
    },
    {
      kind: "numeric",
      property: "saturation",
      access: { readable: true, writable: true },
      valueType: "numeric",
      range: { min: 0, max: 100 },
    },
    {
      kind: "enum",
      property: "effect",
      access: { readable: true, writable: true },
      valueType: "enum",
      permittedValues: effects,
    },
  ];
}

export class NanoleafDeviceSource implements DeviceSource {
  readonly id = NANOLEAF_SOURCE_ID;

  private readonly listeners: Set<DeviceChangeListener> = new Set();
  private readonly tracked: Map<string, TrackedNanoleafState> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly nanoleaf: NanoleafService | null,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = DEFAULT_NANOLEAF_SOURCE_POLL_MS,
    private readonly deviceStateStore?: DeviceStateStore,
  ) {}

  get available(): boolean {
    return this.nanoleaf !== null;
  }

  start(): void {
    if (!this.nanoleaf) return;

    void this.poll();
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.tracked.clear();
    this.listeners.clear();
  }

  list(): DeviceDescriptor[] {
    if (!this.nanoleaf) return [];
    return this.nanoleaf.getDevices().map((name) => this.toDescriptor(name));
  }

  get(deviceId: string): DeviceDescriptor | undefined {
    if (!this.nanoleaf?.getDevices().includes(deviceId)) return undefined;
    return this.toDescriptor(deviceId);
  }

  async command(
    deviceId: string,
    properties: Record<string, unknown>,
  ): Promise<DeviceCommandOutcome> {
    if (!this.nanoleaf) return { status: "unavailable" };
    if (!this.nanoleaf.getDevices().includes(deviceId)) return { status: "not_found" };

    // The effect capability's permitted values are this device's own current
    // effect list, not a static schema, so validation uses the tracked list
    // rather than the fixed capabilities `toDescriptor()` would build.
    const effects = this.tracked.get(deviceId)?.effects ?? [];
    const validation = validateCommand(nanoleafCapabilities(effects), properties);
    if (!validation.ok) return { status: "invalid", error: validation.error };

    if (typeof properties.on === "boolean") {
      if (properties.on) {
        await this.nanoleaf.turnOn(deviceId);
      } else {
        await this.nanoleaf.turnOff(deviceId);
      }
    }
    if (typeof properties.brightness === "number") {
      await this.nanoleaf.setBrightness(deviceId, properties.brightness);
    }
    if (typeof properties.hue === "number" && typeof properties.saturation === "number") {
      await this.nanoleaf.setColor(deviceId, properties.hue, properties.saturation);
    }
    if (typeof properties.effect === "string") {
      await this.nanoleaf.setEffect(deviceId, properties.effect);
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

  /**
   * One poll tick over every registered device. Per-device errors are caught,
   * logged, and marked unreachable so one unreachable device cannot abort
   * the tick or block the others being refreshed.
   */
  private async poll(): Promise<void> {
    if (!this.nanoleaf) return;
    for (const name of this.nanoleaf.getDevices()) {
      try {
        const [nanoleafState, effects, currentEffect] = await Promise.all([
          this.nanoleaf.getState(name),
          this.nanoleaf.getEffects(name),
          this.nanoleaf.getCurrentEffect(name),
        ]);

        const state: Record<string, unknown> = {
          on: nanoleafState.on?.value ?? false,
          brightness: nanoleafState.brightness?.value,
          hue: nanoleafState.hue?.value,
          saturation: nanoleafState.sat?.value,
          effect: currentEffect,
        };

        const observation: DeviceObservation = {
          mode: "polled",
          observedAt: Date.now(),
          refreshIntervalMs: this.pollIntervalMs,
        };
        this.tracked.set(name, {
          state,
          effects,
          reachable: true,
          observation,
        });
        // Record the poll's observation at the point it is made, never on a
        // read (design.md D2).
        this.deviceStateStore?.record(qualifyDeviceId(this.id, name), state, observation);
        this.notify(name);
      } catch (err) {
        this.logger.error({ err, device: name }, "Nanoleaf poll failed for device — skipping");
        // A failed poll makes no observation: keep the last-known state and its
        // original observation — restored from the store when the device has
        // none in memory — rather than stamping a new observedAt or wiping the
        // state (design.md D4).
        const existing = this.trackedFor(name);
        this.tracked.set(name, {
          state: existing.state,
          effects: existing.effects,
          reachable: false,
          observation: existing.observation,
        });
        this.notify(name);
      }
    }
  }

  private notify(name: string): void {
    const descriptor = this.toDescriptor(name);
    for (const listener of this.listeners) {
      try {
        listener(descriptor);
      } catch (err) {
        this.logger.error({ err, device: name }, "Error in device change listener");
      }
    }
  }

  /**
   * The tracked state for a device, falling back to the durable store's
   * last-known record when the device has no in-memory observation yet
   * (design.md D2, D4). A restored record's state and observation are used
   * verbatim — observedAt stays the time it was recorded, never the read
   * time, so a restored value reads as last-known rather than live.
   */
  private trackedFor(name: string): TrackedNanoleafState {
    const tracked = this.tracked.get(name);
    if (tracked) return tracked;
    const restored = this.deviceStateStore?.get(qualifyDeviceId(this.id, name));
    return {
      state: restored?.state ?? {},
      effects: [],
      // Reachability is not persisted — design.md D1 scopes a record to state +
      // observation — so a restored device seeds as reachable until its next
      // observation reports otherwise.
      reachable: true,
      observation: restored?.observation ?? {
        mode: "polled",
        observedAt: Date.now(),
        refreshIntervalMs: this.pollIntervalMs,
      },
    };
  }

  private toDescriptor(name: string): DeviceDescriptor {
    const tracked = this.trackedFor(name);
    return {
      source: this.id,
      id: name,
      qualifiedId: qualifyDeviceId(this.id, name),
      displayName: name,
      state: tracked.state,
      capabilities: nanoleafCapabilities(tracked.effects),
      reachable: tracked.reachable,
      observation: tracked.observation,
      // Stamped by `AggregateDeviceSource` (design.md D8) — a source does
      // not know a user's visibility preference for its own devices.
      hidden: false,
    };
  }
}
