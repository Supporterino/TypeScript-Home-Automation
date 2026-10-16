import type { NotificationService } from "@ts-ha/shared/types/notification";
import type { WeatherService } from "@ts-ha/shared/types/weather";
import pino, { type Logger, multistream } from "pino";
import { AUTOMATION_ENABLED_PREFIX, AutomationManager } from "./automation-manager.js";
import { type Config, loadConfig } from "./config.js";
import { AggregateDeviceSource } from "./device-sources/aggregate.js";
import { wireDeviceEvents } from "./device-sources/device-event-bridge.js";
import {
  DeviceStateStore,
  type DeviceStateStoreOptions,
} from "./device-sources/device-state-store.js";
import { NanoleafDeviceSource } from "./device-sources/nanoleaf-source.js";
import { ShellyDeviceSource } from "./device-sources/shelly-source.js";
import { StateDeviceSource, type StateToggleConfig } from "./device-sources/state-source.js";
import { ZigbeeGroupDeviceSource } from "./device-sources/zigbee-group-source.js";
import { ZigbeeDeviceSource } from "./device-sources/zigbee-source.js";
import { DeviceVisibility } from "./device-visibility.js";
import { EnergyAggregator } from "./energy/energy-aggregator.js";
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
import { WALL_PREFIX, WallManager } from "./wall-manager.js";
import {
  type DeviceNiceNames,
  DeviceRegistry,
  type DeviceRegistryPersistenceOptions,
} from "./zigbee/device-registry.js";

/**
 * Construct the stdout-only logger used exclusively by the event stream's
 * delivery path. Always a second pino instance, never a child of the caller's
 * logger, so delivery logging can never feed the `LogBuffer`.
 */
export function createStreamOnlyLogger(logLevel: Config["logLevel"]): Logger {
  return pino({ level: logLevel });
}

/**
 * Factory function type for optional services: receives the engine's shared
 * `HttpClient` and a scoped `Logger`.
 */
export type ServiceFactory<T> = (http: HttpClient, logger: Logger) => T;

/**
 * Dependency context passed to a `HomekitServiceFactory`: `http`, `logger`, and
 * the aggregate device accessor.
 */
export interface HomekitServiceContext {
  http: HttpClient;
  logger: Logger;
  devices: AggregateDeviceSource;
  /** The persisted, per-device hidden flag; HomeKit exposure filters through it directly. */
  deviceVisibility: DeviceVisibility;
}

/**
 * Factory function type specifically for `HomekitService`: receives a single
 * {@link HomekitServiceContext} object rather than positional arguments.
 */
export type HomekitServiceFactory = (ctx: HomekitServiceContext) => HomekitService;

/**
 * Options for creating an automation engine; fields are optional with defaults derived
 * from environment variables.
 */
export interface EngineOptions {
  /** Directory containing automation files; each file default-exports an `Automation` subclass. */
  automationsDir: string;

  /**
   * Whether to scan subdirectories recursively for automation files.
   *
   * @default false
   */
  recursive?: boolean;

  /** Override the environment-derived config. */
  config?: Partial<Config>;

  /** Provide your own pino logger; otherwise one is created from the config log level. */
  logger?: Logger;

  /**
   * State manager options; state is always available in-memory regardless of persistence.
   */
  state?: StateManagerOptions;

  /**
   * Runtime options for the Zigbee2MQTT device registry; only relevant when
   * `DEVICE_REGISTRY_ENABLED=true`.
   */
  deviceRegistry?: {
    /** Human-readable name mappings. Used by `registry.getNiceName()`. */
    names?: DeviceNiceNames;
    /**
     * Whether to persist the device list and state on shutdown and restore on startup.
     *
     * @default false
     */
    persist?: boolean;
    /**
     * Path to the device registry JSON persistence file.
     * @default "./device-registry.json"
     */
    filePath?: string;
  };

  /**
   * Device state store options: whether each device's last-known state and its
   * observation are persisted and restored on startup. The store is a seed,
   * never an authority — a reported observation always wins.
   */
  deviceState?: DeviceStateStoreOptions;

  /**
   * Boolean `StateManager` keys to present as devices through the unified device source.
   *
   * @default []
   */
  stateToggles?: StateToggleConfig[];

  /**
   * Optional services to register with the engine. Well-known keys accept either
   * an instance or a `ServiceFactory`; additional services use any custom key.
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
   * A second pino instance that writes to stdout only, used solely by the event
   * stream's delivery path so its logging cannot feed the log buffer.
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
   * The aggregate device accessor spanning every unified device source. Always
   * present — a disabled source is reported unavailable rather than `null`.
   */
  readonly devices: AggregateDeviceSource;

  /** User-defined rooms grouping devices across every unified device source. */
  readonly rooms: RoomManager;

  /** Named wall profiles for the full-bleed wall surface. */
  readonly walls: WallManager;

  /** The persisted, per-device hidden flag. */
  readonly deviceVisibility: DeviceVisibility;

  /**
   * The home-wide energy aggregator sampling the unified device sources. Started
   * after the device sources so its first sample observes a populated surface.
   */
  readonly energy: EnergyAggregator;
}

/**
 * Create and configure an automation engine; the main entry point for using the framework
 * as a package.
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

  // A second instance, never a child of `logger`, so the delivery path cannot
  // feed back into the log category it delivers. Constructed unconditionally.
  const streamLogger = createStreamOnlyLogger(config.logLevel);

  // The realtime event stream's shared publish/subscribe hub.
  const eventBus = new EventBus();

  // Log category: relay every newly-stored entry.
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

  // Route every state mutation to exactly one typed category; reserved keys are
  // mapped by namespace, and every other reserved key is excluded from the stream.
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
    if (key.startsWith(WALL_PREFIX)) {
      const name = key.slice(WALL_PREFIX.length);
      const kind =
        oldValue === undefined ? "created" : newValue === undefined ? "deleted" : "updated";
      eventBus.emit({ category: "wall", name, kind });
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

  // ── Device visibility ────────────────────────────────────────────────────
  //
  // A persisted, per-device hidden flag that the aggregate stamps onto every
  // descriptor. Depends only on `StateManager`, keeping this ordering acyclic.
  const deviceVisibility = new DeviceVisibility(
    stateManager,
    logger.child({ service: "visibility" }),
  );

  // A visibility change rides its own SSE category, since its reserved backing
  // key is excluded from the `state` category above.
  deviceVisibility.onChange(({ qualifiedId, hidden }) => {
    eventBus.emit({ category: "device_visibility", qualifiedId, hidden });
  });

  // ── Device state store ────────────────────────────────────────────────────
  //
  // One durable home for every device's last-known state and the observation that
  // produced it, keyed by qualified id. Loaded in `start()` before the sources,
  // so a restored value is available to the first enumeration.
  const deviceStateStore = new DeviceStateStore(logger.child({ service: "device-state" }), {
    persist: options.deviceState?.persist ?? config.deviceState.persist,
    filePath: options.deviceState?.filePath ?? config.deviceState.filePath,
    flushIntervalMs: options.deviceState?.flushIntervalMs ?? config.deviceState.flushIntervalMs,
  });

  // ── Unified device sources ────────────────────────────────────────────────
  //
  // Constructed before HomekitService, the HTTP server, and automation discovery,
  // so no automation's onStart() observes a partially constructed device surface.
  // The source set is fixed and started/stopped directly by the engine.
  const deviceSources = new AggregateDeviceSource(
    [
      new ZigbeeDeviceSource(
        deviceRegistry,
        mqtt,
        logger.child({ service: "devices-zigbee" }),
        deviceStateStore,
      ),
      new ZigbeeGroupDeviceSource(
        deviceRegistry,
        mqtt,
        logger.child({ service: "devices-zigbee-group" }),
        deviceStateStore,
      ),
      new ShellyDeviceSource(
        shellyService,
        mqtt,
        logger.child({ service: "devices-shelly" }),
        config.devices.shellyPollMs,
        deviceStateStore,
      ),
      new NanoleafDeviceSource(
        nanoleafService,
        logger.child({ service: "devices-nanoleaf" }),
        config.devices.nanoleafPollMs,
        deviceStateStore,
      ),
      new StateDeviceSource(
        stateManager,
        options.stateToggles ?? [],
        logger.child({ service: "devices-state" }),
        deviceStateStore,
      ),
    ],
    deviceVisibility,
    logger.child({ service: "devices" }),
  );

  // Home-wide energy aggregation. Its sampling timer is started after
  // `deviceSources.start()` so the first sample observes a populated surface.
  const energyAggregator = new EnergyAggregator(
    deviceSources,
    {
      sampleIntervalMs: config.energy.sampleIntervalMs,
      historyMinutes: config.energy.historyMinutes,
    },
    logger.child({ service: "energy" }),
  );

  // User-defined rooms span every unified device source, so they are constructed
  // right after `deviceSources`.
  const roomManager = new RoomManager(
    stateManager,
    deviceSources,
    logger.child({ service: "rooms" }),
  );

  // Named wall profiles depend only on the state store: addressed and stored by
  // name in the reserved namespace, with no device knowledge.
  const wallManager = new WallManager(stateManager, logger.child({ service: "walls" }));

  // HomekitService reads every device family through `deviceSources`, so it uses
  // its own resolver only for its distinct context shape, not a dependency order.
  const homekitService =
    homekitValue === undefined
      ? null
      : typeof homekitValue === "function"
        ? homekitValue({
            http,
            logger: logger.child({ service: "homekit" }),
            devices: deviceSources,
            deviceVisibility,
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

  // Broadcast the automation_execution category from the same ExecutionRecorder
  // run() that populates execution history, so the two can never disagree.
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
    walls: wallManager,
    deviceVisibility,
    energy: energyAggregator,

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
        httpServer?.setWallManager(wallManager);
        httpServer?.setDeviceVisibility(deviceVisibility);
        httpServer?.setEventStream(eventBus, streamLogger);
        httpServer?.setEnergyAggregator(energyAggregator);
        httpServer?.setWeatherService(weatherService, config.weather);

        // Mount routes from service plugins before the server starts listening.
        if (httpServer) {
          httpServer.mountServiceRoutes(serviceRegistry);
        }

        httpServer?.start();
        await stateManager.load();
        await deviceRegistry?.load();
        // Loaded after the device registry and before any source starts, so a
        // restored record is available to the first enumeration.
        await deviceStateStore.load();

        // Run onStart() lifecycle hooks for all registered ServicePlugins.
        const coreCtx: CoreContext = {
          http,
          logger,
          deviceRegistry,
          executionRecorder: manager.getExecutionRecorder(),
        };
        await serviceRegistry.startAll(coreCtx);

        // MQTT must be connected before device sources start: a source that
        // discovers components over MQTT publishes an RPC request through
        // MqttService, which is a no-op while disconnected.
        await mqtt.connect();

        // Started before automation discovery so no automation's onStart()
        // ever observes a partially constructed device surface.
        await deviceSources.start();

        // Sampled only once the sources are running, so the first sample
        // observes the same device surface automations will.
        energyAggregator.start();

        // Bridge device changes onto the event stream's device categories.
        // Re-wired on every start() since `deviceSources.stop()` clears its listeners.
        wireDeviceEvents(deviceSources, eventBus, deviceStateStore);

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
            statePersistence: options.state?.persist ?? config.state.persist,
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
          energyAggregator.stop();
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
        await safe(() => energyAggregator.stop(), "stop-energy-aggregator");
        await safe(() => deviceSources.stop(), "stop-device-sources");
        // Run onStop() lifecycle hooks for all registered ServicePlugins.
        await safe(() => serviceRegistry.stopAll(), "stop-service-plugins");
        await safe(() => deviceRegistry?.save(), "save-device-registry");
        await safe(() => deviceRegistry?.stop(), "stop-device-registry");
        // flush() (not save()) so a pending coalesced write is not lost on shutdown.
        await safe(() => stateManager.flush(), "save-state");
        await safe(() => deviceStateStore.flush(), "save-device-state");
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
