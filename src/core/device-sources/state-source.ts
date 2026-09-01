/**
 * The state-toggle `DeviceSource` (design.md D19; tasks 6.8–6.11).
 *
 * Promotes a `StateManager` boolean toggle to an ordinary device: its stable
 * identity is the state key, its capability is one writable boolean, and its
 * liveness is push-backed and always reachable, since its backing store is
 * in-process. Toggles are declared explicitly; the source never derives them
 * from the contents of the state store, so keys the engine writes for its
 * own purposes — room assignments, automation enabled flags — are never
 * presented as user-facing devices. This holds whether or not the HomeKit
 * bridge is enabled, since this source has no dependency on it.
 */
import type { Logger } from "pino";
import type { Capability } from "../../types/capabilities.js";
import type { StateChangeHandler, StateManager } from "../state/state-manager.js";
import { validateCommand } from "./command-validation.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "./device-source.js";
import { qualifyDeviceId } from "./device-source.js";

export const STATE_SOURCE_ID = "state";

/** A boolean `StateManager` key exposed as a device. */
export interface StateToggleConfig {
  /** `StateManager` key to expose. */
  stateKey: string;
  /** Display name. */
  name: string;
}

const TOGGLE_CAPABILITIES: Capability[] = [
  {
    kind: "switch",
    property: "on",
    access: { readable: true, writable: true },
    valueType: "boolean",
    valueOn: true,
    valueOff: false,
  },
];

export class StateDeviceSource implements DeviceSource {
  readonly id = STATE_SOURCE_ID;

  private readonly listeners: Set<DeviceChangeListener> = new Set();
  private readonly handlers: Map<string, StateChangeHandler> = new Map();
  private readonly displayNames: Map<string, string> = new Map();

  constructor(
    private readonly state: StateManager,
    private readonly toggles: StateToggleConfig[],
    private readonly logger: Logger,
  ) {}

  /** Always available: the backing store is in-process and never absent. */
  get available(): boolean {
    return true;
  }

  start(): void {
    const seen = new Set<string>();
    for (const toggle of this.toggles) {
      if (seen.has(toggle.stateKey)) {
        this.logger.warn({ stateKey: toggle.stateKey }, "Duplicate state toggle key — skipping");
        continue;
      }
      seen.add(toggle.stateKey);
      this.displayNames.set(toggle.stateKey, toggle.name);

      const handler: StateChangeHandler = () => this.notify(toggle.stateKey);
      this.handlers.set(toggle.stateKey, handler);
      this.state.onChange(toggle.stateKey, handler);
    }
  }

  stop(): void {
    for (const [stateKey, handler] of this.handlers) {
      this.state.offChange(stateKey, handler);
    }
    this.handlers.clear();
    this.displayNames.clear();
    this.listeners.clear();
  }

  list(): DeviceDescriptor[] {
    return Array.from(this.displayNames.keys()).map((stateKey) => this.toDescriptor(stateKey));
  }

  get(deviceId: string): DeviceDescriptor | undefined {
    if (!this.displayNames.has(deviceId)) return undefined;
    return this.toDescriptor(deviceId);
  }

  async command(
    deviceId: string,
    properties: Record<string, unknown>,
  ): Promise<DeviceCommandOutcome> {
    if (!this.displayNames.has(deviceId)) return { status: "not_found" };

    const validation = validateCommand(TOGGLE_CAPABILITIES, properties);
    if (!validation.ok) return { status: "invalid", error: validation.error };

    if (typeof properties.on === "boolean") {
      this.state.set(deviceId, properties.on);
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

  private notify(stateKey: string): void {
    const descriptor = this.toDescriptor(stateKey);
    for (const listener of this.listeners) {
      try {
        listener(descriptor);
      } catch (err) {
        this.logger.error({ err, stateKey }, "Error in device change listener");
      }
    }
  }

  private toDescriptor(stateKey: string): DeviceDescriptor {
    // An absent or deleted value reads as off, never as unreachable/unknown.
    const on = Boolean(this.state.get(stateKey, false));
    return {
      source: this.id,
      id: stateKey,
      qualifiedId: qualifyDeviceId(this.id, stateKey),
      displayName: this.displayNames.get(stateKey) ?? stateKey,
      state: { on },
      capabilities: TOGGLE_CAPABILITIES,
      reachable: true,
      observation: { mode: "push", observedAt: Date.now() },
    };
  }
}
