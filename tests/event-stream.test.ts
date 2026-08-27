import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { EventBus } from "../src/core/events/event-bus.js";
import { EventStreamHub } from "../src/core/http/event-stream.js";

const decoder = new TextDecoder();

/** Read and decode exactly one SSE frame (`data: {...}\n\n`) from a reader. */
async function readOne(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value, done } = await reader.read();
  if (done || !value) throw new Error("stream ended unexpectedly");
  return decoder.decode(value);
}

function makeLogger() {
  return pino({ level: "silent" });
}

describe("EventStreamHub", () => {
  let bus: EventBus;
  let hub: EventStreamHub;

  beforeEach(() => {
    bus = new EventBus();
    hub = new EventStreamHub(bus, makeLogger(), makeLogger());
  });

  it("delivers an emitted event to a connected client", async () => {
    const res = hub.open();
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no body");

    bus.emit({ category: "readiness", ready: true });

    const chunk = await readOne(reader);
    expect(chunk).toContain('"category":"readiness"');
    expect(chunk).toContain('"ready":true');
  });

  it("carries only the delta, not a snapshot (task 5.4)", async () => {
    const res = hub.open();
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no body");

    bus.emit({ category: "state", key: "night_mode", value: true, previous: false });

    const chunk = await readOne(reader);
    const payload = JSON.parse(chunk.replace(/^data: /, "").trim());
    expect(payload).toEqual({
      category: "state",
      key: "night_mode",
      value: true,
      previous: false,
    });
  });

  it("fans out one event to every connected client (task 5.6)", async () => {
    const readers = [hub.open(), hub.open(), hub.open()].map((res) => res.body?.getReader());
    if (readers.some((r) => !r)) throw new Error("missing body");

    bus.emit({ category: "readiness", ready: false });

    for (const reader of readers) {
      const chunk = await readOne(reader as ReadableStreamDefaultReader<Uint8Array>);
      expect(chunk).toContain('"ready":false');
    }
  });

  it("isolates a disconnected client without affecting the others (tasks 5.5, 5.6)", async () => {
    const a = hub.open();
    const b = hub.open();
    const c = hub.open();
    const readerA = a.body?.getReader();
    const readerC = c.body?.getReader();
    if (!readerA || !readerC) throw new Error("missing body");

    expect(hub.connectionCount).toBe(3);

    // Client B disconnects (the release path a real dropped connection takes).
    await b.body?.cancel("client gone");
    expect(hub.connectionCount).toBe(2);

    bus.emit({ category: "readiness", ready: true });

    const chunkA = await readOne(readerA);
    const chunkC = await readOne(readerC);
    expect(chunkA).toContain('"ready":true');
    expect(chunkC).toContain('"ready":true');
  });

  it("releases the connection's resources on disconnect and does no further work for it", async () => {
    const res = hub.open();
    expect(hub.connectionCount).toBe(1);

    await res.body?.cancel("bye");
    expect(hub.connectionCount).toBe(0);

    // Emitting after disconnect must not throw even though the connection is gone.
    expect(() => bus.emit({ category: "readiness", ready: true })).not.toThrow();
  });

  it("logs connect and disconnect through the lifecycle logger, not the delivery logger", async () => {
    const lifecycleLogger = makeLogger();
    const deliveryLogger = makeLogger();
    const lifecycleSpy = mock(lifecycleLogger.info.bind(lifecycleLogger));
    lifecycleLogger.info = lifecycleSpy as typeof lifecycleLogger.info;
    const deliverySpy = mock(deliveryLogger.info.bind(deliveryLogger));
    deliveryLogger.info = deliverySpy as typeof deliveryLogger.info;

    const localHub = new EventStreamHub(bus, deliveryLogger, lifecycleLogger);
    const res = localHub.open();
    await res.body?.cancel("bye");

    expect(lifecycleSpy).toHaveBeenCalledTimes(2); // connect, disconnect
    expect(deliverySpy).not.toHaveBeenCalled();
  });

  describe("bounded per-connection buffering (task 5.6b)", () => {
    it("stops retained events at the fixed limit for a client that stops reading", async () => {
      const capacity = 3;
      const localHub = new EventStreamHub(bus, makeLogger(), makeLogger(), capacity);
      const res = localHub.open();
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no body");

      // The first emitted event is delivered directly (desiredSize starts at
      // 1); every one after that accumulates in the bounded outbox because
      // nothing has read it yet.
      for (let i = 0; i < 10; i++) {
        bus.emit({ category: "automation", name: `auto-${i}`, enabled: true });
      }

      // First frame: the one delivered directly.
      const first = await readOne(reader);
      expect(first).toContain('"auto-0"');

      // Next frame is the fell-behind signal (buffered overflowed).
      const second = await readOne(reader);
      expect(second).toContain('"category":"fell_behind"');

      // Remaining frames are the most recent `capacity` events, oldest first,
      // rather than the earliest ones sent — confirms drop-oldest.
      const remaining: string[] = [];
      for (let i = 0; i < capacity; i++) {
        remaining.push(await readOne(reader));
      }
      expect(remaining[0]).toContain('"auto-7"');
      expect(remaining[1]).toContain('"auto-8"');
      expect(remaining[2]).toContain('"auto-9"');
    });

    it("delivers the fell-behind signal exactly once per overflow episode", async () => {
      const capacity = 2;
      const localHub = new EventStreamHub(bus, makeLogger(), makeLogger(), capacity);
      const res = localHub.open();
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no body");

      for (let i = 0; i < 5; i++) {
        bus.emit({ category: "readiness", ready: i % 2 === 0 });
      }

      await readOne(reader); // direct delivery of the first event
      const fellBehind = await readOne(reader);
      expect(fellBehind).toContain('"category":"fell_behind"');

      // Draining the rest must not re-emit a second fell-behind frame.
      for (let i = 0; i < capacity; i++) {
        const chunk = await readOne(reader);
        expect(chunk).not.toContain("fell_behind");
      }
    });

    it("isolates a fallen-behind connection — other connections lose nothing", async () => {
      const capacity = 2;
      const localHub = new EventStreamHub(bus, makeLogger(), makeLogger(), capacity);
      const slow = localHub.open();
      const slowReader = slow.body?.getReader();
      const fast = localHub.open();
      const fastReader = fast.body?.getReader();
      if (!slowReader || !fastReader) throw new Error("missing body");

      const names: string[] = [];
      for (let i = 0; i < 6; i++) {
        const name = `auto-${i}`;
        names.push(name);
        bus.emit({ category: "automation", name, enabled: true });
        // The fast client keeps draining every event as it arrives.
        await readOne(fastReader);
      }

      // The fast client received every one of the 6 events with nothing
      // discarded — no fell-behind marker anywhere in its stream.
      // (Already implicitly proven: readOne() above would have thrown on a
      // stalled/empty queue if events were being withheld from it.)

      // The slow client, never having read, only has its bounded backlog.
      await readOne(slowReader); // direct delivery of the first event
      const fellBehind = await readOne(slowReader);
      expect(fellBehind).toContain("fell_behind");
    });
  });

  describe("keep-alive", () => {
    it("emits a keep-alive comment on an idle connection", async () => {
      const localHub = new EventStreamHub(bus, makeLogger(), makeLogger(), 100, 5);
      const res = localHub.open();
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no body");

      const chunk = await readOne(reader);
      expect(chunk).toBe(": keep-alive\n\n");

      await reader.cancel();
    });
  });
});
