/// <reference types="bun" />
import type { Logger } from "pino";
import type { MqttService } from "./mqtt-service.js";

/**
 * Readiness check result with details about each subsystem.
 */
interface ReadinessResult {
  ready: boolean;
  checks: {
    mqtt: boolean;
    engine: boolean;
  };
}

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
 * HTTP server for health probes, readiness checks, and webhook triggers.
 *
 * Exposes:
 * - `GET /healthz` — Liveness probe
 * - `GET /readyz` — Readiness probe
 * - `POST /webhook/<path>` — Webhook endpoints (registered by automations)
 *
 * The server uses `Bun.serve()` for minimal overhead (no dependencies).
 *
 * @example Kubernetes deployment
 * ```yaml
 * livenessProbe:
 *   httpGet:
 *     path: /healthz
 *     port: 8080
 * readinessProbe:
 *   httpGet:
 *     path: /readyz
 *     port: 8080
 * ```
 *
 * @example Webhook trigger
 * ```
 * POST /webhook/deploy → triggers automation with webhook path "deploy"
 * ```
 */
export class HttpServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private engineStarted = false;
  private webhookRoutes: Map<string, WebhookRoute> = new Map();

  constructor(
    private readonly port: number,
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
  ) {}

  /**
   * Mark the engine as started. Called by the engine after successful startup.
   */
  setEngineStarted(started: boolean): void {
    this.engineStarted = started;
  }

  /**
   * Register a webhook route.
   *
   * @param path The webhook path (without leading slash, e.g. "deploy")
   * @param methods Accepted HTTP methods
   * @param handler Function to call when the webhook is triggered
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
   *
   * @param path The webhook path to remove
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

  /**
   * Handle incoming HTTP requests.
   */
  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    switch (url.pathname) {
      case "/healthz":
        return this.handleLiveness();
      case "/readyz":
        return this.handleReadiness();
      default:
        // Check for webhook routes: /webhook/<path>
        if (url.pathname.startsWith("/webhook/")) {
          return this.handleWebhook(req, url);
        }
        return new Response("Not Found", { status: 404 });
    }
  }

  /**
   * Liveness probe: always returns 200 if the server is responding.
   */
  private handleLiveness(): Response {
    return Response.json({ status: "ok" }, { status: 200 });
  }

  /**
   * Readiness probe: checks all subsystems.
   */
  private handleReadiness(): Response {
    const result = this.checkReadiness();

    if (result.ready) {
      return Response.json({ status: "ready", checks: result.checks }, { status: 200 });
    }

    return Response.json({ status: "not ready", checks: result.checks }, { status: 503 });
  }

  /**
   * Handle a webhook request.
   */
  private async handleWebhook(req: Request, url: URL): Promise<Response> {
    const path = url.pathname.slice("/webhook/".length);
    const route = this.webhookRoutes.get(path);

    if (!route) {
      return Response.json({ error: "Webhook not found", path }, { status: 404 });
    }

    if (!route.methods.has(req.method)) {
      return Response.json(
        { error: "Method not allowed", allowed: [...route.methods] },
        { status: 405 },
      );
    }

    // Parse request body
    let body: unknown = null;
    if (req.body) {
      const contentType = req.headers.get("content-type") ?? "";
      try {
        if (contentType.includes("application/json")) {
          body = await req.json();
        } else {
          body = await req.text();
        }
      } catch {
        body = null;
      }
    }

    // Parse headers into a plain object
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Parse query parameters
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    this.logger.info({ path, method: req.method }, "Webhook triggered");

    try {
      await route.handler({ method: req.method, headers, query, body });
      return Response.json({ status: "ok" }, { status: 200 });
    } catch (err) {
      this.logger.error({ err, path }, "Webhook handler error");
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  }

  /**
   * Run all readiness checks.
   */
  private checkReadiness(): ReadinessResult {
    const checks = {
      mqtt: this.mqtt.isConnected,
      engine: this.engineStarted,
    };

    return {
      ready: checks.mqtt && checks.engine,
      checks,
    };
  }
}
