import type { Hono } from "hono";
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
 * @example
 * ```ts
 * const registry = new ServiceRegistry();
 * registry.register("shelly", myShellyService);
 *
 * // In an automation:
 * const shelly = this.services.get<ShellyService>("shelly");
 * if (shelly) {
 *   await shelly.turnOn("my-plug");
 * }
 * ```
 */
export class ServiceRegistry {
  private readonly store: Map<string, unknown> = new Map();

  /**
   * Register a service under the given key.
   * Replaces any previously registered service with the same key.
   */
  register<T>(key: string, service: T): void {
    this.store.set(key, service);
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
   */
  async startAll(context: CoreContext): Promise<void> {
    for (const service of this.store.values()) {
      if (isPlugin(service) && service.onStart) {
        await service.onStart(context);
      }
    }
  }

  /**
   * Call `onStop()` on every registered `ServicePlugin`, in insertion order.
   * Services that do not implement `ServicePlugin` are silently skipped.
   */
  async stopAll(): Promise<void> {
    for (const service of this.store.values()) {
      if (isPlugin(service) && service.onStop) {
        await service.onStop();
      }
    }
  }

  /**
   * Call `registerRoutes(app)` on every registered `ServicePlugin` that
   * implements it. Invoked by the engine once the HTTP server is ready.
   */
  mountRoutes(app: Hono): void {
    for (const service of this.store.values()) {
      if (isPlugin(service) && service.registerRoutes) {
        service.registerRoutes(app);
      }
    }
  }
}

/** Type guard: returns true when the value looks like a `ServicePlugin`. */
function isPlugin(service: unknown): service is ServicePlugin {
  return typeof service === "object" && service !== null && "serviceKey" in service;
}
