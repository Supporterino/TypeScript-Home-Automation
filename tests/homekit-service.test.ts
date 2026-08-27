/**
 * Tests for HomekitService acting as a source-agnostic bridge host (task 6.16).
 *
 * Focuses on the AccessorySink wiring: accessories added/removed by the
 * single `DeviceCatalogSource` are bridged/unbridged on the underlying HAP
 * bridge, keyed by qualified id — driven by a real `AggregateDeviceSource`
 * over fake `DeviceSource`s, exactly the shape `Engine.devices` exposes.
 *
 * `homekit-sources/device-catalog-source.js` is mocked wholesale with a fake
 * that never calls the (real, dynamically-imported)
 * `createAccessoryFromDescriptor` — this file tests the bridge/sink and
 * lifecycle wiring, not accessory-building correctness (covered by
 * `tests/homekit-descriptor-factory.test.ts`). This is deliberate: unlike
 * mocking `homekit-descriptor-factory.js` or `hap-nodejs` themselves — both
 * loaded by other test files too, and Bun's `mock.module` replacements are
 * process-global for the whole test run once a module is first evaluated —
 * `device-catalog-source.js` is imported by no other test file, so this mock
 * cannot leak into or be leaked into by anything else.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";

const bridged: unknown[] = [];
const unbridged: unknown[] = [];
// When set, MockBridge.publish rejects with this error (reset per test).
let publishError: Error | null = null;

class MockBridge {
  UUID: string;
  constructor(_name: string, uuidStr: string) {
    this.UUID = uuidStr;
  }
  addBridgedAccessory(acc: unknown) {
    bridged.push(acc);
  }
  removeBridgedAccessory(acc: unknown) {
    unbridged.push(acc);
  }
  async publish(_info: unknown) {
    if (publishError) throw publishError;
  }
  async unpublish() {}
}

// `homekit-accessory-factory.js` is transitively loaded (unused — see the
// `device-catalog-source.js` mock below) via a static
// `import { Accessory, Characteristic, Service, uuid } from "hap-nodejs"`.
// ESM validates named imports exist at link time even when never called at
// runtime, so every one of these must be present, even as an inert stand-in.
const inertProxy = new Proxy(
  {},
  { get: () => new Proxy(() => {}, { get: () => new Proxy(() => {}, {}) }) },
);

mock.module("hap-nodejs", () => ({
  Bridge: MockBridge,
  Accessory: class {},
  Service: inertProxy,
  Characteristic: inertProxy,
  HAPStorage: { setCustomStoragePath: (_p: string) => {} },
  Categories: { LIGHTBULB: 5, BRIDGE: 2, SENSOR: 10, SWITCH: 8, OTHER: 1 },
  uuid: { generate: (s: string) => `uuid-${s}` },
}));

// Avoid loading the real crypto polyfill machinery.
mock.module("../src/core/services/homekit-crypto-polyfill.js", () => ({}));

// A fake DeviceCatalogSource: bridges one trivial fake accessory per device
// the aggregate reports, without ever calling the injected accessory
// factory — so it does not matter which hap-nodejs mock that factory's own
// (transitive, real) import happens to bind to elsewhere in the suite.
let accessoryCounter = 0;
mock.module("../src/core/services/homekit-sources/device-catalog-source.js", () => ({
  DeviceCatalogSource: class {
    readonly name = "device-catalog";
    private sink: { add: (id: string, acc: unknown) => void; remove: (id: string) => void } | null =
      null;
    private readonly known = new Set<string>();
    private unsubscribe: (() => void) | null = null;

    constructor(
      private readonly devices: {
        list: () => { qualifiedId: string }[];
        subscribe: (l: (d: unknown) => void) => () => void;
      },
    ) {}

    start(sink: { add: (id: string, acc: unknown) => void; remove: (id: string) => void }) {
      this.sink = sink;
      this.reconcile();
      this.unsubscribe = this.devices.subscribe(() => this.reconcile());
    }

    stop() {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.known.clear();
      this.sink = null;
    }

    private reconcile() {
      if (!this.sink) return;
      const live = new Set(this.devices.list().map((d) => d.qualifiedId));
      for (const qualifiedId of live) {
        if (!this.known.has(qualifiedId)) {
          this.known.add(qualifiedId);
          this.sink.add(qualifiedId, {
            accessory: {
              UUID: `acc-${qualifiedId}-${accessoryCounter++}`,
              updateReachability: () => {},
            },
            updateState: () => {},
          });
        }
      }
      for (const qualifiedId of Array.from(this.known)) {
        if (!live.has(qualifiedId)) {
          this.known.delete(qualifiedId);
          this.sink.remove(qualifiedId);
        }
      }
    }
  },
}));

import { AggregateDeviceSource } from "../src/core/device-sources/aggregate.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "../src/core/device-sources/device-source.js";
import { formatQualifiedId } from "../src/core/device-sources/qualified-id.js";
import { HomekitService } from "../src/core/services/homekit-service.js";
import type { CoreContext } from "../src/core/services/service-plugin.js";

const logger = pino({ level: "silent" });
const ctx = {} as unknown as CoreContext;

/** A minimal in-memory fake DeviceSource, mirroring the aggregate test's helper. */
function makeFakeSource(
  id: string,
  devices: DeviceDescriptor[] = [],
): DeviceSource & {
  emit: (descriptor: DeviceDescriptor) => void;
  setDevices: (d: DeviceDescriptor[]) => void;
} {
  let live = devices;
  const listeners = new Set<DeviceChangeListener>();
  return {
    id,
    available: true,
    start: () => {},
    stop: () => {},
    list: () => live,
    get: (deviceId: string) => live.find((d) => d.id === deviceId),
    command: async (): Promise<DeviceCommandOutcome> => ({ status: "ok" }),
    subscribe: (listener: DeviceChangeListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (descriptor: DeviceDescriptor) => {
      for (const l of listeners) l(descriptor);
    },
    setDevices: (d: DeviceDescriptor[]) => {
      live = d;
    },
  };
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
  };
}

describe("HomekitService (source host)", () => {
  beforeEach(() => {
    bridged.length = 0;
    unbridged.length = 0;
    accessoryCounter = 0;
    publishError = null;
  });

  it("rejects the old stateToggles location, naming the new one (design.md D19)", () => {
    const devices = new AggregateDeviceSource([], logger);
    expect(
      () =>
        new HomekitService(logger, devices, {
          pinCode: "031-45-154",
          stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
        }),
    ).toThrow(/stateToggles/);
    expect(
      () =>
        new HomekitService(logger, devices, {
          pinCode: "031-45-154",
          stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
        }),
    ).toThrow(/createEngine/);
  });

  it("starts and publishes even with an empty device inventory", async () => {
    const devices = new AggregateDeviceSource([], logger);
    const svc = new HomekitService(logger, devices, { pinCode: "031-45-154" });
    await svc.onStart(ctx);
    expect(svc.getStatus().running).toBe(true);
    expect(bridged).toHaveLength(0);
    await svc.onStop();
  });

  it("bridges accessories from the aggregate device accessor through the sink", async () => {
    const shelly = makeFakeSource("shelly", [makeDescriptor("shelly", "plug")]);
    const devices = new AggregateDeviceSource([shelly], logger);
    await devices.start();

    const svc = new HomekitService(logger, devices, { pinCode: "031-45-154" });
    await svc.onStart(ctx);

    expect(svc.getStatus().running).toBe(true);
    expect(bridged).toHaveLength(1);
    expect(svc.getStatus().accessoryCount).toBe(1);

    await svc.onStop();
    await devices.stop();
  });

  it("bridges a device that appears after start, across every source", async () => {
    const zigbee = makeFakeSource("zigbee", []);
    const devices = new AggregateDeviceSource([zigbee], logger);
    await devices.start();

    const svc = new HomekitService(logger, devices, { pinCode: "031-45-154" });
    await svc.onStart(ctx);
    expect(bridged).toHaveLength(0);

    const descriptor = makeDescriptor("zigbee", "0xaaa");
    zigbee.setDevices([descriptor]);
    zigbee.emit(descriptor);

    expect(bridged).toHaveLength(1);
    expect(svc.getStatus().accessoryCount).toBe(1);

    await svc.onStop();
    await devices.stop();
  });

  it("removes an accessory whose device is no longer present in the aggregate", async () => {
    const zigbee = makeFakeSource("zigbee", [makeDescriptor("zigbee", "0xaaa")]);
    const devices = new AggregateDeviceSource([zigbee], logger);
    await devices.start();

    const svc = new HomekitService(logger, devices, { pinCode: "031-45-154" });
    await svc.onStart(ctx);
    expect(bridged).toHaveLength(1);

    // The device leaves — the source no longer lists it, and a change on
    // another (still-present) device triggers reconciliation.
    zigbee.setDevices([]);
    zigbee.emit(makeDescriptor("zigbee", "0xaaa"));

    expect(unbridged).toHaveLength(1);
    expect(svc.getStatus().accessoryCount).toBe(0);

    await svc.onStop();
    await devices.stop();
  });

  it("tears down started sources and resets state when publish() rejects", async () => {
    const shelly = makeFakeSource("shelly", [makeDescriptor("shelly", "plug")]);
    const devices = new AggregateDeviceSource([shelly], logger);
    await devices.start();

    const svc = new HomekitService(logger, devices, { pinCode: "031-45-154" });
    publishError = new Error("publish failed");

    await expect(svc.onStart(ctx)).rejects.toThrow("publish failed");

    const status = svc.getStatus();
    expect(status.running).toBe(false);
    expect(status.accessoryCount).toBe(0);

    await expect(svc.onStop()).resolves.toBeUndefined();
    await devices.stop();
  });

  it("clears accessories and unpublishes on stop", async () => {
    const shelly = makeFakeSource("shelly", [makeDescriptor("shelly", "plug")]);
    const devices = new AggregateDeviceSource([shelly], logger);
    await devices.start();

    const svc = new HomekitService(logger, devices, { pinCode: "031-45-154" });
    await svc.onStart(ctx);
    await svc.onStop();
    expect(svc.getStatus().running).toBe(false);
    expect(svc.getStatus().accessoryCount).toBe(0);

    await devices.stop();
  });
});
