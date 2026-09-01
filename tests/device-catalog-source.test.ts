/**
 * Regression test for the HomeKit reachability crash (fix-homekit-reachability-crash).
 *
 * `DeviceCatalogSource.addOrUpdate()` used to call
 * `accessory.updateReachability(descriptor.reachable)` before the accessory
 * was bridged. hap-nodejs's `Accessory.prototype.updateReachability` throws
 * `"Cannot update reachability on non-bridged accessory!"` whenever
 * `accessory.bridged` is `false`, which it always is at that point — so this
 * threw for the very first device on every startup, aborting
 * `HomekitService.onStart()` before `bridge.publish()` was ever reached.
 *
 * Unlike `tests/homekit-service.test.ts`, which wholesale-mocks
 * `DeviceCatalogSource` (and never calls the real
 * `createAccessoryFromDescriptor` or a real `hap-nodejs` `Accessory`), this
 * test drives the real `DeviceCatalogSource` — through its public
 * `start(sink)` and change-subscription surface, exactly how
 * `HomekitService` uses it — against the real `createAccessoryFromDescriptor`
 * and a real `hap-nodejs` `Accessory`. That is the exact seam the crash
 * lived in.
 *
 * `hap-nodejs` requires the `chacha20-poly1305` cipher, which Bun does not
 * implement natively, so the crypto polyfill must be imported before
 * `hap-nodejs` (or anything that imports it) is loaded — see
 * `tests/homekit-uuid-characterisation.test.ts` for the same pattern. All
 * imports below are dynamic and sequenced in `beforeAll` to preserve that
 * ordering; a static top-level import would let the bundler hoist
 * `hap-nodejs` ahead of the polyfill.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import pino from "pino";
import type { AggregateDeviceSource } from "../src/core/device-sources/aggregate.js";
import type {
  DeviceChangeListener,
  DeviceDescriptor,
} from "../src/core/device-sources/device-source.js";
import { DeviceVisibility } from "../src/core/device-visibility.js";
import type { CreatedAccessory } from "../src/core/services/homekit-descriptor-factory.js";
import type { AccessorySink } from "../src/core/services/homekit-sources/accessory-source.js";
import type { DeviceCatalogSource as DeviceCatalogSourceClass } from "../src/core/services/homekit-sources/device-catalog-source.js";
import { StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });

let DeviceCatalogSource: typeof DeviceCatalogSourceClass;
let createAccessoryFromDescriptor: (
  descriptor: DeviceDescriptor,
  onSet: (properties: Record<string, unknown>) => void,
  onWarn?: (message: string, context: Record<string, unknown>) => void,
) => CreatedAccessory | null;
/**
 * A second, cache-busted binding to the same class, used only by the
 * visibility and group-bridging describes below.
 *
 * Every top-level `mock.module()` call across the whole suite runs during
 * Bun's file-load phase, before any `beforeAll` — and `mock.module()`
 * overwrites a module's exports in place, permanently, for every future
 * plain `import()` of that resolved specifier for the rest of the process.
 * `homekit-service.test.ts` mocks this exact module path with a
 * `hidden`/`listVisible`-unaware test double, so a plain import here would
 * silently receive that mock instead of the real class whenever both files
 * run in the same `bun test` invocation. A cache-busting query string
 * produces a distinct resolved specifier the mock never registered against,
 * forcing a fresh load of the real file. The describes below pair it with a
 * fake accessory factory rather than the real `createAccessoryFromDescriptor`,
 * so they never touch `hap-nodejs` — itself mocked the same way by
 * `homekit-service.test.ts`, with no bare-specifier equivalent of this
 * cache-busting trick available.
 */
let RealDeviceCatalogSource: typeof DeviceCatalogSourceClass;

beforeAll(async () => {
  await import("../src/core/services/homekit-crypto-polyfill.js");
  createAccessoryFromDescriptor = (
    await import("../src/core/services/homekit-descriptor-factory.js")
  ).createAccessoryFromDescriptor;
  DeviceCatalogSource = (
    await import("../src/core/services/homekit-sources/device-catalog-source.js")
  ).DeviceCatalogSource;
  RealDeviceCatalogSource = (
    await import(`../src/core/services/homekit-sources/device-catalog-source.js?real=${Date.now()}`)
  ).DeviceCatalogSource;
});

function makeDescriptor(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    source: "shelly",
    id: "plug",
    qualifiedId: "shelly:plug",
    displayName: "office_plug",
    state: {},
    capabilities: [
      {
        kind: "switch",
        property: "on",
        access: { readable: true, writable: true },
        valueType: "boolean",
      },
    ],
    reachable: false,
    observation: { mode: "push", observedAt: Date.now() },
    hidden: false,
    ...overrides,
  };
}

/**
 * A minimal fake `AggregateDeviceSource`: `list()` reflects whatever
 * `setDevices()` last set, and `subscribe()` hands back a controllable
 * emitter — the same shape `HomekitService`'s real `AggregateDeviceSource`
 * exposes to `DeviceCatalogSource`.
 */
function makeFakeDevices(): AggregateDeviceSource & {
  setDevices: (d: DeviceDescriptor[]) => void;
  emit: (d: DeviceDescriptor) => void;
} {
  let live: DeviceDescriptor[] = [];
  const listeners = new Set<DeviceChangeListener>();
  return {
    list: () => live,
    listVisible: () => live.filter((d) => !d.hidden),
    get: (qualifiedId: string) => live.find((d) => d.qualifiedId === qualifiedId),
    subscribe: (listener: DeviceChangeListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    command: async () => ({ status: "ok" }) as const,
    setDevices: (d: DeviceDescriptor[]) => {
      live = d;
    },
    emit: (d: DeviceDescriptor) => {
      for (const l of listeners) l(d);
    },
  } as unknown as AggregateDeviceSource & {
    setDevices: (d: DeviceDescriptor[]) => void;
    emit: (d: DeviceDescriptor) => void;
  };
}

/** A minimal fake `DeviceVisibility` — no listeners fire unless explicitly invoked. */
function makeFakeVisibility(): DeviceVisibility {
  return {
    isHidden: () => false,
    onChange: () => {},
    offChange: () => {},
  } as unknown as DeviceVisibility;
}

/** Tracks which accessories were added/removed, mirroring `HomekitService.createSink()` minus the real `Bridge`. */
function makeFakeSink(): AccessorySink & { added: Map<string, CreatedAccessory> } {
  const added = new Map<string, CreatedAccessory>();
  return {
    added,
    add: (id, accessory) => added.set(id, accessory),
    remove: (id) => added.delete(id),
  };
}

describe("DeviceCatalogSource.addOrUpdate() (regression: reachability crash)", () => {
  it("does not throw when adding a fresh device descriptor with reachable: false", () => {
    const devices = makeFakeDevices();
    devices.setDevices([makeDescriptor({ reachable: false })]);
    const source = new DeviceCatalogSource(
      devices,
      makeFakeVisibility(),
      logger,
      createAccessoryFromDescriptor,
    );
    const sink = makeFakeSink();

    expect(() => source.start(sink)).not.toThrow();

    expect(sink.added.size).toBe(1);
    expect(sink.added.get("shelly:plug")).toBeDefined();
  });

  it("does not throw on the existing-accessory update path", () => {
    const devices = makeFakeDevices();
    devices.setDevices([makeDescriptor({ reachable: false })]);
    const source = new DeviceCatalogSource(
      devices,
      makeFakeVisibility(),
      logger,
      createAccessoryFromDescriptor,
    );
    const sink = makeFakeSink();

    source.start(sink);
    expect(sink.added.size).toBe(1);

    // A subsequent change notification for the same qualifiedId drives
    // `addOrUpdate()` down the existing-accessory branch — the one that used
    // to call `existing.accessory.updateReachability(...)` before the
    // accessory was ever bridged.
    expect(() => {
      devices.emit(makeDescriptor({ reachable: true, state: { on: true } }));
    }).not.toThrow();

    expect(sink.added.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Visibility filtering (design.md D9, D10; tasks 4.1-4.3)
// ---------------------------------------------------------------------------

/**
 * A fake accessory factory standing in for `createAccessoryFromDescriptor`:
 * deterministic UUID per qualified id (so identity across a hide/unhide
 * cycle is checkable), and `null` for a descriptor with no capabilities —
 * standing in for "capabilities map to no HomeKit service" without touching
 * `hap-nodejs`/`capability-detection.ts` (both exercised directly elsewhere:
 * `tests/homekit-descriptor-factory.test.ts` and
 * `tests/device-source-zigbee-group.test.ts`).
 */
function makeFakeFactory(): (descriptor: DeviceDescriptor) => CreatedAccessory | null {
  return (descriptor) => {
    if (descriptor.capabilities.length === 0) return null;
    return {
      accessory: {
        UUID: `fake-${descriptor.qualifiedId}`,
      } as unknown as CreatedAccessory["accessory"],
      updateState: () => {},
    };
  };
}

describe("DeviceCatalogSource visibility", () => {
  it("never bridges an already-hidden device at startup (task 4.1)", () => {
    const stateManager = new StateManager(logger, { persist: false });
    const visibility = new DeviceVisibility(stateManager, logger);
    visibility.hide("shelly:plug");

    const devices = makeFakeDevices();
    devices.setDevices([makeDescriptor({ hidden: true })]);
    const source = new RealDeviceCatalogSource(devices, visibility, logger, makeFakeFactory());
    const sink = makeFakeSink();

    source.start(sink);

    expect(sink.added.size).toBe(0);
  });

  it("removes the accessory when the device is hidden, with no intervening device notification (task 4.2)", () => {
    const stateManager = new StateManager(logger, { persist: false });
    const visibility = new DeviceVisibility(stateManager, logger);

    const devices = makeFakeDevices();
    devices.setDevices([makeDescriptor({ hidden: false })]);
    const source = new RealDeviceCatalogSource(devices, visibility, logger, makeFakeFactory());
    const sink = makeFakeSink();

    source.start(sink);
    expect(sink.added.size).toBe(1);

    // Hiding is a StateManager write, producing no device notification of
    // its own — the accessory must be removed by the visibility
    // subscription directly, not by waiting for the device to report
    // something.
    devices.setDevices([makeDescriptor({ hidden: true })]);
    visibility.hide("shelly:plug");

    expect(sink.added.size).toBe(0);
  });

  it("adds the accessory back when the device is unhidden (task 4.2)", () => {
    const stateManager = new StateManager(logger, { persist: false });
    const visibility = new DeviceVisibility(stateManager, logger);
    visibility.hide("shelly:plug");

    const devices = makeFakeDevices();
    devices.setDevices([makeDescriptor({ hidden: true })]);
    const source = new RealDeviceCatalogSource(devices, visibility, logger, makeFakeFactory());
    const sink = makeFakeSink();

    source.start(sink);
    expect(sink.added.size).toBe(0);

    devices.setDevices([makeDescriptor({ hidden: false })]);
    visibility.unhide("shelly:plug");

    expect(sink.added.size).toBe(1);
  });

  it("the re-added accessory's derived UUID matches the original — no re-pairing (task 4.3)", () => {
    const stateManager = new StateManager(logger, { persist: false });
    const visibility = new DeviceVisibility(stateManager, logger);

    const devices = makeFakeDevices();
    devices.setDevices([makeDescriptor({ hidden: false })]);
    const source = new RealDeviceCatalogSource(devices, visibility, logger, makeFakeFactory());
    const sink = makeFakeSink();

    source.start(sink);
    const originalUuid = sink.added.get("shelly:plug")?.accessory.UUID;
    expect(originalUuid).toBeDefined();

    devices.setDevices([makeDescriptor({ hidden: true })]);
    visibility.hide("shelly:plug");
    expect(sink.added.size).toBe(0);

    devices.setDevices([makeDescriptor({ hidden: false })]);
    visibility.unhide("shelly:plug");

    expect(sink.added.get("shelly:plug")?.accessory.UUID).toBe(originalUuid);
  });
});

// ---------------------------------------------------------------------------
// Zigbee groups are bridged like any other device (specs/homekit; task 4.4)
// ---------------------------------------------------------------------------

describe("DeviceCatalogSource with a Zigbee group descriptor", () => {
  function makeGroupDescriptor(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
    return {
      source: "zigbee-group",
      id: "5",
      qualifiedId: "zigbee-group:5",
      displayName: "lamp",
      state: { state: "ON", brightness: 100 },
      capabilities: [
        {
          kind: "light",
          access: { readable: true, writable: true },
          valueType: "composite",
          features: [
            {
              kind: "binary",
              property: "state",
              access: { readable: true, writable: true },
              valueType: "boolean",
              valueOn: "ON",
              valueOff: "OFF",
            },
            {
              kind: "numeric",
              property: "brightness",
              access: { readable: true, writable: true },
              valueType: "numeric",
              range: { min: 0, max: 254 },
            },
          ],
        },
      ],
      reachable: true,
      observation: { mode: "push", observedAt: Date.now() },
      hidden: false,
      memberQualifiedIds: ["zigbee:0xa", "zigbee:0xb"],
      ...overrides,
    };
  }

  it("bridges a group with mappable (light-shaped) capabilities as one accessory", () => {
    const devices = makeFakeDevices();
    devices.setDevices([makeGroupDescriptor()]);
    const source = new RealDeviceCatalogSource(
      devices,
      makeFakeVisibility(),
      logger,
      makeFakeFactory(),
    );
    const sink = makeFakeSink();

    source.start(sink);

    expect(sink.added.size).toBe(1);
    expect(sink.added.get("zigbee-group:5")).toBeDefined();
  });

  it("dispatches one command to the group through the aggregate, not one per member", async () => {
    const commandCalls: { qualifiedId: string; properties: Record<string, unknown> }[] = [];
    const devices = {
      list: () => [makeGroupDescriptor()],
      listVisible: () => [makeGroupDescriptor()],
      get: (qid: string) => (qid === "zigbee-group:5" ? makeGroupDescriptor() : undefined),
      subscribe: () => () => {},
      command: async (qualifiedId: string, properties: Record<string, unknown>) => {
        commandCalls.push({ qualifiedId, properties });
        return { status: "ok" } as const;
      },
    } as unknown as AggregateDeviceSource;

    // A fake accessory factory — DeviceCatalogSource's own onSet wiring
    // (forwarding to `devices.command(descriptor.qualifiedId, ...)`) is what
    // this test exercises, not accessory-building itself (already covered
    // by `tests/homekit-descriptor-factory.test.ts`).
    let capturedOnSet: ((properties: Record<string, unknown>) => void) | null = null;
    const fakeFactory = (
      descriptor: DeviceDescriptor,
      onSet: (properties: Record<string, unknown>) => void,
    ): CreatedAccessory | null => {
      capturedOnSet = onSet;
      return {
        accessory: {
          UUID: `fake-${descriptor.qualifiedId}`,
        } as unknown as CreatedAccessory["accessory"],
        updateState: () => {},
      };
    };

    const source = new RealDeviceCatalogSource(devices, makeFakeVisibility(), logger, fakeFactory);
    const sink = makeFakeSink();
    source.start(sink);

    expect(sink.added.size).toBe(1);
    expect(capturedOnSet).not.toBeNull();

    (capturedOnSet as unknown as (p: Record<string, unknown>) => void)({ state: "ON" });
    // Command dispatch is async (`void this.devices.command(...).catch(...)`).
    await Promise.resolve();

    expect(commandCalls).toHaveLength(1);
    expect(commandCalls[0]).toEqual({ qualifiedId: "zigbee-group:5", properties: { state: "ON" } });
  });

  it("skips a group whose intersected capabilities map to no HomeKit service, and logs it", () => {
    const devices = makeFakeDevices();
    devices.setDevices([makeGroupDescriptor({ capabilities: [] })]);
    const source = new RealDeviceCatalogSource(
      devices,
      makeFakeVisibility(),
      logger,
      makeFakeFactory(),
    );
    const sink = makeFakeSink();

    source.start(sink);

    expect(sink.added.size).toBe(0);
  });
});
