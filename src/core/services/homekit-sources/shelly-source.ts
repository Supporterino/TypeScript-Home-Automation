import type { Logger } from "pino";
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
 * HomeKit over HTTP (no MQTT).
 *
 * On `start(sink)` it replays `ShellyService.getDevices()`, subscribes to
 * `onDeviceRegistered` (so devices registered after startup are picked up),
 * builds accessories via the Shelly factory, wires HomeKit write-back to
 * `ShellyService` methods, and runs a single global polling loop that refreshes
 * every device's status each tick.
 */
export class ShellySource implements AccessorySource {
  readonly name = "shelly";

  private sink: AccessorySink | null = null;

  /** Maps device name → CreatedAccessory (for state updates + cleanup). */
  private readonly accessories: Map<string, CreatedAccessory> = new Map();

  private onRegisteredCb: ((device: ShellyDevice) => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly shelly: ShellyService,
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

    // Start the global poll loop.
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
    this.accessories.clear();
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
    this.sink.add(`${this.name}:${device.name}`, created);

    this.logger.debug(
      { device: device.name, uuid: created.accessory.UUID },
      "Shelly HomeKit accessory added",
    );
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
   * One poll tick: iterate the *live* device list, fetch each device's status,
   * normalize, and push into its accessory. Per-device errors are caught,
   * logged, and skipped so one unreachable device cannot abort the tick.
   */
  private async poll(): Promise<void> {
    for (const device of this.shelly.getDevices()) {
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
