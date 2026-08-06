import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { HttpClient, HttpResponse } from "../src/core/http/http-client.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";
import { ShellyService } from "../src/core/services/shelly-service.js";

const logger = pino({ level: "silent" });

function createMockHttp(responseData: unknown = {}): HttpClient {
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

/** A minimal MqttService mock that records subscriptions/publishes and lets tests drive responses. */
function createMockMqtt(): MqttService & {
  publishedTopics: string[];
  publishedPayloads: Record<string, unknown>[];
  handlersByTopic: Map<string, MqttMessageHandler>;
} {
  const handlersByTopic = new Map<string, MqttMessageHandler>();
  const publishedTopics: string[] = [];
  const publishedPayloads: Record<string, unknown>[] = [];
  return {
    handlersByTopic,
    publishedTopics,
    publishedPayloads,
    subscribe: mock((topic: string, handler: MqttMessageHandler) => {
      handlersByTopic.set(topic, handler);
    }),
    unsubscribe: mock((topic: string) => {
      handlersByTopic.delete(topic);
    }),
    publish: mock((topic: string, payload: Record<string, unknown>) => {
      publishedTopics.push(topic);
      publishedPayloads.push(payload);
    }),
  } as unknown as MqttService & {
    publishedTopics: string[];
    publishedPayloads: Record<string, unknown>[];
    handlersByTopic: Map<string, MqttMessageHandler>;
  };
}

describe("ShellyService", () => {
  let shelly: ShellyService;
  let http: ReturnType<typeof createMockHttp>;
  let mqtt: ReturnType<typeof createMockMqtt>;

  beforeEach(() => {
    http = createMockHttp({ was_on: false });
    mqtt = createMockMqtt();
    shelly = new ShellyService(http, mqtt, logger);
  });

  describe("device registration", () => {
    it("registers a device by name and host", () => {
      shelly.register("plug1", "192.168.1.50");
      // Should not throw when used
      expect(shelly.getDeviceInfo("plug1")).resolves.toBeDefined();
    });

    it("registers multiple devices with an array", () => {
      shelly.registerMany([
        { name: "plug1", host: "192.168.1.50" },
        { name: "plug2", host: "192.168.1.51" },
      ]);
      expect(shelly.getDeviceInfo("plug1")).resolves.toBeDefined();
      expect(shelly.getDeviceInfo("plug2")).resolves.toBeDefined();
    });

    it("registers multiple devices with a record", () => {
      shelly.registerMany({
        plug1: "192.168.1.50",
        plug2: "192.168.1.51",
      });
      expect(shelly.getDeviceInfo("plug1")).resolves.toBeDefined();
      expect(shelly.getDeviceInfo("plug2")).resolves.toBeDefined();
    });

    it("strips http:// scheme from host", async () => {
      shelly.register("plug", "http://192.168.1.50");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://192.168.1.50/rpc/");
      expect(url).not.toContain("http://http://");
    });

    it("strips https:// scheme from host", async () => {
      shelly.register("plug", "https://shelly-plug.local");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toBe("http://shelly-plug.local/rpc/Switch.Set?id=0&on=true");
    });

    it("strips trailing slashes from host", async () => {
      shelly.register("plug", "192.168.1.50/");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://192.168.1.50/rpc/");
    });

    it("accepts hostname with port", async () => {
      shelly.register("plug", "shelly-plug.local:8080");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://shelly-plug.local:8080/rpc/");
    });

    it("accepts mDNS .local hostnames", async () => {
      shelly.register("plug", "shellyplusplugs-aabbcc.local");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://shellyplusplugs-aabbcc.local/rpc/");
    });

    it("throws for unregistered devices", () => {
      expect(shelly.turnOn("unknown")).rejects.toThrow('Shelly device "unknown" is not registered');
    });

    it("defaults device type to switch when omitted", () => {
      shelly.register("plug", "192.168.1.6");
      const [device] = shelly.getDevices();
      expect(device.type).toBe("switch");
    });

    it("stores an explicit device type", () => {
      shelly.register("blind", "192.168.1.5", "cover");
      const device = shelly.getDevices().find((d) => d.name === "blind");
      expect(device?.type).toBe("cover");
    });

    it("registerMany preserves per-device type", () => {
      shelly.registerMany([
        { name: "plug", host: "192.168.1.50" },
        { name: "blind", host: "192.168.1.60", type: "cover" },
      ]);
      const devices = shelly.getDevices();
      expect(devices.find((d) => d.name === "plug")?.type).toBe("switch");
      expect(devices.find((d) => d.name === "blind")?.type).toBe("cover");
    });
  });

  describe("device inventory", () => {
    it("getDevices returns all registered devices with normalized host and type", () => {
      shelly.register("plug", "http://192.168.1.50/", "outlet");
      shelly.register("blind", "192.168.1.60", "cover");
      const devices = shelly.getDevices();
      expect(devices).toHaveLength(2);
      const plug = devices.find((d) => d.name === "plug");
      expect(plug).toEqual({
        name: "plug",
        host: "192.168.1.50",
        type: "outlet",
        transport: "http",
      });
      const blind = devices.find((d) => d.name === "blind");
      expect(blind).toEqual({
        name: "blind",
        host: "192.168.1.60",
        type: "cover",
        transport: "http",
      });
    });
  });

  describe("MQTT device registration", () => {
    it("registers an MQTT-transport device via the object-form overload", () => {
      shelly.register("garage_plug", {
        transport: "mqtt",
        topicPrefix: "shellyplus1-a8032abe54dc",
      });
      const device = shelly.getDevices().find((d) => d.name === "garage_plug");
      expect(device).toEqual({
        name: "garage_plug",
        type: "switch",
        transport: "mqtt",
        topicPrefix: "shellyplus1-a8032abe54dc",
      });
    });

    it("stores an explicit type on the object-form overload", () => {
      shelly.register("garage_cover", {
        transport: "mqtt",
        topicPrefix: "shellyplus2pm-abc",
        type: "cover",
      });
      const device = shelly.getDevices().find((d) => d.name === "garage_cover");
      expect(device?.type).toBe("cover");
    });

    it("registerMany accepts mixed HTTP/MQTT entries", () => {
      shelly.registerMany([
        { name: "http_plug", host: "192.168.1.50" },
        { name: "mqtt_plug", transport: "mqtt", topicPrefix: "shellyplus1-abc" },
      ]);
      const devices = shelly.getDevices();
      expect(devices.find((d) => d.name === "http_plug")?.transport).toBe("http");
      expect(devices.find((d) => d.name === "mqtt_plug")?.transport).toBe("mqtt");
      expect(devices.find((d) => d.name === "mqtt_plug")?.topicPrefix).toBe("shellyplus1-abc");
    });
  });

  describe("registration events", () => {
    it("fires listeners with the registered device", () => {
      const received: string[] = [];
      shelly.onDeviceRegistered((d) => received.push(`${d.name}:${d.type}`));
      shelly.register("plug", "192.168.1.50", "outlet");
      expect(received).toEqual(["plug:outlet"]);
    });

    it("does not fire removed listeners", () => {
      const cb = mock(() => {});
      shelly.onDeviceRegistered(cb);
      shelly.offDeviceRegistered(cb);
      shelly.register("plug", "192.168.1.50");
      expect(cb).toHaveBeenCalledTimes(0);
    });

    it("isolates a throwing listener so others still run", () => {
      const good = mock(() => {});
      shelly.onDeviceRegistered(() => {
        throw new Error("boom");
      });
      shelly.onDeviceRegistered(good);
      shelly.register("plug", "192.168.1.50");
      expect(good).toHaveBeenCalledTimes(1);
    });
  });

  describe("switch control", () => {
    beforeEach(() => {
      shelly.register("plug", "192.168.1.50");
    });

    it("turnOn sends correct RPC URL", async () => {
      await shelly.turnOn("plug");
      expect(http.get).toHaveBeenCalledTimes(1);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("http://192.168.1.50/rpc/Switch.Set");
      expect(url).toContain("id=0");
      expect(url).toContain("on=true");
    });

    it("turnOn with toggleAfter includes toggle_after param", async () => {
      await shelly.turnOn("plug", 3600);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("toggle_after=3600");
    });

    it("turnOff sends correct RPC URL", async () => {
      await shelly.turnOff("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("on=false");
    });

    it("turnOff with toggleAfter includes toggle_after param", async () => {
      await shelly.turnOff("plug", 60);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("toggle_after=60");
    });

    it("toggle sends correct RPC URL", async () => {
      await shelly.toggle("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Switch.Toggle");
      expect(url).toContain("id=0");
    });
  });

  describe("status and info", () => {
    beforeEach(() => {
      http = createMockHttp({ output: true, apower: 42.5 });
      shelly = new ShellyService(http, mqtt, logger);
      shelly.register("plug", "192.168.1.50");
    });

    it("getStatus returns parsed response", async () => {
      const status = await shelly.getStatus("plug");
      expect(status.output).toBe(true);
      expect(status.apower).toBe(42.5);
    });

    it("getStatus calls correct URL", async () => {
      await shelly.getStatus("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Switch.GetStatus");
    });

    it("getConfig calls correct URL", async () => {
      await shelly.getConfig("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Switch.GetConfig");
    });

    it("getDeviceInfo calls correct URL without params", async () => {
      await shelly.getDeviceInfo("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Shelly.GetDeviceInfo");
      expect(url).not.toContain("?");
    });

    it("getSysStatus calls correct URL", async () => {
      await shelly.getSysStatus("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Sys.GetStatus");
    });

    it("isOn returns true when output is true", async () => {
      expect(await shelly.isOn("plug")).toBe(true);
    });

    it("isOn returns false when output is false", async () => {
      http = createMockHttp({ output: false, apower: 0 });
      shelly = new ShellyService(http, mqtt, logger);
      shelly.register("plug", "192.168.1.50");
      expect(await shelly.isOn("plug")).toBe(false);
    });

    it("getPower returns apower value", async () => {
      expect(await shelly.getPower("plug")).toBe(42.5);
    });
  });

  describe("reboot", () => {
    beforeEach(() => {
      shelly.register("plug", "192.168.1.50");
    });

    it("calls Shelly.Reboot without delay", async () => {
      await shelly.reboot("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Shelly.Reboot");
      expect(url).not.toContain("delay_ms");
    });

    it("calls Shelly.Reboot with delay", async () => {
      await shelly.reboot("plug", 5000);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("delay_ms=5000");
    });
  });

  describe("cover control", () => {
    beforeEach(() => {
      http = createMockHttp({ state: "open", current_pos: 75, apower: 0 });
      shelly = new ShellyService(http, mqtt, logger);
      shelly.register("shutter", "192.168.1.60");
    });

    it("coverOpen sends Cover.Open RPC", async () => {
      await shelly.coverOpen("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.Open");
      expect(url).toContain("id=0");
    });

    it("coverOpen sends duration param when provided", async () => {
      await shelly.coverOpen("shutter", 5);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("duration=5");
    });

    it("coverClose sends Cover.Close RPC", async () => {
      await shelly.coverClose("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.Close");
    });

    it("coverClose sends duration param when provided", async () => {
      await shelly.coverClose("shutter", 3);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("duration=3");
    });

    it("coverStop sends Cover.Stop RPC", async () => {
      await shelly.coverStop("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.Stop");
    });

    it("coverGoToPosition sends pos param", async () => {
      await shelly.coverGoToPosition("shutter", 50);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.GoToPosition");
      expect(url).toContain("pos=50");
    });

    it("coverMoveRelative sends rel param", async () => {
      await shelly.coverMoveRelative("shutter", -20);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.GoToPosition");
      expect(url).toContain("rel=-20");
    });

    it("getCoverStatus calls Cover.GetStatus", async () => {
      const status = await shelly.getCoverStatus("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.GetStatus");
      expect(status.state).toBe("open");
    });

    it("getCoverConfig calls Cover.GetConfig", async () => {
      await shelly.getCoverConfig("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.GetConfig");
    });

    it("coverCalibrate calls Cover.Calibrate", async () => {
      await shelly.coverCalibrate("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.Calibrate");
    });

    it("getCoverPosition returns current_pos from status", async () => {
      const pos = await shelly.getCoverPosition("shutter");
      expect(pos).toBe(75);
    });

    it("getCoverPosition returns null when uncalibrated", async () => {
      http = createMockHttp({ state: "stopped", current_pos: null });
      shelly = new ShellyService(http, mqtt, logger);
      shelly.register("shutter", "192.168.1.60");
      const pos = await shelly.getCoverPosition("shutter");
      expect(pos).toBeNull();
    });

    it("getCoverState returns state from status", async () => {
      const state = await shelly.getCoverState("shutter");
      expect(state).toBe("open");
    });
  });

  describe("error handling", () => {
    it("throws on non-OK HTTP response", async () => {
      const errorHttp = {
        get: mock(() =>
          Promise.resolve({
            status: 500,
            ok: false,
            headers: new Headers(),
            data: {},
          }),
        ),
      } as unknown as HttpClient;

      const s = new ShellyService(errorHttp, mqtt, logger);
      s.register("plug", "192.168.1.50");
      expect(s.turnOn("plug")).rejects.toThrow("HTTP 500");
    });

    it("throws a descriptive error on an RPC error body returned with HTTP 200", async () => {
      const errorHttp = {
        get: mock(() =>
          Promise.resolve({
            status: 200,
            ok: true,
            headers: new Headers(),
            data: { error: { code: -32602, message: "Invalid params" } },
          }),
        ),
      } as unknown as HttpClient;

      const s = new ShellyService(errorHttp, mqtt, logger);
      s.register("plug", "192.168.1.50");
      expect(s.getStatus("plug")).rejects.toThrow(/returned an error/);
    });

    it("throws a descriptive error when the body is not an object", async () => {
      const errorHttp = {
        get: mock(() =>
          Promise.resolve({
            status: 200,
            ok: true,
            headers: new Headers(),
            data: "unexpected string body",
          }),
        ),
      } as unknown as HttpClient;

      const s = new ShellyService(errorHttp, mqtt, logger);
      s.register("plug", "192.168.1.50");
      expect(s.getStatus("plug")).rejects.toThrow(/unexpected response body/);
    });
  });

  describe("MQTT RPC transport", () => {
    const SRC_TOPIC = "ts-home-automation/rpc";

    beforeEach(() => {
      shelly.register("garage_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });
    });

    it("publishes a JSON-RPC request to <topicPrefix>/rpc and makes no HTTP request", async () => {
      const promise = shelly.turnOn("garage_plug");
      expect(mqtt.publishedTopics[0]).toBe("shellyplus1-abc/rpc");
      const request = mqtt.publishedPayloads[0] as { id: number; src: string; method: string };
      expect(request.src).toBe("ts-home-automation");
      expect(request.method).toBe("Switch.Set");
      expect(http.get).not.toHaveBeenCalled();

      mqtt.handlersByTopic.get(SRC_TOPIC)?.(SRC_TOPIC, {
        id: request.id,
        result: { was_on: false },
      });
      expect(await promise).toEqual({ was_on: false });
    });

    it("subscribes to the shared <src>/rpc topic only once across multiple calls", async () => {
      const p1 = shelly.turnOn("garage_plug");
      const id1 = (mqtt.publishedPayloads[0] as { id: number }).id;
      mqtt.handlersByTopic.get(SRC_TOPIC)?.(SRC_TOPIC, { id: id1, result: { was_on: false } });
      await p1;

      const p2 = shelly.turnOff("garage_plug");
      const id2 = (mqtt.publishedPayloads[1] as { id: number }).id;
      mqtt.handlersByTopic.get(SRC_TOPIC)?.(SRC_TOPIC, { id: id2, result: { was_on: true } });
      await p2;

      const subscribeCalls = (mqtt.subscribe as ReturnType<typeof mock>).mock.calls.filter(
        (call: unknown[]) => call[0] === SRC_TOPIC,
      );
      expect(subscribeCalls).toHaveLength(1);
    });

    it("rejects with a descriptive error on an error response", async () => {
      const promise = shelly.turnOn("garage_plug");
      const request = mqtt.publishedPayloads[0] as { id: number };
      mqtt.handlersByTopic.get(SRC_TOPIC)?.(SRC_TOPIC, {
        id: request.id,
        error: { code: -32602, message: "Invalid params" },
      });
      expect(promise).rejects.toThrow(/returned an error/);
    });

    it("times out with a descriptive error naming device, topicPrefix, method, and duration", async () => {
      const originalSetTimeout = globalThis.setTimeout;
      // Fire the timeout callback synchronously instead of waiting 5s.
      globalThis.setTimeout = ((fn: () => void) => {
        fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout;
      try {
        await expect(shelly.turnOn("garage_plug")).rejects.toThrow(
          /Switch\.Set.*garage_plug.*shellyplus1-abc.*timed out.*5000ms/,
        );
      } finally {
        globalThis.setTimeout = originalSetTimeout;
      }
    });

    it("correlates concurrent requests to different devices by id on the shared subscription", async () => {
      shelly.register("garage_plug_2", { transport: "mqtt", topicPrefix: "shellyplus1-def" });

      const promiseA = shelly.turnOn("garage_plug");
      const promiseB = shelly.turnOn("garage_plug_2");

      const idA = (mqtt.publishedPayloads[0] as { id: number }).id;
      const idB = (mqtt.publishedPayloads[1] as { id: number }).id;
      expect(idA).not.toBe(idB);

      // Respond out of order — both must resolve to the correct pending call.
      mqtt.handlersByTopic.get(SRC_TOPIC)?.(SRC_TOPIC, { id: idB, result: { was_on: true } });
      mqtt.handlersByTopic.get(SRC_TOPIC)?.(SRC_TOPIC, { id: idA, result: { was_on: false } });

      expect(await promiseA).toEqual({ was_on: false });
      expect(await promiseB).toEqual({ was_on: true });
    });

    it("does not retry over HTTP when the MQTT call fails", async () => {
      const promise = shelly.turnOn("garage_plug");
      const request = mqtt.publishedPayloads[0] as { id: number };
      mqtt.handlersByTopic.get(SRC_TOPIC)?.(SRC_TOPIC, {
        id: request.id,
        error: { code: -1, message: "boom" },
      });
      await expect(promise).rejects.toThrow();
      expect(http.get).not.toHaveBeenCalled();
    });
  });
});
