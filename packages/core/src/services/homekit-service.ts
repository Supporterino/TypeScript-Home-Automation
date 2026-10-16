import { resolve } from "node:path";
import type { HomekitStatus } from "@ts-ha/shared";
import type { Bridge, HAPStorage, uuid as UuidModule } from "hap-nodejs";
import type { Hono } from "hono";
import type { Logger } from "pino";
import type { AggregateDeviceSource } from "../device-sources/aggregate.js";
import type { StateToggleConfig } from "../device-sources/state-source.js";
import type { DeviceVisibility } from "../device-visibility.js";
import type { CreatedAccessory } from "./homekit-descriptor-factory.js";
import type { AccessorySink, AccessorySource } from "./homekit-sources/accessory-source.js";
import type { CoreContext, ServicePlugin } from "./service-plugin.js";

export type { StateToggleConfig };

export const HOMEKIT_SERVICE_KEY = "homekit";

/** HAP category code for a Bridge accessory. */
const HAP_CATEGORY_BRIDGE = 2;

/**
 * The seed string hashed into the bridge's stable HomeKit UUID — the configured
 * username (MAC address) alone. A hap-nodejs-independent function so the
 * characterisation test can freeze this pairing-critical value without importing it.
 */
export function bridgeUuidSeed(username: string): string {
  return username;
}

export type { HomekitStatus } from "@ts-ha/shared";

/** Configuration options for the `HomekitService`. */
export interface HomekitServiceOptions {
  /**
   * HomeKit pairing PIN in the format "XXX-XX-XXX".
   *
   * @example "031-45-154"
   */
  pinCode: string;

  /**
   * Directory where HAP pairing data is persisted between restarts, created if absent.
   *
   * @default "./homekit-persist"
   */
  persistPath?: string;

  /**
   * Display name advertised to the Home app.
   * @default "TS-Home-Automation"
   */
  bridgeName?: string;

  /**
   * TCP port the HAP server listens on; each bridge uses a unique port.
   * @default 47128
   */
  port?: number;

  /**
   * HAP bridge MAC address ("XX:XX:XX:XX:XX:XX"); must be unique on the network.
   * @default "CC:22:3D:E3:CE:F8"
   */
  username?: string;

  /**
   * Network interfaces or IP addresses to advertise mDNS on, passed to `hap-nodejs`'
   * `publish({ bind })`; undefined advertises on all interfaces. Accepts one or an array.
   */
  bind?: string | string[];

  /**
   * @deprecated Device refresh no longer runs inside `HomekitService`; each device
   * source owns its own poll interval. This option has no effect.
   */
  pollIntervalMs?: number;

  /**
   * @deprecated Moved to engine-level configuration: pass it via
   * `createEngine({ stateToggles: [...] })`. Present here only so a caller upgrading
   * from the old location gets a clear rejection rather than a silently ignored option.
   */
  stateToggles?: StateToggleConfig[];
}

/**
 * A `ServicePlugin` that runs a HomeKit bridge: it advertises a HAP bridge via
 * `hap-nodejs` and bridges the shared `AggregateDeviceSource`'s devices into HomeKit.
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
    private readonly visibility: DeviceVisibility,
  ) {
    // `stateToggles` moved to engine-level configuration; reject the old location
    // explicitly rather than silently ignoring it.
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

    // Build the single accessory source; the set behind `this.devices` is fixed —
    // a family with nothing configured contributes no devices, not an absent source.
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
    return [
      new DeviceCatalogSource(
        this.devices,
        this.visibility,
        this.logger,
        createAccessoryFromDescriptor,
      ),
    ];
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
