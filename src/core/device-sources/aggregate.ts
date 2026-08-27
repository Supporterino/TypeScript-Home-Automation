/**
 * The aggregate device accessor spanning every registered `DeviceSource`
 * (design.md D2; tasks 6.13, 6.13a–d).
 *
 * Exposed as `Engine.devices` — always present, never a `ServicePlugin`, and
 * never a registration point for a caller-supplied source: the source set is
 * fixed at four (Zigbee, Shelly, Nanoleaf, state toggles), constructed and
 * owned entirely by `createEngine()`. `DeviceSource` itself is exported only
 * for inspection and testing.
 */
import type { Logger } from "pino";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "./device-source.js";
import { parseQualifiedId } from "./qualified-id.js";

/** Availability of one registered source, as reported by the aggregate. */
export interface DeviceSourceStatus {
  id: string;
  available: boolean;
}

export class AggregateDeviceSource {
  private readonly byId: Map<string, DeviceSource> = new Map();
  private readonly started: Set<DeviceSource> = new Set();
  private readonly listeners: Set<DeviceChangeListener> = new Set();
  private readonly unsubscribers: Map<DeviceSource, () => void> = new Map();
  private readonly allSources: DeviceSource[];

  constructor(
    sources: DeviceSource[],
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
        await source.stop();
      } catch (err) {
        this.logger.error({ err, source: source.id }, "Error stopping device source");
      }
    }
    this.started.clear();
    this.unsubscribers.clear();
    this.listeners.clear();
  }

  /** Enumerate every device from every available source. Never fails when a source is unavailable. */
  list(): DeviceDescriptor[] {
    const devices: DeviceDescriptor[] = [];
    for (const source of this.allSources) {
      if (!source.available) continue;
      devices.push(...source.list());
    }
    return devices;
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
    return source.get(parsed.deviceId);
  }

  /** Report which sources exist and whether each is currently available. */
  sources(): DeviceSourceStatus[] {
    return this.allSources.map((source) => ({ id: source.id, available: source.available }));
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

  private notify(descriptor: DeviceDescriptor): void {
    for (const listener of this.listeners) {
      try {
        listener(descriptor);
      } catch (err) {
        this.logger.error({ err }, "Error in aggregate device change listener");
      }
    }
  }
}
