/// <reference types="bun" />
import type { Logger } from "pino";
import type { AutomationManager } from "./automation-manager.js";
import type { MqttService } from "./mqtt-service.js";
import type { StateManager } from "./state-manager.js";

/** Handler function for a registered webhook. */
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
 * - `GET  /healthz`                   — Liveness probe
 * - `GET  /readyz`                    — Readiness probe
 * - `POST /webhook/<path>`            — Webhook triggers
 * - `GET  /debug/automations`         — List all automations
 * - `GET  /debug/automations/:name`   — Get automation details
 * - `GET  /debug/state`               — List all state keys and values
 * - `GET  /debug/state/:key`          — Get a single state value
 * - `PUT  /debug/state/:key`          — Set a state value
 * - `DELETE /debug/state/:key`        — Delete a state key
 *
 * Uses `Bun.serve()` for minimal overhead.
 */
export class HttpServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private engineStarted = false;
  private webhookRoutes: Map<string, WebhookRoute> = new Map();
  private stateManager: StateManager | null = null;
  private automationManager: AutomationManager | null = null;

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
  setManagers(state: StateManager, automations: AutomationManager): void {
    this.stateManager = state;
    this.automationManager = automations;
  }

  /**
   * Mark the engine as started.
   */
  setEngineStarted(started: boolean): void {
    this.engineStarted = started;
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
      { status: ready ? "ready" : "not ready", checks },
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
        body = null;
      }
    }

    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

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

    // GET /debug/automations/:name
    if (path.startsWith("/debug/automations/") && req.method === "GET") {
      const name = decodeURIComponent(path.slice("/debug/automations/".length));
      return this.debugGetAutomation(name);
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
}
