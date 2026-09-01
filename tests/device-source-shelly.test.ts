import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { formatQualifiedId } from "../src/core/device-sources/qualified-id.js";
import { ShellyDeviceSource } from "../src/core/device-sources/shelly-source.js";
import type { HttpClient, HttpResponse } from "../src/core/http/http-client.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";
import { ShellyService } from "../src/core/services/shelly-service.js";

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

function createMockMqtt() {
  const handlersByTopic = new Map<string, MqttMessageHandler>();
  const mqtt = {
    subscribe: mock((topic: string, handler: MqttMessageHandler) => {
      handlersByTopic.set(topic, handler);
    }),
    unsubscribe: mock((topic: string) => handlersByTopic.delete(topic)),
    publish: mock(() => {}),
  } as unknown as MqttService;
  function emit(topic: string, payload: unknown): void {
    handlersByTopic.get(topic)?.(topic, payload as Record<string, unknown>);
  }
  return { mqtt, emit, handlersByTopic };
}

describe("ShellyDeviceSource", () => {
  let mqttMock: ReturnType<typeof createMockMqtt>;

  beforeEach(() => {
    mqttMock = createMockMqtt();
  });

  it("reports unavailable and yields no devices when the shelly service is null", () => {
    const source = new ShellyDeviceSource(null, mqttMock.mqtt, logger, 1_000_000);
    expect(source.available).toBe(false);
    expect(source.list()).toEqual([]);
  });

  it("declares a full capability description for a switch device", () => {
    const http = createMockHttp({ output: false, apower: 0, voltage: 230, current: 0 });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("plug", "192.168.1.50", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    source.start();

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

  it("declares a full capability description for a cover device", () => {
    const http = createMockHttp({ current_pos: 50, state: "stopped" });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("blinds", "192.168.1.60", "cover");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    source.start();

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
    source.start();

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
    source.start();

    await new Promise((r) => setTimeout(r, 60));
    expect(getSpy).not.toHaveBeenCalled();

    source.stop();
  });

  it("marks an MQTT-transport device unreachable on presence loss and reachable again on return", () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    source.start();

    mqttMock.emit("shellyplus1-abc/online", false);
    expect(source.get("mqtt_plug")?.reachable).toBe(false);

    mqttMock.emit("shellyplus1-abc/online", true);
    expect(source.get("mqtt_plug")?.reachable).toBe(true);

    source.stop();
  });

  it("applies a push status update from NotifyStatus without polling", () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    source.start();

    mqttMock.emit("shellyplus1-abc/events/rpc", {
      method: "NotifyStatus",
      params: { "switch:0": { output: true, apower: 3, voltage: 230, current: 0.01 } },
    });

    const device = source.get("mqtt_plug");
    expect(device?.state.on).toBe(true);
    expect(device?.observation.mode).toBe("push");

    source.stop();
  });

  it("picks up a device registered after the source has started", () => {
    const http = createMockHttp({ output: false });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    source.start();

    expect(source.list()).toHaveLength(0);
    shelly.register("late_plug", "192.168.1.70", "switch");
    expect(source.list()).toHaveLength(1);

    source.stop();
  });

  it("dispatches an on/off command through ShellyService", async () => {
    const http = createMockHttp({ was_on: false });
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("plug", "192.168.1.50", "switch");
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    source.start();

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
    source.start();

    const outcome = await source.command("blinds", { position: 40 });
    expect(outcome).toEqual({ status: "ok" });
    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("Cover.GoToPosition"));

    source.stop();
  });

  it("returns not_found for an unknown device id", async () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    source.start();

    const outcome = await source.command("unknown", {});
    expect(outcome).toEqual({ status: "not_found" });

    source.stop();
  });

  it("returns unavailable for a command when the shelly service is null", async () => {
    const source = new ShellyDeviceSource(null, mqttMock.mqtt, logger, 1_000_000);
    const outcome = await source.command("plug", {});
    expect(outcome).toEqual({ status: "unavailable" });
  });

  it("stop() clears MQTT subscriptions", () => {
    const http = createMockHttp({});
    const shelly = new ShellyService(http, mqttMock.mqtt, logger);
    shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    const source = new ShellyDeviceSource(shelly, mqttMock.mqtt, logger, 1_000_000);
    source.start();

    expect(mqttMock.handlersByTopic.size).toBeGreaterThan(0);
    source.stop();
    expect(mqttMock.handlersByTopic.size).toBe(0);
  });

  it("an unreachable HTTP device does not halt the poll cycle", async () => {
    const failing = createMockHttp({});
    (failing.get as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error("network error")),
    );
    const failingShelly = new ShellyService(failing, mqttMock.mqtt, logger);
    failingShelly.register("broken", "192.168.1.99", "switch");
    const source = new ShellyDeviceSource(failingShelly, mqttMock.mqtt, logger, 20);
    source.start();

    await new Promise((r) => setTimeout(r, 50));
    expect(source.get("broken")?.reachable).toBe(false);

    // A second poll tick still runs — the failure did not clear the interval.
    await new Promise((r) => setTimeout(r, 40));
    expect(source.get("broken")?.reachable).toBe(false);

    source.stop();
  });
});
