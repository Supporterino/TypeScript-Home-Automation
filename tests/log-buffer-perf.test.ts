import { describe, expect, it } from "bun:test";
import { LogBuffer } from "../src/core/logging/log-buffer.js";

/**
 * Benchmark for LogBuffer.write() throughput with and without a subscriber
 * (design.md D32, R9; task 5.0a).
 *
 * `write()` is pino's synchronous sink — every `logger.*` call in the engine
 * reaches it. Notification is deferred past the write call specifically so
 * adding a subscriber (the SSE event stream's log category) does not put
 * fan-out on that hot path. This test is the enforcement: it measures raw
 * `write()` throughput with zero listeners against the same throughput with a
 * listener registered, and fails on a measurable regression, on the same
 * terms as the existing MQTT dispatch benchmark (`tests/mqtt-perf.test.ts`).
 */
function entry(i: number): string {
  return JSON.stringify({ level: 30, time: Date.now(), msg: `message-${i}` });
}

function benchmarkWrites(buffer: LogBuffer, count: number): number {
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    buffer.write(entry(i));
  }
  return performance.now() - start;
}

describe("LogBuffer write() throughput", () => {
  const WRITE_COUNT = 20_000;

  it("is not measurably slower once a subscriber is registered", () => {
    const withoutSubscriber = new LogBuffer(2500);
    const withSubscriber = new LogBuffer(2500);
    withSubscriber.subscribe(() => {
      /* no-op listener; deferred notification runs off this benchmark's clock */
    });

    // Warm up both paths once before measuring.
    benchmarkWrites(withoutSubscriber, 1000);
    benchmarkWrites(withSubscriber, 1000);

    const baseline = benchmarkWrites(withoutSubscriber, WRITE_COUNT);
    const withListener = benchmarkWrites(withSubscriber, WRITE_COUNT);

    // write() only has to push new entries into an array and schedule one
    // setImmediate callback per write — the listener itself never runs
    // synchronously inside write(). A generous 2x ceiling absorbs test-machine
    // noise while still catching an accidental synchronous fan-out regression.
    expect(withListener).toBeLessThan(baseline * 2 + 50);
  });

  it("write() throughput scales linearly, not per-subscriber", () => {
    const oneListener = new LogBuffer(2500);
    oneListener.subscribe(() => {});

    const manyListeners = new LogBuffer(2500);
    for (let i = 0; i < 50; i++) {
      manyListeners.subscribe(() => {});
    }

    benchmarkWrites(oneListener, 1000);
    benchmarkWrites(manyListeners, 1000);

    const oneListenerTime = benchmarkWrites(oneListener, WRITE_COUNT);
    const manyListenersTime = benchmarkWrites(manyListeners, WRITE_COUNT);

    // Fan-out happens later, off this call stack, so registering 50 listeners
    // instead of 1 must not multiply write() latency.
    expect(manyListenersTime).toBeLessThan(oneListenerTime * 2 + 50);
  });
});
