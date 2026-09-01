import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { AggregateDeviceSource } from "../src/core/device-sources/aggregate.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "../src/core/device-sources/device-source.js";
import { formatQualifiedId } from "../src/core/device-sources/qualified-id.js";
import type { DeviceVisibility } from "../src/core/device-visibility.js";

const logger = pino({ level: "silent" });

/** A minimal fake `DeviceVisibility` for aggregate tests that do not exercise visibility itself. */
function makeVisibility(hiddenIds: string[] = []): DeviceVisibility {
  return {
    isHidden: (qualifiedId: string) => hiddenIds.includes(qualifiedId),
  } as unknown as DeviceVisibility;
}

/** A minimal in-memory fake DeviceSource for aggregate-level testing. */
function makeFakeSource(
  id: string,
  options: {
    available?: boolean;
    devices?: DeviceDescriptor[];
    throwOnStart?: boolean;
  } = {},
): DeviceSource & { stopped: boolean; started: boolean; listeners: Set<DeviceChangeListener> } {
  const devices = options.devices ?? [];
  const listeners = new Set<DeviceChangeListener>();
  const source = {
    id,
    available: options.available ?? true,
    started: false,
    stopped: false,
    listeners,
    start: mock(() => {
      if (options.throwOnStart) throw new Error(`${id} failed to start`);
      source.started = true;
    }),
    stop: mock(() => {
      source.stopped = true;
    }),
    list: mock(() => devices),
    get: mock((deviceId: string) => devices.find((d) => d.id === deviceId)),
    command: mock(
      async (deviceId: string): Promise<DeviceCommandOutcome> =>
        devices.some((d) => d.id === deviceId) ? { status: "ok" } : { status: "not_found" },
    ),
    subscribe: mock((listener: DeviceChangeListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  return source;
}

function makeDescriptor(source: string, id: string): DeviceDescriptor {
  return {
    source,
    id,
    qualifiedId: formatQualifiedId(source, id),
    displayName: id,
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: Date.now() },
    hidden: false,
  };
}

describe("AggregateDeviceSource", () => {
  it("enumerates devices from every available source", async () => {
    const zigbee = makeFakeSource("zigbee", { devices: [makeDescriptor("zigbee", "0xaaa")] });
    const shelly = makeFakeSource("shelly", { devices: [makeDescriptor("shelly", "plug")] });
    const aggregate = new AggregateDeviceSource([zigbee, shelly], makeVisibility(), logger);
    await aggregate.start();

    const devices = aggregate.list();
    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.source).sort()).toEqual(["shelly", "zigbee"]);

    await aggregate.stop();
  });

  it("omits an unavailable source from enumeration without failing", async () => {
    const zigbee = makeFakeSource("zigbee", { available: false, devices: [] });
    const shelly = makeFakeSource("shelly", { devices: [makeDescriptor("shelly", "plug")] });
    const aggregate = new AggregateDeviceSource([zigbee, shelly], makeVisibility(), logger);
    await aggregate.start();

    expect(aggregate.list()).toHaveLength(1);
    expect(aggregate.sources()).toEqual([
      { id: "zigbee", available: false },
      { id: "shelly", available: true },
    ]);

    await aggregate.stop();
  });

  it("keeps a name collision distinct across sources by qualified id", async () => {
    const zigbee = makeFakeSource("zigbee", {
      devices: [makeDescriptor("zigbee", "office_lamp")],
    });
    const shelly = makeFakeSource("shelly", {
      devices: [makeDescriptor("shelly", "office_lamp")],
    });
    const aggregate = new AggregateDeviceSource([zigbee, shelly], makeVisibility(), logger);
    await aggregate.start();

    const a = aggregate.get(formatQualifiedId("zigbee", "office_lamp"));
    const b = aggregate.get(formatQualifiedId("shelly", "office_lamp"));
    expect(a?.source).toBe("zigbee");
    expect(b?.source).toBe("shelly");

    await aggregate.stop();
  });

  it("resolves a device by qualified identifier", async () => {
    const shelly = makeFakeSource("shelly", { devices: [makeDescriptor("shelly", "plug")] });
    const aggregate = new AggregateDeviceSource([shelly], makeVisibility(), logger);
    await aggregate.start();

    expect(aggregate.get(formatQualifiedId("shelly", "plug"))?.id).toBe("plug");
    expect(aggregate.get(formatQualifiedId("shelly", "unknown"))).toBeUndefined();
    expect(aggregate.get(formatQualifiedId("unknown-source", "x"))).toBeUndefined();

    await aggregate.stop();
  });

  it("a source failing to start is logged and reported unavailable without failing engine startup", async () => {
    const broken = makeFakeSource("broken", { throwOnStart: true });
    const ok = makeFakeSource("ok", { devices: [makeDescriptor("ok", "a")] });
    const aggregate = new AggregateDeviceSource([broken, ok], makeVisibility(), logger);

    await expect(aggregate.start()).resolves.toBeUndefined();
    expect(aggregate.list()).toHaveLength(1);

    await aggregate.stop();
  });

  it("stops only the sources that were actually started, leaving a throwing source's peers running until stop()", async () => {
    const broken = makeFakeSource("broken", { throwOnStart: true });
    const ok = makeFakeSource("ok", {});
    const aggregate = new AggregateDeviceSource([broken, ok], makeVisibility(), logger);
    await aggregate.start();

    await aggregate.stop();
    expect(ok.stopped).toBe(true);
    // `broken` never started, so it must not be asked to stop either.
    expect(broken.stopped).toBe(false);
  });

  it("dispatches a command to the owning source", async () => {
    const shelly = makeFakeSource("shelly", { devices: [makeDescriptor("shelly", "plug")] });
    const aggregate = new AggregateDeviceSource([shelly], makeVisibility(), logger);
    await aggregate.start();

    const outcome = await aggregate.command(formatQualifiedId("shelly", "plug"), { on: true });
    expect(outcome).toEqual({ status: "ok" });

    await aggregate.stop();
  });

  it("returns not_found for an unknown source in a command", async () => {
    const aggregate = new AggregateDeviceSource([], makeVisibility(), logger);
    await aggregate.start();
    const outcome = await aggregate.command(formatQualifiedId("unknown", "x"), {});
    expect(outcome).toEqual({ status: "not_found" });
    await aggregate.stop();
  });

  it("returns unavailable for a command addressed to an unavailable source", async () => {
    const zigbee = makeFakeSource("zigbee", { available: false });
    const aggregate = new AggregateDeviceSource([zigbee], makeVisibility(), logger);
    await aggregate.start();
    const outcome = await aggregate.command(formatQualifiedId("zigbee", "0xaaa"), {});
    expect(outcome).toEqual({ status: "unavailable" });
    await aggregate.stop();
  });

  it("subscribes to state changes across all sources at once", async () => {
    const zigbee = makeFakeSource("zigbee", {});
    const shelly = makeFakeSource("shelly", {});
    const aggregate = new AggregateDeviceSource([zigbee, shelly], makeVisibility(), logger);
    await aggregate.start();

    const seen: string[] = [];
    aggregate.subscribe((descriptor) => seen.push(descriptor.source));

    for (const listener of zigbee.listeners) listener(makeDescriptor("zigbee", "0xaaa"));
    for (const listener of shelly.listeners) listener(makeDescriptor("shelly", "plug"));

    expect(seen).toEqual(["zigbee", "shelly"]);

    await aggregate.stop();
  });

  it("stop() unsubscribes from every source, so no further notifications are delivered", async () => {
    const zigbee = makeFakeSource("zigbee", {});
    const aggregate = new AggregateDeviceSource([zigbee], makeVisibility(), logger);
    await aggregate.start();

    const seen: string[] = [];
    aggregate.subscribe((descriptor) => seen.push(descriptor.source));
    await aggregate.stop();

    for (const listener of zigbee.listeners) listener(makeDescriptor("zigbee", "0xaaa"));
    expect(seen).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Visibility stamping (design.md D8, D9; tasks 3.5, 3.6)
  // ---------------------------------------------------------------------------

  describe("visibility", () => {
    it("stamps hidden: true from the visibility store on list()", async () => {
      const zigbee = makeFakeSource("zigbee", { devices: [makeDescriptor("zigbee", "0xaaa")] });
      const aggregate = new AggregateDeviceSource(
        [zigbee],
        makeVisibility([formatQualifiedId("zigbee", "0xaaa")]),
        logger,
      );
      await aggregate.start();

      expect(aggregate.list()[0]?.hidden).toBe(true);
      await aggregate.stop();
    });

    it("stamps hidden: false on get() for a visible device", async () => {
      const zigbee = makeFakeSource("zigbee", { devices: [makeDescriptor("zigbee", "0xaaa")] });
      const aggregate = new AggregateDeviceSource([zigbee], makeVisibility(), logger);
      await aggregate.start();

      expect(aggregate.get(formatQualifiedId("zigbee", "0xaaa"))?.hidden).toBe(false);
      await aggregate.stop();
    });

    it("stamps hidden on a descriptor delivered to a subscriber — the path that bypasses list()", async () => {
      const zigbee = makeFakeSource("zigbee", {});
      const aggregate = new AggregateDeviceSource(
        [zigbee],
        makeVisibility([formatQualifiedId("zigbee", "0xaaa")]),
        logger,
      );
      await aggregate.start();

      const seen: (boolean | undefined)[] = [];
      aggregate.subscribe((descriptor) => seen.push(descriptor.hidden));
      for (const listener of zigbee.listeners) listener(makeDescriptor("zigbee", "0xaaa"));

      expect(seen).toEqual([true]);
      await aggregate.stop();
    });

    it("list() includes hidden devices", async () => {
      const zigbee = makeFakeSource("zigbee", { devices: [makeDescriptor("zigbee", "0xaaa")] });
      const aggregate = new AggregateDeviceSource(
        [zigbee],
        makeVisibility([formatQualifiedId("zigbee", "0xaaa")]),
        logger,
      );
      await aggregate.start();

      expect(aggregate.list()).toHaveLength(1);
      await aggregate.stop();
    });

    it("listVisible() excludes hidden devices", async () => {
      const zigbee = makeFakeSource("zigbee", {
        devices: [makeDescriptor("zigbee", "0xaaa"), makeDescriptor("zigbee", "0xbbb")],
      });
      const aggregate = new AggregateDeviceSource(
        [zigbee],
        makeVisibility([formatQualifiedId("zigbee", "0xaaa")]),
        logger,
      );
      await aggregate.start();

      const visible = aggregate.listVisible();
      expect(visible).toHaveLength(1);
      expect(visible[0]?.id).toBe("0xbbb");
      await aggregate.stop();
    });
  });
});
