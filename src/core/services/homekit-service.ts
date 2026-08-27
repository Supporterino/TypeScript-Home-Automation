import { resolve } from "node:path";
import type { Bridge, HAPStorage, uuid as UuidModule } from "hap-nodejs";
import type { Hono } from "hono";
import type { Logger } from "pino";
import type { AggregateDeviceSource } from "../device-sources/aggregate.js";
import type { StateToggleConfig } from "../device-sources/state-source.js";
import type { CreatedAccessory } from "./homekit-descriptor-factory.js";
import type { AccessorySink, AccessorySource } from "./homekit-sources/accessory-source.js";
import type { CoreContext, ServicePlugin } from "./service-plugin.js";

export type { StateToggleConfig };

export const HOMEKIT_SERVICE_KEY = "homekit";

/** HAP category code for a Bridge accessory. */
const HAP_CATEGORY_BRIDGE = 2;

/**
 * The seed string hashed into the bridge's stable HomeKit UUID — the
 * configured username (MAC address) alone.
 *
 * Extracted as its own named, hap-nodejs-independent function so a
 * characterisation test (task 6.15) can freeze it without importing
 * `hap-nodejs` — a pairing-critical value that must survive any refactor of
 * this service unchanged.
 */
export function bridgeUuidSeed(username: string): string {
  return username;
}

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
 *     homekit: ({ logger, devices }) =>
 *       new HomekitService(logger, devices, {
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
   * @deprecated Device refresh no longer runs inside `HomekitService` — each
   * unified device source (`SHELLY_POLL_MS`, `NANOLEAF_POLL_MS`) owns its own
   * poll interval (design.md D2; task 6.16). This option has no effect.
   */
  pollIntervalMs?: number;

  /**
   * @deprecated `stateToggles` is no longer a `HomekitService` option. A
   * source consumed by two sinks (HomeKit and the web UI) cannot live inside
   * one of them, so it moved to engine-level configuration (design.md D19):
   * pass it as `createEngine({ stateToggles: [...] })` instead. Present here
   * only so a caller upgrading from the old location gets a clear rejection
   * naming the new one, rather than a silently ignored option.
   */
  stateToggles?: StateToggleConfig[];
}

/**
 * A `ServicePlugin` that runs a HomeKit bridge inside the automation engine.
 *
 * It uses the `hap-nodejs` library to advertise a HAP bridge accessory, then
 * consumes the engine's shared, unified {@link AggregateDeviceSource} through
 * a single {@link AccessorySource} — `DeviceCatalogSource` — and bridges its
 * devices into HomeKit.
 *
 * `HomekitService` owns the HAP bridge lifecycle (publish/unpublish, persist
 * path, PIN/port/bind, the accessory map, the status endpoint) and narrows to
 * HAP at its own boundary. It holds no reference to `ZigbeeDevice`,
 * Zigbee2MQTT `exposes`, MQTT, or Shelly RPC — device discovery, freshness,
 * and write-back for every family live in the shared device-source layer
 * (design.md D22; task 6.16), reached only through `Engine.devices`.
 *
 * Supported device types (via the shared capability vocabulary):
 * - Lightbulb (on/off, brightness, colour temperature, colour) — Zigbee
 * - Motion / Contact / Water-leak sensors — Zigbee
 * - Temperature / humidity sensors — Zigbee
 * - Switch / Outlet — Zigbee, Shelly, and state toggles
 * - WindowCovering — Shelly covers
 *
 * @example
 * ```ts
 * import { createEngine, HomekitService } from "ts-home-automation";
 *
 * const engine = createEngine({
 *   automationsDir: "...",
 *   services: {
 *     homekit: ({ logger, devices }) =>
 *       new HomekitService(logger, devices, {
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

  /** Maps qualifiedId → CreatedAccessory (accessory + updateState fn). */
  private readonly accessories: Map<string, CreatedAccessory> = new Map();

  /** The single accessory source, constructed in `onStart()`. */
  private sources: AccessorySource[] = [];

  constructor(
    private readonly logger: Logger,
    private readonly devices: AggregateDeviceSource,
    private readonly options: HomekitServiceOptions,
  ) {
    // `stateToggles` moved to engine-level configuration (design.md D19).
    // Reject the old location explicitly, naming the new one, rather than
    // silently ignoring it — state toggles configured this way would
    // otherwise disappear from the web UI whenever HomeKit is disabled.
    if (this.options.stateToggles !== undefined) {
      throw new Error(
        "HomekitServiceOptions.stateToggles is no longer supported. " +
          "Configure state toggles via createEngine({ stateToggles: [...] }) instead.",
      );
    }
  }

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
    this.bridge = new BridgeCtor(bridgeName, uuidMod.generate(bridgeUuidSeed(username)));

    // Build the single accessory source. The source set behind `this.devices`
    // is fixed and always present (task 6.13a) — a family with nothing
    // configured simply contributes no devices, not an absent source.
    this.sources = await this.buildSources();

    const sink = this.createSink();
    for (const source of this.sources) {
      await source.start(sink);
    }

    try {
      await this.bridge.publish({
        username,
        pincode: this.options.pinCode,
        port,
        category: HAP_CATEGORY_BRIDGE,
        bind: this.options.bind,
      });
    } catch (err) {
      // publish() failed after sources were started. The registry will not call
      // our onStop() (plugin onStart failed), so tear down the already-started
      // sources here to release poll intervals and registry listeners, then
      // rethrow so the failure is logged by the registry.
      this.logger.error({ err }, "HomeKit bridge publish failed — tearing down started sources");
      for (const source of this.sources) {
        try {
          await source.stop();
        } catch (stopErr) {
          this.logger.error(
            { err: stopErr, source: source.name },
            "Error stopping accessory source during publish-failure teardown",
          );
        }
      }
      this.sources = [];
      this.accessories.clear();
      this.published = false;
      this.bridge = null;
      throw err;
    }

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
   * Constructs the single {@link DeviceCatalogSource}. Lazily imports the
   * descriptor factory and source class so their top-level `hap-nodejs`
   * import is only evaluated once the bridge starts.
   */
  private async buildSources(): Promise<AccessorySource[]> {
    const { createAccessoryFromDescriptor } = await import("./homekit-descriptor-factory.js");
    const { DeviceCatalogSource } = await import("./homekit-sources/device-catalog-source.js");
    return [new DeviceCatalogSource(this.devices, this.logger, createAccessoryFromDescriptor)];
  }

  /**
   * Creates the {@link AccessorySink} that bridges accessories added by the
   * source onto the HAP bridge, keyed by qualified id.
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
