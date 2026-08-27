import pino, { type Logger, multistream } from "pino";
import { type Config, loadConfig } from "../config.js";
import type { NotificationService } from "../types/notification.js";
import type { WeatherService } from "../types/weather.js";
import { AUTOMATION_ENABLED_PREFIX, AutomationManager } from "./automation-manager.js";
import { AggregateDeviceSource } from "./device-sources/aggregate.js";
import { wireDeviceEvents } from "./device-sources/device-event-bridge.js";
import { NanoleafDeviceSource } from "./device-sources/nanoleaf-source.js";
import { ShellyDeviceSource } from "./device-sources/shelly-source.js";
import { StateDeviceSource, type StateToggleConfig } from "./device-sources/state-source.js";
import { ZigbeeDeviceSource } from "./device-sources/zigbee-source.js";
import { EventBus } from "./events/event-bus.js";
import { HttpClient } from "./http/http-client.js";
import { HttpServer } from "./http/http-server.js";
import { LogBuffer } from "./logging/log-buffer.js";
import { MqttService } from "./mqtt/mqtt-service.js";
import { ROOM_ASSIGNMENT_PREFIX, ROOM_PREFIX, type Room, RoomManager } from "./room-manager.js";
import { CronScheduler } from "./scheduling/cron-scheduler.js";
import type { HomekitService } from "./services/homekit-service.js";
import type { NanoleafService } from "./services/nanoleaf-service.js";
import type { PrometheusMetricsService } from "./services/prometheus-metrics-service";
import type { CoreContext } from "./services/service-plugin.js";
import { ServiceRegistry } from "./services/service-registry.js";
import type {
  ShellyService,
  ShellyServiceContext,
  ShellyServiceFactory,
} from "./services/shelly-service.js";
import {
  isReservedStateKey,
  StateManager,
  type StateManagerOptions,
} from "./state/state-manager.js";
import {
  type DeviceNiceNames,
  DeviceRegistry,
  type DeviceRegistryPersistenceOptions,
} from "./zigbee/device-registry.js";

/**
 * Construct the stdout-only logger used exclusively by the event stream's
 * delivery path (design.md D32; tasks 5.0b, 5.0c).
 *
 * A pino child inherits its parent's destination set, so
 * `logger.child(...)` would still write to the `LogBuffer` — which is exactly
 * the cycle D32 exists to cut, since the delivery path itself logs (fan-out
 * failures, per-connection overflow, the fell-behind signal). This is
 * therefore always a second, independently constructed pino instance, built
 * unconditionally — even when the caller supplies their own `options.logger`
 * — because the engine cannot know whether a caller-supplied logger writes to
 * the buffer either.
 */
export function createStreamOnlyLogger(logLevel: Config["logLevel"]): Logger {
  return pino({ level: logLevel });
}

/**
 * Factory function type for optional services.
 *
 * Receives the engine's shared `HttpClient` and a scoped `Logger` so the
 * service can use them without creating its own.
 *
 * @example
 * ```ts
 * notifications: (http, logger) =>
 *   new NtfyNotificationService({ topic: "alerts", http, logger }),
 * ```
 */
export type ServiceFactory<T> = (http: HttpClient, logger: Logger) => T;

/**
 * Dependency context passed to a `HomekitServiceFactory`.
 *
 * Narrowed to `http`, `logger`, and the aggregate device accessor (task
 * 6.16b) — `HomekitService` reads every device family through
 * `AggregateDeviceSource` now, so it no longer needs `MqttService`, the
 * Zigbee `DeviceRegistry`, or `ShellyService` directly. **BREAKING** for any
 * deployment supplying its own HomeKit factory built against the previous
 * five-field context.
 */
export interface HomekitServiceContext {
  http: HttpClient;
  logger: Logger;
  devices: AggregateDeviceSource;
}

/**
 * Factory function type specifically for `HomekitService`.
 *
 * Receives a single {@link HomekitServiceContext} object rather than positional
 * arguments.
 *
 * @example
 * ```ts
 * homekit: ({ logger, devices }) =>
 *   new HomekitService(logger, devices, {
 *     pinCode: "031-45-154",
 *   }),
 * ```
 */
export type HomekitServiceFactory = (ctx: HomekitServiceContext) => HomekitService;

/**
 * Options for creating an automation engine.
 *
 * All fields are optional — sensible defaults are derived from
 * environment variables (see `.env.example`).
 */
export interface EngineOptions {
  /**
   * Path to the directory containing automation files.
   * Each `.ts` / `.js` file should default-export a class extending `Automation`.
   */
  automationsDir: string;

  /**
   * Whether to scan subdirectories recursively for automation files.
   * When true, all `.ts` / `.js` files in subdirectories are also loaded.
   * Useful for organizing automations into folders (e.g. `lights/`, `sensors/`).
   *
   * @default false
   */
  recursive?: boolean;

  /**
   * Override the environment-derived config.
   * If omitted, config is loaded from environment variables.
   */
  config?: Partial<Config>;

  /**
   * Provide your own pino logger instance.
   * If omitted, a default logger is created based on the config log level.
   */
  logger?: Logger;

  /**
   * State manager options.
   *
   * Controls whether state is persisted to disk on shutdown and restored
   * on startup. State is always available in-memory regardless of this setting.
   *
   * @example
   * ```ts
   * const engine = createEngine({
   *   automationsDir: "...",
   *   state: {
   *     persist: true,
   *     filePath: "./data/state.json",
   *   },
   * });
   * ```
   */
  state?: StateManagerOptions;

  /**
   * Runtime options for the Zigbee2MQTT device registry.
   * Only relevant when `DEVICE_REGISTRY_ENABLED=true`.
   *
   * @example
   * ```ts
   * const engine = createEngine({
   *   automationsDir: "...",
   *   deviceRegistry: {
   *     names: {
   *       devices: {
   *         "kitchen_motion_0x1a2b": "Kitchen Motion Sensor",
   *       },
   *       transform: (name) => name.replace(/_/g, " "),
   *     },
   *   },
   * });
   * ```
   */
  deviceRegistry?: {
    /** Human-readable name mappings. Used by `registry.getNiceName()`. */
    names?: DeviceNiceNames;
    /**
     * Whether to persist the device list and state to disk on shutdown
     * and restore them on startup.
     *
     * @default false
     */
    persist?: boolean;
    /**
     * Path to the device registry JSON persistence file.
     *
     * @default "./device-registry.json"
     */
    filePath?: string;
  };

  /**
   * Boolean `StateManager` keys to present as devices through the unified
   * device source layer, controllable from the web UI and the HomeKit
   * bridge alike.
   *
   * This is engine-level configuration rather than a `HomekitService`
   * option (design.md D19): a source consumed by more than one sink cannot
   * live inside one of them, or state toggles would disappear from the web
   * UI whenever HomeKit is disabled. Passing `stateToggles` under
   * `services.homekit`'s options is rejected — see
   * `HomekitServiceOptions.stateToggles`.
   *
   * @default []
   *
   * @example
   * ```ts
   * const engine = createEngine({
   *   automationsDir: "...",
   *   stateToggles: [
   *     { stateKey: "night_mode", name: "Night Mode" },
   *     { stateKey: "away_mode", name: "Away Mode" },
   *   ],
   * });
   * ```
   */
  stateToggles?: StateToggleConfig[];

  /**
   * Optional services to register with the engine.
   *
   * Well-known service keys (`notifications`, `weather`, `shelly`, `nanoleaf`)
   * accept either a service instance or a `ServiceFactory` function. Additional
   * services can be registered under any custom key.
   *
   * All registered services are available to automations via
   * `this.services.get<T>(key)`, `this.services.getOrThrow<T>(key)`,
   * `this.services.use<T, R>(key, fn)`, or `this.require<T>(key)` (when the key
   * is declared in `requiredServices`).
   *
   * @example
   * ```ts
   * import { createEngine, ShellyService, NanoleafService } from "ts-home-automation";
   *
   * const engine = createEngine({
   *   automationsDir: "...",
   *   services: {
   *     shelly: ({ http, mqtt, logger }) => {
   *       const shelly = new ShellyService(http, mqtt, logger);
   *       shelly.register("living_room_plug", "192.168.1.50");
   *       return shelly;
   *     },
   *     nanoleaf: (http, logger) =>
   *       new NanoleafService(http, logger),
   *     notifications: (http, logger) =>
   *       new NtfyNotificationService({ topic: "alerts", http, logger }),
   *   },
   * });
   * ```
   */
  services?: {
    notifications?: NotificationService | ServiceFactory<NotificationService>;
    weather?: WeatherService | ServiceFactory<WeatherService>;
    shelly?: ShellyService | ShellyServiceFactory;
    nanoleaf?: NanoleafService | ServiceFactory<NanoleafService>;
    metrics?: PrometheusMetricsService | ServiceFactory<PrometheusMetricsService>;
    homekit?: HomekitService | HomekitServiceFactory;
    /** Any additional custom services registered under arbitrary keys. */
    [key: string]: unknown;
  };
}

/**
 * A running automation engine. Returned by `createEngine()`.
 */
export interface Engine {
  /** Start the engine: connect to MQTT and register all automations. */
  start(): Promise<void>;

  /** Gracefully stop the engine: unregister automations, stop crons, disconnect MQTT. */
  stop(): Promise<void>;

  /** The resolved configuration. */
  readonly config: Config;

  /** The logger instance. */
  readonly logger: Logger;

  /**
   * A second, independently-constructed pino instance that writes to stdout
   * only, bypassing the log buffer entirely (design.md D32). Used solely by
   * the realtime event stream's delivery path, so that path's own logging
   * can never feed back into the log category it delivers (task 5.0c).
   */
  readonly streamLogger: Logger;

  /** The realtime event stream's shared publish/subscribe hub. */
  readonly events: EventBus;

  /** The MQTT service (for advanced usage). */
  readonly mqtt: MqttService;

  /** The HTTP client (for advanced usage). */
  readonly http: HttpClient;

  /** The shared state manager. */
  readonly state: StateManager;

  /** The notification service (if configured). */
  readonly notifications: NotificationService | null;

  /** The shared service registry. Use this to access any registered optional service. */
  readonly services: ServiceRegistry;

  /** The automation manager (for advanced usage, e.g. manual registration). */
  readonly manager: AutomationManager;

  /**
   * The Zigbee2MQTT device registry.
   * `null` when `DEVICE_REGISTRY_ENABLED` is `false` (the default).
   */
  readonly deviceRegistry: DeviceRegistry | null;

  /**
   * The aggregate device accessor spanning every unified device source
   * (Zigbee, Shelly, Nanoleaf, state toggles). Always present — an
   * unconfigured or disabled source is reported unavailable rather than
   * making this `null` (design.md D2; task 6.13a).
   */
  readonly devices: AggregateDeviceSource;

  /**
   * User-defined rooms grouping devices across every unified device source
   * (design.md D14). Always present, like `devices`.
   */
  readonly rooms: RoomManager;
}

/**
 * Create and configure an automation engine.
 *
 * This is the main entry point for using the framework as a package.
 *
 * @example
 * ```ts
 * import { createEngine } from "ts-home-automation";
 *
 * const engine = await createEngine({
 *   automationsDir: new URL("./automations", import.meta.url).pathname,
 * });
 *
 * await engine.start();
 * ```
 */
export function createEngine(options: EngineOptions): Engine {
  // Load and merge config
  const envConfig = loadConfig();
  const config: Config = {
    ...envConfig,
    ...options.config,
    mqtt: {
      ...envConfig.mqtt,
      ...options.config?.mqtt,
    },
  };

  // Create log buffer for debug API
  const logBuffer = new LogBuffer(2500);

  // Create logger with multistream (stdout + log buffer)
  const logger =
    options.logger ??
    (() => {
      const isProd = process.env.NODE_ENV === "production";
      const prettyStream = isProd
        ? process.stdout
        : pino.transport({ target: "pino-pretty", options: { colorize: true } });
      const streams = multistream([{ stream: prettyStream }, { stream: logBuffer }]);
      return pino({ level: config.logLevel }, streams);
    })();

  // A second, independently-constructed instance — never a child of `logger`
  // — so the event stream's delivery path cannot feed back into the log
  // category it delivers (design.md D32; tasks 5.0b, 5.0c). Constructed
  // unconditionally, even when `options.logger` was supplied.
  const streamLogger = createStreamOnlyLogger(config.logLevel);

  // The realtime event stream's shared publish/subscribe hub (task 5.1).
  const eventBus = new EventBus();

  // Log category: relay every newly-stored entry (design.md D32; consumes
  // the 5.0 subscription, deferred past LogBuffer.write() per 5.0a).
  logBuffer.subscribe((entry) => {
    eventBus.emit({ category: "log", entry });
  });

  // Initialize core services
  const mqtt = new MqttService(config, logger.child({ service: "mqtt" }));
  const cron = new CronScheduler(logger.child({ service: "cron" }));
  const http = new HttpClient(logger.child({ service: "http" }));
  const stateManager = new StateManager(logger.child({ service: "state" }), {
    persist: options.state?.persist ?? config.state.persist,
    filePath: options.state?.filePath ?? config.state.filePath,
    flushIntervalMs: options.state?.flushIntervalMs ?? config.state.flushIntervalMs,
  });

  // State/automation/room categories: every state mutation is routed to
  // exactly one typed category. Reserved keys under the automation-enabled
  // namespace become "automation" events; reserved keys under the room
  // namespaces become "room"/"room_membership" deltas; every other reserved
  // key is excluded from the stream entirely (design.md D20; task 5.7).
  // Everything else is an ordinary "state" event.
  stateManager.onAnyChange((key, newValue, oldValue) => {
    if (key.startsWith(AUTOMATION_ENABLED_PREFIX)) {
      const name = key.slice(AUTOMATION_ENABLED_PREFIX.length);
      eventBus.emit({ category: "automation", name, enabled: Boolean(newValue) });
      return;
    }
    if (key.startsWith(ROOM_PREFIX)) {
      const id = key.slice(ROOM_PREFIX.length);
      eventBus.emit({ category: "room", id, room: (newValue as Room | undefined) ?? null });
      return;
    }
    if (key.startsWith(ROOM_ASSIGNMENT_PREFIX)) {
      const qualifiedId = key.slice(ROOM_ASSIGNMENT_PREFIX.length);
      eventBus.emit({
        category: "room_membership",
        qualifiedId,
        roomId: (newValue as string | undefined) ?? null,
      });
      return;
    }
    if (isReservedStateKey(key)) {
      return;
    }
    eventBus.emit({ category: "state", key, value: newValue, previous: oldValue });
  });

  // Readiness category: recomputed from MQTT connectivity and whether the
  // engine has finished starting, and emitted only when it actually changes.
  let lastReadiness: boolean | null = null;
  const engineStartedRef = { started: false };
  const emitReadinessIfChanged = (): void => {
    const ready = mqtt.isConnected && engineStartedRef.started;
    if (ready !== lastReadiness) {
      lastReadiness = ready;
      eventBus.emit({ category: "readiness", ready });
    }
  };
  mqtt.onConnectionChange(() => emitReadinessIfChanged());

  // ── Service registry ──────────────────────────────────────────────────────

  const serviceRegistry = new ServiceRegistry();
  serviceRegistry.setLogger(logger.child({ service: "services" }));

  /**
   * Resolve a service value that may be a direct instance or a factory function.
   * Returns `null` when the value is `undefined`.
   */
  function resolveService<T>(
    value: T | ServiceFactory<T> | undefined,
    serviceKey: string,
  ): T | null {
    if (value === undefined) return null;
    return typeof value === "function"
      ? (value as ServiceFactory<T>)(http, logger.child({ service: serviceKey }))
      : value;
  }

  const notificationsValue = options.services?.notifications;
  const weatherValue = options.services?.weather;
  const shellyValue = options.services?.shelly;
  const nanoleafValue = options.services?.nanoleaf;
  const homekitValue = options.services?.homekit;
  const metricsValue = options.services?.metrics;

  const notificationService = resolveService(notificationsValue, "notifications");
  const weatherService = resolveService(weatherValue, "weather");
  const nanoleafService = resolveService(nanoleafValue, "nanoleaf");
  const metricsService = resolveService(metricsValue, "metrics");

  // ShellyService needs mqtt in addition to the standard (http, logger) pair,
  // so it cannot use the generic resolveService helper. mqtt is constructed
  // above, so this can resolve eagerly (unlike homekit, which additionally
  // depends on deviceRegistry/shelly/state constructed further down).
  const shellyService: ShellyService | null =
    shellyValue === undefined
      ? null
      : typeof shellyValue === "function"
        ? (shellyValue as ShellyServiceFactory)({
            http,
            mqtt,
            logger: logger.child({ service: "shelly" }),
          } satisfies ShellyServiceContext)
        : shellyValue;

  if (notificationService) serviceRegistry.register("notifications", notificationService);
  if (weatherService) serviceRegistry.register("weather", weatherService);
  if (shellyService) serviceRegistry.register("shelly", shellyService);
  if (nanoleafService) serviceRegistry.register("nanoleaf", nanoleafService);
  if (metricsService) serviceRegistry.register("metrics", metricsService);

  // ── Device registry ───────────────────────────────────────────────────────

  const deviceRegistryPersistence: DeviceRegistryPersistenceOptions = {
    persist: options.deviceRegistry?.persist ?? config.deviceRegistry.persist,
    filePath: options.deviceRegistry?.filePath ?? config.deviceRegistry.filePath,
  };

  const deviceRegistry = config.deviceRegistry.enabled
    ? new DeviceRegistry(
        mqtt,
        config,
        logger.child({ service: "device-registry" }),
        options.deviceRegistry?.names,
        deviceRegistryPersistence,
      )
    : null;

  if (!deviceRegistry) {
    logger.info(
      "Device registry disabled (DEVICE_REGISTRY_ENABLED=false) — set to true to enable automatic device discovery",
    );
  }

  // ── Unified device sources ────────────────────────────────────────────────
  //
  // Constructed here — after the device registry and every optional service
  // above it, before HomekitService, the HTTP server, and automation
  // discovery — so no automation's onStart() ever observes a partially
  // constructed device surface (design.md D2; task 6.13a), and so
  // HomekitService (below) can be given the aggregate accessor rather than
  // the individual services it used to depend on (task 6.16b). The source
  // set is fixed at four and is not a ServiceRegistry registration point
  // (task 6.13d): `deviceSources` is started/stopped directly by the engine,
  // symmetrically with `deviceRegistry`.
  const deviceSources = new AggregateDeviceSource(
    [
      new ZigbeeDeviceSource(deviceRegistry, mqtt, logger.child({ service: "devices-zigbee" })),
      new ShellyDeviceSource(
        shellyService,
        mqtt,
        logger.child({ service: "devices-shelly" }),
        config.devices.shellyPollMs,
      ),
      new NanoleafDeviceSource(
        nanoleafService,
        logger.child({ service: "devices-nanoleaf" }),
        config.devices.nanoleafPollMs,
      ),
      new StateDeviceSource(
        stateManager,
        options.stateToggles ?? [],
        logger.child({ service: "devices-state" }),
      ),
    ],
    logger.child({ service: "devices" }),
  );

  // User-defined rooms span every unified device source, so they are
  // constructed right after `deviceSources` — before HomekitService, the
  // HTTP server, and automation discovery — for the same reason
  // `deviceSources` itself is constructed here (design.md D14; task 9.1).
  const roomManager = new RoomManager(
    stateManager,
    deviceSources,
    logger.child({ service: "rooms" }),
  );

  // HomekitService reads every device family through `deviceSources` now
  // (task 6.16b) — it no longer needs mqtt, deviceRegistry, shelly, or state
  // directly, so it cannot use the generic resolveService helper only
  // because of its distinct context shape, not because of a dependency
  // ordering constraint.
  const homekitService =
    homekitValue === undefined
      ? null
      : typeof homekitValue === "function"
        ? homekitValue({
            http,
            logger: logger.child({ service: "homekit" }),
            devices: deviceSources,
          })
        : homekitValue;

  if (homekitService) serviceRegistry.register("homekit", homekitService);

  // Register any additional custom services from the services map.
  if (options.services) {
    const WELL_KNOWN = new Set([
      "notifications",
      "weather",
      "shelly",
      "nanoleaf",
      "homekit",
      "metrics",
    ]);
    for (const [key, value] of Object.entries(options.services)) {
      if (!WELL_KNOWN.has(key) && value !== undefined) {
        const resolved =
          typeof value === "function"
            ? (value as ServiceFactory<unknown>)(http, logger.child({ service: key }))
            : value;
        serviceRegistry.register(key, resolved);
      }
    }
  }

  // ── HTTP server ───────────────────────────────────────────────────────────

  const httpServerPort = config.httpServer.port;
  const httpServer =
    httpServerPort > 0
      ? new HttpServer(
          httpServerPort,
          mqtt,
          config.httpServer.token,
          logger.child({ service: "http-server" }),
        )
      : null;

  if (!httpServer) {
    logger.info(
      "HTTP server disabled (HTTP_PORT=0) — health probes and webhook triggers unavailable",
    );
  }

  const manager = new AutomationManager(
    mqtt,
    cron,
    http,
    stateManager,
    httpServer,
    config,
    logger.child({ service: "manager" }),
    serviceRegistry,
    deviceRegistry,
  );

  // Broadcasts the automation_execution category, derived from the same
  // ExecutionRecorder.run() call that populates execution history, so the
  // two can never disagree (design.md D11, D18; task 8.7).
  manager.getExecutionRecorder().onCompletion(({ automation, trigger, durationMs, outcome }) => {
    eventBus.emit({ category: "automation_execution", automation, trigger, durationMs, outcome });
  });

  let started = false;

  return {
    config,
    logger,
    streamLogger,
    events: eventBus,
    mqtt,
    http,
    state: stateManager,
    get notifications(): NotificationService | null {
      return serviceRegistry.get<NotificationService>("notifications");
    },
    services: serviceRegistry,
    manager,
    deviceRegistry,
    devices: deviceSources,
    rooms: roomManager,

    async start(): Promise<void> {
      if (started) {
        logger.warn("Engine already started");
        return;
      }

      logger.info("Starting Home Automation Engine");

      // Warn when the HTTP server is running without authentication
      if (httpServer && config.httpServer.token.length === 0) {
        logger.warn(
          "HTTP_TOKEN is empty — all API endpoints are unauthenticated. " +
            "Set the HTTP_TOKEN environment variable to secure the API.",
        );
      }

      try {
        httpServer?.setManagers(stateManager, manager, logBuffer);
        httpServer?.setDeviceSources(deviceSources);
        httpServer?.setRoomManager(roomManager);
        httpServer?.setEventStream(eventBus, streamLogger);

        // Mount routes from service plugins before the server starts listening.
        if (httpServer) {
          httpServer.mountServiceRoutes(serviceRegistry);
        }

        // Mount web UI if enabled (imported lazily to keep it tree-shakeable)
        if (httpServer && config.httpServer.webUi.enabled) {
          const webUiPath = config.httpServer.webUi.path;
          await httpServer.mountWebUi(webUiPath, config.httpServer.token);
          logger.info({ path: webUiPath }, "Web UI enabled");
        }

        httpServer?.start();
        await stateManager.load();
        await deviceRegistry?.load();

        // Run onStart() lifecycle hooks for all registered ServicePlugins.
        const coreCtx: CoreContext = {
          http,
          logger,
          deviceRegistry,
          executionRecorder: manager.getExecutionRecorder(),
        };
        await serviceRegistry.startAll(coreCtx);

        // Started before automation discovery, so no automation's onStart()
        // ever observes a partially constructed device surface (task 6.13a).
        await deviceSources.start();

        // Bridges device changes onto the event stream's device categories
        // (design.md D1; tasks 7.4, 7.5). Re-wired on every start() since
        // `deviceSources.stop()` clears its listener set; seeding from
        // `list()` here means whatever's already known at this point in
        // startup (typically nothing yet, since MQTT has not connected)
        // never itself emits a spurious `device_appeared`.
        wireDeviceEvents(deviceSources, eventBus);

        await mqtt.connect();
        deviceRegistry?.start();
        const recursive = options.recursive ?? config.automations.recursive;
        await manager.discoverAndRegister(options.automationsDir, recursive);
        started = true;
        httpServer?.setEngineStarted(true);
        engineStartedRef.started = true;
        emitReadinessIfChanged();
        logger.info(
          {
            automations: manager.listAutomations().length,
            services: serviceRegistry.keys().length,
            mqtt: config.mqtt.host,
            httpPort: httpServerPort > 0 ? httpServerPort : "disabled",
            deviceRegistry: config.deviceRegistry.enabled,
            statePersistence:
              stateManager !== null && (options.state?.persist ?? config.state.persist),
          },
          "Home Automation Engine is running",
        );
      } catch (err) {
        logger.error({ err }, "Engine startup failed — rolling back");
        // Best-effort cleanup of whatever was partially started
        try {
          await manager.stopAll();
        } catch {
          /* already logging above */
        }
        try {
          cron.stopAll();
        } catch {
          /* swallow */
        }
        try {
          await deviceSources.stop();
        } catch {
          /* swallow */
        }
        try {
          await serviceRegistry.stopAll();
        } catch {
          /* swallow */
        }
        try {
          deviceRegistry?.stop();
        } catch {
          /* swallow */
        }
        try {
          await mqtt.disconnect();
        } catch {
          /* swallow */
        }
        try {
          httpServer?.stop();
        } catch {
          /* swallow */
        }
        started = false;
        engineStartedRef.started = false;
        emitReadinessIfChanged();
        throw err;
      }
    },

    async stop(): Promise<void> {
      if (!started) {
        return;
      }

      logger.info("Stopping Home Automation Engine");

      // Each teardown step is isolated: a failure in one step is logged but must
      // never prevent the remaining steps from running (e.g. a failed state save
      // must not stop MQTT from disconnecting or the HTTP port from closing).
      const safe = async (step: () => void | Promise<void>, label: string): Promise<void> => {
        try {
          await step();
        } catch (err) {
          logger.error({ err, step: label }, "Shutdown step failed");
        }
      };

      try {
        await safe(() => httpServer?.setEngineStarted(false), "unmark-http-started");
        engineStartedRef.started = false;
        emitReadinessIfChanged();
        await safe(() => manager.stopAll(), "stop-automations");
        await safe(() => cron.stopAll(), "stop-cron");
        await safe(() => deviceSources.stop(), "stop-device-sources");
        // Run onStop() lifecycle hooks for all registered ServicePlugins.
        await safe(() => serviceRegistry.stopAll(), "stop-service-plugins");
        await safe(() => deviceRegistry?.save(), "save-device-registry");
        await safe(() => deviceRegistry?.stop(), "stop-device-registry");
        // flush() (not save()) so a pending coalesced write from the current
        // debounce window is not lost on shutdown (design.md D6; task 2.3).
        await safe(() => stateManager.flush(), "save-state");
        await safe(() => mqtt.disconnect(), "disconnect-mqtt");
        await safe(() => httpServer?.stop(), "stop-http");
      } finally {
        // Always clear started, even if a step above threw, so the engine does
        // not remain permanently "started" after a partial teardown.
        started = false;
      }
      logger.info("Home Automation Engine stopped");
    },
  };
}
