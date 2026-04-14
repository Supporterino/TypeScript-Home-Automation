import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { TriggerContext } from "../automation.js";
import type { AutomationManager } from "../automation-manager.js";
import type { LogBuffer, LogQuery } from "../logging/log-buffer.js";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type { StateManager } from "../state/state-manager.js";
import { htmlShell, loginShell } from "./components/html-shell.js";

/** Cookie name used to store the session token in the browser. */
const SESSION_COOKIE = "ts-ha-session";

/** Dependencies required by the web UI Hono app. */
export interface WebUiDeps {
  stateManager: StateManager;
  automationManager: AutomationManager;
  logBuffer: LogBuffer;
  mqtt: MqttService;
  /** The configured bearer token. Empty string means no auth required. */
  token: string;
  /** URL path prefix the app is mounted at, e.g. "/status". */
  path: string;
  /** Returns the engine startedAt timestamp, or null if not started. */
  getStartedAt: () => number | null;
}

/**
 * Create the Hono app that powers the web UI.
 *
 * The returned app is mounted inside the existing HttpServer at the
 * configured path prefix. It handles:
 *   - The HTML shell (dashboard page)
 *   - Login / logout flow when a token is configured
 *   - A /api sub-group that mirrors the debug API endpoints
 */
export function createWebUiApp(deps: WebUiDeps): Hono {
  const { stateManager, automationManager, logBuffer, mqtt, token, path, getStartedAt } = deps;
  const hasAuth = token.length > 0;

  const app = new Hono();

  // ── Auth helpers ──────────────────────────────────────────────────────────

  /** Returns true when the request carries a valid token (cookie or header). */
  // biome-ignore lint/suspicious/noExplicitAny: Hono context type is parameterised; using any here is safe
  function isAuthorized(c: Context<any>): boolean {
    if (!hasAuth) return true;

    // Check Authorization header first (for API clients / JS fetch calls)
    const authHeader = c.req.header("authorization") ?? "";
    if (authHeader === `Bearer ${token}`) return true;

    // Check session cookie (for browser navigation)
    const cookieVal = getCookie(c, SESSION_COOKIE);
    return cookieVal === token;
  }

  // ── Auth middleware (browser redirect) ───────────────────────────────────

  app.use(`${path}`, async (c, next) => {
    if (!isAuthorized(c)) {
      return c.redirect(`${path}/login`);
    }
    return next();
  });

  // ── Auth middleware (API — 401 response) ─────────────────────────────────

  app.use(`${path}/api/*`, async (c, next) => {
    if (!isAuthorized(c)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  });

  // ── Dashboard shell ───────────────────────────────────────────────────────

  app.get(path, (c) => {
    const html = htmlShell({ basePath: path, hasAuth });
    return c.html(html);
  });

  // Trailing-slash redirect
  app.get(`${path}/`, (c) => c.redirect(path));

  // ── Login ─────────────────────────────────────────────────────────────────

  app.get(`${path}/login`, (c) => {
    // If no auth configured or already authenticated, redirect to dashboard
    if (!hasAuth || isAuthorized(c)) {
      return c.redirect(path);
    }
    return c.html(loginShell({ basePath: path }));
  });

  app.post(`${path}/login`, async (c) => {
    if (!hasAuth) return c.redirect(path);

    let formToken = "";
    try {
      const body = await c.req.parseBody();
      formToken = String(body.token ?? "");
    } catch {
      formToken = "";
    }

    if (formToken !== token) {
      return c.html(loginShell({ basePath: path, error: "Invalid access token." }), 401);
    }

    // Set session cookie and redirect to dashboard.
    // We build the Response manually so we can attach both the Location header
    // and the Set-Cookie header in a single response.
    const cookieValue = `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: path,
        "Set-Cookie": cookieValue,
      },
    });
  });

  app.get(`${path}/logout`, () => {
    // Clear the session cookie by expiring it and redirect to the login page
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${path}/login`,
        "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
      },
    });
  });

  // ── API: Status ───────────────────────────────────────────────────────────

  app.get(`${path}/api/status`, (c) => {
    const startedAt = getStartedAt();
    const checks = {
      mqtt: mqtt.isConnected,
      engine: startedAt !== null,
    };
    const ready = checks.mqtt && checks.engine;
    return c.json(
      {
        status: ready ? "ready" : "not ready",
        checks,
        startedAt,
        tz: process.env.TZ ?? null,
      },
      ready ? 200 : 503,
    );
  });

  // ── API: Automations ──────────────────────────────────────────────────────

  app.get(`${path}/api/automations`, (c) => {
    const automations = automationManager.listAutomations();
    return c.json({ automations, count: automations.length });
  });

  app.get(`${path}/api/automations/:name`, (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    const automation = automationManager.getAutomation(name);
    if (!automation) {
      return c.json({ error: "Automation not found", name }, 404);
    }
    return c.json(automation);
  });

  app.post(`${path}/api/automations/:name/trigger`, async (c) => {
    const name = decodeURIComponent(c.req.param("name"));

    let body: { type: string; [key: string]: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.type) {
      return c.json(
        { error: "Missing 'type' field. Must be one of: mqtt, cron, state, webhook" },
        400,
      );
    }

    let context: TriggerContext;
    switch (body.type) {
      case "mqtt":
        context = {
          type: "mqtt",
          topic: (body.topic as string) ?? `manual/${name}`,
          payload: (body.payload as Record<string, unknown>) ?? {},
        };
        break;
      case "cron":
        context = {
          type: "cron",
          expression: (body.expression as string) ?? "manual",
          firedAt: new Date(),
        };
        break;
      case "state":
        context = {
          type: "state",
          key: (body.key as string) ?? "manual",
          newValue: body.newValue,
          oldValue: body.oldValue,
        };
        break;
      case "webhook":
        context = {
          type: "webhook",
          path: (body.path as string) ?? "manual",
          method: (body.method as string) ?? "POST",
          headers: (body.headers as Record<string, string>) ?? {},
          query: (body.query as Record<string, string>) ?? {},
          body: body.body ?? null,
        };
        break;
      default:
        return c.json({ error: `Unknown trigger type: ${body.type}` }, 400);
    }

    try {
      const found = await automationManager.triggerAutomation(name, context);
      if (!found) {
        return c.json({ error: "Automation not found", name }, 404);
      }
      return c.json({ status: "triggered", automation: name, type: body.type });
    } catch {
      return c.json({ error: "Execution failed" }, 500);
    }
  });

  // ── API: State ────────────────────────────────────────────────────────────

  app.get(`${path}/api/state`, (c) => {
    const state: Record<string, unknown> = {};
    for (const key of stateManager.keys()) {
      state[key] = stateManager.get(key);
    }
    return c.json({ state, count: stateManager.keys().length });
  });

  app.get(`${path}/api/state/:key`, (c) => {
    const key = decodeURIComponent(c.req.param("key"));
    const exists = stateManager.has(key);
    const value = stateManager.get(key);
    return c.json({ key, value: value ?? null, exists });
  });

  app.put(`${path}/api/state/:key`, async (c) => {
    const key = decodeURIComponent(c.req.param("key"));

    let value: unknown;
    try {
      value = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const previous = stateManager.get(key) ?? null;
    stateManager.set(key, value);
    return c.json({ key, value, previous });
  });

  app.delete(`${path}/api/state/:key`, (c) => {
    const key = decodeURIComponent(c.req.param("key"));
    const existed = stateManager.has(key);
    if (existed) stateManager.delete(key);
    return c.json({ key, deleted: existed });
  });

  // ── API: Logs ─────────────────────────────────────────────────────────────

  app.get(`${path}/api/logs`, (c) => {
    const query: LogQuery = {};
    const automation = c.req.query("automation");
    if (automation) query.automation = automation;

    const level = c.req.query("level");
    if (level) query.level = levelNameToNumber(level);

    const limit = c.req.query("limit");
    if (limit) query.limit = Number.parseInt(limit, 10);

    const entries = logBuffer.query(query);
    return c.json({ entries, count: entries.length });
  });

  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function levelNameToNumber(level: string): number {
  switch (level.toLowerCase()) {
    case "trace":
      return 10;
    case "debug":
      return 20;
    case "info":
      return 30;
    case "warn":
      return 40;
    case "error":
      return 50;
    case "fatal":
      return 60;
    default:
      return 30;
  }
}
