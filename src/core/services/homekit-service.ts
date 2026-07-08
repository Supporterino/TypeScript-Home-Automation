import { resolve } from "node:path";
import type { Bridge, HAPStorage, uuid as UuidModule } from "hap-nodejs";
import type { Hono } from "hono";
import type { Logger } from "pino";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type { DeviceRegistry } from "../zigbee/device-registry.js";
import type { CreatedAccessory } from "./homekit-accessory-factory.js";
import type { AccessorySink, AccessorySource } from "./homekit-sources/accessory-source.js";
import type { CoreContext, ServicePlugin } from "./service-plugin.js";
import type { ShellyService } from "./shelly-service.js";

export const HOMEKIT_SERVICE_KEY = "homekit";

/** HAP category code for a Bridge accessory. */
const HAP_CATEGORY_BRIDGE = 2;

/**
 * Runtime status snapshot for the HomeKit bridge.
 * Returned by `HomekitService.getStatus()` and the `GET /api/homekit/status` endpoint.
 */
export interface HomekitStatus {
  /** Whether the HAP bridge is currently published and accepting connections. */
  running: boolean;
  /** Display name advertised to the Home app. */
  bridgeName: string;
  /** TCP port the HAP server listens on. */
  port: number;
  /** HAP bridge MAC address used as the unique bridge identifier. */
  username: string;
  /** Path to the directory where HAP pairing data is persisted. */
  persistPath: string;
  /** Number of HomeKit accessories currently registered on the bridge. */
  accessoryCount: number;
  /** Network interfaces/IPs the bridge advertises mDNS on (from `bind` option). */
  bind?: string | string[];
}

/**
 * Configuration options for the `HomekitService`.
 *
 * @example
 * ```ts
 * const engine = createEngine({
 *   automationsDir: "...",
 *   services: {
 *     homekit: ({ logger, mqtt, deviceRegistry, shelly }) =>
 *       new HomekitService(mqtt, logger, deviceRegistry, shelly, {
 *         pinCode: "031-45-154",
 *         persistPath: "./homekit-persist",
 *         bridgeName: "My Home Bridge",
 *       }),
 *   },
 * });
 * ```
 */
export interface HomekitServiceOptions {
  /**
   * HomeKit pairing PIN in the format "XXX-XX-XXX".
   *
   * @example "031-45-154"
   */
  pinCode: string;

  /**
   * Path to the directory where HAP pairing data is persisted between restarts.
   * The directory is created automatically if it does not exist.
   *
   * @default "./homekit-persist"
   */
  persistPath?: string;

  /**
   * Display name advertised to the Home app.
   *
   * @default "TS-Home-Automation"
   */
  bridgeName?: string;

  /**
   * TCP port the HAP server listens on.
   * Each bridge instance must use a unique port on the host.
   *
   * @default 47128
   */
  port?: number;

  /**
   * HAP bridge MAC address in the format "XX:XX:XX:XX:XX:XX".
   *
   * Every bridge instance on the same network must have a unique username.
   * If two bridges share the same username, iOS will refuse to pair the second.
   *
   * @default "CC:22:3D:E3:CE:F8"
   */
  username?: string;

  /**
   * Network interfaces or IP addresses to advertise mDNS on.
   *
   * Passed directly to `hap-nodejs`' `publish({ bind })`. Controls which network
   * interface the HAP server binds to and advertises mDNS records on.  By default
   * (undefined), the bridge advertises on all available interfaces.
   *
   * Essential for containerized environments where the primary pod/container
   * network interface is isolated from the LAN:
   *
   * - **Docker:** use `network_mode: host` or specify the host-facing interface
   *   name (e.g. `"eth0"`).
   * - **Kubernetes (Multus CNI):** add a macvlan secondary interface that has
   *   a LAN IP and bind to it (e.g. `["net1"]`).  See docs for details.
   * - **Standalone / host network:** leave undefined.
   *
   * Accepts a single interface/IP or an array.  Interface names are preferred
   * over IPs because they auto-update when the address changes.
   *
   * @example
   * ```ts
   * // Multus macvlan secondary interface
   * bind: ["net1"],
   *
   * // Specific Docker host-facing interface
   * bind: "eth0",
   * ```
   */
  bind?: string | string[];

  /**
   * Global polling interval (milliseconds) used by the Shelly accessory source
   * to refresh device state over HTTP. Has no effect when no Shelly source is
   * active.
   *
   * @default 10000
   */
  pollIntervalMs?: number;
}

/**
 * A `ServicePlugin` that runs a HomeKit bridge inside the automation engine.
 *
 * It uses the `hap-nodejs` library to advertise a HAP bridge accessory, then
 * consumes one or more source-agnostic {@link AccessorySource}s (Zigbee2MQTT via
 * the `DeviceRegistry`, Shelly via HTTP polling) and bridges their accessories
 * into HomeKit.
 *
 * `HomekitService` owns the HAP bridge lifecycle (publish/unpublish, persist
 * path, PIN/port/bind, the accessory map, the status endpoint). It knows nothing
 * about `ZigbeeDevice`, Zigbee2MQTT `exposes`, MQTT, or Shelly RPC — each source
 * owns its own discovery, freshness, and write-back.
 *
 * The Zigbee source requires `DEVICE_REGISTRY_ENABLED=true`. When the registry
 * is absent the Zigbee source is skipped (with a warning), but the bridge may
 * still start to serve the Shelly source. If no source is available a warning is
 * logged and startup is skipped.
 *
 * Supported Zigbee device types:
 * - Lightbulb (on/off, brightness, colour temperature, colour)
 * - Motion sensor
 * - Contact sensor
 * - Water-leak sensor
 * - Temperature / humidity sensor
 * - Switch / outlet
 *
 * Supported Shelly device types:
 * - Switch / Outlet
 * - Cover (WindowCovering)
 *
 * @example
 * ```ts
 * import { createEngine, HomekitService } from "ts-home-automation";
 *
 * const engine = createEngine({
 *   automationsDir: "...",
 *   services: {
 *     homekit: ({ logger, mqtt, deviceRegistry, shelly }) =>
 *       new HomekitService(mqtt, logger, deviceRegistry, shelly, {
 *         pinCode: "031-45-154",
 *       }),
 *   },
 * });
 * ```
 */
export class HomekitService implements ServicePlugin {
  readonly serviceKey = HOMEKIT_SERVICE_KEY;

  private bridge: Bridge | null = null;
  /** Set to `true` only after `bridge.publish()` resolves successfully. */
  private published = false;

  /** Maps namespaced accessory id → CreatedAccessory (accessory + updateState fn). */
  private readonly accessories: Map<string, CreatedAccessory> = new Map();

  /** Active accessory sources, constructed in `onStart()`. */
  private sources: AccessorySource[] = [];

  constructor(
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
    private readonly registry: DeviceRegistry | null,
    private readonly shelly: ShellyService | null,
    private readonly options: HomekitServiceOptions,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Returns a snapshot of the current bridge state.
   * Safe to call at any time, including before `onStart`.
   */
  getStatus(): HomekitStatus {
    return {
      running: this.published,
      bridgeName: this.options.bridgeName ?? "TS-Home-Automation",
      port: this.options.port ?? 47128,
      username: this.options.username ?? "CC:22:3D:E3:CE:F8",
      persistPath: resolve(this.options.persistPath ?? "./homekit-persist"),
      accessoryCount: this.accessories.size,
      bind: this.options.bind,
    };
  }

  /**
   * Mounts `GET /api/homekit/status` on the shared Hono app.
   * The route is automatically protected by the `/api/*` auth middleware.
   */
  registerRoutes(app: Hono): void {
    app.get("/api/homekit/status", (c) => c.json(this.getStatus()));
  }

  // ---------------------------------------------------------------------------
  // ServicePlugin lifecycle
  // ---------------------------------------------------------------------------

  async onStart(_ctx: CoreContext): Promise<void> {
    if (!this.registry && !this.shelly) {
      this.logger.warn(
        "HomekitService has no accessory sources (no device registry, no Shelly service) — skipping startup",
      );
      return;
    }

    // Lazily load hap-nodejs so that simply importing HomekitService does not
    // evaluate the hap-nodejs module (which checks for native crypto ciphers).
    // Under Bun we polyfill the missing chacha20-poly1305 cipher first.
    await import("./homekit-crypto-polyfill.js");

    let BridgeCtor: typeof Bridge;
    let HAPStorageMod: typeof HAPStorage;
    let uuidMod: typeof UuidModule;
    try {
      const hap = await import("hap-nodejs");
      BridgeCtor = hap.Bridge;
      HAPStorageMod = hap.HAPStorage;
      uuidMod = hap.uuid;
    } catch (err) {
      this.logger.error({ err }, "hap-nodejs failed to load — HomeKit bridge cannot start.");
      return;
    }

    const persistPath = resolve(this.options.persistPath ?? "./homekit-persist");
    const bridgeName = this.options.bridgeName ?? "TS-Home-Automation";
    const port = this.options.port ?? 47128;
    const username = this.options.username ?? "CC:22:3D:E3:CE:F8";

    // Configure HAP storage before creating the bridge so pairing data survives restarts.
    // Resolve to absolute path because node-persist resolves relative paths against
    // its own __dirname inside node_modules, which is often read-only in containers.
    HAPStorageMod.setCustomStoragePath(persistPath);

    // Use the stable username (MAC address) as the UUID seed so the bridge
    // identity survives renames and remains unique per bridge instance.
    this.bridge = new BridgeCtor(bridgeName, uuidMod.generate(username));

    // Build the available accessory sources.
    this.sources = await this.buildSources();
    if (this.sources.length === 0) {
      this.logger.warn("No HomeKit accessory sources available — skipping startup");
      this.bridge = null;
      return;
    }

    // Start each source so it builds its initial accessories and begins its own
    // freshness mechanism (registry listeners for Zigbee; a poll loop for Shelly).
    const sink = this.createSink();
    for (const source of this.sources) {
      await source.start(sink);
    }

    await this.bridge.publish({
      username,
      pincode: this.options.pinCode,
      port,
      category: HAP_CATEGORY_BRIDGE,
      bind: this.options.bind,
    });

    // Only mark running after publish() resolves successfully.
    this.published = true;

    this.logger.info(
      {
        bridgeName,
        port,
        username,
        accessories: this.accessories.size,
        sources: this.sources.map((s) => s.name),
      },
      "HomeKit bridge published — open the Home app and scan the PIN to pair",
    );
  }

  async onStop(): Promise<void> {
    if (!this.bridge) return;

    for (const source of this.sources) {
      try {
        await source.stop();
      } catch (err) {
        this.logger.error({ err, source: source.name }, "Error stopping accessory source");
      }
    }
    this.sources = [];
    this.accessories.clear();

    await this.bridge.unpublish();
    this.published = false;
    this.bridge = null;

    this.logger.info("HomeKit bridge unpublished");
  }

  // ---------------------------------------------------------------------------
  // Internal source management
  // ---------------------------------------------------------------------------

  /**
   * Constructs the available accessory sources based on which dependencies are
   * present. Lazily imports the factories and source classes so their
   * top-level `hap-nodejs` imports are only evaluated once the bridge starts.
   */
  private async buildSources(): Promise<AccessorySource[]> {
    const sources: AccessorySource[] = [];

    if (this.registry) {
      const { createAccessory } = await import("./homekit-accessory-factory.js");
      const { ZigbeeSource } = await import("./homekit-sources/zigbee-source.js");
      sources.push(new ZigbeeSource(this.registry, this.mqtt, this.logger, createAccessory));
    } else {
      this.logger.warn(
        "Device registry not available (DEVICE_REGISTRY_ENABLED=false) — skipping Zigbee source",
      );
    }

    if (this.shelly) {
      const { buildShellyAccessory } = await import("./homekit-shelly-factory.js");
      const { ShellySource } = await import("./homekit-sources/shelly-source.js");
      sources.push(
        new ShellySource(
          this.shelly,
          this.logger,
          buildShellyAccessory,
          this.options.pollIntervalMs ?? 10000,
        ),
      );
    }

    return sources;
  }

  /**
   * Creates the {@link AccessorySink} that bridges accessories added by sources
   * onto the HAP bridge, keyed by the namespaced id the source provides.
   */
  private createSink(): AccessorySink {
    return {
      add: (id, accessory) => {
        if (!this.bridge) return;
        if (this.accessories.has(id)) {
          this.logger.debug({ id }, "Accessory already bridged — skipping");
          return;
        }
        this.accessories.set(id, accessory);
        this.bridge.addBridgedAccessory(accessory.accessory);
        this.logger.debug({ id, uuid: accessory.accessory.UUID }, "HomeKit accessory bridged");
      },
      remove: (id) => {
        if (!this.bridge) return;
        const created = this.accessories.get(id);
        if (!created) return;
        this.bridge.removeBridgedAccessory(created.accessory);
        this.accessories.delete(id);
        this.logger.debug({ id }, "HomeKit accessory unbridged");
      },
    };
  }
}
