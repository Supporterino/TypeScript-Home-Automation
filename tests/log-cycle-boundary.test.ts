import { describe, expect, it } from "bun:test";
import pino from "pino";
import { createStreamOnlyLogger } from "../src/core/engine.js";
import { EventBus } from "../src/core/events/event-bus.js";
import { EventStreamHub } from "../src/core/http/event-stream.js";
import { LogBuffer } from "../src/core/logging/log-buffer.js";

/**
 * Asserts the log-cycle guard as a boundary, not a per-call-site review
 * (design.md D32, R21; task 5.0d).
 *
 * The delivery path — fan-out, per-connection overflow eviction, the
 * fell-behind signal, payload serialisation, failing-client isolation — logs
 * through a stdout-only instance, precisely so that a log it produces can
 * never become another entry in the buffer the log category itself
 * delivers. This test exercises the delivery path's actual overflow-eviction
 * warning (a real, deterministic member of the reachable set R21 names
 * explicitly — "the per-connection overflow eviction and fell-behind
 * signal"), with a counting `LogBuffer` standing in for "assert the buffer
 * received nothing" from that call.
 */
describe("log-cycle boundary (design.md D32, R21)", () => {
  it("the delivery path's own logging never reaches the LogBuffer it would otherwise feed", () => {
    let writeCount = 0;
    class CountingLogBuffer extends LogBuffer {
      override write(chunk: string): boolean {
        writeCount++;
        return super.write(chunk);
      }
    }

    const logBuffer = new CountingLogBuffer(100);
    // The primary logger writes to the buffer — this is deliberate: it is
    // what the log category (and /api/logs) reads from.
    const primaryLogger = pino({ level: "info" }, logBuffer);
    // The delivery-path logger is the independently-constructed, stdout-only
    // instance from engine.ts (task 5.0b) — never a child of primaryLogger.
    const deliveryLogger = createStreamOnlyLogger("info");

    const bus = new EventBus();
    const hub = new EventStreamHub(
      bus,
      deliveryLogger,
      primaryLogger.child({ service: "sse" }),
      /* bufferCapacity */ 2,
    );

    const res = hub.open();
    writeCount = 0; // ignore the "connected" lifecycle log above this line

    // A connection that never reads, forced past its bounded buffer: this
    // reaches `deliveryLogger.warn()` inside the delivery path (the overflow
    // eviction / fell-behind warning), by construction, every time.
    for (let i = 0; i < 10; i++) {
      bus.emit({ category: "readiness", ready: i % 2 === 0 });
    }

    // The delivery path logged a warning (proven by the fell-behind signal
    // being observable at all — see event-stream.test.ts), yet the buffer
    // that the log category reads from received nothing from it.
    expect(writeCount).toBe(0);

    void res.body?.cancel();
  });

  it("the lifecycle logger, by contrast, does reach the LogBuffer", async () => {
    let writeCount = 0;
    class CountingLogBuffer extends LogBuffer {
      override write(chunk: string): boolean {
        writeCount++;
        return super.write(chunk);
      }
    }

    const logBuffer = new CountingLogBuffer(100);
    const primaryLogger = pino({ level: "info" }, logBuffer);
    const deliveryLogger = createStreamOnlyLogger("info");
    const bus = new EventBus();
    const hub = new EventStreamHub(bus, deliveryLogger, primaryLogger.child({ service: "sse" }));

    writeCount = 0;
    const res = hub.open(); // "connected" — lifecycle logger, reaches the buffer
    expect(writeCount).toBeGreaterThan(0);

    const before = writeCount;
    await res.body?.cancel(); // "disconnected" — also lifecycle
    expect(writeCount).toBeGreaterThan(before);
  });
});
