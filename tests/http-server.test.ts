import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { EventBus } from "../src/core/events/event-bus.js";
import { HttpServer } from "../src/core/http/http-server.js";
import { LogBuffer } from "../src/core/logging/log-buffer.js";
import { RoomManager } from "../src/core/room-manager.js";
import { StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });

// ── Helpers ───────────────────────────────────────────────────────────────

function createMockMqtt(connected = true) {
  return {
    isConnected: connected,
  } as unknown as import("../src/core/mqtt/mqtt-service.js").MqttService;
}

function createMockAutomationManager(
  automations: Array<{
    name: string;
    enabled?: boolean;
    triggers?: unknown[];
    history?: unknown[];
    relationships?: unknown;
  }> = [],
) {
  return {
    listAutomations: mock(() => automations),
    getAutomation: mock((name: string) => automations.find((a) => a.name === name) ?? null),
    triggerAutomation: mock(async (name: string) => {
      const auto = automations.find((a) => a.name === name);
      if (!auto) return "not_found";
      if (auto.enabled === false) return "disabled";
      return "executed";
    }),
    start: mock(async (name: string) => {
      const auto = automations.find((a) => a.name === name);
      if (!auto) return { status: "not_found" };
      auto.enabled = true;
      return { status: "started" };
    }),
    stop: mock(async (name: string) => {
      const auto = automations.find((a) => a.name === name);
      if (!auto) return "not_found";
      auto.enabled = false;
      return "stopped";
    }),
    getSource: mock(async (name: string) => {
      const auto = automations.find((a) => a.name === name);
      if (!auto) return { status: "not_found" };
      return { status: "found", source: `// source for ${name}` };
    }),
    getHistory: mock((name: string) => {
      const auto = automations.find((a) => a.name === name);
      if (!auto) return null;
      return auto.history ?? [];
    }),
    getRelationships: mock((name: string) => {
      const auto = automations.find((a) => a.name === name);
      if (!auto) return null;
      return (
        auto.relationships ?? {
          declared: { requiredServices: [], relatedDevices: [], watchedStateKeys: [] },
          observed: { writtenStateKeys: [], truncated: false },
        }
      );
    }),
  } as unknown as import("../src/core/automation-manager.js").AutomationManager;
}

function makeServer({
  token = "",
  automations = [] as Array<{ name: string; triggers?: unknown[] }>,
  mqttConnected = true,
  engineStarted = true,
  state = new StateManager(logger, { persist: false }),
  logBuffer = new LogBuffer(100),
  eventBus,
}: {
  token?: string;
  automations?: Array<{ name: string; triggers?: unknown[] }>;
  mqttConnected?: boolean;
  engineStarted?: boolean;
  state?: StateManager;
  logBuffer?: LogBuffer;
  eventBus?: EventBus;
} = {}) {
  const mqtt = createMockMqtt(mqttConnected);
  const server = new HttpServer(8080, mqtt, token, logger);
  const automationManager = createMockAutomationManager(automations);
  server.setManagers(state, automationManager, logBuffer);
  if (eventBus) server.setEventStream(eventBus, logger);
  if (engineStarted) server.setEngineStarted(true);
  return server;
}

async function req(
  server: HttpServer,
  path: string,
  options: RequestInit & { headers?: Record<string, string> } = {},
) {
  return server.fetch(new Request(`http://localhost${path}`, options));
}

// ── Health probes ─────────────────────────────────────────────────────────

describe("HttpServer — health probes", () => {
  describe("GET /healthz", () => {
    it("returns 200 with status ok", async () => {
      const server = makeServer();
      const res = await req(server, "/healthz");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    it("is accessible without a token even when auth is configured", async () => {
      const server = makeServer({ token: "secret" });
      const res = await req(server, "/healthz");
      expect(res.status).toBe(200);
    });
  });

  describe("GET /readyz", () => {
    it("returns 200 when mqtt connected and engine started", async () => {
      const server = makeServer({ mqttConnected: true, engineStarted: true });
      const res = await req(server, "/readyz");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ready");
      expect(body.checks.mqtt).toBe(true);
      expect(body.checks.engine).toBe(true);
    });

    it("returns 503 when engine not started", async () => {
      const server = makeServer({ mqttConnected: true, engineStarted: false });
      const res = await req(server, "/readyz");
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe("not ready");
    });

    it("returns 503 when mqtt disconnected", async () => {
      const server = makeServer({ mqttConnected: false, engineStarted: true });
      const res = await req(server, "/readyz");
      expect(res.status).toBe(503);
    });

    it("is accessible without a token even when auth is configured", async () => {
      const server = makeServer({ token: "secret", mqttConnected: true, engineStarted: true });
      const res = await req(server, "/readyz");
      expect(res.status).toBe(200);
    });

    it("includes startedAt and tz fields", async () => {
      const server = makeServer();
      const res = await req(server, "/readyz");
      const body = await res.json();
      expect(body).toHaveProperty("startedAt");
      expect(body).toHaveProperty("tz");
    });
  });
});

// ── API auth ──────────────────────────────────────────────────────────────

describe("HttpServer — API auth", () => {
  const SECRET = "my-secret";

  describe("no auth configured", () => {
    it("allows unauthenticated access to /api/*", async () => {
      const server = makeServer({ token: "" });
      const res = await req(server, "/api/status");
      expect(res.status).toBe(200);
    });
  });

  describe("auth configured", () => {
    it("returns 401 without a token", async () => {
      const server = makeServer({ token: SECRET });
      const res = await req(server, "/api/status");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 401 with wrong Bearer token", async () => {
      const server = makeServer({ token: SECRET });
      const res = await req(server, "/api/status", {
        headers: { Authorization: "Bearer wrong" },
      });
      expect(res.status).toBe(401);
    });

    it("allows access with correct Bearer token", async () => {
      const server = makeServer({ token: SECRET });
      const res = await req(server, "/api/status", {
        headers: { Authorization: `Bearer ${SECRET}` },
      });
      expect(res.status).toBe(200);
    });

    it("allows access with valid session cookie", async () => {
      const server = makeServer({ token: SECRET });
      const res = await req(server, "/api/status", {
        headers: { Cookie: `ts-ha-session=${SECRET}` },
      });
      expect(res.status).toBe(200);
    });

    it("returns 401 with invalid session cookie", async () => {
      const server = makeServer({ token: SECRET });
      const res = await req(server, "/api/status", {
        headers: { Cookie: "ts-ha-session=wrong" },
      });
      expect(res.status).toBe(401);
    });
  });
});

// ── API: Status ───────────────────────────────────────────────────────────

describe("HttpServer — GET /api/status", () => {
  it("returns ready when mqtt connected and engine started", async () => {
    const server = makeServer({ mqttConnected: true, engineStarted: true });
    const res = await req(server, "/api/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.checks.mqtt).toBe(true);
    expect(body.checks.engine).toBe(true);
  });

  it("returns not ready when engine not started", async () => {
    const server = makeServer({ mqttConnected: true, engineStarted: false });
    const res = await req(server, "/api/status");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("not ready");
  });

  it("includes startedAt and tz", async () => {
    const server = makeServer();
    const res = await req(server, "/api/status");
    const body = await res.json();
    expect(body).toHaveProperty("startedAt");
    expect(body).toHaveProperty("tz");
  });
});

// ── API: Automations ──────────────────────────────────────────────────────

describe("HttpServer — /api/automations", () => {
  describe("GET /api/automations", () => {
    it("returns empty list when no automations", async () => {
      const server = makeServer({ automations: [] });
      const res = await req(server, "/api/automations");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.automations).toEqual([]);
      expect(body.count).toBe(0);
    });

    it("returns automations list", async () => {
      const automations = [
        { name: "motion-light", triggers: [{ type: "mqtt", topic: "z2m/sensor" }] },
      ];
      const server = makeServer({ automations });
      const res = await req(server, "/api/automations");
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.automations[0].name).toBe("motion-light");
    });
  });

  describe("GET /api/automations/:name", () => {
    it("returns 404 for unknown automation", async () => {
      const server = makeServer({ automations: [] });
      const res = await req(server, "/api/automations/nonexistent");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("returns the automation when found", async () => {
      const automations = [{ name: "test-auto", triggers: [] }];
      const server = makeServer({ automations });
      const res = await req(server, "/api/automations/test-auto");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("test-auto");
    });
  });

  describe("GET /api/automations/:name/history (task 8.6)", () => {
    it("returns 404 for an unknown automation", async () => {
      const server = makeServer({ automations: [] });
      const res = await req(server, "/api/automations/nonexistent/history");
      expect(res.status).toBe(404);
    });

    it("returns an empty history for an automation that has never run", async () => {
      const server = makeServer({ automations: [{ name: "idle" }] });
      const res = await req(server, "/api/automations/idle/history");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("idle");
      expect(body.history).toEqual([]);
    });

    it("returns the retained records", async () => {
      const record = {
        startedAt: 1000,
        trigger: { type: "cron", expression: "0 7 * * *" },
        durationMs: 5,
        outcome: "success",
      };
      const server = makeServer({
        automations: [{ name: "test-auto", history: [record] }],
      });
      const res = await req(server, "/api/automations/test-auto/history");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.history).toEqual([record]);
    });
  });

  describe("GET /api/automations/:name/relationships (task 8.6)", () => {
    it("returns 404 for an unknown automation", async () => {
      const server = makeServer({ automations: [] });
      const res = await req(server, "/api/automations/nonexistent/relationships");
      expect(res.status).toBe(404);
    });

    it("distinguishes declared relationships from observed ones", async () => {
      const relationships = {
        declared: {
          requiredServices: [{ name: "shelly", registered: false }],
          relatedDevices: ["hallway_sensor"],
          watchedStateKeys: ["night_mode"],
        },
        observed: { writtenStateKeys: ["lights_on"], truncated: false },
      };
      const server = makeServer({
        automations: [{ name: "test-auto", relationships }],
      });
      const res = await req(server, "/api/automations/test-auto/relationships");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("test-auto");
      expect(body.declared).toEqual(relationships.declared);
      expect(body.observed).toEqual(relationships.observed);
    });

    it("reports an unregistered required service as unavailable", async () => {
      const relationships = {
        declared: {
          requiredServices: [{ name: "nanoleaf", registered: false }],
          relatedDevices: [],
          watchedStateKeys: [],
        },
        observed: { writtenStateKeys: [], truncated: false },
      };
      const server = makeServer({
        automations: [{ name: "test-auto", relationships }],
      });
      const res = await req(server, "/api/automations/test-auto/relationships");
      const body = await res.json();
      expect(body.declared.requiredServices).toEqual([{ name: "nanoleaf", registered: false }]);
    });
  });

  describe("POST /api/automations/:name/trigger", () => {
    it("returns 400 when body is not JSON", async () => {
      const server = makeServer({ automations: [{ name: "test-auto", triggers: [] }] });
      const res = await req(server, "/api/automations/test-auto/trigger", {
        method: "POST",
        body: "not-json",
        headers: { "content-type": "text/plain" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when type field is missing", async () => {
      const server = makeServer({ automations: [{ name: "test-auto", triggers: [] }] });
      const res = await req(server, "/api/automations/test-auto/trigger", {
        method: "POST",
        body: JSON.stringify({ noType: true }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("type");
    });

    it("returns 400 for unknown trigger type", async () => {
      const server = makeServer({ automations: [{ name: "test-auto", triggers: [] }] });
      const res = await req(server, "/api/automations/test-auto/trigger", {
        method: "POST",
        body: JSON.stringify({ type: "invalid" }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("triggers an automation successfully with mqtt context", async () => {
      const automations = [{ name: "test-auto", triggers: [] }];
      const server = makeServer({ automations });
      const res = await req(server, "/api/automations/test-auto/trigger", {
        method: "POST",
        body: JSON.stringify({ type: "mqtt", topic: "manual/test", payload: {} }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("triggered");
      expect(body.automation).toBe("test-auto");
    });

    it("triggers with cron context", async () => {
      const automations = [{ name: "test-auto", triggers: [] }];
      const server = makeServer({ automations });
      const res = await req(server, "/api/automations/test-auto/trigger", {
        method: "POST",
        body: JSON.stringify({ type: "cron" }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
    });

    it("triggers with state context", async () => {
      const automations = [{ name: "test-auto", triggers: [] }];
      const server = makeServer({ automations });
      const res = await req(server, "/api/automations/test-auto/trigger", {
        method: "POST",
        body: JSON.stringify({ type: "state", key: "night_mode", newValue: true }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
    });

    it("triggers with webhook context", async () => {
      const automations = [{ name: "test-auto", triggers: [] }];
      const server = makeServer({ automations });
      const res = await req(server, "/api/automations/test-auto/trigger", {
        method: "POST",
        body: JSON.stringify({ type: "webhook", path: "my-hook" }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
    });

    it("returns 404 when automation does not exist", async () => {
      const server = makeServer({ automations: [] });
      const res = await req(server, "/api/automations/ghost/trigger", {
        method: "POST",
        body: JSON.stringify({ type: "cron" }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(404);
    });
  });
});

// ── API: State ────────────────────────────────────────────────────────────

describe("HttpServer — /api/state", () => {
  describe("GET /api/state", () => {
    it("returns empty state", async () => {
      const server = makeServer();
      const res = await req(server, "/api/state");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.state).toEqual({});
      expect(body.count).toBe(0);
    });

    it("returns state keys after setting values", async () => {
      const state = new StateManager(logger, { persist: false });
      state.set("night_mode", true);
      state.set("count", 42);
      const server = makeServer({ state });
      const res = await req(server, "/api/state");
      const body = await res.json();
      expect(body.count).toBe(2);
      expect(body.state.night_mode).toBe(true);
      expect(body.state.count).toBe(42);
    });

    it("omits reserved internal keys from both the map and the count", async () => {
      const state = new StateManager(logger, { persist: false });
      state.set("visible", 1);
      state.setInternal("$internal:rooms", { kitchen: [] });
      const server = makeServer({ state });
      const res = await req(server, "/api/state");
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.state).toEqual({ visible: 1 });
      expect(body.state["$internal:rooms"]).toBeUndefined();
    });
  });

  describe("GET /api/state/:key", () => {
    it("returns key value and exists=true when key present", async () => {
      const state = new StateManager(logger, { persist: false });
      state.set("my-key", "hello");
      const server = makeServer({ state });
      const res = await req(server, "/api/state/my-key");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.key).toBe("my-key");
      expect(body.value).toBe("hello");
      expect(body.exists).toBe(true);
    });

    it("returns exists=false for missing key", async () => {
      const server = makeServer();
      const res = await req(server, "/api/state/missing");
      const body = await res.json();
      expect(body.exists).toBe(false);
      expect(body.value).toBeNull();
    });
  });

  describe("PUT /api/state/:key", () => {
    it("sets a state value", async () => {
      const state = new StateManager(logger, { persist: false });
      const server = makeServer({ state });
      const res = await req(server, "/api/state/my-key", {
        method: "PUT",
        body: JSON.stringify(true),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.key).toBe("my-key");
      expect(body.value).toBe(true);
      expect(state.get("my-key")).toBe(true);
    });

    it("returns 400 for invalid JSON body", async () => {
      const server = makeServer();
      const res = await req(server, "/api/state/my-key", {
        method: "PUT",
        body: "not-json",
        headers: { "content-type": "text/plain" },
      });
      expect(res.status).toBe(400);
    });

    it("returns previous value in response", async () => {
      const state = new StateManager(logger, { persist: false });
      state.set("counter", 1);
      const server = makeServer({ state });
      const res = await req(server, "/api/state/counter", {
        method: "PUT",
        body: JSON.stringify(2),
        headers: { "content-type": "application/json" },
      });
      const body = await res.json();
      expect(body.previous).toBe(1);
      expect(body.value).toBe(2);
    });

    it("rejects a write to a reserved internal key without modifying the store", async () => {
      const state = new StateManager(logger, { persist: false });
      const server = makeServer({ state });
      const res = await req(server, "/api/state/%24internal%3Arooms", {
        method: "PUT",
        body: JSON.stringify({ kitchen: [] }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(400);
      expect(state.has("$internal:rooms")).toBe(false);
    });
  });

  describe("DELETE /api/state/:key", () => {
    it("deletes an existing key", async () => {
      const state = new StateManager(logger, { persist: false });
      state.set("to-delete", "value");
      const server = makeServer({ state });
      const res = await req(server, "/api/state/to-delete", { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);
      expect(state.has("to-delete")).toBe(false);
    });

    it("returns deleted=false for non-existent key", async () => {
      const server = makeServer();
      const res = await req(server, "/api/state/nope", { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(false);
    });

    it("rejects a delete of a reserved internal key without modifying the store", async () => {
      const state = new StateManager(logger, { persist: false });
      state.setInternal("$internal:rooms", { kitchen: [] });
      const server = makeServer({ state });
      const res = await req(server, "/api/state/%24internal%3Arooms", { method: "DELETE" });
      expect(res.status).toBe(400);
      expect(state.get("$internal:rooms")).toEqual({ kitchen: [] });
    });
  });
});

// ── API: Logs ─────────────────────────────────────────────────────────────

describe("HttpServer — GET /api/logs", () => {
  it("returns empty log list", async () => {
    const server = makeServer();
    const res = await req(server, "/api/logs");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("returns logs written to the buffer", async () => {
    const logBuffer = new LogBuffer(100);
    logBuffer.write(JSON.stringify({ level: 30, time: Date.now(), msg: "hello" }));
    const server = makeServer({ logBuffer });
    const res = await req(server, "/api/logs");
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.entries[0].msg).toBe("hello");
  });

  it("respects limit query param", async () => {
    const logBuffer = new LogBuffer(100);
    for (let i = 0; i < 10; i++) {
      logBuffer.write(JSON.stringify({ level: 30, time: Date.now() + i, msg: `msg-${i}` }));
    }
    const server = makeServer({ logBuffer });
    const res = await req(server, "/api/logs?limit=3");
    const body = await res.json();
    expect(body.count).toBe(3);
  });
});

// ── API: Realtime event stream ───────────────────────────────────────────

describe("HttpServer — GET /api/events", () => {
  it("returns 503 when the event stream is not configured", async () => {
    const server = makeServer();
    const res = await req(server, "/api/events");
    expect(res.status).toBe(503);
  });

  it("is subject to the same authorisation as other API endpoints (task 5.2)", async () => {
    const server = makeServer({ token: "secret", eventBus: new EventBus() });
    const res = await req(server, "/api/events");
    expect(res.status).toBe(401);
    await res.body?.cancel();
  });

  it("authorises from the session cookie alone, with no request header (task 5.3)", async () => {
    const server = makeServer({ token: "secret", eventBus: new EventBus() });
    const res = await req(server, "/api/events", {
      headers: { Cookie: "ts-ha-session=secret" },
    });
    expect(res.status).toBe(200);
    await res.body?.cancel();
  });

  it("is refused without the session cookie or a bearer token", async () => {
    const server = makeServer({ token: "secret", eventBus: new EventBus() });
    const res = await req(server, "/api/events", {
      headers: { Cookie: "ts-ha-session=wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("logs a connect and a disconnect retrievable through the log query API (task 5.0c)", async () => {
    // The lifecycle logger writes into the same LogBuffer the log category
    // (and /api/logs) reads from — unlike the delivery-path logger, which
    // must not (design.md D32; asserted separately below).
    const logBuffer = new LogBuffer(100);
    const realLogger = pino({ level: "info" }, logBuffer);
    const bus = new EventBus();

    const mqtt = createMockMqtt(true);
    const server = new HttpServer(8080, mqtt, "", realLogger);
    server.setManagers(
      new StateManager(realLogger, { persist: false }),
      createMockAutomationManager(),
      logBuffer,
    );
    server.setEventStream(bus, realLogger); // lifecycleLogger derives from realLogger too
    server.setEngineStarted(true);

    const res = await req(server, "/api/events");
    const reader = res.body?.getReader();
    await reader?.cancel();

    const logsRes = await req(server, "/api/logs?limit=50");
    const body = await logsRes.json();
    const messages = (body.entries as Array<{ msg: string }>).map((e) => e.msg);
    expect(messages.some((m) => m.includes("connected"))).toBe(true);
    expect(messages.some((m) => m.includes("disconnected"))).toBe(true);
  });

  it("opens as an event-stream response and delivers a delta emitted after connecting", async () => {
    const bus = new EventBus();
    const server = makeServer({ eventBus: bus });
    const res = await req(server, "/api/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    if (!reader) throw new Error("no body");

    bus.emit({ category: "state", key: "night_mode", value: true, previous: false });

    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    const payload = JSON.parse(chunk.replace(/^data: /, "").trim());
    // Only the changed key is present — a delta, not a full state snapshot
    // (task 5.4).
    expect(payload).toEqual({
      category: "state",
      key: "night_mode",
      value: true,
      previous: false,
    });

    await reader.cancel();
  });
});

// ── API: Devices (removed) ────────────────────────────────────────────────

describe("HttpServer — removed Zigbee-only device endpoints", () => {
  it("GET /api/devices is removed and carries no device payload", async () => {
    const server = makeServer();
    const res = await req(server, "/api/devices");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.devices).toBeUndefined();
    expect(body.error).toBeDefined();
  });

  it("GET /api/devices/:friendlyName is removed and carries no device payload", async () => {
    const server = makeServer();
    const res = await req(server, "/api/devices/some-device");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.friendly_name).toBeUndefined();
    expect(body.error).toBeDefined();
  });
});

// ── API: Unified device catalog ───────────────────────────────────────────

describe("HttpServer — /api/device-catalog", () => {
  it("returns 503 when no device accessor is configured", async () => {
    const server = makeServer();
    const res = await req(server, "/api/device-catalog");
    expect(res.status).toBe(503);
  });

  it("returns 503 for a single device when no device accessor is configured", async () => {
    const server = makeServer();
    const res = await req(server, "/api/device-catalog/zigbee:0xaaa");
    expect(res.status).toBe(503);
  });

  it("lists devices from all available sources with a count and source availability", async () => {
    const server = makeServer();
    const descriptor = {
      source: "shelly",
      id: "plug",
      qualifiedId: "shelly:plug",
      displayName: "plug",
      state: { on: true },
      capabilities: [],
      reachable: true,
      observation: { mode: "push", observedAt: Date.now() },
    };
    server.setDeviceSources({
      list: mock(() => [descriptor]),
      get: mock((qid: string) => (qid === "shelly:plug" ? descriptor : undefined)),
      sources: mock(() => [
        { id: "shelly", available: true },
        { id: "zigbee", available: false },
      ]),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.devices).toEqual([descriptor]);
    expect(body.sources).toEqual([
      { id: "shelly", available: true },
      { id: "zigbee", available: false },
    ]);
  });

  it("reports the Zigbee source unavailable rather than failing the whole request", async () => {
    const server = makeServer();
    server.setDeviceSources({
      list: mock(() => []),
      get: mock(() => undefined),
      sources: mock(() => [{ id: "zigbee", available: false }]),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.devices).toEqual([]);
    expect(body.sources).toEqual([{ id: "zigbee", available: false }]);
  });

  it("retrieves a single device by qualified identifier", async () => {
    const server = makeServer();
    const descriptor = {
      source: "state",
      id: "night_mode",
      qualifiedId: "state:night_mode",
      displayName: "Night Mode",
      state: { on: false },
      capabilities: [],
      reachable: true,
      observation: { mode: "push", observedAt: Date.now() },
    };
    server.setDeviceSources({
      list: mock(() => [descriptor]),
      get: mock((qid: string) => (qid === "state:night_mode" ? descriptor : undefined)),
      sources: mock(() => []),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog/state:night_mode");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(descriptor);
  });

  it("returns 404 for an unknown qualified identifier", async () => {
    const server = makeServer();
    server.setDeviceSources({
      list: mock(() => []),
      get: mock(() => undefined),
      sources: mock(() => []),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog/zigbee:0xunknown");
    expect(res.status).toBe(404);
  });

  it("resolves a qualified identifier whose device id itself contains the delimiter", async () => {
    const server = makeServer();
    const descriptor = {
      source: "state",
      id: "motion-light:lights_on",
      qualifiedId: "state:motion-light:lights_on",
      displayName: "Lights On",
      state: { on: true },
      capabilities: [],
      reachable: true,
      observation: { mode: "push", observedAt: Date.now() },
    };
    server.setDeviceSources({
      list: mock(() => [descriptor]),
      get: mock((qid: string) => (qid === "state:motion-light:lights_on" ? descriptor : undefined)),
      sources: mock(() => []),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(
      server,
      `/api/device-catalog/${encodeURIComponent("state:motion-light:lights_on")}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("motion-light:lights_on");
  });

  it("keeps a name collision distinct: two devices retrievable by their own qualified id", async () => {
    const server = makeServer();
    const zigbee = {
      source: "zigbee",
      id: "0xaaa",
      qualifiedId: "zigbee:office_lamp",
      displayName: "office_lamp",
      state: {},
      capabilities: [],
      reachable: true,
      observation: { mode: "push", observedAt: Date.now() },
    };
    const shelly = {
      source: "shelly",
      id: "office_lamp",
      qualifiedId: "shelly:office_lamp",
      displayName: "office_lamp",
      state: {},
      capabilities: [],
      reachable: true,
      observation: { mode: "push", observedAt: Date.now() },
    };
    server.setDeviceSources({
      list: mock(() => [zigbee, shelly]),
      get: mock((qid: string) =>
        qid === "zigbee:office_lamp" ? zigbee : qid === "shelly:office_lamp" ? shelly : undefined,
      ),
      sources: mock(() => []),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const resA = await req(server, "/api/device-catalog/zigbee:office_lamp");
    const resB = await req(server, "/api/device-catalog/shelly:office_lamp");
    expect((await resA.json()).source).toBe("zigbee");
    expect((await resB.json()).source).toBe("shelly");
  });

  it("includes a device's capability schema, present and empty when it declares none", async () => {
    const server = makeServer();
    const noCaps = {
      source: "shelly",
      id: "plug",
      qualifiedId: "shelly:plug",
      displayName: "plug",
      state: {},
      capabilities: [],
      reachable: true,
      observation: { mode: "push", observedAt: Date.now() },
    };
    const withCaps = {
      ...noCaps,
      id: "lamp",
      qualifiedId: "shelly:lamp",
      capabilities: [
        {
          kind: "switch",
          property: "on",
          access: { readable: true, writable: true },
          valueType: "boolean",
        },
      ],
    };
    server.setDeviceSources({
      list: mock(() => [noCaps, withCaps]),
      get: mock(() => undefined),
      sources: mock(() => []),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog");
    const body = await res.json();
    expect(body.devices[0].capabilities).toEqual([]);
    expect(body.devices[1].capabilities).toHaveLength(1);
  });
});

// ── API: Device command endpoint ───────────────────────────────────────────

describe("HttpServer — POST /api/device-catalog/:qualifiedId/command", () => {
  it("returns 503 when no device accessor is configured", async () => {
    const server = makeServer();
    const res = await req(server, "/api/device-catalog/shelly:plug/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: true }),
    });
    expect(res.status).toBe(503);
  });

  it("dispatches a valid command and returns ok", async () => {
    const server = makeServer();
    const command = mock(async (qualifiedId: string, properties: Record<string, unknown>) => {
      expect(qualifiedId).toBe("shelly:plug");
      expect(properties).toEqual({ on: true });
      return { status: "ok" as const };
    });
    server.setDeviceSources({
      command,
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog/shelly:plug/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(command).toHaveBeenCalledTimes(1);
  });

  it("returns 400 with a descriptive error and does not dispatch when validation fails", async () => {
    const server = makeServer();
    const command = mock(async () => ({
      status: "invalid" as const,
      error: 'Unknown property "brightness"',
    }));
    server.setDeviceSources({
      command,
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog/state:night_mode/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brightness: 100 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown property/);
  });

  it("returns 404 for an unrecognised device identifier", async () => {
    const server = makeServer();
    server.setDeviceSources({
      command: mock(async () => ({ status: "not_found" as const })),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog/zigbee:0xunknown/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("returns 503 when the owning source is unavailable", async () => {
    const server = makeServer();
    server.setDeviceSources({
      command: mock(async () => ({ status: "unavailable" as const })),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog/zigbee:0xaaa/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "ON" }),
    });
    expect(res.status).toBe(503);
  });

  it("returns 400 for an invalid JSON body", async () => {
    const server = makeServer();
    server.setDeviceSources({
      command: mock(async () => ({ status: "ok" as const })),
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog/zigbee:0xaaa/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-object JSON body", async () => {
    const server = makeServer();
    const command = mock(async () => ({ status: "ok" as const }));
    server.setDeviceSources({
      command,
    } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource);

    const res = await req(server, "/api/device-catalog/zigbee:0xaaa/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    expect(res.status).toBe(400);
    expect(command).not.toHaveBeenCalled();
  });
});

// ── Rooms ─────────────────────────────────────────────────────────────────

/** A real `RoomManager` over an in-memory `StateManager` and a stub aggregate device accessor. */
function makeRoomManager(devices: Array<{ qualifiedId: string }> = []) {
  const state = new StateManager(logger, { persist: false });
  const aggregate = {
    list: mock(() => devices),
    get: mock((qid: string) => devices.find((d) => d.qualifiedId === qid)),
  } as unknown as import("../src/core/device-sources/aggregate.js").AggregateDeviceSource;
  return new RoomManager(state, aggregate, logger);
}

describe("HttpServer — /api/rooms", () => {
  it("returns 503 when no room manager is configured", async () => {
    const server = makeServer();
    const res = await req(server, "/api/rooms");
    expect(res.status).toBe(503);
  });

  it("lists rooms with an empty membership", async () => {
    const server = makeServer();
    const rooms = makeRoomManager();
    rooms.createRoom("Kitchen");
    server.setRoomManager(rooms);

    const res = await req(server, "/api/rooms");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.rooms[0].name).toBe("Kitchen");
    expect(body.rooms[0].members).toEqual([]);
  });

  it("creates a room and returns 201 with the created room", async () => {
    const server = makeServer();
    server.setRoomManager(makeRoomManager());

    const res = await req(server, "/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Office" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Office");
    expect(typeof body.id).toBe("string");
  });

  it("returns 409 for a duplicate room name and creates nothing", async () => {
    const server = makeServer();
    const rooms = makeRoomManager();
    rooms.createRoom("Office");
    server.setRoomManager(rooms);

    const res = await req(server, "/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Office" }),
    });
    expect(res.status).toBe(409);
    expect(rooms.listRooms()).toHaveLength(1);
  });

  it("returns 400 for a missing name", async () => {
    const server = makeServer();
    server.setRoomManager(makeRoomManager());

    const res = await req(server, "/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("renames a room", async () => {
    const server = makeServer();
    const rooms = makeRoomManager();
    const created = rooms.createRoom("Office");
    if (created.status !== "ok") throw new Error("unreachable");
    server.setRoomManager(rooms);

    const res = await req(server, `/api/rooms/${created.room.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Study" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Study");
  });

  it("returns 404 renaming an unknown room", async () => {
    const server = makeServer();
    server.setRoomManager(makeRoomManager());

    const res = await req(server, "/api/rooms/nope", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Study" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 renaming a room to a name already in use", async () => {
    const server = makeServer();
    const rooms = makeRoomManager();
    rooms.createRoom("Bedroom");
    const created = rooms.createRoom("Office");
    if (created.status !== "ok") throw new Error("unreachable");
    server.setRoomManager(rooms);

    const res = await req(server, `/api/rooms/${created.room.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bedroom" }),
    });
    expect(res.status).toBe(409);
  });

  it("deletes a room without deleting its devices", async () => {
    const server = makeServer();
    const rooms = makeRoomManager([{ qualifiedId: "zigbee:0xaaa" }]);
    const created = rooms.createRoom("Garage");
    if (created.status !== "ok") throw new Error("unreachable");
    rooms.assignDevice("zigbee:0xaaa", created.room.id);
    server.setRoomManager(rooms);

    const res = await req(server, `/api/rooms/${created.room.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(rooms.listRooms()).toHaveLength(0);
    expect(rooms.getRoomForDevice("zigbee:0xaaa")).toBeNull();
  });

  it("returns 404 deleting an unknown room", async () => {
    const server = makeServer();
    server.setRoomManager(makeRoomManager());

    const res = await req(server, "/api/rooms/nope", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("lists devices belonging to no room under /api/rooms/unassigned", async () => {
    const server = makeServer();
    const rooms = makeRoomManager([
      { qualifiedId: "zigbee:0xaaa" },
      { qualifiedId: "shelly:plug" },
    ]);
    const created = rooms.createRoom("Office");
    if (created.status !== "ok") throw new Error("unreachable");
    rooms.assignDevice("zigbee:0xaaa", created.room.id);
    server.setRoomManager(rooms);

    const res = await req(server, "/api/rooms/unassigned");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.devices).toEqual([{ qualifiedId: "shelly:plug" }]);
  });

  it("reports an absent room member as unavailable without erroring", async () => {
    const server = makeServer();
    const rooms = makeRoomManager([]);
    const created = rooms.createRoom("Living Room");
    if (created.status !== "ok") throw new Error("unreachable");
    rooms.assignDevice("zigbee:0xunpaired", created.room.id);
    server.setRoomManager(rooms);

    const res = await req(server, "/api/rooms");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rooms[0].members).toEqual([
      { qualifiedId: "zigbee:0xunpaired", available: false, device: null },
    ]);
  });
});

describe("HttpServer — PUT/DELETE /api/device-catalog/:qualifiedId/room", () => {
  it("returns 503 when no room manager is configured", async () => {
    const server = makeServer();
    const res = await req(server, "/api/device-catalog/zigbee:0xaaa/room", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "abc" }),
    });
    expect(res.status).toBe(503);
  });

  it("assigns a device to a room", async () => {
    const server = makeServer();
    const rooms = makeRoomManager([{ qualifiedId: "zigbee:0xaaa" }]);
    const created = rooms.createRoom("Office");
    if (created.status !== "ok") throw new Error("unreachable");
    server.setRoomManager(rooms);

    const res = await req(server, "/api/device-catalog/zigbee:0xaaa/room", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: created.room.id }),
    });
    expect(res.status).toBe(200);
    expect(rooms.getRoomForDevice("zigbee:0xaaa")?.id).toBe(created.room.id);
  });

  it("returns 404 assigning to an unknown room", async () => {
    const server = makeServer();
    server.setRoomManager(makeRoomManager([{ qualifiedId: "zigbee:0xaaa" }]));

    const res = await req(server, "/api/device-catalog/zigbee:0xaaa/room", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("clears a device's room assignment", async () => {
    const server = makeServer();
    const rooms = makeRoomManager([{ qualifiedId: "zigbee:0xaaa" }]);
    const created = rooms.createRoom("Office");
    if (created.status !== "ok") throw new Error("unreachable");
    rooms.assignDevice("zigbee:0xaaa", created.room.id);
    server.setRoomManager(rooms);

    const res = await req(server, "/api/device-catalog/zigbee:0xaaa/room", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(rooms.getRoomForDevice("zigbee:0xaaa")).toBeNull();
  });
});

// ── Webhooks ──────────────────────────────────────────────────────────────

describe("HttpServer — webhooks", () => {
  it("returns 404 for unregistered webhook path", async () => {
    const server = makeServer();
    const res = await req(server, "/webhook/unknown", { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("calls registered webhook handler and returns ok", async () => {
    const server = makeServer();
    let called = false;
    server.registerWebhook("my-hook", ["POST"], async () => {
      called = true;
    });
    const res = await req(server, "/webhook/my-hook", {
      method: "POST",
      body: JSON.stringify({ key: "val" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(called).toBe(true);
  });

  it("returns 405 for disallowed method", async () => {
    const server = makeServer();
    server.registerWebhook("my-hook", ["POST"], async () => {});
    const res = await req(server, "/webhook/my-hook", { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("returns 404 after webhook is removed", async () => {
    const server = makeServer();
    server.registerWebhook("temp-hook", ["POST"], async () => {});
    server.removeWebhook("temp-hook");
    const res = await req(server, "/webhook/temp-hook", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("is accessible without a token even when auth is configured", async () => {
    const server = makeServer({ token: "secret" });
    server.registerWebhook("my-hook", ["POST"], async () => {});
    const res = await req(server, "/webhook/my-hook", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("passes parsed JSON body to webhook handler", async () => {
    const server = makeServer();
    let receivedBody: unknown;
    server.registerWebhook("json-hook", ["POST"], async (ctx) => {
      receivedBody = ctx.body;
    });
    await req(server, "/webhook/json-hook", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
      headers: { "content-type": "application/json" },
    });
    expect(receivedBody).toEqual({ foo: "bar" });
  });

  it("supports nested webhook paths", async () => {
    const server = makeServer();
    let called = false;
    server.registerWebhook("sensors/motion", ["POST"], async () => {
      called = true;
    });
    const res = await req(server, "/webhook/sensors/motion", { method: "POST" });
    expect(res.status).toBe(200);
    expect(called).toBe(true);
  });
});

// ── Unknown routes ────────────────────────────────────────────────────────

describe("HttpServer — unknown routes", () => {
  it("returns 404 for completely unknown path", async () => {
    const server = makeServer();
    const res = await req(server, "/unknown-path");
    expect(res.status).toBe(404);
  });
});
