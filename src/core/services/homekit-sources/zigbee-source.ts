import type { Logger } from "pino";
import type { ZigbeeDevice } from "../../../types/zigbee/bridge.js";
import type { MqttService } from "../../mqtt/mqtt-service.js";
import type {
  DeviceAddedHandler,
  DeviceRegistry,
  DeviceRemovedHandler,
  DeviceStateChangeHandler,
} from "../../zigbee/device-registry.js";
import type { CreatedAccessory } from "../homekit-accessory-factory.js";
import type { AccessorySink, AccessorySource } from "./accessory-source.js";

/** Factory signature for building a HomeKit accessory from a Zigbee device. */
export type ZigbeeAccessoryFactory = (
  device: ZigbeeDevice,
  onSet: (command: Record<string, unknown>) => void,
) => CreatedAccessory | null;

/**
 * An {@link AccessorySource} that bridges Zigbee2MQTT devices into HomeKit.
 *
 * On `start(sink)` it replays the current `DeviceRegistry` inventory, subscribes
 * to device join/leave events, wires per-device state changes, and routes
 * HomeKit write-back through `mqtt.publishToDevice`. Behavior is preserved from
 * the previous inline implementation in `HomekitService`.
 */
export class ZigbeeSource implements AccessorySource {
  readonly name = "zigbee";

  private sink: AccessorySink | null = null;

  /** Maps friendly_name → CreatedAccessory (for state updates + cleanup). */
  private readonly accessories: Map<string, CreatedAccessory> = new Map();

  /** Per-device state-change handlers keyed by friendly_name (for cleanup). */
  private readonly stateHandlers: Map<string, DeviceStateChangeHandler> = new Map();

  private onDeviceAddedCb: DeviceAddedHandler | null = null;
  private onDeviceRemovedCb: DeviceRemovedHandler | null = null;

  constructor(
    private readonly registry: DeviceRegistry,
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
    private readonly createAccessory: ZigbeeAccessoryFactory,
  ) {}

  start(sink: AccessorySink): void {
    this.sink = sink;

    // Register all devices that are already known.
    for (const device of this.registry.getDevices()) {
      this.addAccessory(device);
    }

    // Subscribe to dynamic device join/leave events.
    this.onDeviceAddedCb = (device) => this.addAccessory(device);
    this.onDeviceRemovedCb = (device) => this.removeAccessory(device);
    this.registry.onDeviceAdded(this.onDeviceAddedCb);
    this.registry.onDeviceRemoved(this.onDeviceRemovedCb);
  }

  stop(): void {
    // Detach dynamic event listeners.
    if (this.onDeviceAddedCb) this.registry.offDeviceAdded(this.onDeviceAddedCb);
    if (this.onDeviceRemovedCb) this.registry.offDeviceRemoved(this.onDeviceRemovedCb);
    this.onDeviceAddedCb = null;
    this.onDeviceRemovedCb = null;

    // Detach all per-device state handlers.
    for (const [friendlyName, handler] of this.stateHandlers) {
      this.registry.offDeviceStateChange(friendlyName, handler);
    }
    this.stateHandlers.clear();
    this.accessories.clear();
    this.sink = null;
  }

  // ---------------------------------------------------------------------------
  // Internal device management
  // ---------------------------------------------------------------------------

  /**
   * Creates a HAP accessory for the given device and adds it through the sink.
   * Also registers a state-change listener so the accessory stays in sync.
   */
  private addAccessory(device: ZigbeeDevice): void {
    if (!this.sink) return;

    const { friendly_name } = device;

    if (this.accessories.has(friendly_name)) {
      this.logger.debug({ device: friendly_name }, "Accessory already registered — skipping");
      return;
    }

    const created = this.createAccessory(device, (command) => {
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
    const currentState = this.registry.getDeviceState(friendly_name);
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
    this.registry.onDeviceStateChange(friendly_name, stateHandler);

    this.sink.add(`${this.name}:${friendly_name}`, created);

    this.logger.debug(
      { device: friendly_name, uuid: created.accessory.UUID },
      "HomeKit accessory added",
    );
  }

  /**
   * Removes the HAP accessory for the given device through the sink and
   * unregisters all associated listeners.
   */
  private removeAccessory(device: ZigbeeDevice): void {
    if (!this.sink) return;

    const { friendly_name } = device;
    const created = this.accessories.get(friendly_name);
    if (!created) return;

    const stateHandler = this.stateHandlers.get(friendly_name);
    if (stateHandler) {
      this.registry.offDeviceStateChange(friendly_name, stateHandler);
      this.stateHandlers.delete(friendly_name);
    }

    this.sink.remove(`${this.name}:${friendly_name}`);
    this.accessories.delete(friendly_name);

    this.logger.debug({ device: friendly_name }, "HomeKit accessory removed");
  }
}
