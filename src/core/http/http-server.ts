/// <reference types="bun" />
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Logger } from "pino";
import type { TriggerContext } from "../automation.js";
import type { AutomationManager } from "../automation-manager.js";
import type { AggregateDeviceSource } from "../device-sources/aggregate.js";
import type { EventBus } from "../events/event-bus.js";
import type { LogBuffer, LogQuery } from "../logging/log-buffer.js";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type { RoomManager } from "../room-manager.js";
import type { ServiceRegistry } from "../services/service-registry.js";
import { isReservedStateKey, type StateManager } from "../state/state-manager.js";
import { EventStreamHub } from "./event-stream.js";
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
 * - `PUT  /api/automations/:name/enabled`  — Enable or disable an automation
 * - `GET  /api/automations/:name/source`   — Read the automation's source file
 * - `GET  /api/automations/:name/history`  — Execution history (start time, trigger, duration, outcome)
 * - `GET  /api/automations/:name/relationships` — Declared and observed relationships
 * - `POST /api/automations/:name/trigger`  — Manually trigger an automation
 * - `GET  /api/state`                      — List all state keys and values
 * - `GET  /api/state/:key`                 — Get a single state value
 * - `PUT  /api/state/:key`                 — Set a state value
 * - `DELETE /api/state/:key`               — Delete a state key
 * - `GET  /api/logs`                       — Query log buffer
 * - `GET  /api/device-catalog`             — List devices from every available source
 * - `GET  /api/device-catalog/:qualifiedId` — Get a single device by qualified id
 * - `POST /api/device-catalog/:qualifiedId/command` — Issue a validated command to a device
 * - `PUT  /api/device-catalog/:qualifiedId/room` — Assign a device to a room
 * - `DELETE /api/device-catalog/:qualifiedId/room` — Clear a device's room assignment
 * - `GET  /api/rooms`                      — List rooms with membership
 * - `GET  /api/rooms/unassigned`           — Devices belonging to no room
 * - `POST /api/rooms`                      — Create a room
 * - `PUT  /api/rooms/:id`                  — Rename a room
 * - `DELETE /api/rooms/:id`                — Delete a room
 * - `GET  /api/events`                     — Realtime server-sent event stream
 *
 * `GET /api/devices` and `GET /api/devices/:friendlyName` (Zigbee-only) are
 * removed rather than repurposed (design.md R13) — see `/api/device-catalog`.
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
  private deviceSources: AggregateDeviceSource | null = null;
  private roomManager: RoomManager | null = null;
  private eventStreamHub: EventStreamHub | null = null;
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
   * Wire the unified device catalog endpoints (`/api/device-catalog`,
   * `/api/device-catalog/:qualifiedId`) to the engine's aggregate device
   * accessor. Called by the engine after construction; `engine.devices` is
   * always present, so this is called unconditionally rather than passed
   * `null` for an unconfigured deployment (task 6.13a).
   */
  setDeviceSources(sources: AggregateDeviceSource): void {
    this.deviceSources = sources;
  }

  /**
   * Wire the room endpoints (`/api/rooms`, `/api/device-catalog/:qualifiedId/room`)
   * to the engine's room manager. Called by the engine after construction;
   * `engine.rooms` is always present, so this is called unconditionally
   * (task 9.6).
   */
  setRoomManager(rooms: RoomManager): void {
    this.roomManager = rooms;
  }

  /**
   * Wire the realtime event stream's `/api/events` endpoint to the engine's
   * shared {@link EventBus}.
   *
   * `deliveryLogger` MUST be the stdout-only logger from `engine.ts`
   * (design.md D32) — never `this.logger` or any of its children — since the
   * delivery path's own logging (fan-out failures, overflow, the
   * fell-behind signal) must not be able to feed back into the log category
   * it delivers (task 5.0c). Connection accepted/closed logging uses
   * `this.logger` instead, so stream activity remains visible in the log
   * view even if delivery itself is failing.
   */
  setEventStream(bus: EventBus, deliveryLogger: Logger): void {
    this.eventStreamHub?.stop();
    this.eventStreamHub = new EventStreamHub(
      bus,
      deliveryLogger,
      this.logger.child({ service: "sse" }),
    );
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
    registerWebUiRoutes(this.honoApp, path, token, this.logger.child({ service: "web-ui" }));
    this.logger.info({ path }, "Web UI mounted");
  }

  /**
   * Call `registerRoutes(app)` on every `ServicePlugin` in the given registry
   * that implements it. Invoke before `start()` so routes are active when the
   * server starts listening.
   */
  mountServiceRoutes(registry: ServiceRegistry): void {
    registry.mountRoutes(this.honoApp);
    this.logger.debug("Service plugin routes mounted");
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
    this.eventStreamHub?.stop();
    this.eventStreamHub = null;
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

    app.put("/api/automations/:name/enabled", async (c) => {
      if (!this.automationManager) return c.json({ error: "Not available" }, 503);
      const name = decodeURIComponent(c.req.param("name"));

      let body: { enabled?: unknown };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }

      if (typeof body.enabled !== "boolean") {
        return c.json({ error: "Body must be { enabled: boolean }" }, 400);
      }

      if (body.enabled) {
        const result = await this.automationManager.start(name);
        if (result.status === "not_found") {
          return c.json({ error: "Automation not found", name }, 404);
        }
        if (result.status === "error") {
          return c.json({ error: result.message, name }, 400);
        }
        const automation = this.automationManager.getAutomation(name);
        return c.json(automation);
      }

      const result = await this.automationManager.stop(name);
      if (result === "not_found") {
        return c.json({ error: "Automation not found", name }, 404);
      }
      const automation = this.automationManager.getAutomation(name);
      return c.json(automation);
    });

    app.get("/api/automations/:name/source", async (c) => {
      if (!this.automationManager) return c.json({ error: "Not available" }, 503);
      const name = decodeURIComponent(c.req.param("name"));

      const result = await this.automationManager.getSource(name);
      if (result.status === "not_found") {
        return c.json({ error: "Automation not found", name }, 404);
      }
      if (result.status === "error") {
        return c.json({ error: result.message, name }, 500);
      }
      return c.json({ name, source: result.source });
    });

    // Execution history and relationships (design.md D11; task 8.6). Both
    // return 404 for an unknown automation, and an automation that is known
    // but has never run reports an empty history rather than an error —
    // `getHistory()`/`getRelationships()` return `null` only for the former,
    // so a single null-check distinguishes the two cases correctly.
    app.get("/api/automations/:name/history", (c) => {
      if (!this.automationManager) return c.json({ error: "Not available" }, 503);
      const name = decodeURIComponent(c.req.param("name"));

      const history = this.automationManager.getHistory(name);
      if (history === null) return c.json({ error: "Automation not found", name }, 404);
      return c.json({ name, history });
    });

    app.get("/api/automations/:name/relationships", (c) => {
      if (!this.automationManager) return c.json({ error: "Not available" }, 503);
      const name = decodeURIComponent(c.req.param("name"));

      const relationships = this.automationManager.getRelationships(name);
      if (relationships === null) return c.json({ error: "Automation not found", name }, 404);
      return c.json({ name, ...relationships });
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
            topic: typeof body.topic === "string" ? body.topic : `manual/${name}`,
            payload:
              body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
                ? (body.payload as Record<string, unknown>)
                : {},
          };
          break;
        case "cron":
          context = {
            type: "cron",
            expression: typeof body.expression === "string" ? body.expression : "manual",
            firedAt: new Date(),
          };
          break;
        case "state":
          context = {
            type: "state",
            key: typeof body.key === "string" ? body.key : "manual",
            newValue: body.newValue,
            oldValue: body.oldValue,
          };
          break;
        case "webhook":
          context = {
            type: "webhook",
            path: typeof body.path === "string" ? body.path : "manual",
            method: typeof body.method === "string" ? body.method : "POST",
            headers:
              body.headers && typeof body.headers === "object" && !Array.isArray(body.headers)
                ? (body.headers as Record<string, string>)
                : {},
            query:
              body.query && typeof body.query === "object" && !Array.isArray(body.query)
                ? (body.query as Record<string, string>)
                : {},
            body: body.body ?? null,
          };
          break;
        default:
          return c.json({ error: `Unknown trigger type: ${body.type}` }, 400);
      }

      this.logger.info({ automation: name, type: body.type }, "Manual trigger via API");

      try {
        const result = await this.automationManager.triggerAutomation(name, context);
        if (result === "not_found") return c.json({ error: "Automation not found", name }, 404);
        if (result === "disabled") {
          return c.json({ error: "Automation is disabled", name }, 409);
        }
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
      if (isReservedStateKey(key)) {
        return c.json({ error: `Cannot write reserved internal state key "${key}"` }, 400);
      }

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
      if (isReservedStateKey(key)) {
        return c.json({ error: `Cannot delete reserved internal state key "${key}"` }, 400);
      }
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
      if (limit) {
        const parsed = Number.parseInt(limit, 10);
        logQuery.limit = Number.isNaN(parsed) ? 50 : Math.max(1, Math.min(parsed, 1000));
      }

      const entries = this.logBuffer.query(logQuery);
      return c.json({ entries, count: entries.length });
    });

    // ── API: Realtime event stream ─────────────────────────────────────────

    app.get("/api/events", (c) => {
      if (!this.eventStreamHub) return c.json({ error: "Not available" }, 503);
      return this.eventStreamHub.open();
    });

    // ── API: Unified device catalog ───────────────────────────────────────────
    //
    // `GET /api/devices` and `GET /api/devices/:friendlyName` (Zigbee-only)
    // are removed rather than repurposed (design.md R13; task 6.14): serving
    // a source-qualified payload from the same paths would return 200 with a
    // shape neither existing client can read, defeating the failed-fetch
    // handling both already have. The unified, source-spanning endpoints are
    // served from different paths below.

    app.get("/api/devices", (c) => c.json({ error: "Removed — use /api/device-catalog" }, 410));
    app.get("/api/devices/:friendlyName", (c) =>
      c.json({ error: "Removed — use /api/device-catalog" }, 410),
    );

    app.get("/api/device-catalog", (c) => {
      if (!this.deviceSources) return c.json({ error: "Not available" }, 503);

      const devices = this.deviceSources.list();
      return c.json({
        devices,
        count: devices.length,
        sources: this.deviceSources.sources(),
      });
    });

    app.get("/api/device-catalog/:qualifiedId", (c) => {
      if (!this.deviceSources) return c.json({ error: "Not available" }, 503);

      const qualifiedId = decodeURIComponent(c.req.param("qualifiedId"));
      const device = this.deviceSources.get(qualifiedId);
      if (!device) return c.json({ error: "Device not found", qualifiedId }, 404);

      return c.json(device);
    });

    // Issues a command to a single device, addressed by qualified identifier
    // (task 7.2; specs/http-server "Device Command Endpoint"). The payload is
    // never forwarded to a transport unvalidated — validation happens inside
    // `DeviceSource.command()`, one level below this endpoint, so every
    // dispatch path (HomeKit, this endpoint, and any future consumer) is
    // validated identically rather than duplicating the rule here.
    app.post("/api/device-catalog/:qualifiedId/command", async (c) => {
      if (!this.deviceSources) return c.json({ error: "Not available" }, 503);

      const qualifiedId = decodeURIComponent(c.req.param("qualifiedId"));

      let properties: unknown;
      try {
        properties = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
        return c.json({ error: "Command body must be a JSON object of properties" }, 400);
      }

      const outcome = await this.deviceSources.command(
        qualifiedId,
        properties as Record<string, unknown>,
      );

      switch (outcome.status) {
        case "ok":
          return c.json({ qualifiedId, status: "ok" });
        case "invalid":
          return c.json({ error: outcome.error, qualifiedId }, 400);
        case "not_found":
          return c.json({ error: "Device not found", qualifiedId }, 404);
        case "unavailable":
          return c.json({ error: "Device source unavailable", qualifiedId }, 503);
      }
    });

    // ── API: Rooms ──────────────────────────────────────────────────────────
    //
    // User-defined rooms grouping devices across every device source
    // (design.md D14; specs/device-rooms/spec.md, specs/http-server/spec.md
    // "Room Endpoints"; task 9.6).

    app.get("/api/rooms", (c) => {
      if (!this.roomManager) return c.json({ error: "Not available" }, 503);
      const rooms = this.roomManager.listRooms();
      return c.json({ rooms, count: rooms.length });
    });

    // Must be registered before "/api/rooms/:id" so the literal segment
    // "unassigned" is never captured as a room id.
    app.get("/api/rooms/unassigned", (c) => {
      if (!this.roomManager) return c.json({ error: "Not available" }, 503);
      const devices = this.roomManager.getUnassignedDevices();
      return c.json({ devices, count: devices.length });
    });

    app.post("/api/rooms", async (c) => {
      if (!this.roomManager) return c.json({ error: "Not available" }, 503);

      let body: { name?: unknown };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      if (typeof body.name !== "string" || body.name.length === 0) {
        return c.json({ error: "Body must be { name: string }" }, 400);
      }

      const result = this.roomManager.createRoom(body.name);
      if (result.status === "duplicate_name") {
        return c.json({ error: result.message }, 409);
      }
      return c.json(result.room, 201);
    });

    app.put("/api/rooms/:id", async (c) => {
      if (!this.roomManager) return c.json({ error: "Not available" }, 503);
      const id = decodeURIComponent(c.req.param("id"));

      let body: { name?: unknown };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      if (typeof body.name !== "string" || body.name.length === 0) {
        return c.json({ error: "Body must be { name: string }" }, 400);
      }

      const result = this.roomManager.renameRoom(id, body.name);
      if (result.status === "not_found") return c.json({ error: "Room not found", id }, 404);
      if (result.status === "duplicate_name") return c.json({ error: result.message }, 409);
      return c.json(result.room);
    });

    app.delete("/api/rooms/:id", (c) => {
      if (!this.roomManager) return c.json({ error: "Not available" }, 503);
      const id = decodeURIComponent(c.req.param("id"));

      const result = this.roomManager.deleteRoom(id);
      if (result === "not_found") return c.json({ error: "Room not found", id }, 404);
      return c.json({ id, deleted: true });
    });

    // Assign/unassign a device's room, addressed by qualified identifier —
    // alongside the device-catalog read and command endpoints above, rather
    // than under /api/rooms, since a device belongs to at most one room and
    // this is fundamentally a property of the device (design.md D14).
    app.put("/api/device-catalog/:qualifiedId/room", async (c) => {
      if (!this.roomManager) return c.json({ error: "Not available" }, 503);
      const qualifiedId = decodeURIComponent(c.req.param("qualifiedId"));

      let body: { roomId?: unknown };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      if (typeof body.roomId !== "string" || body.roomId.length === 0) {
        return c.json({ error: "Body must be { roomId: string }" }, 400);
      }

      const result = this.roomManager.assignDevice(qualifiedId, body.roomId);
      if (result === "room_not_found") {
        return c.json({ error: "Room not found", roomId: body.roomId }, 404);
      }
      return c.json({ qualifiedId, roomId: body.roomId });
    });

    app.delete("/api/device-catalog/:qualifiedId/room", (c) => {
      if (!this.roomManager) return c.json({ error: "Not available" }, 503);
      const qualifiedId = decodeURIComponent(c.req.param("qualifiedId"));
      this.roomManager.unassignDevice(qualifiedId);
      return c.json({ qualifiedId, roomId: null });
    });

    return app;
  }
}
