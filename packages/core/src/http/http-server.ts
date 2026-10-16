/// <reference types="bun" />
import type {
  Capability,
  RoomBatchCommandResponse,
  RoomCommandOutcome,
  WeatherData,
  WeatherUnavailable,
} from "@ts-ha/shared";
import type { WeatherLocation, WeatherService } from "@ts-ha/shared/types/weather";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Logger } from "pino";
import type { TriggerContext } from "../automation.js";
import type { AutomationManager } from "../automation-manager.js";
import { WEATHER_MAX_FORECAST_DAYS } from "../config.js";
import type { AggregateDeviceSource } from "../device-sources/aggregate.js";
import { flattenByProperty } from "../device-sources/command-validation.js";
import type { DeviceVisibility } from "../device-visibility.js";
import type { EnergyAggregator } from "../energy/energy-aggregator.js";
import type { EventBus } from "../events/event-bus.js";
import type { LogBuffer, LogQuery } from "../logging/log-buffer.js";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type { RoomManager } from "../room-manager.js";
import type { ServiceRegistry } from "../services/service-registry.js";
import { isReservedStateKey, type StateManager } from "../state/state-manager.js";
import type { WallManager, WallProfileConfig } from "../wall-manager.js";
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
 * Default location and forecast horizon `GET /api/weather` uses when a request
 * supplies none.
 */
export interface WeatherEndpointDefaults {
  /** Configured default latitude, absent unless both coordinates are set. */
  latitude?: number;
  /** Configured default longitude, absent unless both coordinates are set. */
  longitude?: number;
  /** Configured default forecast horizon, already clamped by config. */
  forecastDays: number;
}

/**
 * HTTP server for health probes, readiness checks, webhook triggers, and the
 * unified API. Uses `Bun.serve()` backed by a Hono router.
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
  private wallManager: WallManager | null = null;
  private deviceVisibility: DeviceVisibility | null = null;
  private energyAggregator: EnergyAggregator | null = null;
  private weatherService: WeatherService | null = null;
  private weatherDefaults: WeatherEndpointDefaults | null = null;
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

  /** Wire the `/api/device-catalog` endpoints to the engine's aggregate device accessor. */
  setDeviceSources(sources: AggregateDeviceSource): void {
    this.deviceSources = sources;
  }

  /** Wire the `/api/rooms` endpoints to the engine's room manager. */
  setRoomManager(rooms: RoomManager): void {
    this.roomManager = rooms;
  }

  /** Wire the `/api/walls` endpoints to the engine's {@link WallManager}. */
  setWallManager(walls: WallManager): void {
    this.wallManager = walls;
  }

  /** Wire the device-visibility endpoints to the engine's `DeviceVisibility`. */
  setDeviceVisibility(visibility: DeviceVisibility): void {
    this.deviceVisibility = visibility;
  }

  /** Wire the `/api/energy` endpoint to the engine's `EnergyAggregator`. */
  setEnergyAggregator(aggregator: EnergyAggregator): void {
    this.energyAggregator = aggregator;
  }

  /** Wire `GET /api/weather` to an optional `WeatherService` and configured defaults. */
  setWeatherService(service: WeatherService | null, defaults: WeatherEndpointDefaults): void {
    this.weatherService = service;
    this.weatherDefaults = defaults;
  }

  /**
   * Wire the `/api/events` endpoint to the engine's shared `EventBus`.
   * `deliveryLogger` must be the stdout-only logger from `engine.ts`, never `this.logger`.
   */
  setEventStream(bus: EventBus, deliveryLogger: Logger): void {
    this.eventStreamHub?.stop();
    this.eventStreamHub = new EventStreamHub(
      bus,
      deliveryLogger,
      this.logger.child({ service: "sse" }),
    );
    // Read lazily from `this.deviceSources` so the supplier stays correct regardless of call order.
    this.eventStreamHub.setDeviceSupplier(() => this.deviceSources?.list() ?? []);
  }

  /**
   * Mark the engine as started.
   */
  setEngineStarted(started: boolean): void {
    this.engineStarted = started;
    this.startedAt = started ? Date.now() : null;
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

    // Both endpoints 404 for an unknown automation; a known automation that has
    // never run reports an empty history (the getters return null only for "not found").
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
    // `GET /api/devices` and `/api/devices/:friendlyName` are removed; the unified
    // endpoints below serve the same data from different paths.

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

    // Issue a command to a single device. Validation happens inside
    // `DeviceSource.command()`, so every dispatch path is validated identically.
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
    // User-defined rooms grouping devices across every device source.

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

    // ── API: Walls ──────────────────────────────────────────────────────────
    //
    // Named wall profiles for the full-bleed wall surface, addressed by name;
    // the config is validated on write inside `WallManager`.

    app.get("/api/walls", (c) => {
      if (!this.wallManager) return c.json({ error: "Not available" }, 503);
      const walls = this.wallManager.listWalls();
      return c.json({ walls, count: walls.length });
    });

    app.get("/api/walls/:name", (c) => {
      if (!this.wallManager) return c.json({ error: "Not available" }, 503);
      const name = c.req.param("name");
      const wall = this.wallManager.getWall(name);
      if (!wall) return c.json({ error: "Wall not found", name }, 404);
      return c.json(wall);
    });

    app.post("/api/walls", async (c) => {
      if (!this.wallManager) return c.json({ error: "Not available" }, 503);

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return c.json({ error: "Body must be an object" }, 400);
      }
      const parsed = body as { name?: unknown; config?: unknown };
      if (typeof parsed.name !== "string" || parsed.name.length === 0) {
        return c.json({ error: "Body must be { name: string, config: object }" }, 400);
      }
      if (
        parsed.config === null ||
        typeof parsed.config !== "object" ||
        Array.isArray(parsed.config)
      ) {
        return c.json({ error: "Body must be { name: string, config: object }" }, 400);
      }

      const result = this.wallManager.createWall(parsed.name, parsed.config as WallProfileConfig);
      if (result.status === "duplicate_name") {
        return c.json({ error: result.message, name: parsed.name }, 409);
      }
      if (result.status === "invalid_config") return c.json({ error: result.message }, 400);
      return c.json(result.wall, 201);
    });

    app.put("/api/walls/:name", async (c) => {
      if (!this.wallManager) return c.json({ error: "Not available" }, 503);
      const name = c.req.param("name");

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return c.json({ error: "Body must be an object" }, 400);
      }
      const parsed = body as { name?: unknown; config?: unknown };
      if (
        parsed.name !== undefined &&
        (typeof parsed.name !== "string" || parsed.name.length === 0)
      ) {
        return c.json({ error: "Body 'name' must be a non-empty string" }, 400);
      }
      if (
        parsed.config !== undefined &&
        (parsed.config === null ||
          typeof parsed.config !== "object" ||
          Array.isArray(parsed.config))
      ) {
        return c.json({ error: "Body 'config' must be an object" }, 400);
      }

      const input: { name?: string; config?: WallProfileConfig } = {};
      if (typeof parsed.name === "string") input.name = parsed.name;
      if (parsed.config !== undefined) input.config = parsed.config as WallProfileConfig;

      const result = this.wallManager.updateWall(name, input);
      if (result.status === "not_found") return c.json({ error: "Wall not found", name }, 404);
      if (result.status === "duplicate_name") {
        return c.json({ error: result.message, name }, 409);
      }
      if (result.status === "invalid_config") return c.json({ error: result.message }, 400);
      return c.json(result.wall);
    });

    app.delete("/api/walls/:name", (c) => {
      if (!this.wallManager) return c.json({ error: "Not available" }, 503);
      const name = c.req.param("name");
      const result = this.wallManager.deleteWall(name);
      if (result === "not_found") return c.json({ error: "Wall not found", name }, 404);
      return c.json({ name, deleted: true });
    });

    // Issue one command to every room member whose capabilities permit the
    // property. Best-effort: a member's failure never aborts the batch.
    app.post("/api/rooms/:id/command", async (c) => {
      if (!this.roomManager || !this.deviceSources) {
        return c.json({ error: "Not available" }, 503);
      }

      const id = decodeURIComponent(c.req.param("id"));
      const room = this.roomManager.listRooms().find((candidate) => candidate.id === id);
      if (!room) return c.json({ error: "Room not found", id }, 404);

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return c.json({ error: "Command body must be a JSON object of properties" }, 400);
      }

      const command = body as Record<string, unknown>;
      const requestedProperties = Object.keys(command);
      const results: RoomBatchCommandResponse = [];

      for (const member of room.members) {
        results.push({
          qualifiedId: member.qualifiedId,
          outcome: await this.dispatchRoomMember(
            member.qualifiedId,
            member.device?.capabilities ?? null,
            command,
            requestedProperties,
          ),
        });
      }

      return c.json(results);
    });

    // Assign/unassign a device's room, addressed by qualified identifier and
    // served under device-catalog since a device belongs to at most one room.
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

    // ── API: Device visibility ─────────────────────────────────────────────
    //
    // A device's hidden flag, addressed by qualified identifier. Idempotent in
    // both directions and settable even for an unknown qualified id.

    app.put("/api/device-catalog/:qualifiedId/hidden", (c) => {
      if (!this.deviceVisibility) return c.json({ error: "Not available" }, 503);
      const qualifiedId = decodeURIComponent(c.req.param("qualifiedId"));
      this.deviceVisibility.hide(qualifiedId);
      return c.json({ qualifiedId, hidden: true });
    });

    app.delete("/api/device-catalog/:qualifiedId/hidden", (c) => {
      if (!this.deviceVisibility) return c.json({ error: "Not available" }, 503);
      const qualifiedId = decodeURIComponent(c.req.param("qualifiedId"));
      this.deviceVisibility.unhide(qualifiedId);
      return c.json({ qualifiedId, hidden: false });
    });

    // ── API: Energy ─────────────────────────────────────────────────────────
    //
    // The aggregated home energy view. `503` is purely defensive — the engine
    // always wires the aggregator.

    app.get("/api/energy", (c) => {
      if (!this.energyAggregator) return c.json({ error: "Not available" }, 503);
      return c.json(this.energyAggregator.snapshot());
    });

    // ── API: Weather ────────────────────────────────────────────────────────
    //
    // Current conditions and forecast; the location comes from the client or the
    // configured default.

    app.get("/api/weather", async (c) => {
      if (!this.weatherService) {
        const unavailable: WeatherUnavailable = {
          available: false,
          reason: "service_unregistered",
        };
        return c.json(unavailable, 404);
      }

      const location = this.resolveWeatherLocation(c.req.query("lat"), c.req.query("lon"));
      if (!location) {
        const unavailable: WeatherUnavailable = { available: false, reason: "no_location" };
        return c.json(unavailable, 400);
      }

      const requestedDays = this.parseForecastDays(c.req.query("days"));
      const days = Math.min(
        requestedDays ?? this.weatherDefaults?.forecastDays ?? 1,
        WEATHER_MAX_FORECAST_DAYS,
      );

      try {
        const current = await this.weatherService.getCurrent(location);
        const forecast = await this.weatherService.getForecast(days, location);
        return c.json({ location, current, forecast } satisfies WeatherData);
      } catch (err) {
        this.logger.error({ err, location }, "Weather service request failed");
        return c.json({ error: "Weather service unavailable" }, 502);
      }
    });

    return app;
  }

  /**
   * Resolve a weather request's location: the client coordinates when both are
   * present and in range, else the configured default, else `null`.
   */
  private resolveWeatherLocation(
    latParam: string | undefined,
    lonParam: string | undefined,
  ): WeatherLocation | null {
    const hasLat = latParam !== undefined && latParam.trim() !== "";
    const hasLon = lonParam !== undefined && lonParam.trim() !== "";
    if (hasLat && hasLon) {
      const latitude = Number(latParam);
      const longitude = Number(lonParam);
      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
      ) {
        return { latitude, longitude };
      }
    }

    const { latitude, longitude } = this.weatherDefaults ?? {};
    if (latitude === undefined || longitude === undefined) return null;
    return { latitude, longitude };
  }

  /**
   * Parse the `days` query param into a positive integer, or `null` when it
   * is absent or malformed so the configured default applies.
   */
  private parseForecastDays(daysParam: string | undefined): number | null {
    if (daysParam === undefined) return null;
    const days = Number.parseInt(daysParam, 10);
    if (!Number.isFinite(days) || days < 1) return null;
    return days;
  }

  /**
   * Dispatch one room batch member, mapping capability support and the
   * source-neutral dispatch outcome to the wire outcome.
   */
  private async dispatchRoomMember(
    qualifiedId: string,
    capabilities: Capability[] | null,
    command: Record<string, unknown>,
    requestedProperties: string[],
  ): Promise<RoomCommandOutcome> {
    if (!capabilities) return "skipped";

    const byProperty = flattenByProperty(capabilities);
    const supportsAll = requestedProperties.every(
      (property) => byProperty.get(property)?.access.writable === true,
    );
    if (!supportsAll) return "skipped";

    try {
      const outcome = await this.deviceSources?.command(qualifiedId, command);
      return outcome?.status === "ok" ? "applied" : "failed";
    } catch (err) {
      this.logger.error({ err, qualifiedId }, "Room batch command dispatch failed");
      return "failed";
    }
  }
}
