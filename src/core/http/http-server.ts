/// <reference types="bun" />
import type { Hono } from "hono";
import type { Logger } from "pino";
import type { TriggerContext } from "../automation.js";
import type { AutomationManager } from "../automation-manager.js";
import type { LogBuffer, LogQuery } from "../logging/log-buffer.js";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type { StateManager } from "../state/state-manager.js";
import type { DeviceRegistry } from "../zigbee/device-registry.js";

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
 * and the debug API.
 *
 * Endpoints:
 * - `GET  /healthz`                         — Liveness probe
 * - `GET  /readyz`                          — Readiness probe
 * - `POST /webhook/<path>`                  — Webhook triggers
 * - `GET  /debug/automations`               — List all automations
 * - `GET  /debug/automations/:name`         — Get automation details
 * - `POST /debug/automations/:name/trigger` — Manually trigger an automation
 * - `GET  /debug/state`                     — List all state keys and values
 * - `GET  /debug/state/:key`                — Get a single state value
 * - `PUT  /debug/state/:key`                — Set a state value
 * - `DELETE /debug/state/:key`              — Delete a state key
 * - `GET  /debug/logs`                      — Query log buffer
 * - `GET  /debug/devices`                   — List all tracked Zigbee devices
 * - `GET  /debug/devices/:friendlyName`     — Get a single device with its state
 *
 * Uses `Bun.serve()` for minimal overhead.
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
  private webUiApp: Hono | null = null;
  private webUiPath = "";

  constructor(
    private readonly port: number,
    private readonly mqtt: MqttService,
    private readonly token: string,
    private readonly logger: Logger,
  ) {}

  /**
   * Set references to managers for the debug API.
   * Called by the engine after construction.
   */
  setManagers(state: StateManager, automations: AutomationManager, logs: LogBuffer): void {
    this.stateManager = state;
    this.automationManager = automations;
    this.logBuffer = logs;
  }

  /**
   * Set the device registry for the `/debug/devices` endpoints.
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
   * Mount a Hono app at a given path prefix for the web UI.
   * All requests whose path starts with the given prefix are delegated to the app.
   */
  mountWebUi(app: Hono, path: string): void {
    this.webUiApp = app;
    this.webUiPath = path;
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
      fetch: (req) => this.handleRequest(req),
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

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  /**
   * Check if a request has a valid bearer token.
   * Returns null if authorized, or a 401 Response if not.
   * If no token is configured, all requests are allowed.
   */
  private checkAuth(req: Request): Response | null {
    if (!this.token) return null;

    const auth = req.headers.get("authorization") ?? "";
    if (auth === `Bearer ${this.token}`) return null;

    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Request routing
  // -------------------------------------------------------------------------

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Health probes — unauthenticated
    if (path === "/healthz") return this.handleLiveness();
    if (path === "/readyz") return this.handleReadiness();

    // Webhooks — unauthenticated
    if (path.startsWith("/webhook/")) return this.handleWebhook(req, url);

    // Debug API — requires auth
    const authError = this.checkAuth(req);
    if (authError) return authError;

    // Debug API — authenticated
    if (path.startsWith("/debug/")) return this.handleDebug(req, url);

    // Web UI — delegated to Hono sub-app
    if (this.webUiApp && this.webUiPath && path.startsWith(this.webUiPath)) {
      return this.webUiApp.fetch(req);
    }

    return new Response("Not Found", { status: 404 });
  }

  // -------------------------------------------------------------------------
  // Health probes
  // -------------------------------------------------------------------------

  private handleLiveness(): Response {
    return Response.json({ status: "ok" }, { status: 200 });
  }

  private handleReadiness(): Response {
    const checks = {
      mqtt: this.mqtt.isConnected,
      engine: this.engineStarted,
    };
    const ready = checks.mqtt && checks.engine;
    return Response.json(
      {
        status: ready ? "ready" : "not ready",
        checks,
        startedAt: this.startedAt,
        tz: process.env.TZ ?? null,
      },
      { status: ready ? 200 : 503 },
    );
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  private async handleWebhook(req: Request, url: URL): Promise<Response> {
    const webhookPath = url.pathname.slice("/webhook/".length);
    const route = this.webhookRoutes.get(webhookPath);

    if (!route) {
      return Response.json({ error: "Webhook not found", path: webhookPath }, { status: 404 });
    }

    if (!route.methods.has(req.method)) {
      return Response.json(
        { error: "Method not allowed", allowed: [...route.methods] },
        { status: 405 },
      );
    }

    let body: unknown = null;
    if (req.body) {
      const contentType = req.headers.get("content-type") ?? "";
      try {
        body = contentType.includes("application/json") ? await req.json() : await req.text();
      } catch {
        this.logger.warn({ path: webhookPath }, "Failed to parse webhook request body");
        body = null;
      }
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of req.headers) {
      headers[key] = value;
    }

    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      query[key] = value;
    }

    this.logger.info({ path: webhookPath, method: req.method }, "Webhook triggered");

    try {
      await route.handler({ method: req.method, headers, query, body });
      return Response.json({ status: "ok" }, { status: 200 });
    } catch (err) {
      this.logger.error({ err, path: webhookPath }, "Webhook handler error");
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  }

  // -------------------------------------------------------------------------
  // Debug API
  // -------------------------------------------------------------------------

  private async handleDebug(req: Request, url: URL): Promise<Response> {
    const path = url.pathname;

    // GET /debug/automations
    if (path === "/debug/automations" && req.method === "GET") {
      return this.debugListAutomations();
    }

    // POST /debug/automations/:name/trigger
    if (
      path.startsWith("/debug/automations/") &&
      path.endsWith("/trigger") &&
      req.method === "POST"
    ) {
      const name = decodeURIComponent(path.slice("/debug/automations/".length, -"/trigger".length));
      return this.debugTriggerAutomation(name, req);
    }

    // GET /debug/automations/:name
    if (path.startsWith("/debug/automations/") && req.method === "GET") {
      const name = decodeURIComponent(path.slice("/debug/automations/".length));
      return this.debugGetAutomation(name);
    }

    // GET /debug/logs
    if (path === "/debug/logs" && req.method === "GET") {
      return this.debugGetLogs(url);
    }

    // GET /debug/state
    if (path === "/debug/state" && req.method === "GET") {
      return this.debugListState();
    }

    // GET/PUT/DELETE /debug/state/:key
    if (path.startsWith("/debug/state/")) {
      const key = decodeURIComponent(path.slice("/debug/state/".length));

      if (req.method === "GET") return this.debugGetState(key);
      if (req.method === "PUT") return this.debugSetState(key, req);
      if (req.method === "DELETE") return this.debugDeleteState(key);

      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // GET /debug/devices
    if (path === "/debug/devices" && req.method === "GET") {
      return this.debugListDevices();
    }

    // GET /debug/devices/:friendlyName
    if (path.startsWith("/debug/devices/") && req.method === "GET") {
      const friendlyName = decodeURIComponent(path.slice("/debug/devices/".length));
      return this.debugGetDevice(friendlyName);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  private debugListAutomations(): Response {
    if (!this.automationManager) {
      return Response.json({ error: "Not available" }, { status: 503 });
    }

    const automations = this.automationManager.listAutomations();
    return Response.json({ automations, count: automations.length });
  }

  private debugGetAutomation(name: string): Response {
    if (!this.automationManager) {
      return Response.json({ error: "Not available" }, { status: 503 });
    }

    const automation = this.automationManager.getAutomation(name);
    if (!automation) {
      return Response.json({ error: "Automation not found", name }, { status: 404 });
    }

    return Response.json(automation);
  }

  private debugListState(): Response {
    if (!this.stateManager) {
      return Response.json({ error: "Not available" }, { status: 503 });
    }

    const state: Record<string, unknown> = {};
    for (const key of this.stateManager.keys()) {
      state[key] = this.stateManager.get(key);
    }

    return Response.json({ state, count: this.stateManager.keys().length });
  }

  private debugGetState(key: string): Response {
    if (!this.stateManager) {
      return Response.json({ error: "Not available" }, { status: 503 });
    }

    const exists = this.stateManager.has(key);
    const value = this.stateManager.get(key);
    return Response.json({ key, value: value ?? null, exists });
  }

  private async debugSetState(key: string, req: Request): Promise<Response> {
    if (!this.stateManager) {
      return Response.json({ error: "Not available" }, { status: 503 });
    }

    let value: unknown;
    try {
      value = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const previous = this.stateManager.get(key) ?? null;
    this.stateManager.set(key, value);
    this.logger.info({ key, value, previous }, "State set via debug API");
    return Response.json({ key, value, previous });
  }

  private debugDeleteState(key: string): Response {
    if (!this.stateManager) {
      return Response.json({ error: "Not available" }, { status: 503 });
    }

    const existed = this.stateManager.has(key);
    if (existed) {
      this.stateManager.delete(key);
      this.logger.info({ key }, "State deleted via debug API");
    }

    return Response.json({ key, deleted: existed });
  }

  // -------------------------------------------------------------------------
  // Debug API — Logs
  // -------------------------------------------------------------------------

  private debugGetLogs(url: URL): Response {
    if (!this.logBuffer) {
      return Response.json({ error: "Not available" }, { status: 503 });
    }

    const query: LogQuery = {};
    const automation = url.searchParams.get("automation");
    if (automation) query.automation = automation;

    const level = url.searchParams.get("level");
    if (level) query.level = levelNameToNumber(level);

    const limit = url.searchParams.get("limit");
    if (limit) query.limit = Number.parseInt(limit, 10);

    const entries = this.logBuffer.query(query);
    return Response.json({ entries, count: entries.length });
  }

  // -------------------------------------------------------------------------
  // Debug API — Trigger
  // -------------------------------------------------------------------------

  private async debugTriggerAutomation(name: string, req: Request): Promise<Response> {
    if (!this.automationManager) {
      return Response.json({ error: "Not available" }, { status: 503 });
    }

    let body: { type: string; [key: string]: unknown };
    try {
      body = (await req.json()) as { type: string; [key: string]: unknown };
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.type) {
      return Response.json(
        { error: "Missing 'type' field. Must be one of: mqtt, cron, state, webhook" },
        { status: 400 },
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
        return Response.json({ error: `Unknown trigger type: ${body.type}` }, { status: 400 });
    }

    this.logger.info({ automation: name, type: body.type }, "Manual trigger via debug API");

    try {
      const found = await this.automationManager.triggerAutomation(name, context);
      if (!found) {
        return Response.json({ error: "Automation not found", name }, { status: 404 });
      }
      return Response.json({ status: "triggered", automation: name, type: body.type });
    } catch (err) {
      this.logger.error({ err, automation: name }, "Manual trigger failed");
      return Response.json({ error: "Execution failed" }, { status: 500 });
    }
  }

  // -------------------------------------------------------------------------
  // Debug API — Devices
  // -------------------------------------------------------------------------

  private debugListDevices(): Response {
    if (!this.deviceRegistry) {
      return Response.json(
        { error: "Device registry is disabled (DEVICE_REGISTRY_ENABLED=false)" },
        { status: 503 },
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

    return Response.json({ devices, count: devices.length });
  }

  private debugGetDevice(friendlyName: string): Response {
    if (!this.deviceRegistry) {
      return Response.json(
        { error: "Device registry is disabled (DEVICE_REGISTRY_ENABLED=false)" },
        { status: 503 },
      );
    }

    const device = this.deviceRegistry.getDevice(friendlyName);
    if (!device) {
      return Response.json({ error: "Device not found", friendlyName }, { status: 404 });
    }

    return Response.json({
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
  }
}

/**
 * Map pino level name to numeric value.
 */
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
