import { describe, expect, it } from "bun:test";
import {
  type CoalescedOutcome,
  CommandCoalescer,
  coalescingKey,
} from "../src/core/web-ui/app/lib/command-coalescing.js";

/** A deferred send: resolves only once `resolve()` is called, so tests can control ordering. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("coalescingKey", () => {
  it("combines qualified id and property", () => {
    expect(coalescingKey("zigbee:0xabc", "brightness")).toBe("zigbee:0xabc:brightness");
  });
});

describe("CommandCoalescer", () => {
  it("sends immediately when nothing is outstanding for the key", async () => {
    let sent: unknown;
    const coalescer = new CommandCoalescer<number, "ok">((_key, value) => {
      sent = value;
      return Promise.resolve("ok");
    });

    const outcomes: CoalescedOutcome<"ok">[] = [];
    coalescer.request("a", 1, (o) => outcomes.push(o));

    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toBe(1);
    expect(outcomes).toEqual([{ status: "sent", result: "ok" }]);
  });

  it("keeps at most one command outstanding across a burst, issuing only the latest value", async () => {
    const sentValues: number[] = [];
    const first = deferred<"ok">();
    let callCount = 0;

    const coalescer = new CommandCoalescer<number, "ok">((_key, value) => {
      callCount++;
      sentValues.push(value);
      if (callCount === 1) return first.promise;
      return Promise.resolve("ok");
    });

    const outcomes: CoalescedOutcome<"ok">[][] = [[], [], [], []];
    coalescer.request("dev:brightness", 10, (o) => outcomes[0]?.push(o));
    coalescer.request("dev:brightness", 20, (o) => outcomes[1]?.push(o));
    coalescer.request("dev:brightness", 30, (o) => outcomes[2]?.push(o));
    coalescer.request("dev:brightness", 40, (o) => outcomes[3]?.push(o));

    // Only the first call actually issued a send synchronously; requests 2
    // and 3 were superseded before ever being sent, and request 4 is the
    // one queued behind the outstanding call.
    expect(callCount).toBe(1);
    expect(sentValues).toEqual([10]);
    expect(outcomes[1]).toEqual([{ status: "superseded" }]);
    expect(outcomes[2]).toEqual([{ status: "superseded" }]);
    expect(outcomes[3]).toEqual([]); // still queued, not superseded

    first.resolve("ok");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Once the first settles, the latest queued value (40) is issued — 20
    // and 30 are never sent at all.
    expect(callCount).toBe(2);
    expect(sentValues).toEqual([10, 40]);
    expect(outcomes[0]).toEqual([{ status: "sent", result: "ok" }]);
    expect(outcomes[3]).toEqual([{ status: "sent", result: "ok" }]);
  });

  it("lets only the latest token remain isLatest after being superseded", () => {
    const first = deferred<"ok">();
    const coalescer = new CommandCoalescer<number, "ok">(() => first.promise);

    const tokenA = coalescer.request("dev:pos", 1, () => {});
    const tokenB = coalescer.request("dev:pos", 2, () => {});

    expect(coalescer.isLatest("dev:pos", tokenA)).toBe(false);
    expect(coalescer.isLatest("dev:pos", tokenB)).toBe(true);
  });

  it("does not block a different device or property", async () => {
    const first = deferred<"ok">();
    const sentKeys: string[] = [];
    const coalescer = new CommandCoalescer<number, "ok">((key, _value) => {
      sentKeys.push(key);
      if (key === "dev-a:brightness") return first.promise;
      return Promise.resolve("ok");
    });

    coalescer.request("dev-a:brightness", 1, () => {});
    coalescer.request("dev-b:brightness", 1, () => {});

    // The second device's command is issued immediately, without waiting
    // for the first device's outstanding command to settle.
    expect(sentKeys).toEqual(["dev-a:brightness", "dev-b:brightness"]);
  });

  it("reports isOutstanding only while a send for that key is in flight", async () => {
    const first = deferred<"ok">();
    const coalescer = new CommandCoalescer<number, "ok">(() => first.promise);

    expect(coalescer.isOutstanding("dev:pos")).toBe(false);
    coalescer.request("dev:pos", 1, () => {});
    expect(coalescer.isOutstanding("dev:pos")).toBe(true);

    first.resolve("ok");
    await Promise.resolve();
    await Promise.resolve();
    expect(coalescer.isOutstanding("dev:pos")).toBe(false);
  });

  it("surfaces a rejected send as sent_error rather than throwing", async () => {
    const coalescer = new CommandCoalescer<number, "ok">(() => Promise.reject(new Error("boom")));
    const outcomes: CoalescedOutcome<"ok">[] = [];
    coalescer.request("dev:pos", 1, (o) => outcomes.push(o));

    await Promise.resolve();
    await Promise.resolve();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.status).toBe("sent_error");
  });
});
