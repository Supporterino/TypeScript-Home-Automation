import type { Logger } from "pino";
import type { MqttMessageHandler, MqttService } from "../../mqtt/mqtt-service.js";
import type { CreatedAccessory } from "../homekit-accessory-factory.js";
import type { ShellyAccessoryCommand } from "../homekit-shelly-factory.js";
import type { ShellyDevice, ShellyService } from "../shelly-service.js";
import type { AccessorySink, AccessorySource } from "./accessory-source.js";

/** Factory signature for building a HomeKit accessory from a Shelly device. */
export type ShellyAccessoryFactory = (
  device: ShellyDevice,
  onSet: (command: ShellyAccessoryCommand) => void,
  onWarn?: (message: string, context: Record<string, unknown>) => void,
) => CreatedAccessory | null;

/** Default poll interval for Shelly status refresh (ms). */
export const DEFAULT_SHELLY_POLL_INTERVAL_MS = 10000;

/**
 * An {@link AccessorySource} that bridges registered Shelly devices into
 * HomeKit, over either HTTP or MQTT depending on each device's transport.
 *
 * On `start(sink)` it replays `ShellyService.getDevices()`, subscribes to
 * `onDeviceRegistered` (so devices registered after startup are picked up),
 * builds accessories via the Shelly factory, wires HomeKit write-back to
 * `ShellyService` methods, and runs a single global HTTP polling loop scoped to
 * HTTP-transport devices only. MQTT-transport devices instead get push status
 * (`<topicPrefix>/events/rpc`) and presence (`<topicPrefix>/online`)
 * subscriptions.
 */
/** Per-device MQTT subscription handles, tracked so `stop()` can unsubscribe them. */
interface MqttSubscriptionHandles {
  eventsTopic: string;
  eventsHandler: MqttMessageHandler;
  onlineTopic: string;
  onlineHandler: MqttMessageHandler;
}

export class ShellySource implements AccessorySource {
  readonly name = "shelly";

  private sink: AccessorySink | null = null;

  /** Maps device name → CreatedAccessory (for state updates + cleanup). */
  private readonly accessories: Map<string, CreatedAccessory> = new Map();

  /** Maps device name → registered device (needed to look up type/transport in handlers). */
  private readonly devicesByName: Map<string, ShellyDevice> = new Map();

  /** Maps device name → MQTT subscription handles, for MQTT-transport devices only. */
  private readonly mqttSubscriptions: Map<string, MqttSubscriptionHandles> = new Map();

  private onRegisteredCb: ((device: ShellyDevice) => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly shelly: ShellyService,
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
    private readonly buildAccessory: ShellyAccessoryFactory,
    private readonly pollIntervalMs: number = DEFAULT_SHELLY_POLL_INTERVAL_MS,
  ) {}

  start(sink: AccessorySink): void {
    this.sink = sink;

    // Replay already-registered devices.
    for (const device of this.shelly.getDevices()) {
      this.addAccessory(device);
    }

    // React to devices registered later (including at runtime).
    this.onRegisteredCb = (device) => this.addAccessory(device);
    this.shelly.onDeviceRegistered(this.onRegisteredCb);

    // Start the global poll loop (HTTP-transport devices only — see `poll()`).
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.onRegisteredCb) {
      this.shelly.offDeviceRegistered(this.onRegisteredCb);
      this.onRegisteredCb = null;
    }
    for (const [name] of this.mqttSubscriptions) {
      this.removeMqttSubscriptions(name);
    }
    this.accessories.clear();
    this.devicesByName.clear();
    this.sink = null;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private addAccessory(device: ShellyDevice): void {
    if (!this.sink) return;

    if (this.accessories.has(device.name)) {
      this.logger.debug({ device: device.name }, "Shelly accessory already registered — skipping");
      return;
    }

    const created = this.buildAccessory(
      device,
      (command) => {
        void this.handleWriteBack(device, command);
      },
      (message, context) => this.logger.warn(context, message),
    );

    if (!created) {
      this.logger.debug(
        { device: device.name, type: device.type },
        "Shelly device has no supported HomeKit mapping — skipping",
      );
      return;
    }

    this.accessories.set(device.name, created);
    this.devicesByName.set(device.name, device);
    this.sink.add(`${this.name}:${device.name}`, created);

    this.logger.debug(
      { device: device.name, uuid: created.accessory.UUID },
      "Shelly HomeKit accessory added",
    );

    if (device.transport === "mqtt" && device.topicPrefix) {
      this.addMqttSubscriptions(device);
    }
  }

  /**
   * Subscribe to an MQTT-transport device's push status (`events/rpc`) and
   * presence (`online`) topics, tracking the handles so `stop()` (or future
   * device removal) can symmetrically unsubscribe them.
   */
  private addMqttSubscriptions(device: ShellyDevice): void {
    const topicPrefix = device.topicPrefix as string;
    const eventsTopic = `${topicPrefix}/events/rpc`;
    const onlineTopic = `${topicPrefix}/online`;

    const eventsHandler: MqttMessageHandler = (_topic, payload) => {
      this.handleNotifyStatus(device, payload);
    };
    const onlineHandler: MqttMessageHandler = (_topic, payload) => {
      this.handleOnline(device, payload as unknown);
    };

    this.mqtt.subscribe(eventsTopic, eventsHandler);
    this.mqtt.subscribe(onlineTopic, onlineHandler);

    this.mqttSubscriptions.set(device.name, {
      eventsTopic,
      eventsHandler,
      onlineTopic,
      onlineHandler,
    });
  }

  /** Unsubscribe a device's MQTT push status/presence topics, if any. */
  private removeMqttSubscriptions(deviceName: string): void {
    const handles = this.mqttSubscriptions.get(deviceName);
    if (!handles) return;
    this.mqtt.unsubscribe(handles.eventsTopic, handles.eventsHandler);
    this.mqtt.unsubscribe(handles.onlineTopic, handles.onlineHandler);
    this.mqttSubscriptions.delete(deviceName);
  }

  /**
   * Handle a `NotifyStatus` push notification for an MQTT-transport device,
   * normalizing the relevant component's status and pushing it to the
   * accessory's `updateState` — mirroring the HTTP poll loop's data shape.
   * Malformed/unexpected payloads are logged and skipped without crashing or
   * affecting other devices.
   */
  private handleNotifyStatus(device: ShellyDevice, payload: Record<string, unknown>): void {
    const created = this.accessories.get(device.name);
    if (!created) return;

    if (payload?.method !== "NotifyStatus") return;

    const params = payload.params;
    if (params === null || typeof params !== "object") {
      this.logger.warn(
        { device: device.name, payload },
        "Received malformed Shelly NotifyStatus (missing params) — skipping",
      );
      return;
    }

    const componentKey = device.type === "cover" ? "cover:0" : "switch:0";
    const component = (params as Record<string, unknown>)[componentKey];
    if (component === undefined || component === null || typeof component !== "object") {
      this.logger.warn(
        { device: device.name, componentKey },
        "Shelly NotifyStatus missing expected component — skipping",
      );
      return;
    }

    created.updateState(component as Record<string, unknown>);
  }

  /**
   * Handle a presence update on an MQTT-transport device's `online` topic,
   * marking the corresponding accessory reachable/unreachable.
   */
  private handleOnline(device: ShellyDevice, payload: unknown): void {
    const created = this.accessories.get(device.name);
    if (!created) return;

    if (typeof payload !== "boolean") {
      this.logger.warn(
        { device: device.name, payload },
        "Received malformed Shelly online payload — skipping",
      );
      return;
    }

    created.accessory.updateReachability(payload);
    this.logger.debug({ device: device.name, reachable: payload }, "Shelly presence updated");
  }

  /** Route a HomeKit write-back command to the appropriate ShellyService call. */
  private async handleWriteBack(
    device: ShellyDevice,
    command: ShellyAccessoryCommand,
  ): Promise<void> {
    try {
      if ("on" in command) {
        if (command.on) {
          await this.shelly.turnOn(device.name);
        } else {
          await this.shelly.turnOff(device.name);
        }
      } else if ("position" in command) {
        await this.shelly.coverGoToPosition(device.name, command.position);
      } else if ("stop" in command) {
        await this.shelly.coverStop(device.name);
      }
    } catch (err) {
      this.logger.error({ err, device: device.name }, "Shelly write-back failed");
    }
  }

  /**
   * One poll tick: iterate the *live* list of HTTP-transport devices only
   * (MQTT-transport devices are bridged via push status/presence instead —
   * see `addMqttSubscriptions`), fetch each device's status, normalize, and
   * push into its accessory. Per-device errors are caught, logged, and skipped
   * so one unreachable device cannot abort the tick.
   */
  private async poll(): Promise<void> {
    for (const device of this.shelly.getDevices()) {
      if (device.transport !== "http") continue;

      const created = this.accessories.get(device.name);
      if (!created) continue;

      try {
        const state =
          device.type === "cover"
            ? await this.shelly.getCoverStatus(device.name)
            : await this.shelly.getStatus(device.name);
        created.updateState(state as unknown as Record<string, unknown>);
      } catch (err) {
        this.logger.error({ err, device: device.name }, "Shelly poll failed for device — skipping");
      }
    }
  }
}
