/**
 * The aggregate device accessor spanning every registered `DeviceSource`, exposed
 * as `Engine.devices`. Stamps `hidden` onto every descriptor in all delivery paths.
 */
import type { Logger } from "pino";
import type { DeviceVisibility } from "../device-visibility.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "./device-source.js";
import { parseQualifiedId } from "./qualified-id.js";

/** Availability and enumeration readiness of one registered source, as reported by the aggregate. */
export interface DeviceSourceStatus {
  id: string;
  available: boolean;
  /** Whether the source has completed an authoritative enumeration; see `DeviceSource.hasEnumerated`. */
  hasEnumerated: boolean;
}

export class AggregateDeviceSource {
  private readonly byId: Map<string, DeviceSource> = new Map();
  private readonly started: Set<DeviceSource> = new Set();
  private readonly listeners: Set<DeviceChangeListener> = new Set();
  private readonly unsubscribers: Map<DeviceSource, () => void> = new Map();
  private readonly setChangedListeners: Set<() => void> = new Set();
  private readonly setChangedUnsubscribers: Map<DeviceSource, () => void> = new Map();
  private readonly allSources: DeviceSource[];

  constructor(
    sources: DeviceSource[],
    private readonly visibility: DeviceVisibility,
    private readonly logger: Logger,
  ) {
    this.allSources = sources;
    for (const source of sources) {
      this.byId.set(source.id, source);
    }
  }

  /**
   * Start every source. A source whose backing service or configuration is
   * absent, or which throws while starting, is logged and left out of the
   * running set without failing the others or this call.
   */
  async start(): Promise<void> {
    for (const source of this.allSources) {
      try {
        await source.start();
        this.started.add(source);
        this.unsubscribers.set(
          source,
          source.subscribe((descriptor) => this.notify(descriptor)),
        );
        if (source.onDeviceSetChanged) {
          this.setChangedUnsubscribers.set(
            source,
            source.onDeviceSetChanged(() => this.notifyDeviceSetChanged()),
          );
        }
      } catch (err) {
        this.logger.error(
          { err, source: source.id },
          "Device source failed to start — reporting unavailable",
        );
      }
    }
  }

  /** Stop every source that was successfully started, in the same order. */
  async stop(): Promise<void> {
    for (const source of this.started) {
      try {
        this.unsubscribers.get(source)?.();
        this.setChangedUnsubscribers.get(source)?.();
        await source.stop();
      } catch (err) {
        this.logger.error({ err, source: source.id }, "Error stopping device source");
      }
    }
    this.started.clear();
    this.unsubscribers.clear();
    this.setChangedUnsubscribers.clear();
    this.setChangedListeners.clear();
    this.listeners.clear();
  }

  /**
   * Enumerate every device from every available source, including hidden devices;
   * used to reconcile appearances, disappearances, and room membership.
   */
  list(): DeviceDescriptor[] {
    const devices: DeviceDescriptor[] = [];
    for (const source of this.allSources) {
      if (!source.available) continue;
      devices.push(...source.list().map((d) => this.stamp(d)));
    }
    return devices;
  }

  /**
   * Enumerate every visible device — {@link list} minus hidden devices — for
   * consumers that present devices to a person, such as the HomeKit bridge.
   */
  listVisible(): DeviceDescriptor[] {
    return this.list().filter((d) => !d.hidden);
  }

  /** Look up one device by qualified identifier. */
  get(qualifiedId: string): DeviceDescriptor | undefined {
    let parsed: { source: string; deviceId: string };
    try {
      parsed = parseQualifiedId(qualifiedId);
    } catch {
      return undefined;
    }
    const source = this.byId.get(parsed.source);
    if (!source?.available) return undefined;
    const descriptor = source.get(parsed.deviceId);
    return descriptor ? this.stamp(descriptor) : undefined;
  }

  /** Report which sources exist, whether each is available, and whether it has enumerated. */
  sources(): DeviceSourceStatus[] {
    return this.allSources.map((source) => ({
      id: source.id,
      available: source.available,
      hasEnumerated: source.hasEnumerated === true,
    }));
  }

  /** Dispatch a command to the device named by a qualified identifier. */
  async command(
    qualifiedId: string,
    properties: Record<string, unknown>,
  ): Promise<DeviceCommandOutcome> {
    let parsed: { source: string; deviceId: string };
    try {
      parsed = parseQualifiedId(qualifiedId);
    } catch {
      return { status: "not_found" };
    }
    const source = this.byId.get(parsed.source);
    if (!source) return { status: "not_found" };
    if (!source.available) return { status: "unavailable" };
    return source.command(parsed.deviceId, properties);
  }

  /** Subscribe to device changes across every source. Returns an unsubscribe function. */
  subscribe(listener: DeviceChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to device-set changes that arrive without a descriptor notification — a
   * removal, or a group-list change — so a consumer can reconcile disappearances.
   * Returns an unsubscribe function.
   */
  onDeviceSetChanged(listener: () => void): () => void {
    this.setChangedListeners.add(listener);
    return () => this.setChangedListeners.delete(listener);
  }

  private notify(descriptor: DeviceDescriptor): void {
    // Stamped here too: subscriber-delivered descriptors bypass list()/get(),
    // so skipping this would leave `hidden` unset on live updates.
    const stamped = this.stamp(descriptor);
    for (const listener of this.listeners) {
      try {
        listener(stamped);
      } catch (err) {
        this.logger.error({ err }, "Error in aggregate device change listener");
      }
    }
  }

  private notifyDeviceSetChanged(): void {
    for (const listener of this.setChangedListeners) {
      try {
        listener();
      } catch (err) {
        this.logger.error({ err }, "Error in aggregate device set change listener");
      }
    }
  }

  /** Stamp `hidden` onto a descriptor from the visibility store. */
  private stamp(descriptor: DeviceDescriptor): DeviceDescriptor {
    return { ...descriptor, hidden: this.visibility.isHidden(descriptor.qualifiedId) };
  }
}
