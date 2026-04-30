# Custom Service Plugins

The engine's service layer is extensible. You can register any object as a service, and services that implement the `ServicePlugin` interface receive lifecycle hooks and can mount HTTP routes on the shared server.

---

## Basic services vs plugins

Any value can be registered as a service and retrieved by automations:

```ts
// Register a plain object
const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    myCache: new Map<string, unknown>(),
  },
});

// Access in an automation
const cache = this.services.get<Map<string, unknown>>("myCache");
```

A **service plugin** goes further — it implements the `ServicePlugin` interface to hook into the engine lifecycle:

```ts
import type { ServicePlugin, CoreContext } from "ts-home-automation";
```

---

## The `ServicePlugin` interface

```ts
interface ServicePlugin {
  /** Unique key for registration and retrieval */
  readonly serviceKey: string;

  /** Called during engine startup, after MQTT connects */
  onStart?(context: CoreContext): Promise<void>;

  /** Called during engine shutdown, before MQTT disconnects */
  onStop?(): Promise<void>;

  /** Mount custom HTTP routes on the shared Hono server */
  registerRoutes?(app: Hono): void;
}
```

### `CoreContext`

Provided to `onStart()`:

| Field | Type | Description |
|---|---|---|
| `http` | `HttpClient` | The engine's shared HTTP client |
| `logger` | `Logger` | A child logger scoped to your service |

All three methods are optional — implement only what you need.

---

## Step-by-step example

This example creates a service that periodically fetches data from an external API and exposes it via an HTTP endpoint.

### 1. Define the service class

```ts
// src/services/solar-service.ts
import type { ServicePlugin, CoreContext, HttpClient } from "ts-home-automation";
import type { Logger } from "pino";
import type { Hono } from "hono";

interface SolarData {
  production: number;  // watts
  consumption: number;
  gridExport: number;
  timestamp: Date;
}

export class SolarService implements ServicePlugin {
  readonly serviceKey = "solar";

  private http!: HttpClient;
  private logger!: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private latest: SolarData | null = null;

  constructor(
    private readonly inverterHost: string,
    private readonly pollIntervalMs = 30_000,
  ) {}

  async onStart(context: CoreContext): Promise<void> {
    this.http = context.http;
    this.logger = context.logger;

    // Initial fetch
    await this.poll();

    // Periodic polling
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
    this.logger.info(
      { host: this.inverterHost, intervalMs: this.pollIntervalMs },
      "Solar service started",
    );
  }

  async onStop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info("Solar service stopped");
  }

  registerRoutes(app: Hono): void {
    app.get("/api/solar/current", (c) => {
      if (!this.latest) return c.json({ error: "No data yet" }, 503);
      return c.json(this.latest);
    });
  }

  // Public API for automations
  getLatest(): SolarData | null {
    return this.latest;
  }

  // Internal
  private async poll(): Promise<void> {
    try {
      const res = await this.http.get<SolarData>(
        `http://${this.inverterHost}/api/realtime`,
      );
      this.latest = { ...res.data, timestamp: new Date() };
    } catch (err) {
      this.logger.error({ err }, "Failed to poll solar inverter");
    }
  }
}
```

### 2. Register with the engine

```ts
// src/index.ts
import { createEngine } from "ts-home-automation";
import { SolarService } from "./services/solar-service.js";

const engine = createEngine({
  automationsDir: new URL("./automations", import.meta.url).pathname,
  services: {
    solar: new SolarService("192.168.1.200"),
  },
});

await engine.start();
```

Because `SolarService` implements `ServicePlugin` (has a `serviceKey` property and lifecycle methods), the engine automatically:

1. Calls `onStart()` during `engine.start()`, passing the `CoreContext`
2. Calls `registerRoutes()` to mount `/api/solar/current` on the HTTP server
3. Calls `onStop()` during `engine.stop()`

### 3. Use in automations

```ts
import { Automation, type Trigger, type TriggerContext } from "ts-home-automation";
import type { SolarService } from "../services/solar-service.js";

export default class SolarAlert extends Automation {
  readonly name = "solar-alert";

  // Validate at startup that the service is registered
  readonly requiredServices = ["solar"] as const;

  readonly triggers: Trigger[] = [
    { type: "cron", expression: "0 12 * * *" }, // noon daily
  ];

  async execute(_ctx: TriggerContext): Promise<void> {
    const solar = this.require<SolarService>("solar");
    const data = solar.getLatest();

    if (data && data.production > 5000) {
      await this.notify({
        title: "High solar production",
        message: `Currently producing ${data.production}W`,
      });
    }
  }
}
```

---

## Service retrieval patterns

Four styles are available inside automations:

| Pattern | When to use |
|---|---|
| `this.services.get<T>(key)` | Returns `null` when absent — you handle the missing case |
| `this.services.getOrThrow<T>(key)` | Throws at runtime if absent — use when you know it's always present |
| `this.services.use<T>(key, fn)` | Callback wrapper — no-ops silently when absent (one-liners) |
| `this.require<T>(key)` | Non-null retrieval for services declared in `requiredServices` |

### `requiredServices` validation

Declare services that must be present at startup:

```ts
export default class MyAutomation extends Automation {
  readonly requiredServices = ["solar", "shelly"] as const;

  async execute(): Promise<void> {
    // These are guaranteed non-null because requiredServices was validated
    const solar = this.require<SolarService>("solar");
    const shelly = this.require<ShellyService>("shelly");
  }
}
```

If any required service is missing when the automation registers, the engine throws an error and the automation is not loaded.

---

## Factory functions

For services that need the engine's HTTP client or logger in their constructor, use a factory function:

```ts
const engine = createEngine({
  automationsDir: "...",
  services: {
    // Factory receives (http, logger) and returns the service instance
    myService: (http, logger) => new MyService(http, logger, "extra-config"),
  },
});
```

The factory is called during engine construction, before `start()`. The returned value is registered in the `ServiceRegistry`.

---

## Key conventions

Service keys should be short, lowercase identifiers:

| Key | Service |
|---|---|
| `"shelly"` | `ShellyService` |
| `"nanoleaf"` | `NanoleafService` |
| `"notifications"` | `NotificationService` |
| `"weather"` | `WeatherService` |
| `"homekit"` | `HomekitService` |
| `"solar"` | Custom solar service |

The built-in services (`notifications`, `weather`, `shelly`, `nanoleaf`, `homekit`) use these exact keys. Avoid colliding with them unless you intend to replace a built-in.

---

## Lifecycle order

During `engine.start()`:

1. Core services are constructed (MQTT, HTTP, State, Cron)
2. Custom services are registered in the `ServiceRegistry`
3. HTTP server starts
4. State is loaded from disk
5. `serviceRegistry.startAll()` calls `onStart()` on each `ServicePlugin`
6. MQTT connects
7. Automations are discovered and registered

During `engine.stop()`:

1. All automations are stopped (`onStop()`)
2. Cron jobs are stopped
3. `serviceRegistry.stopAll()` calls `onStop()` on each `ServicePlugin`
4. State and device registry are saved to disk
5. MQTT disconnects
6. HTTP server stops
