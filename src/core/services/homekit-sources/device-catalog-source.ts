/**
 * The single {@link AccessorySource} `HomekitService` uses after task 6.16's
 * refactor — a thin bridge from the shared `AggregateDeviceSource` to HAP,
 * with no accessory source of its own and no direct reference to
 * `ZigbeeDevice`, `exposes`, MQTT, or Shelly RPC. Every device family flows
 * through this one class, built from `DeviceDescriptor`s alone.
 *
 * Accessories are keyed by `descriptor.qualifiedId`, which is already
 * globally unique across sources, so no additional namespacing is needed the
 * way the old per-family sources needed (`${this.name}:${id}`).
 *
 * `AggregateDeviceSource.subscribe()` only signals devices that changed, not
 * ones that disappeared (design.md's device-sources spec describes state and
 * reachability changes, not an explicit removal event). Every notification
 * therefore also reconciles the tracked accessory set against a fresh
 * `list()`, removing any accessory whose device is no longer present — the
 * same outcome the old `ZigbeeSource`'s `onDeviceRemoved` listener achieved,
 * reached generically instead of per-family.
 */
import type { Logger } from "pino";
import type { AggregateDeviceSource } from "../../device-sources/aggregate.js";
import type { DeviceDescriptor } from "../../device-sources/device-source.js";
import type { CreatedAccessory } from "../homekit-descriptor-factory.js";
import type { AccessorySink, AccessorySource } from "./accessory-source.js";

/** Factory signature for building a HomeKit accessory from a device descriptor. */
export type DescriptorAccessoryFactory = (
  descriptor: DeviceDescriptor,
  onSet: (properties: Record<string, unknown>) => void,
  onWarn?: (message: string, context: Record<string, unknown>) => void,
) => CreatedAccessory | null;

export class DeviceCatalogSource implements AccessorySource {
  readonly name = "device-catalog";

  private sink: AccessorySink | null = null;
  /** Maps qualifiedId → CreatedAccessory (for state updates + removal). */
  private readonly accessories: Map<string, CreatedAccessory> = new Map();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly devices: AggregateDeviceSource,
    private readonly logger: Logger,
    private readonly createAccessory: DescriptorAccessoryFactory,
  ) {}

  start(sink: AccessorySink): void {
    this.sink = sink;

    for (const descriptor of this.devices.list()) {
      this.addOrUpdate(descriptor);
    }

    this.unsubscribe = this.devices.subscribe((descriptor) => {
      this.addOrUpdate(descriptor);
      this.reconcileRemovals();
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.accessories.clear();
    this.sink = null;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private addOrUpdate(descriptor: DeviceDescriptor): void {
    if (!this.sink) return;

    const existing = this.accessories.get(descriptor.qualifiedId);
    if (existing) {
      try {
        existing.updateState(descriptor.state);
      } catch (err) {
        this.logger.error(
          { err, device: descriptor.qualifiedId },
          "Error updating HomeKit accessory state",
        );
      }
      return;
    }

    const created = this.createAccessory(
      descriptor,
      (properties) => {
        void this.devices.command(descriptor.qualifiedId, properties).catch((err: unknown) => {
          this.logger.error(
            { err, device: descriptor.qualifiedId },
            "Device command dispatch failed",
          );
        });
      },
      (message, context) => this.logger.warn(context, message),
    );

    if (!created) {
      this.logger.debug(
        { device: descriptor.qualifiedId },
        "Device has no supported HomeKit capability — skipping",
      );
      return;
    }

    try {
      created.updateState(descriptor.state);
    } catch (err) {
      this.logger.error(
        { err, device: descriptor.qualifiedId },
        "Error applying initial state to HomeKit accessory",
      );
    }
    this.accessories.set(descriptor.qualifiedId, created);
    this.sink.add(descriptor.qualifiedId, created);

    this.logger.debug(
      { device: descriptor.qualifiedId, uuid: created.accessory.UUID },
      "HomeKit accessory added",
    );
  }

  private reconcileRemovals(): void {
    if (!this.sink) return;
    const live = new Set(this.devices.list().map((d) => d.qualifiedId));
    for (const qualifiedId of Array.from(this.accessories.keys())) {
      if (!live.has(qualifiedId)) {
        this.sink.remove(qualifiedId);
        this.accessories.delete(qualifiedId);
        this.logger.debug({ device: qualifiedId }, "HomeKit accessory removed");
      }
    }
  }
}
