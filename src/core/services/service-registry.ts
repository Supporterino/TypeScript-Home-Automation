import type { Hono } from "hono";
import type { Logger } from "pino";
import type { CoreContext, ServicePlugin } from "./service-plugin.js";

/**
 * A type-safe, key/value registry for optional services.
 *
 * Services are registered by string key and retrieved with a type parameter.
 * Services that implement `ServicePlugin` additionally receive engine lifecycle
 * hooks (`onStart` / `onStop`) and can mount HTTP routes (`registerRoutes`).
 *
 * The engine creates one `ServiceRegistry` and passes it to automations via
 * `AutomationContext.services`.  Well-known services (`shelly`, `nanoleaf`,
 * `notifications`, `weather`) are registered under their conventional keys.
 * Any additional services registered under custom keys are accessible via
 * `this.services.get<MyService>("my-service")` inside an automation.
 *
 * ## Retrieval options
 *
 * **`get`** — nullable lookup; you handle the absent case yourself:
 * ```ts
 * const shelly = this.services.get<ShellyService>("shelly");
 * if (shelly) await shelly.turnOn("my-plug");
 * ```
 *
 * **`getOrThrow`** — asserts presence; throws at runtime if missing:
 * ```ts
 * const shelly = this.services.getOrThrow<ShellyService>("shelly");
 * await shelly.turnOn("my-plug");
 * ```
 *
 * **`use`** — callback wrapper; no-ops silently when the service is absent:
 * ```ts
 * await this.services.use<ShellyService>("shelly", (s) => s.turnOn("my-plug"));
 * ```
 */
export class ServiceRegistry {
  private readonly store: Map<string, unknown> = new Map();
  private logger: Logger | null = null;

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
   * Look up a service by key and throw if it is not registered.
   *
   * Use this when the service is required for the automation to work at all.
   * The TypeScript return type is `T` (not `T | null`), so no null-check is needed.
   *
   * @throws {Error} with a descriptive message if the service is not registered.
   *
   * @example
   * ```ts
   * const shelly = this.services.getOrThrow<ShellyService>("shelly");
   * await shelly.turnOn("my-plug");
   * ```
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
   * Call `fn` with the service if it is registered; otherwise do nothing.
   *
   * Returns the result of `fn` (which may be a `Promise`) or `undefined` when
   * the service is absent. When the callback is async, `await` the whole
   * expression before applying `??`, because `use()` returns
   * `Promise<R> | undefined` — not `Promise<R | undefined>`:
   *
   * Best suited for one-shot, fire-and-forget calls where the service is
   * genuinely optional.
   *
   * @example
   * ```ts
   * // Fire-and-forget — no null-check needed:
   * await (this.services.use<ShellyService>("shelly", (s) => s.turnOff("tv_plug")) ?? Promise.resolve());
   *
   * // With a fallback value — await first, then apply ??:
   * const isOn = (await this.services.use("shelly", (s) => s.isOn("tv_plug"))) ?? false;
   * ```
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
          await service.onStart(pluginContext);
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
    for (const service of this.store.values()) {
      if (isPlugin(service) && service.onStop) {
        try {
          this.logger?.info({ service: service.serviceKey }, "Stopping service plugin");
          await service.onStop();
        } catch (err) {
          this.logger?.error({ err, service: service.serviceKey }, "Service plugin onStop failed");
        }
      }
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
