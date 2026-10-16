import type { Hono } from "hono";
import type { Logger } from "pino";
import type { CoreContext, ServicePlugin } from "./service-plugin.js";

/** Per-plugin lifecycle timeout (ms), bounding a hanging plugin during startup/shutdown. */
const PLUGIN_LIFECYCLE_TIMEOUT_MS = 15_000;

/**
 * A type-safe, key/value registry for optional services. Services implementing
 * `ServicePlugin` additionally receive lifecycle hooks and can mount HTTP routes.
 */
export class ServiceRegistry {
  private readonly store: Map<string, unknown> = new Map();
  private logger: Logger | null = null;
  private readonly pluginLifecycleTimeoutMs: number;

  /**
   * @param pluginLifecycleTimeoutMs Per-plugin `onStart`/`onStop` timeout in ms.
   *   Defaults to {@link PLUGIN_LIFECYCLE_TIMEOUT_MS}. Overridable primarily for tests.
   */
  constructor(pluginLifecycleTimeoutMs: number = PLUGIN_LIFECYCLE_TIMEOUT_MS) {
    this.pluginLifecycleTimeoutMs = pluginLifecycleTimeoutMs;
  }

  /**
   * Attach a logger for lifecycle events. Called by the engine after construction.
   */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Register a service under the given key.
   * Replaces any previously registered service with the same key.
   */
  register<T>(key: string, service: T): void {
    this.store.set(key, service);
    this.logger?.debug({ key }, "Service registered");
  }

  /**
   * Look up a service by key.
   * Returns `null` if no service is registered under the given key.
   */
  get<T>(key: string): T | null {
    const val = this.store.get(key);
    return val !== undefined ? (val as T) : null;
  }

  /**
   * Look up a service by key and throw if it is not registered; the return type is `T`,
   * so no null-check is needed.
   *
   * @throws {Error} with a descriptive message if the service is not registered.
   */
  getOrThrow<T>(key: string): T {
    const val = this.store.get(key);
    if (val === undefined) {
      throw new Error(
        `Service "${key}" is not registered. Make sure it is passed via the services map in createEngine().`,
      );
    }
    return val as T;
  }

  /**
   * Call `fn` with the service if registered, else return `undefined`. When async,
   * `await` the whole expression before applying `??`.
   */
  use<T, R>(key: string, fn: (service: T) => R): R | undefined {
    const val = this.store.get(key);
    if (val === undefined) return undefined;
    return fn(val as T);
  }

  /**
   * Returns `true` if a service is registered under the given key.
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Returns all registered service keys.
   */
  keys(): string[] {
    return [...this.store.keys()];
  }

  /**
   * Call `onStart()` on every registered `ServicePlugin`, in insertion order.
   * Services that do not implement `ServicePlugin` are silently skipped.
   * Errors in individual plugins are logged and do not prevent other plugins from starting.
   */
  async startAll(context: CoreContext): Promise<void> {
    for (const service of this.store.values()) {
      if (isPlugin(service) && service.onStart) {
        const pluginContext: CoreContext = {
          ...context,
          logger: context.logger.child({ service: service.serviceKey }),
        };
        try {
          this.logger?.info({ service: service.serviceKey }, "Starting service plugin");
          await this.withTimeout(
            service.onStart(pluginContext),
            this.pluginLifecycleTimeoutMs,
            `${service.serviceKey} onStart`,
          );
        } catch (err) {
          this.logger?.error({ err, service: service.serviceKey }, "Service plugin onStart failed");
        }
      }
    }
  }

  /**
   * Call `onStop()` on every registered `ServicePlugin`, in insertion order.
   * Services that do not implement `ServicePlugin` are silently skipped.
   * Errors in individual plugins are logged and do not prevent other plugins from stopping.
   */
  async stopAll(): Promise<void> {
    // Stop in reverse (LIFO) registration order.
    for (const service of [...this.store.values()].reverse()) {
      if (isPlugin(service) && service.onStop) {
        try {
          this.logger?.info({ service: service.serviceKey }, "Stopping service plugin");
          await this.withTimeout(
            service.onStop(),
            this.pluginLifecycleTimeoutMs,
            `${service.serviceKey} onStop`,
          );
        } catch (err) {
          this.logger?.error({ err, service: service.serviceKey }, "Service plugin onStop failed");
        }
      }
    }
  }

  /**
   * Race a plugin lifecycle promise against a timeout. If the promise does not
   * settle within `ms`, log a timeout error and settle so the registry can
   * continue with the next plugin rather than blocking indefinitely.
   */
  private async withTimeout(promise: Promise<void>, ms: number, label: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.logger?.error({ label, timeoutMs: ms }, "Service plugin lifecycle hook timed out");
        resolve();
      }, ms);
    });
    try {
      await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Call `registerRoutes(app)` on every registered `ServicePlugin` that
   * implements it. Invoked by the engine once the HTTP server is ready.
   * Errors in individual plugins are logged and do not prevent other plugins from mounting.
   */
  mountRoutes(app: Hono): void {
    for (const service of this.store.values()) {
      if (isPlugin(service) && service.registerRoutes) {
        try {
          service.registerRoutes(app);
        } catch (err) {
          this.logger?.error(
            { err, service: service.serviceKey },
            "Service plugin registerRoutes failed",
          );
        }
      }
    }
  }
}

/** Type guard: returns true when the value looks like a `ServicePlugin`. */
function isPlugin(service: unknown): service is ServicePlugin {
  return typeof service === "object" && service !== null && "serviceKey" in service;
}
