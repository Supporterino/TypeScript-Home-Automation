/// <reference types="bun" />
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Logger } from "pino";
import type { TriggerContext } from "../automation.js";
import type { AutomationManager } from "../automation-manager.js";
import type { LogBuffer, LogQuery } from "../logging/log-buffer.js";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type { StateManager } from "../state/state-manager.js";
import type { DeviceRegistry } from "../zigbee/device-registry.js";
import { levelNameToNumber, SESSION_COOKIE } from "./utils.js";

/**
 * Handler function for a registered webhook.
 * @internal
 */
export type WebhookHandler = (context: {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}) => Promise<void>;

/** A registered webhook route. */
interface WebhookRoute {
  path: string;
  methods: Set<string>;
  handler: WebhookHandler;
}

/**
 * HTTP server for health probes, readiness checks, webhook triggers,
 * and the unified API.
 *
 * Public endpoints (no authentication required):
 * - `GET  /healthz`                        — Liveness probe
 * - `GET  /readyz`                         — Readiness probe
 * - `POST /webhook/<path>`                 — Webhook triggers
 *
 * Authenticated endpoints (Bearer token or session cookie):
 * - `GET  /api/status`                     — Engine and MQTT status
 * - `GET  /api/automations`                — List all automations
 * - `GET  /api/automations/:name`          — Get automation details
 * - `POST /api/automations/:name/trigger`  — Manually trigger an automation
 * - `GET  /api/state`                      — List all state keys and values
 * - `GET  /api/state/:key`                 — Get a single state value
 * - `PUT  /api/state/:key`                 — Set a state value
 * - `DELETE /api/state/:key`               — Delete a state key
 * - `GET  /api/logs`                       — Query log buffer
 * - `GET  /api/devices`                    — List all tracked Zigbee devices
 * - `GET  /api/devices/:friendlyName`      — Get a single device with its state
 *
 * Uses `Bun.serve()` backed by a Hono router.
 *
 * @internal
 */
export class HttpServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private engineStarted = false;
  startedAt: number | null = null;
  private readonly webhookRoutes: Map<string, WebhookRoute> = new Map();
  private stateManager: StateManager | null = null;
  private automationManager: AutomationManager | null = null;
  private logBuffer: LogBuffer | null = null;
  private deviceRegistry: DeviceRegistry | null = null;
  private readonly honoApp: Hono;

  constructor(
    private readonly port: number,
    private readonly mqtt: MqttService,
    private readonly token: string,
    private readonly logger: Logger,
  ) {
    this.honoApp = this.buildApp();
  }

  /**
   * Set references to managers for the API.
   * Called by the engine after construction.
   */
  setManagers(state: StateManager, automations: AutomationManager, logs: LogBuffer): void {
    this.stateManager = state;
    this.automationManager = automations;
    this.logBuffer = logs;
  }

  /**
   * Set the device registry for the `/api/devices` endpoints.
   * Pass `null` when the registry is disabled.
   */
  setDeviceRegistry(registry: DeviceRegistry | null): void {
    this.deviceRegistry = registry;
  }

  /**
   * Mark the engine as started.
   */
  setEngineStarted(started: boolean): void {
    this.engineStarted = started;
    this.startedAt = started ? Date.now() : null;
  }

  /**
   * Register web UI routes on the server's Hono app.
   * Lazily imports `registerWebUiRoutes` to keep the web UI tree-shakeable.
   * Must be called before `start()`.
   */
  async mountWebUi(path: string, token: string): Promise<void> {
    const { registerWebUiRoutes } = await import("../web-ui/index.js");
    registerWebUiRoutes(this.honoApp, path, token);
    this.logger.info({ path }, "Web UI mounted");
  }

  /**
   * Register a webhook route.
   */
  registerWebhook(path: string, methods: string[], handler: WebhookHandler): void {
    this.webhookRoutes.set(path, {
      path,
      methods: new Set(methods.map((m) => m.toUpperCase())),
      handler,
    });
    this.logger.debug({ path, methods }, "Webhook route registered");
  }

  /**
   * Remove a webhook route.
   */
  removeWebhook(path: string): void {
    this.webhookRoutes.delete(path);
    this.logger.debug({ path }, "Webhook route removed");
  }

  /**
   * Start the HTTP server.
   */
  start(): void {
    this.server = Bun.serve({
      port: this.port,
      fetch: this.honoApp.fetch,
    });
    this.logger.info({ port: this.port }, "HTTP server listening");
  }

  /**
   * Stop the HTTP server.
   */
  stop(): void {
    if (this.server) {
      this.server.stop(true);
      this.server = null;
      this.logger.info("HTTP server stopped");
    }
  }

  /**
   * Expose the underlying Hono app's fetch handler for direct use in tests
   * without starting a real `Bun.serve()` listener.
   */
  get fetch(): (req: Request) => Response | Promise<Response> {
    return this.honoApp.fetch.bind(this.honoApp);
  }

  // -------------------------------------------------------------------------
  // App builder
  // -------------------------------------------------------------------------

  private buildApp(): Hono {
    const app = new Hono();
    const hasAuth = this.token.length > 0;

    // ── Auth helper ─────────────────────────────────────────────────────────

    // biome-ignore lint/suspicious/noExplicitAny: Hono context type is parameterised; using any here is safe
    const isAuthorized = (c: Context<any>): boolean => {
      if (!hasAuth) return true;

      const authHeader = c.req.header("authorization") ?? "";
      if (authHeader === `Bearer ${this.token}`) return true;

      const cookieVal = getCookie(c, SESSION_COOKIE);
      return cookieVal === this.token;
    };

    // ── Health probes (unauthenticated) ─────────────────────────────────────

    app.get("/healthz", (c) => c.json({ status: "ok" }));

    app.get("/readyz", (c) => {
      const checks = { mqtt: this.mqtt.isConnected, engine: this.engineStarted };
      const ready = checks.mqtt && checks.engine;
      return c.json(
        {
          status: ready ? "ready" : "not ready",
          checks,
          startedAt: this.startedAt,
          tz: process.env.TZ ?? null,
        },
        ready ? 200 : 503,
      );
    });

    // ── Webhooks (unauthenticated) ──────────────────────────────────────────

    app.all("/webhook/*", async (c) => {
      const webhookPath = c.req.path.slice("/webhook/".length);
      const route = this.webhookRoutes.get(webhookPath);

      if (!route) {
        return c.json({ error: "Webhook not found", path: webhookPath }, 404);
      }

      if (!route.methods.has(c.req.method)) {
        return c.json({ error: "Method not allowed", allowed: [...route.methods] }, 405);
      }

      let body: unknown = null;
      if (c.req.raw.body) {
        const contentType = c.req.header("content-type") ?? "";
        try {
          body = contentType.includes("application/json") ? await c.req.json() : await c.req.text();
        } catch {
          this.logger.warn({ path: webhookPath }, "Failed to parse webhook request body");
          body = null;
        }
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of c.req.raw.headers) {
        headers[key] = value;
      }

      const query: Record<string, string> = {};
      for (const [key, value] of new URL(c.req.url).searchParams) {
        query[key] = value;
      }

      this.logger.info({ path: webhookPath, method: c.req.method }, "Webhook triggered");

      try {
        await route.handler({ method: c.req.method, headers, query, body });
        return c.json({ status: "ok" });
      } catch (err) {
        this.logger.error({ err, path: webhookPath }, "Webhook handler error");
        return c.json({ error: "Internal error" }, 500);
      }
    });

    // ── API auth middleware ─────────────────────────────────────────────────

    app.use("/api/*", async (c, next) => {
      if (!isAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
      return next();
    });

    // ── API: Status ─────────────────────────────────────────────────────────

    app.get("/api/status", (c) => {
      const checks = { mqtt: this.mqtt.isConnected, engine: this.engineStarted };
      const ready = checks.mqtt && checks.engine;
      return c.json(
        {
          status: ready ? "ready" : "not ready",
          checks,
          startedAt: this.startedAt,
          tz: process.env.TZ ?? null,
        },
        ready ? 200 : 503,
      );
    });

    // ── API: Automations ────────────────────────────────────────────────────

    app.get("/api/automations", (c) => {
      if (!this.automationManager) return c.json({ error: "Not available" }, 503);
      const automations = this.automationManager.listAutomations();
      return c.json({ automations, count: automations.length });
    });

    app.get("/api/automations/:name", (c) => {
      if (!this.automationManager) return c.json({ error: "Not available" }, 503);
      const name = decodeURIComponent(c.req.param("name"));
      const automation = this.automationManager.getAutomation(name);
      if (!automation) return c.json({ error: "Automation not found", name }, 404);
      return c.json(automation);
    });

    app.post("/api/automations/:name/trigger", async (c) => {
      if (!this.automationManager) return c.json({ error: "Not available" }, 503);
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

      this.logger.info({ automation: name, type: body.type }, "Manual trigger via API");

      try {
        const found = await this.automationManager.triggerAutomation(name, context);
        if (!found) return c.json({ error: "Automation not found", name }, 404);
        return c.json({ status: "triggered", automation: name, type: body.type });
      } catch (err) {
        this.logger.error({ err, automation: name }, "Manual trigger failed");
        return c.json({ error: "Execution failed" }, 500);
      }
    });

    // ── API: State ──────────────────────────────────────────────────────────

    app.get("/api/state", (c) => {
      if (!this.stateManager) return c.json({ error: "Not available" }, 503);
      const state: Record<string, unknown> = {};
      for (const key of this.stateManager.keys()) {
        state[key] = this.stateManager.get(key);
      }
      return c.json({ state, count: this.stateManager.keys().length });
    });

    app.get("/api/state/:key", (c) => {
      if (!this.stateManager) return c.json({ error: "Not available" }, 503);
      const key = decodeURIComponent(c.req.param("key"));
      const exists = this.stateManager.has(key);
      const value = this.stateManager.get(key);
      return c.json({ key, value: value ?? null, exists });
    });

    app.put("/api/state/:key", async (c) => {
      if (!this.stateManager) return c.json({ error: "Not available" }, 503);
      const key = decodeURIComponent(c.req.param("key"));

      let value: unknown;
      try {
        value = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }

      const previous = this.stateManager.get(key) ?? null;
      this.stateManager.set(key, value);
      this.logger.info({ key, value, previous }, "State set via API");
      return c.json({ key, value, previous });
    });

    app.delete("/api/state/:key", (c) => {
      if (!this.stateManager) return c.json({ error: "Not available" }, 503);
      const key = decodeURIComponent(c.req.param("key"));
      const existed = this.stateManager.has(key);
      if (existed) {
        this.stateManager.delete(key);
        this.logger.info({ key }, "State deleted via API");
      }
      return c.json({ key, deleted: existed });
    });

    // ── API: Logs ───────────────────────────────────────────────────────────

    app.get("/api/logs", (c) => {
      if (!this.logBuffer) return c.json({ error: "Not available" }, 503);

      const logQuery: LogQuery = {};
      const automation = c.req.query("automation");
      if (automation) logQuery.automation = automation;

      const level = c.req.query("level");
      if (level) logQuery.level = levelNameToNumber(level);

      const limit = c.req.query("limit");
      if (limit) logQuery.limit = Number.parseInt(limit, 10);

      const entries = this.logBuffer.query(logQuery);
      return c.json({ entries, count: entries.length });
    });

    // ── API: Devices ────────────────────────────────────────────────────────

    app.get("/api/devices", (c) => {
      if (!this.deviceRegistry) {
        return c.json(
          { error: "Device registry is disabled (DEVICE_REGISTRY_ENABLED=false)" },
          503,
        );
      }

      const devices = this.deviceRegistry.getDevices().map((d) => ({
        friendly_name: d.friendly_name,
        nice_name: this.deviceRegistry?.getNiceName(d.friendly_name),
        ieee_address: d.ieee_address,
        type: d.type,
        supported: d.supported,
        interview_state: d.interview_state,
        power_source: d.power_source ?? null,
        state: this.deviceRegistry?.getDeviceState(d.friendly_name) ?? null,
        definition: d.definition
          ? {
              model: d.definition.model,
              vendor: d.definition.vendor,
              description: d.definition.description,
            }
          : null,
      }));

      return c.json({ devices, count: devices.length });
    });

    app.get("/api/devices/:friendlyName", (c) => {
      if (!this.deviceRegistry) {
        return c.json(
          { error: "Device registry is disabled (DEVICE_REGISTRY_ENABLED=false)" },
          503,
        );
      }

      const friendlyName = decodeURIComponent(c.req.param("friendlyName"));
      const device = this.deviceRegistry.getDevice(friendlyName);
      if (!device) return c.json({ error: "Device not found", friendlyName }, 404);

      return c.json({
        friendly_name: device.friendly_name,
        nice_name: this.deviceRegistry.getNiceName(device.friendly_name),
        ieee_address: device.ieee_address,
        type: device.type,
        supported: device.supported,
        interview_state: device.interview_state,
        power_source: device.power_source ?? null,
        state: this.deviceRegistry.getDeviceState(device.friendly_name) ?? null,
        definition: device.definition
          ? {
              model: device.definition.model,
              vendor: device.definition.vendor,
              description: device.definition.description,
            }
          : null,
      });
    });

    return app;
  }
}
