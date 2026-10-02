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
 * `listVisible()`, removing any accessory whose device is no longer present
 * or has been hidden — the same outcome the old `ZigbeeSource`'s
 * `onDeviceRemoved` listener achieved, reached generically instead of
 * per-family.
 *
 * Sourced through `devices.listVisible()` rather than `list()` (design.md
 * D9, D10; specs/homekit "Visibility-Filtered Accessory Exposure"): a hidden
 * device must never be bridged, and reproducing that filter here instead of
 * reading it from the shared device model would give the system two
 * independently maintained definitions of "hidden". A `DeviceVisibility`
 * subscription drives the same add/remove path directly, since hiding
 * produces no device notification of its own — without it, a hidden device
 * would linger in the Home app until it happened to report something.
 */
import type { Logger } from "pino";
import type { AggregateDeviceSource } from "../../device-sources/aggregate.js";
import type { DeviceDescriptor } from "../../device-sources/device-source.js";
import type { DeviceVisibility } from "../../device-visibility.js";
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
  private unsubscribeDevices: (() => void) | null = null;
  private readonly onVisibilityChange = (change: {
    qualifiedId: string;
    hidden: boolean;
  }): void => {
    if (change.hidden) {
      this.removeAccessory(change.qualifiedId);
      return;
    }
    const descriptor = this.devices.get(change.qualifiedId);
    if (descriptor && !descriptor.hidden) this.addOrUpdate(descriptor);
  };

  constructor(
    private readonly devices: AggregateDeviceSource,
    private readonly visibility: DeviceVisibility,
    private readonly logger: Logger,
    private readonly createAccessory: DescriptorAccessoryFactory,
  ) {}

  start(sink: AccessorySink): void {
    this.sink = sink;

    for (const descriptor of this.devices.listVisible()) {
      this.addOrUpdate(descriptor);
    }

    this.unsubscribeDevices = this.devices.subscribe((descriptor) => {
      if (!descriptor.hidden) this.addOrUpdate(descriptor);
      this.reconcileRemovals();
    });
    this.visibility.onChange(this.onVisibilityChange);
  }

  stop(): void {
    this.unsubscribeDevices?.();
    this.unsubscribeDevices = null;
    this.visibility.offChange(this.onVisibilityChange);
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
    const live = new Set(this.devices.listVisible().map((d) => d.qualifiedId));
    for (const qualifiedId of Array.from(this.accessories.keys())) {
      if (!live.has(qualifiedId)) {
        this.removeAccessory(qualifiedId);
      }
    }
  }

  /**
   * Removes a tracked accessory, indistinguishably from removal on
   * disappearance (design.md D10) — the accessory is removed and its
   * identifier freed, so re-adding it (on unhide, or on reappearance)
   * produces the same derived UUID and requires no re-pairing.
   */
  private removeAccessory(qualifiedId: string): void {
    if (!this.sink) return;
    if (!this.accessories.has(qualifiedId)) return;
    this.sink.remove(qualifiedId);
    this.accessories.delete(qualifiedId);
    this.logger.debug({ device: qualifiedId }, "HomeKit accessory removed");
  }
}
