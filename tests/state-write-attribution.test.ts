import { describe, expect, it } from "bun:test";
import pino from "pino";
import { runInAutomationContext } from "../src/core/observability/execution-context.js";
import { ExecutionRecorder } from "../src/core/observability/execution-recorder.js";
import { wireStateWriteAttribution } from "../src/core/observability/state-write-attribution.js";
import { StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("wireStateWriteAttribution (task 8.2)", () => {
  it("attributes a write made inside an automation's execution context", () => {
    const state = new StateManager(logger, { persist: false });
    const recorder = new ExecutionRecorder(logger);
    wireStateWriteAttribution(state, recorder);

    runInAutomationContext("motion-light", () => {
      state.set("lights_on", true);
    });

    expect(recorder.getObservedWrites("motion-light").keys).toEqual(["lights_on"]);
  });

  it("attributes a write performed after an await inside the context", async () => {
    const state = new StateManager(logger, { persist: false });
    const recorder = new ExecutionRecorder(logger);
    wireStateWriteAttribution(state, recorder);

    await runInAutomationContext("motion-light", async () => {
      await delay(5);
      state.set("lights_on", true);
    });

    expect(recorder.getObservedWrites("motion-light").keys).toEqual(["lights_on"]);
  });

  it("does not attribute a write made outside any execution context (e.g. an API request)", () => {
    const state = new StateManager(logger, { persist: false });
    const recorder = new ExecutionRecorder(logger);
    wireStateWriteAttribution(state, recorder);

    state.set("lights_on", true);

    expect(recorder.getObservedWrites("motion-light").keys).toEqual([]);
    // No automation observed anything either.
    expect(recorder.getObservedWrites("").keys).toEqual([]);
  });

  it("attributes writes from concurrent runs of different automations to the correct one", async () => {
    const state = new StateManager(logger, { persist: false });
    const recorder = new ExecutionRecorder(logger);
    wireStateWriteAttribution(state, recorder);

    await Promise.all([
      runInAutomationContext("automation-a", async () => {
        await delay(8);
        state.set("key_a", 1);
      }),
      runInAutomationContext("automation-b", async () => {
        await delay(2);
        state.set("key_b", 2);
      }),
    ]);

    expect(recorder.getObservedWrites("automation-a").keys).toEqual(["key_a"]);
    expect(recorder.getObservedWrites("automation-b").keys).toEqual(["key_b"]);
  });

  it("leaves stored values and change-listener notification unchanged (with attribution wired)", () => {
    const state = new StateManager(logger, { persist: false });
    const recorder = new ExecutionRecorder(logger);
    wireStateWriteAttribution(state, recorder);

    const seen: [string, unknown, unknown][] = [];
    state.onChange("lights_on", (key, newValue, oldValue) => seen.push([key, newValue, oldValue]));

    runInAutomationContext("motion-light", () => {
      state.set("lights_on", true);
    });

    expect(state.get("lights_on")).toBe(true);
    expect(seen).toEqual([["lights_on", true, undefined]]);
  });

  it("produces identical listener behaviour whether or not attribution is wired", () => {
    const withAttribution = new StateManager(logger, { persist: false });
    wireStateWriteAttribution(withAttribution, new ExecutionRecorder(logger));
    const withoutAttribution = new StateManager(logger, { persist: false });

    const seenWith: unknown[] = [];
    const seenWithout: unknown[] = [];
    withAttribution.onChange("k", (_k, v) => seenWith.push(v));
    withoutAttribution.onChange("k", (_k, v) => seenWithout.push(v));

    withAttribution.set("k", 1);
    withoutAttribution.set("k", 1);
    withAttribution.set("k", 2);
    withoutAttribution.set("k", 2);

    expect(seenWith).toEqual(seenWithout);
    expect(withAttribution.get("k")).toBe(withoutAttribution.get("k"));
  });

  it("stops attributing after the returned unsubscribe function is called", () => {
    const state = new StateManager(logger, { persist: false });
    const recorder = new ExecutionRecorder(logger);
    const unsubscribe = wireStateWriteAttribution(state, recorder);
    unsubscribe();

    runInAutomationContext("motion-light", () => {
      state.set("lights_on", true);
    });

    expect(recorder.getObservedWrites("motion-light").keys).toEqual([]);
  });
});
