import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { loadConfig } from "../src/config.js";
import { LogBuffer } from "../src/core/log-buffer.js";
import { StateManager } from "../src/core/state-manager.js";
import { createStatusPageApp } from "../src/core/status-page/index.js";

const logger = pino({ level: "silent" });

// ── Helpers ───────────────────────────────────────────────────────────────

function createMockMqtt(connected = true) {
  return { isConnected: connected } as unknown as import("../src/core/mqtt-service.js").MqttService;
}

function createMockAutomationManager(automations: Array<{ name: string }> = []) {
  return {
    listAutomations: mock(() => automations),
    getAutomation: mock((name: string) => automations.find((a) => a.name === name) ?? null),
    triggerAutomation: mock(async (name: string) => automations.some((a) => a.name === name)),
  } as unknown as import("../src/core/automation-manager.js").AutomationManager;
}

function makeApp({
  token = "",
  automations = [] as Array<{ name: string }>,
  started = true,
  path = "/status",
} = {}) {
  const stateManager = new StateManager(logger);
  const logBuffer = new LogBuffer(100);
  const mqtt = createMockMqtt(true);
  const automationManager = createMockAutomationManager(automations);

  return createStatusPageApp({
    stateManager,
    automationManager,
    logBuffer,
    mqtt,
    token,
    path,
    getStartedAt: () => (started ? Date.now() - 60_000 : null),
  });
}

async function req(
  app: ReturnType<typeof makeApp>,
  path: string,
  options: RequestInit & { headers?: Record<string, string> } = {},
) {
  return app.fetch(new Request(`http://localhost${path}`, options));
}

// ── Config tests ─────────────────────────────────────────────────────────

describe("statusPage config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STATUS_PAGE_ENABLED;
    delete process.env.STATUS_PAGE_PATH;
    delete process.env.HTTP_PORT;
    delete process.env.HTTP_TOKEN;
    delete process.env.MQTT_HOST;
    delete process.env.MQTT_PORT;
    delete process.env.STATE_PERSIST;
    delete process.env.STATE_FILE_PATH;
    delete process.env.AUTOMATIONS_RECURSIVE;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("defaults to disabled with path /status", () => {
    const config = loadConfig();
    expect(config.httpServer.statusPage.enabled).toBe(false);
    expect(config.httpServer.statusPage.path).toBe("/status");
  });

  it.each([
    ["true", true],
    ["1", true],
    ["yes", true],
    ["false", false],
    ["0", false],
    ["no", false],
  ] as const)("STATUS_PAGE_ENABLED='%s' parses to %s", (envValue, expected) => {
    process.env.STATUS_PAGE_ENABLED = envValue;
    const config = loadConfig();
    expect(config.httpServer.statusPage.enabled).toBe(expected);
  });

  it("reads STATUS_PAGE_PATH from env", () => {
    process.env.STATUS_PAGE_PATH = "/dashboard";
    const config = loadConfig();
    expect(config.httpServer.statusPage.path).toBe("/dashboard");
  });
});

// ── Status page app — no auth ─────────────────────────────────────────────

describe("createStatusPageApp — no auth", () => {
  describe("GET /status", () => {
    it("returns 200 with HTML content-type", async () => {
      const app = makeApp();
      const res = await req(app, "/status");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    it("HTML includes the base path as a data attribute", async () => {
      const app = makeApp({ path: "/status" });
      const res = await req(app, "/status");
      const html = await res.text();
      expect(html).toContain('data-base-path="/status"');
    });

    it("HTML includes the React app mount point", async () => {
      const app = makeApp();
      const res = await req(app, "/status");
      const html = await res.text();
      expect(html).toContain('<div id="app">');
    });

    it("HTML includes inlined JavaScript module", async () => {
      const app = makeApp();
      const res = await req(app, "/status");
      const html = await res.text();
      expect(html).toContain('<script type="module">');
    });

    it("HTML includes inlined CSS", async () => {
      const app = makeApp();
      const res = await req(app, "/status");
      const html = await res.text();
      expect(html).toContain("<style>");
    });
  });

  describe("GET /status/ (trailing slash)", () => {
    it("redirects to /status", async () => {
      const app = makeApp();
      const res = await req(app, "/status/");
      // Hono issues a 302 for programmatic redirects
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/status");
    });
  });

  describe("GET /status/api/status", () => {
    it("returns engine and mqtt status", async () => {
      const app = makeApp({ started: true });
      const res = await req(app, "/status/api/status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("checks");
      expect(body.checks).toHaveProperty("mqtt");
      expect(body.checks).toHaveProperty("engine");
    });

    it("returns ready=true when mqtt connected and engine started", async () => {
      const app = makeApp({ started: true });
      const res = await req(app, "/status/api/status");
      const body = await res.json();
      expect(body.status).toBe("ready");
      expect(body.checks.mqtt).toBe(true);
      expect(body.checks.engine).toBe(true);
    });

    it("returns ready=false when engine not started", async () => {
      const app = makeApp({ started: false });
      const res = await req(app, "/status/api/status");
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe("not ready");
    });
  });

  describe("GET /status/api/automations", () => {
    it("returns empty list when no automations", async () => {
      const app = makeApp({ automations: [] });
      const res = await req(app, "/status/api/automations");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.automations).toEqual([]);
      expect(body.count).toBe(0);
    });

    it("returns automations list", async () => {
      const automations = [
        { name: "motion-light", triggers: [{ type: "mqtt", topic: "z2m/sensor" }] },
      ];
      const app = makeApp({ automations });
      const res = await req(app, "/status/api/automations");
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.automations[0].name).toBe("motion-light");
    });
  });

  describe("GET /status/api/automations/:name", () => {
    it("returns 404 for unknown automation", async () => {
      const app = makeApp({ automations: [] });
      const res = await req(app, "/status/api/automations/nonexistent");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("returns the automation when found", async () => {
      const automations = [{ name: "test-auto", triggers: [] }];
      const app = makeApp({ automations });
      const res = await req(app, "/status/api/automations/test-auto");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("test-auto");
    });
  });

  describe("POST /status/api/automations/:name/trigger", () => {
    it("returns 400 when body is not JSON", async () => {
      const app = makeApp({ automations: [{ name: "test-auto", triggers: [] }] });
      const res = await req(app, "/status/api/automations/test-auto/trigger", {
        method: "POST",
        body: "not-json",
        headers: { "content-type": "text/plain" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when type field is missing", async () => {
      const app = makeApp({ automations: [{ name: "test-auto", triggers: [] }] });
      const res = await req(app, "/status/api/automations/test-auto/trigger", {
        method: "POST",
        body: JSON.stringify({ noType: true }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("type");
    });

    it("returns 400 for unknown trigger type", async () => {
      const app = makeApp({ automations: [{ name: "test-auto", triggers: [] }] });
      const res = await req(app, "/status/api/automations/test-auto/trigger", {
        method: "POST",
        body: JSON.stringify({ type: "invalid" }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("triggers an automation successfully", async () => {
      const automations = [{ name: "test-auto", triggers: [] }];
      const app = makeApp({ automations });
      const res = await req(app, "/status/api/automations/test-auto/trigger", {
        method: "POST",
        body: JSON.stringify({ type: "mqtt", topic: "manual/test", payload: {} }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("triggered");
    });

    it("returns 404 when automation does not exist", async () => {
      const app = makeApp({ automations: [] });
      const res = await req(app, "/status/api/automations/ghost/trigger", {
        method: "POST",
        body: JSON.stringify({ type: "cron" }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /status/api/state", () => {
    it("returns empty state", async () => {
      const app = makeApp();
      const res = await req(app, "/status/api/state");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.state).toEqual({});
      expect(body.count).toBe(0);
    });

    it("returns state keys after setting values", async () => {
      const stateManager = new StateManager(logger);
      stateManager.set("night_mode", true);
      stateManager.set("count", 42);

      const app = createStatusPageApp({
        stateManager,
        automationManager: createMockAutomationManager(),
        logBuffer: new LogBuffer(100),
        mqtt: createMockMqtt(),
        token: "",
        path: "/status",
        getStartedAt: () => Date.now(),
      });

      const res = await req(app, "/status/api/state");
      const body = await res.json();
      expect(body.count).toBe(2);
      expect(body.state.night_mode).toBe(true);
      expect(body.state.count).toBe(42);
    });
  });

  describe("PUT /status/api/state/:key", () => {
    it("sets a state value", async () => {
      const stateManager = new StateManager(logger);
      const app = createStatusPageApp({
        stateManager,
        automationManager: createMockAutomationManager(),
        logBuffer: new LogBuffer(100),
        mqtt: createMockMqtt(),
        token: "",
        path: "/status",
        getStartedAt: () => Date.now(),
      });

      const res = await req(app, "/status/api/state/my-key", {
        method: "PUT",
        body: JSON.stringify(true),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.key).toBe("my-key");
      expect(body.value).toBe(true);
      expect(stateManager.get("my-key")).toBe(true);
    });

    it("returns 400 for invalid JSON body", async () => {
      const app = makeApp();
      const res = await req(app, "/status/api/state/my-key", {
        method: "PUT",
        body: "not-json",
        headers: { "content-type": "text/plain" },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /status/api/state/:key", () => {
    it("deletes an existing key", async () => {
      const stateManager = new StateManager(logger);
      stateManager.set("to-delete", "value");

      const app = createStatusPageApp({
        stateManager,
        automationManager: createMockAutomationManager(),
        logBuffer: new LogBuffer(100),
        mqtt: createMockMqtt(),
        token: "",
        path: "/status",
        getStartedAt: () => Date.now(),
      });

      const res = await req(app, "/status/api/state/to-delete", { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);
      expect(stateManager.has("to-delete")).toBe(false);
    });

    it("returns deleted=false for non-existent key", async () => {
      const app = makeApp();
      const res = await req(app, "/status/api/state/nope", { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(false);
    });
  });

  describe("GET /status/api/logs", () => {
    it("returns empty log list", async () => {
      const app = makeApp();
      const res = await req(app, "/status/api/logs");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.entries).toEqual([]);
      expect(body.count).toBe(0);
    });

    it("returns logs written to the buffer", async () => {
      const logBuffer = new LogBuffer(100);
      logBuffer.write(JSON.stringify({ level: 30, time: Date.now(), msg: "hello" }));

      const app = createStatusPageApp({
        stateManager: new StateManager(logger),
        automationManager: createMockAutomationManager(),
        logBuffer,
        mqtt: createMockMqtt(),
        token: "",
        path: "/status",
        getStartedAt: () => Date.now(),
      });

      const res = await req(app, "/status/api/logs");
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.entries[0].msg).toBe("hello");
    });
  });
});

// ── Status page app — with auth ───────────────────────────────────────────

describe("createStatusPageApp — with auth", () => {
  const SECRET = "my-secret-token";

  function authedReq(
    app: ReturnType<typeof makeApp>,
    path: string,
    options: RequestInit & { headers?: Record<string, string> } = {},
  ) {
    return app.fetch(
      new Request(`http://localhost${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${SECRET}`,
          ...options.headers,
        },
      }),
    );
  }

  describe("GET /status — unauthenticated", () => {
    it("redirects to /status/login when no token provided", async () => {
      const app = makeApp({ token: SECRET });
      const res = await req(app, "/status");
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("/login");
    });
  });

  describe("GET /status/login", () => {
    it("returns login page HTML when auth is required", async () => {
      const app = makeApp({ token: SECRET });
      const res = await req(app, "/status/login");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html).toContain("Access Token");
    });

    it("redirects to dashboard when already authenticated via cookie", async () => {
      const app = makeApp({ token: SECRET });
      const res = await app.fetch(
        new Request("http://localhost/status/login", {
          headers: { Cookie: `ts-ha-session=${SECRET}` },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/status");
    });
  });

  describe("POST /status/login", () => {
    it("sets session cookie and redirects on correct token", async () => {
      const app = makeApp({ token: SECRET });
      const res = await app.fetch(
        new Request("http://localhost/status/login", {
          method: "POST",
          body: new URLSearchParams({ token: SECRET }),
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/status");
      expect(res.headers.get("set-cookie")).toContain("ts-ha-session=");
    });

    it("returns 401 and login page on wrong token", async () => {
      const app = makeApp({ token: SECRET });
      const res = await app.fetch(
        new Request("http://localhost/status/login", {
          method: "POST",
          body: new URLSearchParams({ token: "wrong-token" }),
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      );
      expect(res.status).toBe(401);
      const html = await res.text();
      expect(html).toContain("Invalid access token");
    });
  });

  describe("GET /status/api/* — authenticated via header", () => {
    it("allows access with correct Bearer token", async () => {
      const app = makeApp({ token: SECRET });
      const res = await authedReq(app, "/status/api/status");
      expect(res.status).toBe(200);
    });

    it("returns 401 without token", async () => {
      const app = makeApp({ token: SECRET });
      const res = await req(app, "/status/api/status");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 401 with wrong token", async () => {
      const app = makeApp({ token: SECRET });
      const res = await app.fetch(
        new Request("http://localhost/status/api/status", {
          headers: { Authorization: "Bearer wrong" },
        }),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("GET /status/api/* — authenticated via session cookie", () => {
    it("allows access with valid session cookie", async () => {
      const app = makeApp({ token: SECRET });
      const res = await app.fetch(
        new Request("http://localhost/status/api/status", {
          headers: { Cookie: `ts-ha-session=${SECRET}` },
        }),
      );
      expect(res.status).toBe(200);
    });
  });
});
