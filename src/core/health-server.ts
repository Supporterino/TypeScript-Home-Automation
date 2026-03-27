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

/**
 * Lightweight HTTP health server for container liveness and readiness probes.
 *
 * Exposes two endpoints:
 *
 * - `GET /healthz` — **Liveness probe**. Returns `200` if the process is alive
 *   and the HTTP server is responding. Always succeeds unless the process is stuck.
 *
 * - `GET /readyz` — **Readiness probe**. Returns `200` only when all subsystems
 *   are healthy: MQTT is connected and the engine has started.
 *   Returns `503` with details if any check fails.
 *
 * The server uses `Bun.serve()` for minimal overhead (no dependencies).
 *
 * @example Kubernetes deployment
 * ```yaml
 * livenessProbe:
 *   httpGet:
 *     path: /healthz
 *     port: 8080
 *   initialDelaySeconds: 5
 *   periodSeconds: 10
 * readinessProbe:
 *   httpGet:
 *     path: /readyz
 *     port: 8080
 *   initialDelaySeconds: 10
 *   periodSeconds: 5
 * ```
 */
export class HealthServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private engineStarted = false;

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
   * Start the health HTTP server.
   */
  start(): void {
    this.server = Bun.serve({
      port: this.port,
      fetch: (req) => this.handleRequest(req),
    });

    this.logger.info({ port: this.port }, "Health server listening");
  }

  /**
   * Stop the health HTTP server.
   */
  stop(): void {
    if (this.server) {
      this.server.stop(true);
      this.server = null;
      this.logger.info("Health server stopped");
    }
  }

  /**
   * Handle incoming HTTP requests.
   */
  private handleRequest(req: Request): Response {
    const url = new URL(req.url);

    switch (url.pathname) {
      case "/healthz":
        return this.handleLiveness();
      case "/readyz":
        return this.handleReadiness();
      default:
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
