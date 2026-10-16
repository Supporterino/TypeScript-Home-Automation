import type { Hono } from "hono";
import type { Logger } from "pino";
import type { HttpClient } from "../http/http-client.js";
import type { ExecutionRecorder } from "../observability/execution-recorder.js";
import type { DeviceRegistry } from "../zigbee/device-registry.js";

/** Minimal context provided to a `ServicePlugin.onStart()` hook. */
export interface CoreContext {
  /** The shared HTTP client for outbound requests. */
  http: HttpClient;
  /** A logger instance. Each plugin receives its own child logger from the engine. */
  logger: Logger;
  /**
   * The Zigbee2MQTT device registry.
   * `null` when `DEVICE_REGISTRY_ENABLED` is `false`.
   */
  deviceRegistry: DeviceRegistry | null;
  /**
   * Records automation execution history and broadcasts completions; the Prometheus
   * metrics service subscribes here to export per-automation counters.
   */
  executionRecorder: ExecutionRecorder;
}

/**
 * Optional lifecycle interface for services registered with `ServiceRegistry`:
 * implement it to receive engine lifecycle hooks and/or mount custom HTTP routes.
 * All methods are optional.
 */
export interface ServicePlugin {
  /**
   * Unique string key identifying this service in the `ServiceRegistry`.
   * Used for registration and lookup (e.g. `"shelly"`, `"my-service"`).
   */
  readonly serviceKey: string;

  /** Called once after the state manager has loaded and before MQTT connects. */
  onStart?(context: CoreContext): Promise<void>;

  /** Called during engine shutdown after automations stop and before MQTT disconnects. */
  onStop?(): Promise<void>;

  /** Called once when the HTTP server is available, before it starts listening. */
  registerRoutes?(app: Hono): void;
}
