import type { Logger } from "pino";
import type { StateChangeHandler, StateManager } from "../../state/state-manager.js";
import type { CreatedAccessory } from "../homekit-accessory-factory.js";
import type { StateToggleConfig } from "../homekit-service.js";
import type { AccessorySink, AccessorySource } from "./accessory-source.js";

/** Factory signature for building a HomeKit switch from a state toggle config. */
export type StateAccessoryFactory = (
  name: string,
  stateKey: string,
  onSet: (value: boolean) => void,
) => CreatedAccessory;

/**
 * An {@link AccessorySource} that bridges configured `StateManager` boolean
 * keys as HomeKit switch toggles.
 *
 * On `start(sink)` it builds one accessory per configured toggle, seeds it from
 * the current state value (truthy → ON, absent key → OFF), subscribes to
 * `StateManager.onChange` so state changes are pushed into the accessory, and
 * routes HomeKit write-back to `StateManager.set`. `stop()` detaches every
 * subscribed change listener.
 */
export class StateSource implements AccessorySource {
  readonly name = "state";

  private sink: AccessorySink | null = null;

  /** Maps state key → CreatedAccessory (for cleanup). */
  private readonly accessories: Map<string, CreatedAccessory> = new Map();

  /** Per-key change handlers keyed by state key (for cleanup). */
  private readonly handlers: Map<string, StateChangeHandler> = new Map();

  constructor(
    private readonly state: StateManager,
    private readonly toggles: StateToggleConfig[],
    private readonly logger: Logger,
    private readonly buildAccessory: StateAccessoryFactory,
  ) {}

  start(sink: AccessorySink): void {
    this.sink = sink;

    const seen = new Set<string>();
    for (const toggle of this.toggles) {
      if (seen.has(toggle.stateKey)) {
        this.logger.warn({ stateKey: toggle.stateKey }, "Duplicate state toggle key — skipping");
        continue;
      }
      seen.add(toggle.stateKey);
      this.addToggle(toggle);
    }
  }

  stop(): void {
    for (const [stateKey, handler] of this.handlers) {
      this.state.offChange(stateKey, handler);
    }
    this.handlers.clear();
    this.accessories.clear();
    this.sink = null;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private addToggle(toggle: StateToggleConfig): void {
    if (!this.sink) return;

    const { stateKey, name } = toggle;

    const created = this.buildAccessory(name, stateKey, (value) => {
      this.state.set(stateKey, Boolean(value));
    });

    this.accessories.set(stateKey, created);

    // Seed from the current value (absent key coerces to OFF).
    const current = this.state.get(stateKey, false);
    created.updateState({ state: current ? "ON" : "OFF" });

    // Push future state changes (including delete → OFF) into the accessory.
    const handler: StateChangeHandler = (_key, newValue) => {
      created.updateState({ state: newValue ? "ON" : "OFF" });
    };
    this.handlers.set(stateKey, handler);
    this.state.onChange(stateKey, handler);

    this.sink.add(`${this.name}:${stateKey}`, created);

    this.logger.debug(
      { stateKey, uuid: created.accessory.UUID },
      "State toggle HomeKit accessory added",
    );
  }
}
