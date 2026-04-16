import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { HttpServer } from "../src/core/http/http-server.js";
import { LogBuffer } from "../src/core/logging/log-buffer.js";
import { StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });

// ── Helpers ───────────────────────────────────────────────────────────────

function createMockMqtt(connected = true) {
  return {
    isConnected: connected,
  } as unknown as import("../src/core/mqtt/mqtt-service.js").MqttService;
}

function createMockAutomationManager(
  automations: Array<{ name: string; triggers?: unknown[] }> = [],
) {
  return {
    listAutomations: mock(() => automations),
    getAutomation: mock((name: string) => automations.find((a) => a.name === name) ?? null),
    triggerAutomation: mock(async (name: string) => automations.some((a) => a.name === name)),
  } as unknown as import("../src/core/automation-manager.js").AutomationManager;
}

function makeServer({
  token = "",
  automations = [] as Array<{ name: string; triggers?: unknown[] }>,
  mqttConnected = true,
  engineStarted = true,
  state = new StateManager(logger),
  logBuffer = new LogBuffer(100),
} = {}) {
  const mqtt = createMockMqtt(mqttConnected);
  const server = new HttpServer(8080, mqtt, token, logger);
  const automationManager = createMockAutomationManager(automations);
  server.setManagers(state, automationManager, logBuffer);
  server.setDeviceRegistry(null);
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
      const state = new StateManager(logger);
      state.set("night_mode", true);
      state.set("count", 42);
      const server = makeServer({ state });
      const res = await req(server, "/api/state");
      const body = await res.json();
      expect(body.count).toBe(2);
      expect(body.state.night_mode).toBe(true);
      expect(body.state.count).toBe(42);
    });
  });

  describe("GET /api/state/:key", () => {
    it("returns key value and exists=true when key present", async () => {
      const state = new StateManager(logger);
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
      const state = new StateManager(logger);
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
      const state = new StateManager(logger);
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
  });

  describe("DELETE /api/state/:key", () => {
    it("deletes an existing key", async () => {
      const state = new StateManager(logger);
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

// ── API: Devices ──────────────────────────────────────────────────────────

describe("HttpServer — /api/devices", () => {
  it("returns 503 when device registry is disabled", async () => {
    const server = makeServer();
    const res = await req(server, "/api/devices");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Device registry is disabled");
  });

  it("returns 503 for single device when registry is disabled", async () => {
    const server = makeServer();
    const res = await req(server, "/api/devices/some-device");
    expect(res.status).toBe(503);
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
