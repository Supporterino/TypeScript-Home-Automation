import { Bridge, HAPStorage, uuid } from "hap-nodejs";
import type { Logger } from "pino";
import type { ZigbeeDevice } from "../../types/zigbee/bridge.js";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type {
  DeviceAddedHandler,
  DeviceRegistry,
  DeviceRemovedHandler,
  DeviceStateChangeHandler,
} from "../zigbee/device-registry.js";
import { type CreatedAccessory, createAccessory } from "./homekit-accessory-factory.js";
import type { CoreContext, ServicePlugin } from "./service-plugin.js";

export const HOMEKIT_SERVICE_KEY = "homekit";

/**
 * Configuration options for the `HomekitService`.
 *
 * @example
 * ```ts
 * const engine = createEngine({
 *   automationsDir: "...",
 *   services: {
 *     homekit: (_http, logger) =>
 *       new HomekitService(mqtt, logger, deviceRegistry, {
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
}

/**
 * A `ServicePlugin` that runs a HomeKit bridge inside the automation engine.
 *
 * It uses the `hap-nodejs` library to advertise a HAP bridge accessory, then
 * translates every Zigbee2MQTT device tracked by the `DeviceRegistry` into a
 * HomeKit accessory in real-time.
 *
 * Requires `DEVICE_REGISTRY_ENABLED=true`. If the registry is not available
 * a warning is logged and the service skips startup.
 *
 * Supported device types:
 * - Lightbulb (on/off, brightness, colour temperature, colour)
 * - Motion sensor
 * - Contact sensor
 * - Water-leak sensor
 * - Temperature / humidity sensor
 * - Switch / outlet
 *
 * @example
 * ```ts
 * import { createEngine, HomekitService } from "ts-home-automation";
 *
 * const engine = createEngine({
 *   automationsDir: "...",
 *   services: {
 *     homekit: (_http, logger) =>
 *       new HomekitService(engine.mqtt, logger, engine.deviceRegistry, {
 *         pinCode: "031-45-154",
 *       }),
 *   },
 * });
 * ```
 */
export class HomekitService implements ServicePlugin {
  readonly serviceKey = HOMEKIT_SERVICE_KEY;

  private bridge: Bridge | null = null;

  /** Maps friendly_name → CreatedAccessory (accessory + updateState fn). */
  private readonly accessories: Map<string, CreatedAccessory> = new Map();

  /** Per-device state-change handlers keyed by friendly_name (for cleanup). */
  private readonly stateHandlers: Map<string, DeviceStateChangeHandler> = new Map();

  private onDeviceAddedCb: DeviceAddedHandler | null = null;
  private onDeviceRemovedCb: DeviceRemovedHandler | null = null;

  constructor(
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
    private readonly registry: DeviceRegistry | null,
    private readonly options: HomekitServiceOptions,
  ) {}

  // ---------------------------------------------------------------------------
  // ServicePlugin lifecycle
  // ---------------------------------------------------------------------------

  async onStart(_ctx: CoreContext): Promise<void> {
    if (!this.registry) {
      this.logger.warn("HomekitService requires DEVICE_REGISTRY_ENABLED=true — skipping startup");
      return;
    }

    const persistPath = this.options.persistPath ?? "./homekit-persist";
    const bridgeName = this.options.bridgeName ?? "TS-Home-Automation";
    const port = this.options.port ?? 47128;
    const username = this.options.username ?? "CC:22:3D:E3:CE:F8";

    // Configure HAP storage before creating the bridge so pairing data survives restarts.
    HAPStorage.setCustomStoragePath(persistPath);

    this.bridge = new Bridge(bridgeName, uuid.generate(bridgeName));

    // Register all devices that are already known at startup.
    for (const device of this.registry.getDevices()) {
      this.addAccessory(device);
    }

    // Subscribe to dynamic device join/leave events.
    this.onDeviceAddedCb = (device) => this.addAccessory(device);
    this.onDeviceRemovedCb = (device) => this.removeAccessory(device);
    this.registry.onDeviceAdded(this.onDeviceAddedCb);
    this.registry.onDeviceRemoved(this.onDeviceRemovedCb);

    await this.bridge.publish({
      username,
      pincode: this.options.pinCode,
      port,
      category: 2, // Categories.BRIDGE
    });

    this.logger.info(
      { bridgeName, port, username, accessories: this.accessories.size },
      "HomeKit bridge published — open the Home app and scan the PIN to pair",
    );
  }

  async onStop(): Promise<void> {
    if (!this.bridge) return;

    // Detach dynamic event listeners.
    if (this.registry) {
      if (this.onDeviceAddedCb) this.registry.offDeviceAdded(this.onDeviceAddedCb);
      if (this.onDeviceRemovedCb) this.registry.offDeviceRemoved(this.onDeviceRemovedCb);
    }

    // Detach all per-device state handlers.
    for (const [friendlyName, handler] of this.stateHandlers) {
      this.registry?.offDeviceStateChange(friendlyName, handler);
    }
    this.stateHandlers.clear();
    this.accessories.clear();

    await this.bridge.unpublish();
    this.bridge = null;

    this.logger.info("HomeKit bridge unpublished");
  }

  // ---------------------------------------------------------------------------
  // Internal device management
  // ---------------------------------------------------------------------------

  /**
   * Creates a HAP accessory for the given device and adds it to the bridge.
   * Also registers a state-change listener so the accessory stays in sync.
   */
  private addAccessory(device: ZigbeeDevice): void {
    if (!this.bridge) return;

    const { friendly_name } = device;

    if (this.accessories.has(friendly_name)) {
      this.logger.debug({ device: friendly_name }, "Accessory already registered — skipping");
      return;
    }

    const created = createAccessory(device, (command) => {
      this.mqtt.publishToDevice(friendly_name, command);
    });

    if (!created) {
      this.logger.debug(
        { device: friendly_name },
        "Device has no supported HomeKit capability — skipping",
      );
      return;
    }

    this.accessories.set(friendly_name, created);

    // Seed the accessory with the current known state (if any).
    const currentState = this.registry?.getDeviceState(friendly_name);
    if (currentState) {
      try {
        created.updateState(currentState);
      } catch (err) {
        this.logger.error(
          { err, device: friendly_name },
          "Error applying initial state to HomeKit accessory",
        );
      }
    }

    // Keep the accessory updated as state changes arrive.
    const stateHandler: DeviceStateChangeHandler = (state) => {
      try {
        created.updateState(state);
      } catch (err) {
        this.logger.error({ err, device: friendly_name }, "Error updating HomeKit accessory state");
      }
    };
    this.stateHandlers.set(friendly_name, stateHandler);
    this.registry?.onDeviceStateChange(friendly_name, stateHandler);

    this.bridge.addBridgedAccessory(created.accessory);

    this.logger.debug(
      { device: friendly_name, uuid: created.accessory.UUID },
      "HomeKit accessory added",
    );
  }

  /**
   * Removes the HAP accessory for the given device from the bridge and
   * unregisters all associated listeners.
   */
  private removeAccessory(device: ZigbeeDevice): void {
    if (!this.bridge) return;

    const { friendly_name } = device;
    const created = this.accessories.get(friendly_name);
    if (!created) return;

    const stateHandler = this.stateHandlers.get(friendly_name);
    if (stateHandler) {
      this.registry?.offDeviceStateChange(friendly_name, stateHandler);
      this.stateHandlers.delete(friendly_name);
    }

    this.bridge.removeBridgedAccessory(created.accessory);
    this.accessories.delete(friendly_name);

    this.logger.debug({ device: friendly_name }, "HomeKit accessory removed");
  }
}
