import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { loadConfig } from "../src/config.js";
import { createWebUiApp } from "../src/core/web-ui/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeApp({ token = "", path = "/status" } = {}) {
  return createWebUiApp({ token, path });
}

async function req(
  app: ReturnType<typeof makeApp>,
  path: string,
  options: RequestInit & { headers?: Record<string, string> } = {},
) {
  return app.fetch(new Request(`http://localhost${path}`, options));
}

// ── Config tests ─────────────────────────────────────────────────────────

describe("webUi config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.WEB_UI_ENABLED;
    delete process.env.WEB_UI_PATH;
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
    expect(config.httpServer.webUi.enabled).toBe(false);
    expect(config.httpServer.webUi.path).toBe("/status");
  });

  it.each([
    ["true", true],
    ["1", true],
    ["yes", true],
    ["false", false],
    ["0", false],
    ["no", false],
  ] as const)("WEB_UI_ENABLED='%s' parses to %s", (envValue, expected) => {
    process.env.WEB_UI_ENABLED = envValue;
    const config = loadConfig();
    expect(config.httpServer.webUi.enabled).toBe(expected);
  });

  it("reads WEB_UI_PATH from env", () => {
    process.env.WEB_UI_PATH = "/dashboard";
    const config = loadConfig();
    expect(config.httpServer.webUi.path).toBe("/dashboard");
  });
});

// ── Dashboard shell — no auth ─────────────────────────────────────────────

describe("createWebUiApp — no auth", () => {
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
});

// ── Dashboard shell — with auth ───────────────────────────────────────────

describe("createWebUiApp — with auth", () => {
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

    it("serves dashboard when authenticated via Bearer header", async () => {
      const app = makeApp({ token: SECRET });
      const res = await authedReq(app, "/status");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
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

  describe("GET /status/logout", () => {
    it("clears session cookie and redirects to login", async () => {
      const app = makeApp({ token: SECRET });
      const res = await app.fetch(
        new Request("http://localhost/status/logout", {
          headers: { Cookie: `ts-ha-session=${SECRET}` },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("/login");
      expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    });
  });
});
