import type { Hono } from "hono";
import type { Logger } from "pino";
import type { HttpClient } from "../http/http-client.js";

/**
 * Minimal context provided to a `ServicePlugin.onStart()` hook.
 *
 * Contains the shared infrastructure services every plugin may need during
 * its startup phase.
 */
export interface CoreContext {
  /** The shared HTTP client for outbound requests. */
  http: HttpClient;
  /** A logger instance. Each plugin receives its own child logger from the engine. */
  logger: Logger;
}

/**
 * Optional lifecycle interface for services registered with `ServiceRegistry`.
 *
 * Implement this interface on a service class to receive engine lifecycle hooks
 * and/or to mount custom HTTP API routes — without touching any core files.
 *
 * All methods are optional. Only implement what you need.
 *
 * @example
 * ```ts
 * export class MyService implements ServicePlugin {
 *   readonly serviceKey = "my-service";
 *
 *   async onStart(ctx: CoreContext): Promise<void> {
 *     ctx.logger.info("MyService starting up");
 *   }
 *
 *   async onStop(): Promise<void> {
 *     // cleanup
 *   }
 *
 *   registerRoutes(app: Hono): void {
 *     app.get("/api/my-service/status", (c) => c.json({ ok: true }));
 *   }
 * }
 * ```
 */
export interface ServicePlugin {
  /**
   * Unique string key identifying this service in the `ServiceRegistry`.
   * Used for registration and lookup (e.g. `"shelly"`, `"my-service"`).
   */
  readonly serviceKey: string;

  /**
   * Called once after the state manager has loaded and before MQTT connects.
   * Use this to perform async initialisation (e.g. connect to an external API).
   */
  onStart?(context: CoreContext): Promise<void>;

  /**
   * Called during engine shutdown after automations have stopped but before
   * MQTT disconnects. Use this to flush buffers or close connections.
   */
  onStop?(): Promise<void>;

  /**
   * Called once when the HTTP server is available, before it starts listening.
   * Use this to mount custom API routes on the shared Hono app.
   *
   * @param app The shared Hono application instance.
   */
  registerRoutes?(app: Hono): void;
}
