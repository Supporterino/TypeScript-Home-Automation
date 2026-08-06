import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { HttpClient, HttpResponse } from "../src/core/http/http-client.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";
import type { CreatedAccessory } from "../src/core/services/homekit-accessory-factory.js";
import type { AccessorySink } from "../src/core/services/homekit-sources/accessory-source.js";
import type { ShellyAccessoryFactory } from "../src/core/services/homekit-sources/shelly-source.js";
import { ShellySource } from "../src/core/services/homekit-sources/shelly-source.js";
import { type ShellyDevice, ShellyService } from "../src/core/services/shelly-service.js";

const logger = pino({ level: "silent" });

function createMockHttp(responseData: unknown, ok = true): HttpClient {
  const response: HttpResponse = {
    status: ok ? 200 : 500,
    ok,
    headers: new Headers(),
    data: responseData,
  };
  return {
    get: mock(() => Promise.resolve(response)),
    post: mock(() => Promise.resolve(response)),
    put: mock(() => Promise.resolve(response)),
    patch: mock(() => Promise.resolve(response)),
    del: mock(() => Promise.resolve(response)),
    request: mock(() => Promise.resolve(response)),
  } as unknown as HttpClient;
}

/** A minimal MqttService mock that records subscriptions and lets tests drive incoming messages. */
function createMockMqtt(): MqttService & {
  handlersByTopic: Map<string, MqttMessageHandler>;
  subscribedTopics: string[];
  unsubscribedTopics: string[];
} {
  const handlersByTopic = new Map<string, MqttMessageHandler>();
  const subscribedTopics: string[] = [];
  const unsubscribedTopics: string[] = [];
  return {
    handlersByTopic,
    subscribedTopics,
    unsubscribedTopics,
    subscribe: mock((topic: string, handler: MqttMessageHandler) => {
      handlersByTopic.set(topic, handler);
      subscribedTopics.push(topic);
    }),
    unsubscribe: mock((topic: string) => {
      handlersByTopic.delete(topic);
      unsubscribedTopics.push(topic);
    }),
    publish: mock(() => {}),
  } as unknown as MqttService & {
    handlersByTopic: Map<string, MqttMessageHandler>;
    subscribedTopics: string[];
    unsubscribedTopics: string[];
  };
}

/** A fake CreatedAccessory that records updateState and updateReachability calls. */
function makeFakeAccessory(): CreatedAccessory & {
  states: unknown[];
  reachability: boolean[];
} {
  const states: unknown[] = [];
  const reachability: boolean[] = [];
  return {
    accessory: {
      UUID: "fake",
      updateReachability: (reachable: boolean) => {
        reachability.push(reachable);
      },
    } as unknown as CreatedAccessory["accessory"],
    updateState: (state) => {
      states.push(state);
    },
    states,
    reachability,
  };
}

function createSink(): AccessorySink & {
  added: Map<string, CreatedAccessory>;
  removed: string[];
} {
  const added = new Map<string, CreatedAccessory>();
  const removed: string[] = [];
  return {
    added,
    removed,
    add: (id, accessory) => {
      added.set(id, accessory);
    },
    remove: (id) => {
      removed.push(id);
    },
  };
}

describe("ShellySource", () => {
  let shelly: ShellyService;
  let mqtt: ReturnType<typeof createMockMqtt>;
  let sink: ReturnType<typeof createSink>;
  let factory: ShellyAccessoryFactory;
  let builtFor: string[];
  let accessoriesByName: Map<string, ReturnType<typeof makeFakeAccessory>>;

  beforeEach(() => {
    mqtt = createMockMqtt();
    shelly = new ShellyService(createMockHttp({ output: false }), mqtt, logger);
    sink = createSink();
    builtFor = [];
    accessoriesByName = new Map();
    factory = (device: ShellyDevice) => {
      builtFor.push(device.name);
      const acc = makeFakeAccessory();
      accessoriesByName.set(device.name, acc);
      return acc;
    };
  });

  it("bridges an accessory for a device registered after start", () => {
    const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
    source.start(sink);
    expect(sink.added.size).toBe(0);

    shelly.register("plug", "192.168.1.50", "switch");

    expect(builtFor).toEqual(["plug"]);
    expect(sink.added.has("shelly:plug")).toBe(true);
    source.stop();
  });

  it("replays already-registered devices at start", () => {
    shelly.register("plug", "192.168.1.50");
    const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
    source.start(sink);
    expect(sink.added.has("shelly:plug")).toBe(true);
    source.stop();
  });

  it("detaches the registration listener on stop", () => {
    const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
    source.start(sink);
    source.stop();
    shelly.register("plug", "192.168.1.50");
    expect(builtFor).toEqual([]);
  });

  it("isolates poll errors per device", async () => {
    // One device returns a good status, the other throws (unreachable).
    const goodHttp: HttpResponse = {
      status: 200,
      ok: true,
      headers: new Headers(),
      data: { output: true },
    };
    const http = {
      get: mock((url: string) => {
        if (url.includes("bad")) return Promise.reject(new Error("unreachable"));
        return Promise.resolve(goodHttp);
      }),
    } as unknown as HttpClient;

    shelly = new ShellyService(http, mqtt, logger);
    shelly.register("good", "good.host", "switch");
    shelly.register("bad", "bad.host", "switch");

    const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
    source.start(sink);

    // Invoke the private poll loop directly (avoids timer flakiness).
    await (source as unknown as { poll: () => Promise<void> }).poll();

    const good = accessoriesByName.get("good");
    const bad = accessoriesByName.get("bad");
    expect(good?.states).toHaveLength(1);
    expect(good?.states[0]).toEqual({ output: true });
    // The bad device errored and pushed no state, but did not abort the tick.
    expect(bad?.states).toHaveLength(0);

    source.stop();
  });

  it("routes switch write-back to turnOn / turnOff", async () => {
    const http = createMockHttp({ was_on: false });
    shelly = new ShellyService(http, mqtt, logger);
    let captured: ((cmd: { on: boolean }) => void) | null = null;
    const capturingFactory: ShellyAccessoryFactory = (_device, onSet) => {
      captured = onSet as (cmd: { on: boolean }) => void;
      return makeFakeAccessory();
    };
    const source = new ShellySource(shelly, mqtt, logger, capturingFactory, 10000);
    source.start(sink);
    shelly.register("plug", "192.168.1.50", "switch");

    captured?.({ on: true });
    await Promise.resolve();
    const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(url).toContain("Switch.Set");
    expect(url).toContain("on=true");
    source.stop();
  });

  describe("MQTT-transport devices", () => {
    it("excludes MQTT-transport devices from the poll loop", async () => {
      const http = createMockHttp({ output: true });
      shelly = new ShellyService(http, mqtt, logger);
      shelly.register("http_plug", "192.168.1.50", "switch");
      shelly.register("mqtt_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });

      const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
      source.start(sink);

      await (source as unknown as { poll: () => Promise<void> }).poll();

      expect(http.get).toHaveBeenCalledTimes(1);
      const httpAcc = accessoriesByName.get("http_plug");
      const mqttAcc = accessoriesByName.get("mqtt_plug");
      expect(httpAcc?.states).toHaveLength(1);
      expect(mqttAcc?.states).toHaveLength(0);

      source.stop();
    });

    it("subscribes to events/rpc and online topics on registration", () => {
      const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
      source.start(sink);

      shelly.register("garage_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });

      expect(mqtt.subscribedTopics).toContain("shellyplus1-abc/events/rpc");
      expect(mqtt.subscribedTopics).toContain("shellyplus1-abc/online");

      source.stop();
    });

    it("pushes NotifyStatus updates into the accessory's updateState", () => {
      const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
      source.start(sink);
      shelly.register("garage_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });

      const handler = mqtt.handlersByTopic.get("shellyplus1-abc/events/rpc");
      handler?.("shellyplus1-abc/events/rpc", {
        src: "shellyplus1-abc",
        method: "NotifyStatus",
        params: { "switch:0": { output: true, apower: 5 } },
      });

      const acc = accessoriesByName.get("garage_plug");
      expect(acc?.states).toEqual([{ output: true, apower: 5 }]);

      source.stop();
    });

    it("skips malformed NotifyStatus payloads without crashing", () => {
      const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
      source.start(sink);
      shelly.register("garage_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });

      const handler = mqtt.handlersByTopic.get("shellyplus1-abc/events/rpc");
      handler?.("shellyplus1-abc/events/rpc", {
        src: "shellyplus1-abc",
        method: "NotifyStatus",
        params: { "cover:0": { position: 50 } }, // wrong component for a switch device
      });

      const acc = accessoriesByName.get("garage_plug");
      expect(acc?.states).toHaveLength(0);

      source.stop();
    });

    it("marks the accessory unreachable on online=false", () => {
      const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
      source.start(sink);
      shelly.register("garage_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });

      const handler = mqtt.handlersByTopic.get("shellyplus1-abc/online");
      handler?.("shellyplus1-abc/online", false as unknown as Record<string, unknown>);

      const acc = accessoriesByName.get("garage_plug");
      expect(acc?.reachability).toEqual([false]);

      source.stop();
    });

    it("marks the accessory reachable again on online=true", () => {
      const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
      source.start(sink);
      shelly.register("garage_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });

      const handler = mqtt.handlersByTopic.get("shellyplus1-abc/online");
      handler?.("shellyplus1-abc/online", false as unknown as Record<string, unknown>);
      handler?.("shellyplus1-abc/online", true as unknown as Record<string, unknown>);

      const acc = accessoriesByName.get("garage_plug");
      expect(acc?.reachability).toEqual([false, true]);

      source.stop();
    });

    it("unsubscribes MQTT topics on stop", () => {
      const source = new ShellySource(shelly, mqtt, logger, factory, 10000);
      source.start(sink);
      shelly.register("garage_plug", { transport: "mqtt", topicPrefix: "shellyplus1-abc" });

      source.stop();

      expect(mqtt.unsubscribedTopics).toContain("shellyplus1-abc/events/rpc");
      expect(mqtt.unsubscribedTopics).toContain("shellyplus1-abc/online");
    });
  });
});
