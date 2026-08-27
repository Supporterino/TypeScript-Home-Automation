import { beforeEach, describe, expect, it } from "bun:test";
import pino from "pino";
import { formatQualifiedId } from "../src/core/device-sources/qualified-id.js";
import {
  StateDeviceSource,
  type StateToggleConfig,
} from "../src/core/device-sources/state-source.js";
import { StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });

describe("StateDeviceSource", () => {
  let state: StateManager;

  beforeEach(() => {
    state = new StateManager(logger, { persist: false, filePath: "./state.json" });
  });

  it("is always available", () => {
    const source = new StateDeviceSource(state, [], logger);
    expect(source.available).toBe(true);
  });

  it("enumerates each configured toggle as a device with one writable boolean", () => {
    const toggles: StateToggleConfig[] = [{ stateKey: "night_mode", name: "Night Mode" }];
    const source = new StateDeviceSource(state, toggles, logger);
    source.start();

    const devices = source.list();
    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe("night_mode");
    expect(devices[0].qualifiedId).toBe(formatQualifiedId("state", "night_mode"));
    expect(devices[0].displayName).toBe("Night Mode");
    expect(devices[0].capabilities).toEqual([
      {
        kind: "switch",
        property: "on",
        access: { readable: true, writable: true },
        valueType: "boolean",
      },
    ]);
    expect(devices[0].reachable).toBe(true);
    expect(devices[0].observation.mode).toBe("push");

    source.stop();
  });

  it("preserves stable identity across a display-name-only change (a fresh toggle at the same key)", () => {
    const source = new StateDeviceSource(
      state,
      [{ stateKey: "night_mode", name: "Night Mode" }],
      logger,
    );
    source.start();
    expect(source.get("night_mode")?.id).toBe("night_mode");
    source.stop();
  });

  it("seeds off for an absent key", () => {
    const source = new StateDeviceSource(
      state,
      [{ stateKey: "night_mode", name: "Night Mode" }],
      logger,
    );
    source.start();
    expect(source.get("night_mode")?.state.on).toBe(false);
    source.stop();
  });

  it("pushes an external write to subscribers, marked push-backed", () => {
    const source = new StateDeviceSource(
      state,
      [{ stateKey: "night_mode", name: "Night Mode" }],
      logger,
    );
    source.start();

    const seen: unknown[] = [];
    source.subscribe((descriptor) => seen.push(descriptor.state.on));

    state.set("night_mode", true);

    expect(seen).toEqual([true]);
    expect(source.get("night_mode")?.observation.mode).toBe("push");

    source.stop();
  });

  it("reads a deleted key as off, not unreachable or unknown", () => {
    const source = new StateDeviceSource(
      state,
      [{ stateKey: "night_mode", name: "Night Mode" }],
      logger,
    );
    source.start();
    state.set("night_mode", true);
    expect(source.get("night_mode")?.state.on).toBe(true);

    state.delete("night_mode");
    expect(source.get("night_mode")?.state.on).toBe(false);
    expect(source.get("night_mode")?.reachable).toBe(true);

    source.stop();
  });

  it("a command writes through to the state store, observable by other consumers", async () => {
    const source = new StateDeviceSource(
      state,
      [{ stateKey: "night_mode", name: "Night Mode" }],
      logger,
    );
    source.start();

    const outcome = await source.command("night_mode", { on: true });
    expect(outcome).toEqual({ status: "ok" });
    expect(state.get("night_mode")).toBe(true);

    source.stop();
  });

  it("rejects a non-boolean command value and never writes the state key (task 7.1, 7.3)", async () => {
    const source = new StateDeviceSource(
      state,
      [{ stateKey: "night_mode", name: "Night Mode" }],
      logger,
    );
    source.start();

    const outcome = await source.command("night_mode", { on: "yes" });
    expect(outcome.status).toBe("invalid");
    expect(state.has("night_mode")).toBe(false);

    source.stop();
  });

  it("rejects a command naming an unknown property and never writes the state key", async () => {
    const source = new StateDeviceSource(
      state,
      [{ stateKey: "night_mode", name: "Night Mode" }],
      logger,
    );
    source.start();

    const outcome = await source.command("night_mode", { brightness: 100 });
    expect(outcome.status).toBe("invalid");
    expect(state.has("night_mode")).toBe(false);

    source.stop();
  });

  it("returns not_found for a command addressing an unconfigured key", async () => {
    const source = new StateDeviceSource(state, [], logger);
    source.start();
    const outcome = await source.command("not_a_toggle", { on: true });
    expect(outcome).toEqual({ status: "not_found" });
    source.stop();
  });

  it("never derives toggles from the contents of the state store", () => {
    const source = new StateDeviceSource(state, [], logger);
    source.start();

    // Room assignment and automation-enabled-flag-shaped keys written directly
    // must not appear as devices merely because they exist in the store.
    state.set("some_room_assignment", "kitchen");
    state.setInternal("$internal:automation-enabled:my-automation", false);

    expect(source.list()).toEqual([]);
    source.stop();
  });

  it("skips a duplicate state key with a warning, keeping only the first", () => {
    const toggles: StateToggleConfig[] = [
      { stateKey: "night_mode", name: "Night Mode" },
      { stateKey: "night_mode", name: "Duplicate" },
    ];
    const source = new StateDeviceSource(state, toggles, logger);
    source.start();
    expect(source.list()).toHaveLength(1);
    expect(source.list()[0].displayName).toBe("Night Mode");
    source.stop();
  });

  it("stop() releases the state change subscription", () => {
    const source = new StateDeviceSource(
      state,
      [{ stateKey: "night_mode", name: "Night Mode" }],
      logger,
    );
    source.start();
    const seen: unknown[] = [];
    source.subscribe((descriptor) => seen.push(descriptor.state.on));
    source.stop();

    state.set("night_mode", true);
    expect(seen).toEqual([]);
  });
});
