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
import type { CreatedAccessory } from "../src/core/services/homekit-descriptor-factory.js";
import type { AccessorySink } from "../src/core/services/homekit-sources/accessory-source.js";
import type { DeviceCatalogSource as DeviceCatalogSourceClass } from "../src/core/services/homekit-sources/device-catalog-source.js";

const logger = pino({ level: "silent" });

let DeviceCatalogSource: typeof DeviceCatalogSourceClass;
let createAccessoryFromDescriptor: (
  descriptor: DeviceDescriptor,
  onSet: (properties: Record<string, unknown>) => void,
  onWarn?: (message: string, context: Record<string, unknown>) => void,
) => CreatedAccessory | null;

beforeAll(async () => {
  await import("../src/core/services/homekit-crypto-polyfill.js");
  createAccessoryFromDescriptor = (
    await import("../src/core/services/homekit-descriptor-factory.js")
  ).createAccessoryFromDescriptor;
  DeviceCatalogSource = (
    await import("../src/core/services/homekit-sources/device-catalog-source.js")
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
    const source = new DeviceCatalogSource(devices, logger, createAccessoryFromDescriptor);
    const sink = makeFakeSink();

    expect(() => source.start(sink)).not.toThrow();

    expect(sink.added.size).toBe(1);
    expect(sink.added.get("shelly:plug")).toBeDefined();
  });

  it("does not throw on the existing-accessory update path", () => {
    const devices = makeFakeDevices();
    devices.setDevices([makeDescriptor({ reachable: false })]);
    const source = new DeviceCatalogSource(devices, logger, createAccessoryFromDescriptor);
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
