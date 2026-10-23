import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import pino from "pino";
import { DeviceStateStore } from "../src/device-sources/device-state-store.js";
import { formatQualifiedId } from "../src/device-sources/qualified-id.js";
import { ShellyDeviceSource } from "../src/device-sources/shelly-source.js";
import type { HttpClient, HttpResponse } from "../src/http/http-client.js";
import type { MqttMessageHandler, MqttService } from "../src/mqtt/mqtt-service.js";
import { ShellyService } from "../src/services/shelly-service.js";

const logger = pino({ level: "silent" });

function createMockHttp(responseData: unknown): HttpClient {
  const mockResponse: HttpResponse = {
    status: 200,
    ok: true,
    headers: new Headers(),
    data: responseData,
  };
  return {
    get: mock(() => Promise.resolve(mockResponse)),
    post: mock(() => Promise.resolve(mockResponse)),
    put: mock(() => Promise.resolve(mockResponse)),
    patch: mock(() => Promise.resolve(mockResponse)),
    del: mock(() => Promise.resolve(mockResponse)),
    request: mock(() => Promise.resolve(mockResponse)),
  } as unknown as HttpClient;
}

/** Build a `Shelly.GetComponents` entry for a `switch:N` / `cover:N` key. */
function makeComponent(key: string, name: string | null = null, metered = false): unknown {
  return {
    key,
    config: { name },
    status: metered ? { aenergy: { total: 1, by_minute: [], minute_ts: 0 } } : {},
  };
}

interface RoutedHttpMockOptions {
  components?: unknown[] | ((host: string) => unknown[]);
  switchStatus?: (channel: number, host: string) => unknown;
  coverStatus?: (channel: number, host: string) => unknown;
  deviceInfo?: unknown;
}

/**
 * A method-aware HTTP mock: it answers `Shelly.GetComponents`, per-channel
 * `Switch.GetStatus`/`Cover.GetStatus`, and `Shelly.GetDeviceInfo` from the
 * supplied configuration while recording every requested URL.
 */
function createRoutedHttpMock(options: RoutedHttpMockOptions = {}) {
  const calls: string[] = [];
  let components: unknown[] | ((host: string) => unknown[]) = options.components ?? [];

  const respond = (url: string): HttpResponse => {
    calls.push(url);
    const parsed = new URL(url);
    const method = parsed.pathname.replace(/^\/rpc\//, "");
    const channel = Number.parseInt(parsed.searchParams.get("id") ?? "0", 10);
    const host = parsed.hostname;

    let data: unknown = {};
    if (method === "Shelly.GetComponents") {
      const resolved = typeof components === "function" ? components(host) : components;
      data = { components: resolved, total: resolved.length };
    } else if (method === "Switch.GetStatus") {
      data = options.switchStatus?.(channel, host) ?? { output: false };
    } else if (method === "Cover.GetStatus") {
      data = options.coverStatus?.(channel, host) ?? { current_pos: 0, state: "stopped" };
    } else if (method === "Shelly.GetDeviceInfo") {
      data = options.deviceInfo ?? { id: "device" };
    }

    return { status: 200, ok: true, headers: new Headers(), data };
  };

  const http = {
    get: mock((url: string) => Promise.resolve(respond(url))),
    post: mock(() => Promise.resolve({ status: 200, ok: true, headers: new Headers(), data: {} })),
    put: mock(() => Promise.resolve({ status: 200, ok: true, headers: new Headers(), data: {} })),
    patch: mock(() => Promise.resolve({ status: 200, ok: true, headers: new Headers(), data: {} })),
    del: mock(() => Promise.resolve({ status: 200, ok: true, headers: new Headers(), data: {} })),
    request: mock((url: string) => Promise.resolve(respond(url))),
  } as unknown as HttpClient;

  return {
    http,
    calls,
    setComponents(next: unknown[] | ((host: string) => unknown[])): void {
      components = next;
    },
  };
}

function createMockMqtt(
  initialComponents?: unknown[],
  status: {
    switch?: (channel: number) => unknown;
    cover?: (channel: number) => unknown;
    error?: (method: string) => { code: number; message: string } | undefined;
  } = {},
) {
  const handlersByTopic = new Map<string, MqttMessageHandler>();
  let components: unknown[] | undefined = initialComponents;
  const mqtt = {
    subscribe: mock((topic: string, handler: MqttMessageHandler) => {
      handlersByTopic.set(topic, handler);
    }),
    unsubscribe: mock((topic: string) => handlersByTopic.delete(topic)),
    publish: mock((_topic: string, payload: unknown) => {
      const frame = payload as {
        id?: unknown;
        src?: unknown;
        method?: unknown;
        params?: { id?: unknown };
      };
      if (typeof frame?.id !== "number" || typeof frame?.method !== "string") return;
      const responseTopic = `${String(frame.src)}/rpc`;
      const handler = handlersByTopic.get(responseTopic);
      if (!handler) return;
      const channel = typeof frame.params?.id === "number" ? frame.params.id : 0;
      const error = status.error?.(frame.method);
      if (error) {
        handler(responseTopic, { id: frame.id, error } as unknown as Record<string, unknown>);
        return;
      }
      let result: unknown = {};
      if (frame.method === "Shelly.GetComponents") {
        result = { components: components ?? [], total: (components ?? []).length };
      } else if (frame.method === "Switch.GetStatus") {
        result = status.switch?.(channel) ?? {};
      } else if (frame.method === "Cover.GetStatus") {
        result = status.cover?.(channel) ?? {};
      }
      handler(responseTopic, { id: frame.id, result } as unknown as Record<string, unknown>);
    }),
  } as unknown as MqttService;
  function emit(topic: string, payload: unknown): void {
    handlersByTopic.get(topic)?.(topic, payload as Record<string, unknown>);
  }
  return {
    mqtt,
    emit,
    handlersByTopic,
    setComponents(next: unknown[]): void {
      components = next;
    },
  };
}

/**
 * A controllable MQTT mock for the concurrent-seed race: responses on chosen topics are
 * withheld until released, holding a seed in flight while another device's discovery completes.
 */
function createGatedMqtt(options: {
  components: unknown[];
  gateDiscoveryPrefix: string;
  gateStatusPrefix: string;
  gateStatusChannel: number;
}) {
  const handlersByTopic = new Map<string, MqttMessageHandler>();
  let releaseDiscovery!: () => void;
  const discoveryGate = new Promise<void>((resolve) => {
    releaseDiscovery = resolve;
  });
  const pendingStatus: Array<(result: unknown) => void> = [];

  const mqtt = {
    subscribe: mock((topic: string, handler: MqttMessageHandler) => {
      handlersByTopic.set(topic, handler);
    }),
    unsubscribe: mock((topic: string) => handlersByTopic.delete(topic)),
    publish: mock((topic: string, payload: unknown) => {
      const frame = payload as {
        id?: unknown;
        src?: unknown;
        method?: unknown;
        params?: { id?: unknown };
      };
      if (typeof frame?.id !== "number" || typeof frame?.method !== "string") return;
      const responseTopic = `${String(frame.src)}/rpc`;
      const respond = (result: unknown): void => {
        handlersByTopic.get(responseTopic)?.(responseTopic, {
          id: frame.id,
          result,
        } as unknown as Record<string, unknown>);
      };
      const prefix = topic.replace(/\/rpc$/, "");
      if (frame.method === "Shelly.GetComponents") {
        const total = options.components.length;
        if (prefix === options.gateDiscoveryPrefix) {
          void discoveryGate.then(() => respond({ components: options.components, total }));
          return;
        }
        respond({ components: options.components, total });
        return;
      }
      if (frame.method === "Switch.GetStatus") {
        const channel = typeof frame.params?.id === "number" ? frame.params.id : 0;
        if (prefix === options.gateStatusPrefix && channel === options.gateStatusChannel) {
          pendingStatus.push((result) => respond(result));
          return;
        }
        respond({ output: false });
        return;
      }
      respond({});
    }),
  } as unknown as MqttService;

  function emit(topic: string, payload: unknown): void {
    handlersByTopic.get(topic)?.(topic, payload as Record<string, unknown>);
  }

  return {
    mqtt,
    emit,
    pendingStatusCount: () => pendingStatus.length,
    releaseDiscovery: () => releaseDiscovery(),
    releaseStatus: (result: unknown) => pendingStatus.shift()?.(result),
  };
}

function sortedIds(source: ShellyDeviceSource): string[] {
  return source
    .list()
    .map((d) => d.id)
    .sort();
}

describe("ShellyDeviceSource", () => {
  let mqttMock: ReturnType<typeof createMockMqtt>;

  beforeEach(() => {
    mqttMock = createMockMqtt();
  });

  it("reports unavailable and yields no devices when the shelly service is null", () => {
    const source = new ShellyDeviceSource(null, mqttMock.mqtt, logger, 1_000_000);
    expect(source.available).toBe(false);
    expect(source.hasEnumerated).toBe(false);
    expect(source.list()).toEqual([]);
  });

  it("becomes enumerated once the discovery sweep resolves and resets on stop", async () => {
    const http = createMockHttp({ output: false, apower: 0, voltage: 230, current: 0 });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("plug", "192.168.1.50", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    expect(source.hasEnumerated).toBe(false);
    await source.start();
    expect(source.hasEnumerated).toBe(true);

    source.stop();
    expect(source.hasEnumerated).toBe(false);
  });

  it("declares a full capability description for a switch device", async () => {
    const http = createMockHttp({ output: false, apower: 0, voltage: 230, current: 0 });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("plug", "192.168.1.50", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    const devices = source.list();
    expect(devices).toHaveLength(1);
    expect(devices[0].qualifiedId).toBe(formatQualifiedId("shelly", "plug"));
    const properties = devices[0].capabilities.map((c) => c.property);
    expect(properties).toContain("on");
    expect(properties).toContain("power");

    const onCap = devices[0].capabilities.find((c) => c.property === "on");
    expect(onCap?.valueOn).toBe(true);
    expect(onCap?.valueOff).toBe(false);

    source.stop();
  });

  it("declares a full capability description for a cover device", async () => {
    const http = createMockHttp({ current_pos: 50, state: "stopped" });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("blinds", "192.168.1.60", "cover");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    const devices = source.list();
    const positionCap = devices[0].capabilities.find((c) => c.property === "position");
    expect(positionCap?.range).toEqual({ min: 0, max: 100 });

    source.stop();
  });

  it("polls HTTP-transport devices and normalises the resulting state", async () => {
    const http = createMockHttp({ output: true, apower: 12, voltage: 231, current: 0.05 });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("plug", "192.168.1.50", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 20);
    await source.start();

    await new Promise((r) => setTimeout(r, 50));

    const device = source.get("plug");
    expect(device?.state.on).toBe(true);
    expect(device?.state.power).toBe(12);
    expect(device?.observation.mode).toBe("polled");
    expect(device?.observation.refreshIntervalMs).toBe(20);

    source.stop();
  });

  it("does not poll MQTT-transport devices", async () => {
    const http = createMockHttp({ output: true });
    const getSpy = http.get as ReturnType<typeof mock>;
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 20);
    await source.start();

    await new Promise((r) => setTimeout(r, 60));
    expect(getSpy).not.toHaveBeenCalled();

    source.stop();
  });

  it("marks an MQTT-transport device unreachable on presence loss and reachable again on return", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    mqttMock.emit("shellyplus1-abc/online", false);
    expect(source.get("mqtt_plug")?.reachable).toBe(false);

    mqttMock.emit("shellyplus1-abc/online", true);
    expect(source.get("mqtt_plug")?.reachable).toBe(true);

    source.stop();
  });

  it("applies a push status update from NotifyStatus without polling", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    mqttMock.emit("shellyplus1-abc/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:0": { output: true, apower: 3, voltage: 230, current: 0.01 } },
    });

    const device = source.get("mqtt_plug");
    expect(device?.state.on).toBe(true);
    expect(device?.observation.mode).toBe("push");

    source.stop();
  });

  it("seeds a switch's on from a NotifyFullStatus with no prior NotifyStatus", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    mqttMock.emit("shellyplus1-abc/events/rpc", {
      method: "NotifyFullStatus",
      params: { "switch:0": { output: true, apower: 4, voltage: 230, current: 0.02 } },
    });

    const device = source.get("mqtt_plug");
    expect(device?.state.on).toBe(true);
    expect(device?.state.power).toBe(4);
    expect(device?.observation.mode).toBe("push");

    source.stop();
  });

  it("seeds a cover's position and state from a NotifyFullStatus naming cover:0", async () => {
    mqttMock.setComponents([makeComponent("cover:0")]);
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_blinds", {
      transport: "mqtt",
      topicPrefix: "shellyplus2pm-abc",
      type: "cover",
    });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    mqttMock.emit("shellyplus2pm-abc/events/rpc", {
      method: "NotifyFullStatus",
      params: { "cover:0": { current_pos: 37, state: "opening" } },
    });

    const device = source.get("mqtt_blinds");
    expect(device?.state.position).toBe(37);
    expect(device?.state.state).toBe("opening");
    expect(device?.observation.mode).toBe("push");

    source.stop();
  });

  it("applies a multi-component NotifyFullStatus to every channel and notifies each", async () => {
    mqttMock.setComponents([makeComponent("switch:0"), makeComponent("switch:1")]);
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("pro", { transport: "mqtt", topicPrefix: "shellypro-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    expect(sortedIds(source)).toEqual(["pro_0", "pro_1"]);

    const notified: string[] = [];
    source.subscribe((descriptor) => notified.push(descriptor.id));

    mqttMock.emit("shellypro-abc/events/rpc", {
      method: "NotifyFullStatus",
      params: {
        "switch:0": { output: true, apower: 5, voltage: 230, current: 0.02 },
        "switch:1": { output: false, apower: 0, voltage: 230, current: 0 },
      },
    });

    expect(source.get("pro_0")?.state.on).toBe(true);
    expect(source.get("pro_1")?.state.on).toBe(false);
    expect([...notified].sort()).toEqual(["pro_0", "pro_1"]);

    source.stop();
  });

  // -------------------------------------------------------------------------
  // Status seeding at subscription (tasks 2.1–2.3)
  // -------------------------------------------------------------------------

  it("seeds an MQTT switch's on from its status query before any notification", async () => {
    mqttMock = createMockMqtt(undefined, {
      switch: () => ({ output: true, apower: 3, voltage: 230, current: 0.02 }),
    });
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // No MQTT notification has been emitted — the descriptor is complete from
    // the RPC status query alone.
    const device = source.get("mqtt_plug");
    expect(device?.state.on).toBe(true);
    expect(device?.state.power).toBe(3);

    source.stop();
  });

  it("preserves a seeded channel's values when a later NotifyStatus names a different component", async () => {
    mqttMock = createMockMqtt([makeComponent("switch:0"), makeComponent("switch:1")], {
      switch: (channel) =>
        channel === 0
          ? { output: true, apower: 3, voltage: 230, current: 0.02 }
          : { output: false, apower: 0, voltage: 230, current: 0 },
    });
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("pro", { transport: "mqtt", topicPrefix: "shellypro-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // The RPC status query seeded every channel before any notification.
    expect(source.get("pro_0")?.state.on).toBe(true);
    expect(source.get("pro_0")?.state.power).toBe(3);
    expect(source.get("pro_1")?.state.on).toBe(false);

    mqttMock.emit("shellypro-abc/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:1": { output: true, apower: 9, voltage: 230, current: 0.04 } },
    });

    // The partial notification applies to switch:1 only; switch:0's seeded
    // values are preserved (spec: "Incremental notifications still apply").
    expect(source.get("pro_0")?.state.on).toBe(true);
    expect(source.get("pro_0")?.state.power).toBe(3);
    expect(source.get("pro_1")?.state.on).toBe(true);
    expect(source.get("pro_1")?.state.power).toBe(9);

    source.stop();
  });

  it("merges a partial NotifyStatus naming the seeded channel onto its last-known state", async () => {
    mqttMock = createMockMqtt(undefined, {
      switch: () => ({ output: true, apower: 3, voltage: 230, current: 0.02 }),
    });
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // The RPC status query seeded the channel before any notification.
    expect(source.get("mqtt_plug")?.state.on).toBe(true);
    expect(source.get("mqtt_plug")?.state.power).toBe(3);

    // A routine partial frame names the *same* component but carries only the
    // cumulative energy — every other key normalizes to `undefined` and must
    // not clobber the seeded state.
    mqttMock.emit("shellyplus1-abc/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:0": { aenergy: { total: 55, by_minute: [], minute_ts: 1_700_000_000 } } },
    });

    // The changed attribute is applied and the seeded values are preserved
    // (spec: "Incremental notifications still apply").
    const device = source.get("mqtt_plug");
    expect(device?.state.energy).toBe(55);
    expect(device?.state.on).toBe(true);
    expect(device?.state.power).toBe(3);
    expect(device?.state.voltage).toBe(230);
    expect(device?.state.current).toBe(0.02);

    source.stop();
  });

  it("seeds an MQTT cover's position and state from its status query before any notification", async () => {
    mqttMock = createMockMqtt(undefined, {
      cover: () => ({ current_pos: 42, state: "stopped", apower: 0, voltage: 230, current: 0 }),
    });
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_blinds", {
      transport: "mqtt",
      topicPrefix: "shellyplus2pm-abc",
      type: "cover",
    });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    const device = source.get("mqtt_blinds");
    expect(device?.state.position).toBe(42);
    expect(device?.state.state).toBe("stopped");

    source.stop();
  });

  it("logs a failed seed and still enumerates the device", async () => {
    mqttMock = createMockMqtt(undefined, {
      error: (method) =>
        method === "Switch.GetStatus" ? { code: -1, message: "unavailable" } : undefined,
    });
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    const errorSpy = spyOn(logger, "error");

    // A rejecting status query must not reject the source or drop the device.
    await expect(source.start()).resolves.toBeUndefined();
    expect(source.list()).toHaveLength(1);
    expect(source.get("mqtt_plug")).toBeDefined();
    expect(source.get("mqtt_plug")?.state.on).toBeUndefined();

    // The failure is logged (spec: "the failure is logged, the device remains
    // enumerable"), with the seed's own message and device context.
    expect(
      errorSpy.mock.calls.some((call) => call[1] === "Shelly status seed failed — continuing"),
    ).toBe(true);

    errorSpy.mockRestore();

    source.stop();
  });

  it("applies an in-flight seed to a re-resolved id when a concurrent discovery duplicates a configured name", async () => {
    // Both devices configure a component name "Kitchen", so while only "a" is
    // discovered its channel id is "Kitchen"; once "b" is discovered the name is
    // no longer unique and "a" re-resolves to "a_0" mid-seed.
    const gated = createGatedMqtt({
      components: [makeComponent("switch:0", "Kitchen"), makeComponent("switch:1")],
      gateDiscoveryPrefix: "shelly-b",
      gateStatusPrefix: "shelly-a",
      gateStatusChannel: 0,
    });
    const http = createMockHttp({});
    const shelly = new ShellyService(http, gated.mqtt, logger);
    shelly.register("a", { transport: "mqtt", topicPrefix: "shelly-a" });
    shelly.register("b", { transport: "mqtt", topicPrefix: "shelly-b" });
    const source = new ShellyDeviceSource(shelly, gated.mqtt, logger, 1_000_000);

    const started = source.start();

    // "a" discovers first and its switch:0 status RPC is now in flight (gated);
    // "b"'s discovery is still gated, so "a" holds the "Kitchen" identity.
    while (gated.pendingStatusCount() === 0) await new Promise((r) => setTimeout(r, 1));
    expect(source.get("Kitchen")?.id).toBe("Kitchen");

    // "b"'s discovery completes, making "Kitchen" non-unique and re-resolving
    // "a" to "a_0" while its status RPC is still in flight.
    gated.releaseDiscovery();
    while (source.get("a_0") === undefined) await new Promise((r) => setTimeout(r, 1));
    expect(source.get("Kitchen")).toBeUndefined();

    // The in-flight seed resolves; it must land on "a"'s current id, not be
    // discarded against the stale snapshot id.
    gated.releaseStatus({ output: true, apower: 7, voltage: 230, current: 0.03 });
    await started;

    expect(source.get("a_0")?.state.on).toBe(true);
    expect(source.get("a_0")?.state.power).toBe(7);
    expect(source.get("b_0")?.state.on).toBe(false);

    source.stop();
  });

  it("keeps a push applied during the seed in flight instead of overwriting it with the stale snapshot", async () => {
    const gated = createGatedMqtt({
      components: [makeComponent("switch:0")],
      gateDiscoveryPrefix: "unused-prefix",
      gateStatusPrefix: "shelly-a",
      gateStatusChannel: 0,
    });
    const http = createMockHttp({});
    const shelly = new ShellyService(http, gated.mqtt, logger);
    shelly.register("a", { transport: "mqtt", topicPrefix: "shelly-a" });
    const source = new ShellyDeviceSource(shelly, gated.mqtt, logger, 1_000_000);

    const started = source.start();

    // The seed's switch:0 status RPC is now in flight (gated) while the events
    // subscription is already live.
    while (gated.pendingStatusCount() === 0) await new Promise((r) => setTimeout(r, 1));

    // The device toggles on and pushes the change while the seed is still
    // pending; the seed's response is a snapshot the device took before it.
    gated.emit("shelly-a/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:0": { output: true, apower: 9, voltage: 230, current: 0.04 } },
    });
    expect(source.get("a")?.state.on).toBe(true);

    // The older snapshot lands after the push and must not overwrite it.
    gated.releaseStatus({ output: false, apower: 0, voltage: 230, current: 0 });
    await started;

    const device = source.get("a");
    expect(device?.state.on).toBe(true);
    expect(device?.state.power).toBe(9);

    source.stop();
  });

  it("omits an unreported readable property instead of synthesizing a zero", async () => {
    mqttMock = createMockMqtt(undefined, {
      // The status omits `apower`, so the transport has not reported `power`.
      switch: () => ({ output: true, voltage: 230, current: 0 }),
    });
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    const device = source.get("mqtt_plug");
    expect(device?.state.on).toBe(true);
    expect(device?.state.power).toBeUndefined();
    // Present-but-undefined is dropped on the wire, never rendered as zero.
    const serialized = JSON.parse(JSON.stringify(device?.state)) as Record<string, unknown>;
    expect("power" in serialized).toBe(false);

    source.stop();
  });

  it("maps cumulative active energy into state and declares the Wh capability for a metering device", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    mqttMock.emit("shellyplus1-abc/events/rpc", {
      method: "NotifyStatus",
      params: {
        "switch:0": {
          output: true,
          apower: 12,
          voltage: 230,
          current: 0.05,
          aenergy: { total: 1234.5, by_minute: [], minute_ts: 1_700_000_000 },
        },
      },
    });

    const device = source.get("mqtt_plug");
    expect(device?.state.energy).toBe(1234.5);

    const energy = device?.capabilities.find((c) => c.property === "energy");
    expect(energy?.valueType).toBe("numeric");
    expect(energy?.unit).toBe("Wh");
    expect(energy?.access).toEqual({ readable: true, writable: false });

    source.stop();
  });

  it("keeps a reported zero cumulative energy as a present, metered reading", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    mqttMock.emit("shellyplus1-abc/events/rpc", {
      method: "NotifyStatus",
      params: {
        "switch:0": {
          output: true,
          apower: 0,
          voltage: 230,
          current: 0,
          aenergy: { total: 0, by_minute: [], minute_ts: 1_700_000_000 },
        },
      },
    });

    const device = source.get("mqtt_plug");
    expect(device?.state.energy).toBe(0);
    expect(device?.capabilities.some((c) => c.property === "energy")).toBe(true);

    source.stop();
  });

  it("omits the energy property and capability for a device that reports no cumulative energy", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    mqttMock.emit("shellyplus1-abc/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:0": { output: true, apower: 0, voltage: 230, current: 0 } },
    });

    const device = source.get("mqtt_plug");
    expect(device?.state).not.toHaveProperty("energy");
    expect(device?.capabilities.some((c) => c.property === "energy")).toBe(false);

    source.stop();
  });

  it("picks up a device registered after the source has started", async () => {
    const http = createMockHttp({ output: false });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    expect(source.list()).toHaveLength(0);
    shelly.register("late_plug", "192.168.1.70", "switch");
    await new Promise((r) => setTimeout(r, 10));
    expect(source.list()).toHaveLength(1);

    source.stop();
  });

  it("seeds an MQTT device registered after the source has started from its status query", async () => {
    mqttMock = createMockMqtt(undefined, {
      switch: () => ({ output: true, apower: 3, voltage: 230, current: 0.02 }),
    });
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    expect(source.list()).toHaveLength(0);

    // Register after start(): the late-registration hook must run the same
    // discovery + RPC seed path as a start-time registration (spec: "or that
    // device is registered after the source has started").
    shelly.register("late_mqtt", { transport: "mqtt", topicPrefix: "shellyplus1-late" });
    while (source.get("late_mqtt")?.state.on === undefined) {
      await new Promise((r) => setTimeout(r, 1));
    }

    // The descriptor is complete from the RPC status query alone — no
    // NotifyStatus/NotifyFullStatus was ever emitted.
    const device = source.get("late_mqtt");
    expect(device?.state.on).toBe(true);
    expect(device?.state.power).toBe(3);
    expect(device?.observation.mode).toBe("push");

    source.stop();
  });

  it("dispatches an on/off command through ShellyService", async () => {
    const http = createMockHttp({ was_on: false });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("plug", "192.168.1.50", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    const outcome = await source.command("plug", { on: true });
    expect(outcome).toEqual({ status: "ok" });
    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("Switch.Set"));

    source.stop();
  });

  it("dispatches a position command through ShellyService for a cover", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("blinds", "192.168.1.60", "cover");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    const outcome = await source.command("blinds", { position: 40 });
    expect(outcome).toEqual({ status: "ok" });
    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("Cover.GoToPosition"));

    source.stop();
  });

  it("dispatches each declared transport action to the matching Cover RPC", async () => {
    const routed = createRoutedHttpMock({ components: [makeComponent("cover:0")] });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("blinds", "192.168.1.60", "cover");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    // The transport is declared write-only — a command with no reported-state
    // counterpart — so a capability-driven consumer never renders a readout for
    // it, yet validation and dispatch still accept every declared value.
    const declared = source.get("blinds")?.capabilities.find((c) => c.property === "action");
    expect(declared?.access).toEqual({ readable: false, writable: true });

    const transports: [string, string][] = [
      ["open", "Cover.Open"],
      ["close", "Cover.Close"],
      ["stop", "Cover.Stop"],
    ];
    for (const [action, method] of transports) {
      routed.calls.length = 0;
      expect(await source.command("blinds", { action })).toEqual({ status: "ok" });
      const rpcCalls = routed.calls.filter((url) => url.includes("/rpc/"));
      expect(rpcCalls).toHaveLength(1);
      expect(rpcCalls[0]).toContain(method);
    }

    source.stop();
  });

  it("now accepts a stop command for a cover, which it previously rejected", async () => {
    const routed = createRoutedHttpMock({ components: [makeComponent("cover:0")] });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("blinds", "192.168.1.60", "cover");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    // The descriptor declares the transport, so a client that knows only the
    // source-neutral vocabulary can express stop instead of the command being
    // rejected as an unknown property. It is declared write-only: a command the
    // device does not report, only accepts.
    const action = source.get("blinds")?.capabilities.find((c) => c.property === "action");
    expect(action?.access).toEqual({ readable: false, writable: true });
    expect(action?.permittedValues).toContain("stop");

    routed.calls.length = 0;
    expect(await source.command("blinds", { action: "stop" })).toEqual({ status: "ok" });
    expect(routed.calls.some((url) => url.includes("Cover.Stop"))).toBe(true);

    source.stop();
  });

  it("rejects an undeclared transport action with a descriptive error and sends nothing", async () => {
    const routed = createRoutedHttpMock({ components: [makeComponent("cover:0")] });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("blinds", "192.168.1.60", "cover");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    routed.calls.length = 0;
    const outcome = await source.command("blinds", { action: "raise" });

    expect(outcome.status).toBe("invalid");
    expect((outcome as { error: string }).error).toBe(
      'Property "action" value "raise" is not one of the permitted values: open, close, stop',
    );
    expect(routed.calls).toHaveLength(0);

    source.stop();
  });

  it("returns not_found for an unknown device id", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    const outcome = await source.command("unknown", {});
    expect(outcome).toEqual({ status: "not_found" });

    source.stop();
  });

  it("returns unavailable for a command when the shelly service is null", async () => {
    const source = new ShellyDeviceSource(null, mqttMock.mqtt, logger, 1_000_000);
    const outcome = await source.command("plug", {});
    expect(outcome).toEqual({ status: "unavailable" });
  });

  it("stop() clears MQTT subscriptions", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    expect(mqttMock.handlersByTopic.has("shellyplus1-abc/events/rpc")).toBe(true);
    expect(mqttMock.handlersByTopic.has("shellyplus1-abc/online")).toBe(true);
    source.stop();
    expect(mqttMock.handlersByTopic.has("shellyplus1-abc/events/rpc")).toBe(false);
    expect(mqttMock.handlersByTopic.has("shellyplus1-abc/online")).toBe(false);
  });

  it("an unreachable HTTP device does not halt the poll cycle", async () => {
    const failing = createMockHttp({});
    (failing.get as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error("network error")),
    );
    const failingShelly = new ShellyService(failing, mqttMock.mqtt, logger);
    failingShelly.register("broken", "192.168.1.99", "switch");
    const source = new ShellyDeviceSource(failingShelly, mqttMock.mqtt, logger, 20);
    await source.start();

    await new Promise((r) => setTimeout(r, 50));
    expect(source.get("broken")?.reachable).toBe(false);

    // A second poll tick still runs — the failure did not clear the interval.
    await new Promise((r) => setTimeout(r, 40));
    expect(source.get("broken")?.reachable).toBe(false);

    source.stop();
  });

  // -------------------------------------------------------------------------
  // Multi-component fan-out (tasks 3.1–3.10)
  // -------------------------------------------------------------------------

  it("awaits component discovery for every already-registered device before start() resolves", async () => {
    const routed = createRoutedHttpMock({
      components: (host) =>
        host === "192.168.1.10"
          ? [makeComponent("switch:0"), makeComponent("switch:1")]
          : [makeComponent("switch:0")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("dual", "192.168.1.10", "switch");
    shelly.register("single", "192.168.1.11", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // No waiting: discovery is complete the moment start() resolves.
    expect(sortedIds(source)).toEqual(["dual_0", "dual_1", "single"]);

    source.stop();
  });

  it("isolates an unexpected discovery rejection so one device cannot block the others", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0"), makeComponent("switch:1")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("bad", "192.168.1.12", "switch");
    shelly.register("good", "192.168.1.13", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    // Force an unexpected rejection at the per-device discovery boundary.
    const internals = source as unknown as {
      discoverDevice: (device: { name: string }, generation: number) => Promise<void>;
    };
    const originalDiscovery = internals.discoverDevice.bind(source);
    internals.discoverDevice = (device, generation) =>
      device.name === "bad"
        ? Promise.reject(new Error("unexpected discovery failure"))
        : originalDiscovery(device, generation);

    await expect(source.start()).resolves.toBeUndefined();
    // The failing device is skipped; the healthy device still enumerates.
    expect(sortedIds(source)).toEqual(["good_0", "good_1"]);
    expect(source.get("bad_0")).toBeUndefined();

    source.stop();
  });

  it("omits a late-registered device until discovery resolves, then materializes it", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0"), makeComponent("switch:1")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    shelly.register("late", "192.168.1.20", "switch");
    expect(source.get("late_0")).toBeUndefined();
    expect(source.list()).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 10));
    expect(source.get("late_0")).toBeDefined();
    expect(source.list()).toHaveLength(2);

    source.stop();
  });

  it("expands a four-switch device into four descriptors and excludes the base", async () => {
    const routed = createRoutedHttpMock({
      components: [
        makeComponent("switch:0"),
        makeComponent("switch:1"),
        makeComponent("switch:2"),
        makeComponent("switch:3"),
      ],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("pro4pm", "192.168.1.30", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    expect(sortedIds(source)).toEqual(["pro4pm_0", "pro4pm_1", "pro4pm_2", "pro4pm_3"]);
    expect(source.get("pro4pm")).toBeUndefined();

    source.stop();
  });

  it("keeps a single-switch device as exactly the base registration", async () => {
    const routed = createRoutedHttpMock({ components: [makeComponent("switch:0")] });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("plug", "192.168.1.31", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    expect(source.list()).toHaveLength(1);
    expect(source.get("plug")).toBeDefined();
    expect(source.get("plug_0")).toBeUndefined();

    source.stop();
  });

  it("uses unique configured component names as channel identities", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0", "left"), makeComponent("switch:1", "right")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.32", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    expect(sortedIds(source)).toEqual(["left", "right"]);
    expect(source.get("left")?.displayName).toBe("left");

    source.stop();
  });

  it("falls back to base_channel when two components of one device share a configured name", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0", "dup"), makeComponent("switch:1", "dup")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.33", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    expect(sortedIds(source)).toEqual(["strip_0", "strip_1"]);
    expect(source.get("strip_0")?.displayName).toBe("strip 0");
    expect(source.get("strip_1")?.displayName).toBe("strip 1");
    expect(source.get("strip_0")?.displayName).not.toBe(source.get("strip_1")?.displayName);

    source.stop();
  });

  it("distinguishes a configured name that equals a sibling's generated label", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0"), makeComponent("switch:1", "base 0")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("base", "192.168.1.34", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // switch:0's fallback label is "base 0"; switch:1's configured name "base 0"
    // must not shadow it, so its own fallback label is used instead.
    const names = source
      .list()
      .map((d) => d.displayName)
      .sort();
    expect(names).toEqual(["base 0", "base 1"]);
    expect(new Set(names).size).toBe(names.length);

    source.stop();
  });

  it("distinguishes the same configured name on two different devices by base name", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0", "shared"), makeComponent("switch:1")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("alpha", "192.168.1.35", "switch");
    shelly.register("beta", "192.168.1.36", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // "shared" is not unique across devices, so both channels fall back to their
    // base-qualified label rather than rendering identically.
    const names = source
      .list()
      .map((d) => d.displayName)
      .sort();
    expect(names).toEqual(["alpha 0", "alpha 1", "beta 0", "beta 1"]);
    expect(new Set(names).size).toBe(names.length);

    source.stop();
  });

  it("resolves ids deterministically when a configured name equals another channel's generated candidate", async () => {
    const run = async (components: unknown[]): Promise<string[]> => {
      const routed = createRoutedHttpMock({ components });
      const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
      shelly.register("B", "192.168.1.34", "switch");
      const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

      await source.start();
      const ids = sortedIds(source);
      source.stop();
      return ids;
    };

    // `switch:0` is unnamed and generates `B_0`; `switch:1` is configured `B_0`.
    const forward = await run([makeComponent("switch:0"), makeComponent("switch:1", "B_0")]);
    const reversed = await run([makeComponent("switch:1", "B_0"), makeComponent("switch:0")]);

    expect(forward).toEqual(["B_0", "B_1"]);
    expect(reversed).toEqual(forward);
  });

  it("falls back for the same configured name on two different devices", async () => {
    const routed = createRoutedHttpMock({
      components: (host) =>
        host === "192.168.1.40"
          ? [makeComponent("switch:0", "shared"), makeComponent("switch:1", "a_only")]
          : [makeComponent("switch:0", "shared"), makeComponent("switch:1", "b_only")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("alpha", "192.168.1.40", "switch");
    shelly.register("beta", "192.168.1.41", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    expect(sortedIds(source)).toEqual(["a_only", "alpha_0", "b_only", "beta_0"]);

    source.stop();
  });

  it("updates only channel 2 from a switch:2 NotifyStatus", async () => {
    mqttMock.setComponents([
      makeComponent("switch:0"),
      makeComponent("switch:1"),
      makeComponent("switch:2"),
      makeComponent("switch:3"),
    ]);
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("pro", { transport: "mqtt", topicPrefix: "shellypro-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    mqttMock.emit("shellypro-abc/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:2": { output: true, apower: 7, voltage: 230, current: 0.03 } },
    });

    expect(source.get("pro_2")?.state.on).toBe(true);
    expect(source.get("pro_0")?.state.on).toBeUndefined();
    expect(source.get("pro_1")?.state.on).toBeUndefined();
    expect(source.get("pro_3")?.state.on).toBeUndefined();

    source.stop();
  });

  it("polls each HTTP channel independently and normalizes it into its own entry", async () => {
    const routed = createRoutedHttpMock({
      components: [
        makeComponent("switch:0"),
        makeComponent("switch:1"),
        makeComponent("switch:2"),
        makeComponent("switch:3"),
      ],
      switchStatus: (channel) => ({
        output: channel % 2 === 0,
        apower: channel + 1,
        voltage: 230,
        current: 0.01,
      }),
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("quad", "192.168.1.50", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 20);

    await source.start();
    await new Promise((r) => setTimeout(r, 60));

    for (let channel = 0; channel < 4; channel += 1) {
      const device = source.get(`quad_${channel}`);
      expect(device?.state.on).toBe(channel % 2 === 0);
      expect(device?.state.power).toBe(channel + 1);
    }

    source.stop();
  });

  it("routes a channel-1 command to channel 1 only", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0"), makeComponent("switch:1")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("pro", "192.168.1.60", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();
    routed.calls.length = 0;

    const outcome = await source.command("pro_1", { on: true });

    expect(outcome).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=1");
    expect(routed.calls.some((url) => url.includes("Switch.Set") && url.includes("id=0"))).toBe(
      false,
    );

    source.stop();
  });

  it("retains a channel that disappears from a later inventory and marks it unreachable", async () => {
    const routed = createRoutedHttpMock({
      components: [
        makeComponent("switch:0"),
        makeComponent("switch:1"),
        makeComponent("switch:2"),
        makeComponent("switch:3"),
      ],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.70", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();
    expect(sortedIds(source)).toEqual(["strip_0", "strip_1", "strip_2", "strip_3"]);
    expect(source.get("strip_3")?.reachable).toBe(true);

    routed.setComponents([makeComponent("switch:0"), makeComponent("switch:1")]);
    shelly.register("strip", "192.168.1.70", "switch");
    await new Promise((r) => setTimeout(r, 10));

    expect(source.get("strip_0")).toBeDefined();
    expect(source.get("strip_1")).toBeDefined();
    expect(source.get("strip_2")).toBeDefined();
    expect(source.get("strip_3")).toBeDefined();
    expect(source.get("strip_2")?.reachable).toBe(false);
    expect(source.get("strip_3")?.reachable).toBe(false);

    source.stop();
  });

  it("does not let a retained removed channel overwrite a live channel reusing its configured name", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0"), makeComponent("switch:1", "foo")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.71", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();
    expect(sortedIds(source)).toEqual(["foo", "strip_0"]);

    // switch:1 (id "foo") disappears and switch:2 reuses the configured name.
    routed.setComponents([makeComponent("switch:0"), makeComponent("switch:2", "foo")]);
    shelly.register("strip", "192.168.1.71", "switch");
    await new Promise((r) => setTimeout(r, 10));

    // The live switch:2 keeps the configured-name identity; the retained
    // switch:1 is re-resolved to a distinct id and marked unreachable.
    expect(source.get("foo")?.id).toBe("foo");
    // "foo" now names two entries (the live channel and the retained one), so
    // neither may display it bare; each falls back to its own channel label.
    expect(source.get("foo")?.displayName).toBe("strip 2");
    expect(source.get("strip_1")?.id).toBe("strip_1");
    expect(source.get("strip_1")?.displayName).toBe("strip 1");
    expect(source.get("strip_1")?.reachable).toBe(false);
    expect(source.get("foo")?.displayName).not.toBe(source.get("strip_1")?.displayName);
    expect(sortedIds(source)).toEqual(["foo", "strip_0", "strip_1"]);

    // A command for the live identity routes to the new channel, never the
    // removed one.
    routed.calls.length = 0;
    expect(await source.command("foo", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=2");
    expect(setCalls[0]).not.toContain("id=1");

    source.stop();
  });

  it("relabels a retained channel so it cannot share a display name with the live channel that replaced it", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0"), makeComponent("switch:1", "foo")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.74", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // switch:1 ("foo") vanishes from a later inventory; switch:2 reuses the
    // configured name, so the retained channel's stored "foo" label must be
    // reconciled against the live entry rather than carried verbatim.
    routed.setComponents([makeComponent("switch:0"), makeComponent("switch:2", "foo")]);
    shelly.register("strip", "192.168.1.74", "switch");
    await new Promise((r) => setTimeout(r, 10));

    const live = source.get("foo");
    const retained = source.get("strip_1");
    expect(live).toBeDefined();
    expect(retained).toBeDefined();
    expect(retained?.reachable).toBe(false);
    expect(live?.displayName).not.toBe(retained?.displayName);

    // Every label in the source is distinct, not just the two channels.
    const names = source.list().map((d) => d.displayName);
    expect(new Set(names).size).toBe(names.length);

    // The retained channel stays unreachable and non-commandable, while the
    // live claimant of the configured name still routes to channel 2.
    routed.calls.length = 0;
    expect(await source.command("strip_1", { on: true })).toEqual({ status: "not_found" });
    expect(await source.command("foo", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=2");
    expect(setCalls[0]).not.toContain("id=1");

    source.stop();
  });

  it("rejects a command naming the base of an expanded device while channels succeed", async () => {
    const routed = createRoutedHttpMock({
      components: [
        makeComponent("switch:0"),
        makeComponent("switch:1"),
        makeComponent("switch:2"),
        makeComponent("switch:3"),
      ],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("quad", "192.168.1.80", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    expect(await source.command("quad", { on: true })).toEqual({ status: "not_found" });

    routed.calls.length = 0;
    expect(await source.command("quad_1", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=1");

    // Device-level queries still resolve against the retained base registration.
    await shelly.getDeviceInfo("quad");
    expect(routed.calls.some((url) => url.includes("Shelly.GetDeviceInfo"))).toBe(true);

    source.stop();
  });

  // -------------------------------------------------------------------------
  // Per-channel kind composition
  // -------------------------------------------------------------------------

  it("describes and commands a discovered switch component as a switch on a cover-registered device", async () => {
    const routed = createRoutedHttpMock({ components: [makeComponent("switch:0")] });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("shutter", "192.168.1.90", "cover");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // The single component keeps the base registration's identity but takes its
    // kind from discovery, so it is a switch even though the registration said cover.
    expect(source.get("shutter")?.id).toBe("shutter");
    const properties = source.get("shutter")?.capabilities.map((c) => c.property) ?? [];
    expect(properties).toContain("on");
    expect(properties).not.toContain("position");

    routed.calls.length = 0;
    expect(await source.command("shutter", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=0");

    source.stop();
  });

  it("still describes and commands a discovered cover component as a cover on a switch-registered device", async () => {
    const routed = createRoutedHttpMock({ components: [makeComponent("cover:0")] });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("gate", "192.168.1.91", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    expect(source.get("gate")?.id).toBe("gate");
    const properties = source.get("gate")?.capabilities.map((c) => c.property) ?? [];
    expect(properties).toContain("position");
    expect(properties).not.toContain("on");

    routed.calls.length = 0;
    expect(await source.command("gate", { position: 30 })).toEqual({ status: "ok" });
    expect(routed.calls.some((url) => url.includes("Cover.GoToPosition"))).toBe(true);

    source.stop();
  });

  // -------------------------------------------------------------------------
  // Independent review fixes
  // -------------------------------------------------------------------------

  it("keys mixed switch:0/cover:0 components independently without collision", async () => {
    mqttMock.setComponents([makeComponent("switch:0"), makeComponent("cover:0")]);
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mixed", { transport: "mqtt", topicPrefix: "shellymixed-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // Deterministic id resolution sorts by base name, then kind, then channel,
    // so the cover claims the bare channel id and the switch is kind-qualified.
    expect(sortedIds(source)).toEqual(["mixed_0", "mixed_switch_0"]);

    mqttMock.emit("shellymixed-abc/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:0": { output: true, apower: 5, voltage: 230, current: 0.02 } },
    });

    expect(source.get("mixed_switch_0")?.state.on).toBe(true);
    expect(source.get("mixed_0")?.state.on).toBeUndefined();
    expect(source.get("mixed_0")?.state.position).toBeUndefined();

    const publishMock = mqttMock.mqtt.publish as ReturnType<typeof mock>;
    publishMock.mockClear();

    expect(await source.command("mixed_switch_0", { on: true })).toEqual({ status: "ok" });
    expect(await source.command("mixed_0", { position: 40 })).toEqual({ status: "ok" });

    const frames = publishMock.mock.calls.map(
      (call) => call[1] as { method?: string; params?: { id?: number } },
    );
    expect(frames.find((f) => f.method === "Switch.Set")?.params?.id).toBe(0);
    expect(frames.find((f) => f.method === "Cover.GoToPosition")?.params?.id).toBe(0);

    source.stop();
  });

  it("disambiguates a configured channel name equal to a base registration name", async () => {
    const routed = createRoutedHttpMock({
      components: (host) =>
        host === "192.168.1.201"
          ? [makeComponent("switch:0", "base"), makeComponent("switch:1")]
          : [makeComponent("switch:0")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("base", "192.168.1.202", "switch");
    shelly.register("strip", "192.168.1.201", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // "base" is another registration's name, so the colliding configured name
    // must fall back rather than shadow the base device.
    expect(source.get("base")?.qualifiedId).toBe(formatQualifiedId("shelly", "base"));
    expect(source.get("strip_0")).toBeDefined();
    expect(source.get("strip_0")?.id).not.toBe("base");
    expect(source.get("strip_1")).toBeDefined();

    routed.calls.length = 0;
    expect(await source.command("strip_0", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=0");

    source.stop();
  });

  it("reports and commands the sole component's non-zero channel", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:2")],
      switchStatus: (channel) => ({
        output: true,
        apower: channel + 10,
        voltage: 230,
        current: 0.01,
      }),
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("remote", "192.168.1.210", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 20);

    await source.start();
    await new Promise((r) => setTimeout(r, 60));

    expect(source.get("remote")?.id).toBe("remote");
    // The sole component is at channel 2, so both the descriptor's state and
    // its commands must address channel 2 rather than defaulting to 0.
    expect(source.get("remote")?.state.power).toBe(12);

    routed.calls.length = 0;
    expect(await source.command("remote", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=2");

    source.stop();
  });

  it("drops a stale channel record when a sole component relocates to channel 0", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:2")],
      switchStatus: (channel) => ({
        output: true,
        apower: channel + 10,
        voltage: 230,
        current: 0.01,
      }),
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("dev", "192.168.1.250", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // First discovery: the sole component lives at channel 2, so the base id
    // must thread channel 2.
    routed.calls.length = 0;
    expect(await source.command("dev", { on: true })).toEqual({ status: "ok" });
    let setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=2");

    // Re-discovery: the same sole component relocated to channel 0. The
    // previously-present channel-2 entry is retained and marked unreachable.
    routed.setComponents([makeComponent("switch:0")]);
    shelly.register("dev", "192.168.1.250", "switch");
    await new Promise((r) => setTimeout(r, 10));

    expect(source.get("dev")?.id).toBe("dev");
    expect(source.get("dev_2")?.reachable).toBe(false);

    // The live channel cannot keep the bare base label for itself while the
    // retained channel also claims it; both must be globally distinguishable.
    const live = source.get("dev");
    const retained = source.get("dev_2");
    expect(live?.displayName).toBe("dev");
    expect(retained?.displayName).toBeDefined();
    expect(retained?.displayName).not.toBe(live?.displayName);
    const labels = source.list().map((d) => d.displayName);
    expect(new Set(labels).size).toBe(labels.length);

    // The stale dev -> channel 2 service record must be gone, so the base id
    // resolves to the base registration / channel 0.
    routed.calls.length = 0;
    expect(await source.command("dev", { on: true })).toEqual({ status: "ok" });
    setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=0");
    expect(setCalls[0]).not.toContain("id=2");

    source.stop();
  });

  it("re-resolves a retained base-named sole-channel entry so its stale channel record is pruned", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:2")],
      switchStatus: (channel) => ({
        output: true,
        apower: channel + 10,
        voltage: 230,
        current: 0.01,
      }),
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.252", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // First discovery: the sole component sits at channel 2, so the base id
    // must thread channel 2.
    routed.calls.length = 0;
    await shelly.turnOn("strip");
    let setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=2");

    // Re-discovery: multiple components not including channel 2. The old sole
    // entry must not retain the base registration's name, which would leave its
    // stale channel-2 record commandable through the service while the source
    // layer rejects "strip".
    routed.setComponents([makeComponent("switch:0"), makeComponent("switch:1")]);
    shelly.register("strip", "192.168.1.252", "switch");
    await new Promise((r) => setTimeout(r, 10));

    const retained = source.get("strip_2");
    expect(retained).toBeDefined();
    expect(retained?.id).not.toBe("strip");
    expect(retained?.reachable).toBe(false);
    expect(source.get("strip")).toBeUndefined();

    // The vanished channel stays enumerated but non-commandable.
    routed.calls.length = 0;
    expect(await source.command("strip_2", { on: true })).toEqual({ status: "not_found" });
    expect(routed.calls.filter((url) => url.includes("Switch.Set"))).toHaveLength(0);

    // With the stale base-named record pruned, the service resolves "strip"
    // against the base registration (channel 0), not the vanished channel 2.
    routed.calls.length = 0;
    await shelly.turnOn("strip");
    setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=0");
    expect(setCalls[0]).not.toContain("id=2");

    source.stop();
  });

  it("clears materialized channel records when the source stops", async () => {
    const routed = createRoutedHttpMock({ components: [makeComponent("switch:2")] });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("remote", "192.168.1.251", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    routed.calls.length = 0;
    await shelly.turnOn("remote");
    let setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=2");

    source.stop();

    // With the materialized record gone, the base registration defaults to 0
    // instead of retaining the previous lifecycle's channel.
    routed.calls.length = 0;
    await shelly.turnOn("remote");
    setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=0");
    expect(setCalls[0]).not.toContain("id=2");
  });

  it("does not install a poll timer or rebuild after stop() during discovery", async () => {
    let resolveComponents!: (value: unknown) => void;
    const componentsPromise = new Promise<unknown>((resolve) => {
      resolveComponents = resolve;
    });
    const respond = (url: string): Promise<HttpResponse> =>
      url.includes("Shelly.GetComponents")
        ? componentsPromise.then(
            (data) =>
              ({
                status: 200,
                ok: true,
                headers: new Headers(),
                data,
              }) as HttpResponse,
          )
        : Promise.resolve({
            status: 200,
            ok: true,
            headers: new Headers(),
            data: {},
          } as HttpResponse);
    const http = {
      get: mock((url: string) => respond(url)),
      post: mock(() => Promise.resolve({} as HttpResponse)),
      put: mock(() => Promise.resolve({} as HttpResponse)),
      patch: mock(() => Promise.resolve({} as HttpResponse)),
      del: mock(() => Promise.resolve({} as HttpResponse)),
      request: mock((url: string) => respond(url)),
    } as unknown as HttpClient;

    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("slow", "192.168.1.220", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 20);

    const setIntervalSpy = spyOn(globalThis, "setInterval");
    const registerSpy = spyOn(shelly, "registerChannel");

    const started = source.start();
    source.stop();

    resolveComponents({
      components: [makeComponent("switch:0"), makeComponent("switch:1")],
      total: 2,
    });
    await started;

    expect(source.list()).toEqual([]);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(registerSpy).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    registerSpy.mockRestore();
  });

  it("prunes the old channel record when a component is renamed", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0", "old"), makeComponent("switch:1", "other")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.230", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();
    expect(sortedIds(source)).toEqual(["old", "other"]);

    routed.setComponents([makeComponent("switch:0", "new"), makeComponent("switch:1", "other")]);
    shelly.register("strip", "192.168.1.230", "switch");
    await new Promise((r) => setTimeout(r, 10));

    expect(source.get("old")).toBeUndefined();
    expect(source.get("new")).toBeDefined();
    await expect(shelly.turnOn("old")).rejects.toThrow(/not registered/);
    await expect(shelly.turnOn("new")).resolves.toBeDefined();

    source.stop();
  });

  it("declares energy for a metered channel immediately after start()", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0", null, true)],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("metered_plug", "192.168.1.240", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    const device = source.get("metered_plug");
    expect(device?.capabilities.some((c) => c.property === "energy")).toBe(true);
    // Discovery seeds the metering flag, not a fabricated reading.
    expect(device?.state.energy).toBeUndefined();

    source.stop();
  });

  it("does not resurrect a retained vanished channel on an MQTT online message", async () => {
    mqttMock.setComponents([
      makeComponent("switch:0"),
      makeComponent("switch:1"),
      makeComponent("switch:2"),
    ]);
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("pro", { transport: "mqtt", topicPrefix: "shellypro-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    expect(sortedIds(source)).toEqual(["pro_0", "pro_1", "pro_2"]);

    // switch:2 vanishes from a later inventory and is retained unreachable.
    mqttMock.setComponents([makeComponent("switch:0"), makeComponent("switch:1")]);
    shelly.register("pro", { transport: "mqtt", topicPrefix: "shellypro-abc" });
    await new Promise((r) => setTimeout(r, 10));

    expect(source.get("pro_2")?.reachable).toBe(false);

    // A device-wide presence message must not resurrect the retained channel.
    mqttMock.emit("shellypro-abc/online", true);

    expect(source.get("pro_0")?.reachable).toBe(true);
    expect(source.get("pro_1")?.reachable).toBe(true);
    expect(source.get("pro_2")?.reachable).toBe(false);

    source.stop();
  });

  it("returns not_found for a retained vanished channel instead of dispatching to it", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0"), makeComponent("switch:1"), makeComponent("switch:2")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.72", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    routed.setComponents([makeComponent("switch:0"), makeComponent("switch:1")]);
    shelly.register("strip", "192.168.1.72", "switch");
    await new Promise((r) => setTimeout(r, 10));

    expect(source.get("strip_2")?.reachable).toBe(false);

    // The retained channel resolves but no longer maps to a live component, so
    // it is rejected as not found without reaching the transport.
    routed.calls.length = 0;
    expect(await source.command("strip_2", { on: true })).toEqual({ status: "not_found" });
    expect(routed.calls.filter((url) => url.includes("Switch.Set"))).toHaveLength(0);

    // A live channel is still commandable and actuates its own channel.
    routed.calls.length = 0;
    expect(await source.command("strip_1", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=1");

    source.stop();
  });

  it("returns not_found for a re-resolved retained channel with no service record", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0"), makeComponent("switch:1", "foo")],
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.73", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    // switch:1 ("foo") vanishes and switch:2 reuses the configured name, so the
    // retained entry is re-resolved to strip_1 with no channel record.
    routed.setComponents([makeComponent("switch:0"), makeComponent("switch:2", "foo")]);
    shelly.register("strip", "192.168.1.73", "switch");
    await new Promise((r) => setTimeout(r, 10));

    expect(source.get("strip_1")?.reachable).toBe(false);

    // Before the fix this threw through the service; it must be an outcome.
    routed.calls.length = 0;
    expect(await source.command("strip_1", { on: true })).toEqual({ status: "not_found" });
    expect(routed.calls.filter((url) => url.includes("Switch.Set"))).toHaveLength(0);

    // The live claimant of the configured name still commands channel 2.
    routed.calls.length = 0;
    expect(await source.command("foo", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=2");

    source.stop();
  });

  it("does not resurrect a retained channel when an in-flight HTTP poll resolves after re-registration", async () => {
    let releaseChannel2!: (value: unknown) => void;
    const channel2Status = new Promise<unknown>((resolve) => {
      releaseChannel2 = resolve;
    });
    let channel2Requested = false;
    let components: unknown[] = [
      makeComponent("switch:0"),
      makeComponent("switch:1"),
      makeComponent("switch:2"),
    ];

    const respond = (url: string): HttpResponse | Promise<HttpResponse> => {
      const parsed = new URL(url);
      const method = parsed.pathname.replace(/^\/rpc\//, "");
      const channel = Number.parseInt(parsed.searchParams.get("id") ?? "0", 10);
      if (method === "Shelly.GetComponents") {
        return {
          status: 200,
          ok: true,
          headers: new Headers(),
          data: { components, total: components.length },
        };
      }
      if (method === "Switch.GetStatus") {
        if (channel === 2) {
          channel2Requested = true;
          return channel2Status.then((data) => ({
            status: 200,
            ok: true,
            headers: new Headers(),
            data,
          }));
        }
        return {
          status: 200,
          ok: true,
          headers: new Headers(),
          data: { output: false, apower: 0, voltage: 230, current: 0 },
        };
      }
      return { status: 200, ok: true, headers: new Headers(), data: {} };
    };

    const http = {
      get: mock((url: string) => Promise.resolve(respond(url))),
      post: mock(() => Promise.resolve({} as HttpResponse)),
      put: mock(() => Promise.resolve({} as HttpResponse)),
      patch: mock(() => Promise.resolve({} as HttpResponse)),
      del: mock(() => Promise.resolve({} as HttpResponse)),
      request: mock((url: string) => Promise.resolve(respond(url))),
    } as unknown as HttpClient;

    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("strip", "192.168.1.95", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();
    expect(source.get("strip_2")?.reachable).toBe(true);

    // Start a poll tick and wait until it reaches channel 2's status request.
    const poll = (source as unknown as { poll: () => Promise<void> }).poll();
    while (!channel2Requested) await new Promise((r) => setTimeout(r, 1));

    // Re-registration drops switch:2, retaining it as unreachable.
    components = [makeComponent("switch:0"), makeComponent("switch:1")];
    shelly.register("strip", "192.168.1.95", "switch");
    await new Promise((r) => setTimeout(r, 10));
    expect(source.get("strip_2")?.reachable).toBe(false);

    // The in-flight poll now resolves with data for the vanished channel; it
    // must not resurrect the retained entry.
    releaseChannel2({ output: true, apower: 99, voltage: 230, current: 0.5 });
    await poll;

    expect(source.get("strip_2")?.reachable).toBe(false);
    expect(source.get("strip_2")?.state.on).toBeUndefined();

    source.stop();
  });

  it("does not apply a status notification to a retained vanished channel", async () => {
    mqttMock.setComponents([
      makeComponent("switch:0"),
      makeComponent("switch:1"),
      makeComponent("switch:2"),
    ]);
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("pro", { transport: "mqtt", topicPrefix: "shellypro-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    await source.start();

    // switch:2 vanishes from a later inventory and is retained unreachable.
    mqttMock.setComponents([makeComponent("switch:0"), makeComponent("switch:1")]);
    shelly.register("pro", { transport: "mqtt", topicPrefix: "shellypro-abc" });
    await new Promise((r) => setTimeout(r, 10));
    expect(source.get("pro_2")?.reachable).toBe(false);

    // A late status notification for the vanished component must not write
    // state onto the retained entry.
    mqttMock.emit("shellypro-abc/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:2": { output: true, apower: 7, voltage: 230, current: 0.03 } },
    });

    expect(source.get("pro_2")?.state.on).toBeUndefined();
    expect(source.get("pro_2")?.reachable).toBe(false);

    source.stop();
  });
});

// ---------------------------------------------------------------------------
// End-to-end per-channel verification
// ---------------------------------------------------------------------------

describe("ShellyDeviceSource end-to-end per-channel", () => {
  let mqttMock: ReturnType<typeof createMockMqtt>;

  beforeEach(() => {
    mqttMock = createMockMqtt();
  });

  it("HTTP: enumerates a Pro 4PM per channel, reports each independently, and commands channel 1", async () => {
    const routed = createRoutedHttpMock({
      // A realistic inventory also carries non-controllable components the
      // source must ignore (only switch/cover are enumerated).
      components: [
        makeComponent("wifi:0"),
        makeComponent("input:0"),
        makeComponent("switch:0"),
        makeComponent("switch:1"),
        makeComponent("switch:2"),
        makeComponent("switch:3"),
      ],
      switchStatus: (channel) => ({
        output: channel % 2 === 0,
        apower: channel + 1,
        voltage: 230,
        current: 0.01,
      }),
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("pro4pm", "192.168.1.100", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 20);

    await source.start();

    expect(sortedIds(source)).toEqual(["pro4pm_0", "pro4pm_1", "pro4pm_2", "pro4pm_3"]);
    expect(source.get("pro4pm")).toBeUndefined();

    await new Promise((r) => setTimeout(r, 60));

    for (let channel = 0; channel < 4; channel += 1) {
      const device = source.get(`pro4pm_${channel}`);
      expect(device?.state.on).toBe(channel % 2 === 0);
      expect(device?.state.power).toBe(channel + 1);
    }

    routed.calls.length = 0;
    expect(await source.command("pro4pm_1", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=1");

    source.stop();
  });

  it("MQTT: enumerates a Pro 4PM per channel, isolates switch:2 status, and commands channel 3", async () => {
    mqttMock.setComponents([
      makeComponent("switch:0"),
      makeComponent("switch:1"),
      makeComponent("switch:2"),
      makeComponent("switch:3"),
    ]);
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("pro", { transport: "mqtt", topicPrefix: "shellypro4pm-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    expect(sortedIds(source)).toEqual(["pro_0", "pro_1", "pro_2", "pro_3"]);

    mqttMock.emit("shellypro4pm-abc/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:2": { output: true, apower: 7, voltage: 230, current: 0.03 } },
    });

    expect(source.get("pro_2")?.state.on).toBe(true);
    expect(source.get("pro_0")?.state.on).toBeUndefined();
    expect(source.get("pro_1")?.state.on).toBeUndefined();
    expect(source.get("pro_3")?.state.on).toBeUndefined();

    const publishMock = mqttMock.mqtt.publish as ReturnType<typeof mock>;
    publishMock.mockClear();

    expect(await source.command("pro_3", { on: true })).toEqual({ status: "ok" });
    const setFrames = publishMock.mock.calls
      .map((call) => call[1] as { method?: string; params?: { id?: number } })
      .filter((frame) => frame.method === "Switch.Set");
    expect(setFrames).toHaveLength(1);
    expect(setFrames[0].params?.id).toBe(3);

    source.stop();
  });

  it("leaves a single-component Plus 1PM unchanged and defaults the RPC to channel 0", async () => {
    const routed = createRoutedHttpMock({
      components: [makeComponent("switch:0")],
      switchStatus: () => ({ output: false, apower: 0, voltage: 230, current: 0 }),
    });
    const shelly = new ShellyService(routed.http, mqttMock.mqtt, logger);
    shelly.register("plus1pm", "192.168.1.101", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);

    await source.start();

    const descriptors = source.list();
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].id).toBe("plus1pm");

    routed.calls.length = 0;
    expect(await source.command("plus1pm", { on: true })).toEqual({ status: "ok" });
    const setCalls = routed.calls.filter((url) => url.includes("Switch.Set"));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toContain("id=0");

    source.stop();
  });

  // -------------------------------------------------------------------------
  // Durable device state store
  // -------------------------------------------------------------------------

  it("seeds enumeration from the durable store's last-known state before any observation", async () => {
    const store = new DeviceStateStore(logger, { persist: false });
    const storedObservation = {
      mode: "polled" as const,
      observedAt: 1_700_000_000_000,
      refreshIntervalMs: 1_000_000,
    };
    store.record("shelly:plug", { on: true, power: 12 }, storedObservation);

    const http = createMockHttp({ output: false, apower: 0, voltage: 230, current: 0 });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("plug", "192.168.1.50", "switch");
    // A long poll interval means no observation is made during start(), so the
    // descriptor's state must come from the store's seed.
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000, store);
    await source.start();

    const device = source.get("plug");
    expect(device?.state).toEqual({ on: true, power: 12 });
    expect(device?.observation).toEqual(storedObservation);

    source.stop();
  });

  it("a fresh observation supersedes the seed and updates the store", async () => {
    const store = new DeviceStateStore(logger, { persist: false });
    store.record(
      "shelly:plug",
      { on: false },
      { mode: "polled" as const, observedAt: 1_700_000_000_000, refreshIntervalMs: 1_000_000 },
    );

    const http = createMockHttp({ output: true, apower: 12, voltage: 231, current: 0.05 });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("plug", "192.168.1.50", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 20, store);
    await source.start();

    await new Promise((r) => setTimeout(r, 50));

    const device = source.get("plug");
    expect(device?.state.on).toBe(true);
    expect(device?.observation.mode).toBe("polled");
    expect(store.get("shelly:plug")?.state).toEqual(device?.state);
    expect(store.get("shelly:plug")?.observation.observedAt).toBeGreaterThan(1_700_000_000_000);

    source.stop();
  });
});
