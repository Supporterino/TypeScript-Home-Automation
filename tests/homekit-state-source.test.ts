import { beforeEach, describe, expect, it } from "bun:test";
import pino from "pino";
import type { CreatedAccessory } from "../src/core/services/homekit-accessory-factory.js";
import type { StateToggleConfig } from "../src/core/services/homekit-service.js";
import type { AccessorySink } from "../src/core/services/homekit-sources/accessory-source.js";
import type { StateAccessoryFactory } from "../src/core/services/homekit-sources/state-source.js";
import { StateSource } from "../src/core/services/homekit-sources/state-source.js";
import { StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });

/** A fake CreatedAccessory that records updateState calls. */
function makeFakeAccessory(): CreatedAccessory & { states: unknown[] } {
  const states: unknown[] = [];
  return {
    accessory: { UUID: "fake" } as unknown as CreatedAccessory["accessory"],
    updateState: (state) => {
      states.push(state);
    },
    states,
  };
}

function createSink(): AccessorySink & {
  added: Map<string, CreatedAccessory>;
  removed: string[];
} {
  const added = new Map<string, CreatedAccessory>();
  const removed: string[] = [];
  return {
    added,
    removed,
    add: (id, accessory) => {
      added.set(id, accessory);
    },
    remove: (id) => {
      removed.push(id);
    },
  };
}

const NIGHT_MODE: StateToggleConfig = { stateKey: "night_mode", name: "Night Mode" };

describe("StateSource", () => {
  let state: StateManager;
  let sink: ReturnType<typeof createSink>;
  let factory: StateAccessoryFactory;
  let accessoriesByKey: Map<string, ReturnType<typeof makeFakeAccessory>>;
  let onSetByKey: Map<string, (value: boolean) => void>;

  beforeEach(() => {
    state = new StateManager(logger);
    sink = createSink();
    accessoriesByKey = new Map();
    onSetByKey = new Map();
    factory = (_name, stateKey, onSet) => {
      const acc = makeFakeAccessory();
      accessoriesByKey.set(stateKey, acc);
      onSetByKey.set(stateKey, onSet);
      return acc;
    };
  });

  it("seeds an accessory from existing state and namespaces its id", () => {
    state.set("night_mode", true);
    const source = new StateSource(state, [NIGHT_MODE], logger, factory);
    source.start(sink);

    expect(accessoriesByKey.get("night_mode")?.states).toEqual([{ state: "ON" }]);
    expect(sink.added.has("state:night_mode")).toBe(true);
    source.stop();
  });

  it("defaults a missing key to OFF", () => {
    const source = new StateSource(state, [NIGHT_MODE], logger, factory);
    source.start(sink);
    expect(accessoriesByKey.get("night_mode")?.states).toEqual([{ state: "OFF" }]);
    source.stop();
  });

  it("pushes a state change into the accessory", () => {
    const source = new StateSource(state, [NIGHT_MODE], logger, factory);
    source.start(sink);

    state.set("night_mode", true);
    expect(accessoriesByKey.get("night_mode")?.states).toEqual([{ state: "OFF" }, { state: "ON" }]);

    state.set("night_mode", false);
    expect(accessoriesByKey.get("night_mode")?.states).toEqual([
      { state: "OFF" },
      { state: "ON" },
      { state: "OFF" },
    ]);
    source.stop();
  });

  it("turns the toggle OFF when a key is deleted", () => {
    state.set("night_mode", true);
    const source = new StateSource(state, [NIGHT_MODE], logger, factory);
    source.start(sink);

    state.delete("night_mode");
    expect(accessoriesByKey.get("night_mode")?.states).toEqual([{ state: "ON" }, { state: "OFF" }]);
    source.stop();
  });

  it("coerces non-boolean state values by truthiness", () => {
    state.set("night_mode", "on");
    const source = new StateSource(state, [NIGHT_MODE], logger, factory);
    source.start(sink);
    expect(accessoriesByKey.get("night_mode")?.states).toEqual([{ state: "ON" }]);
    source.stop();
  });

  it("routes onSet write-back to state.set with a real boolean", () => {
    const source = new StateSource(state, [NIGHT_MODE], logger, factory);
    source.start(sink);

    const onSet = onSetByKey.get("night_mode");
    expect(onSet).toBeDefined();
    onSet?.(true);
    expect(state.get("night_mode")).toBe(true);

    onSet?.(false);
    expect(state.get("night_mode")).toBe(false);
    source.stop();
  });

  it("warns and skips duplicate state keys", () => {
    const source = new StateSource(state, [NIGHT_MODE, NIGHT_MODE], logger, factory);
    source.start(sink);
    expect(sink.added.size).toBe(1);
    expect(sink.added.has("state:night_mode")).toBe(true);
    source.stop();
  });

  it("detaches all listeners on stop", () => {
    state.set("night_mode", true);
    const source = new StateSource(state, [NIGHT_MODE], logger, factory);
    source.start(sink);
    source.stop();

    const before = accessoriesByKey.get("night_mode")?.states.length ?? 0;
    state.set("night_mode", false);
    expect(accessoriesByKey.get("night_mode")?.states).toHaveLength(before);
  });
});
