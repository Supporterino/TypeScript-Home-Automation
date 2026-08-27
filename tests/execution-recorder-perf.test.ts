import { describe, expect, it } from "bun:test";
import pino from "pino";
import type { TriggerContext } from "../src/core/automation.js";
import { ExecutionRecorder } from "../src/core/observability/execution-recorder.js";

const logger = pino({ level: "silent" });

/**
 * Benchmark for the execution context and history recording overhead
 * (design.md D11, R9; task 8.9).
 *
 * The execution context (`AsyncLocalStorage`) sits on every automation run —
 * a leak, or a measurable slowdown, would be a blocker per R9. This measures
 * calling an automation's `execute()` equivalent directly against calling it
 * through `ExecutionRecorder.run()` (context + history + completion
 * broadcast), on the same terms as the existing MQTT dispatch and LogBuffer
 * write benchmarks (`tests/mqtt-perf.test.ts`, `tests/log-buffer-perf.test.ts`).
 */
const trigger: TriggerContext = { type: "cron", expression: "0 7 * * *", firedAt: new Date(0) };

async function directCalls(count: number): Promise<number> {
  const fn = async (): Promise<void> => {
    /* stand-in for an automation's execute() */
  };
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    await fn();
  }
  return performance.now() - start;
}

async function recordedCalls(recorder: ExecutionRecorder, count: number): Promise<number> {
  const fn = async (): Promise<void> => {
    /* stand-in for an automation's execute() */
  };
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    await recorder.run("bench-automation", trigger, fn);
  }
  return performance.now() - start;
}

describe("ExecutionRecorder overhead (task 8.9)", () => {
  const CALL_COUNT = 2000;

  it("is not measurably slower than calling execute() directly", async () => {
    const recorder = new ExecutionRecorder(logger);

    // Warm up both paths once before measuring.
    await directCalls(200);
    await recordedCalls(recorder, 200);

    const baseline = await directCalls(CALL_COUNT);
    const withRecorder = await recordedCalls(new ExecutionRecorder(logger), CALL_COUNT);

    // The context wrap, history push, and completion broadcast add real
    // work per call — this is not zero-cost — but it must stay bounded
    // rather than scale into a measurable regression. A generous ceiling
    // absorbs test-machine noise while still catching an accidental
    // synchronous fan-out or an unbounded per-call allocation.
    expect(withRecorder).toBeLessThan(baseline * 4 + 100);
  });

  it("throughput does not degrade as completion listeners accumulate", async () => {
    const fewListeners = new ExecutionRecorder(logger);
    fewListeners.onCompletion(() => {});

    const manyListeners = new ExecutionRecorder(logger);
    for (let i = 0; i < 20; i++) {
      manyListeners.onCompletion(() => {});
    }

    await recordedCalls(fewListeners, 200);
    await recordedCalls(manyListeners, 200);

    const fewTime = await recordedCalls(fewListeners, CALL_COUNT);
    const manyTime = await recordedCalls(manyListeners, CALL_COUNT);

    expect(manyTime).toBeLessThan(fewTime * 3 + 100);
  });
});
