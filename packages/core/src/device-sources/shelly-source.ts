/**
 * The Shelly `DeviceSource`. Expands each physical registration into one logical
 * entry per discovered `switch:N`/`cover:N` component, push-backed over MQTT and
 * polled over HTTP.
 */

import type {
  ShellyComponentKind,
  ShellyCoverStatus,
  ShellyDeviceType,
  ShellyDiscoveredComponent,
  ShellySwitchStatus,
} from "@ts-ha/shared/types/shelly";
import type { Logger } from "pino";
import type { MqttMessageHandler, MqttService } from "../mqtt/mqtt-service.js";
import type { ShellyDevice, ShellyService } from "../services/shelly-service.js";
import { validateCommand } from "./command-validation.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceObservation,
  DeviceSource,
} from "./device-source.js";
import { qualifyDeviceId } from "./device-source.js";
import type { DeviceStateStore } from "./device-state-store.js";
import { shellyCapabilitiesFor } from "./shelly-capabilities.js";

export const SHELLY_SOURCE_ID = "shelly";

/** Default poll interval for HTTP-transport Shelly devices, in milliseconds. */
export const DEFAULT_SHELLY_SOURCE_POLL_MS = 10000;

/** Per-channel tracked runtime state, normalised to the shared property names. */
interface TrackedShellyState {
  state: Record<string, unknown>;
  reachable: boolean;
  /** Whether this channel is known to be metered from discovery or a live reading. */
  metered: boolean;
  observation: DeviceObservation;
}

/** One logical Shelly device: a physical registration plus a component channel. */
interface ShellyLogicalEntry {
  /** Logical device id, unique within the source. */
  id: string;
  /** Name of the physical registration this entry belongs to. */
  baseName: string;
  /** Component channel this entry addresses. */
  channel: number;
  /** Discovered component kind (`switch` vs `cover`). */
  kind: ShellyComponentKind;
  /** Effective type (cover, else the registration's switch/outlet). */
  type: ShellyDeviceType;
  /** The component's configured name, or null when it has none. */
  configuredName: string | null;
  /** Channel-qualified fallback label, used when the configured name is not usable. */
  defaultLabel: string;
  /** A single-component entry keeps the base registration's identity unchanged. */
  baseIdentity: boolean;
  /** Human-facing name that distinguishes the channel. */
  displayName: string;
  /**
   * Whether this entry is retained from a previous discovery because its channel
   * is absent from the current inventory; retained entries are enumerated but
   * unreachable and never commandable.
   */
  retained: boolean;
}

/** Per-physical-device MQTT subscription handles, tracked so `stop()` can unsubscribe them. */
interface MqttSubscriptionHandles {
  eventsTopic: string;
  eventsHandler: MqttMessageHandler;
  onlineTopic: string;
  onlineHandler: MqttMessageHandler;
}

/** A provisional entry before global id-uniqueness resolution. */
interface ProvisionalEntry {
  entry: ShellyLogicalEntry;
  /** Ordered id candidates; the first not already assigned wins. */
  idCandidates: string[];
  /** A single-component entry keeps the base registration's identity unchanged. */
  keepBaseIdentity: boolean;
}

/**
 * Pick the first candidate id not already used, falling back to a
 * deterministically suffixed variant of the last candidate.
 */
function pickUniqueId(candidates: string[], used: ReadonlySet<string>): string {
  for (const candidate of candidates) {
    if (!used.has(candidate)) return candidate;
  }
  const base = candidates[candidates.length - 1];
  let suffix = 2;
  let candidate = `${base}_${suffix}`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  return candidate;
}

/**
 * Keep only the keys a normalized state patch actually defines, so merging a
 * partial frame never overwrites a seeded value with `undefined`.
 */
function definedState(state: Record<string, unknown>): Record<string, unknown> {
  const defined: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (value !== undefined) defined[key] = value;
  }
  return defined;
}

export class ShellyDeviceSource implements DeviceSource {
  readonly id = SHELLY_SOURCE_ID;

  private readonly listeners: Set<DeviceChangeListener> = new Set();
  /** Per-channel-entry state, keyed by logical device id. */
  private readonly tracked: Map<string, TrackedShellyState> = new Map();
  /**
   * Time each logical channel last received a push notification, keyed by
   * `entryKey` so it survives an id re-resolution; used to drop stale seeds.
   */
  private readonly lastPushAt: Map<string, number> = new Map();
  /** One subscription per physical device, keyed by its registration name. */
  private readonly mqttSubscriptions: Map<string, MqttSubscriptionHandles> = new Map();
  /** Materialized logical entries, keyed by logical device id. */
  private readonly entries: Map<string, ShellyLogicalEntry> = new Map();
  /** Reverse index from `baseName` + channel to logical id. */
  private readonly entryKeys: Map<string, string> = new Map();
  /** Physical registrations seen by the source, keyed by base name. */
  private readonly registrations: Map<string, ShellyDevice> = new Map();
  /** Latest discovery result per physical device. */
  private readonly discoveredComponents: Map<string, ShellyDiscoveredComponent[]> = new Map();
  /** In-flight discovery per physical device, so concurrent lookups share one run. */
  private readonly discoveryInFlight: Map<string, Promise<void>> = new Map();
  private onRegisteredCb: ((device: ShellyDevice) => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * Monotonic lifecycle generation, bumped by `start()` and `stop()` so an
   * in-flight discovery cannot resume a stopped source.
   */
  private generation = 0;
  /** Whether the discovery sweep has completed since the last `start()`. */
  private enumerated = false;

  constructor(
    private readonly shelly: ShellyService | null,
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = DEFAULT_SHELLY_SOURCE_POLL_MS,
    private readonly deviceStateStore?: DeviceStateStore,
  ) {}

  get available(): boolean {
    return this.shelly !== null;
  }

  /** True once `start()`'s discovery sweep has resolved; the inventory is config-driven. */
  get hasEnumerated(): boolean {
    return this.enumerated;
  }

  async start(): Promise<void> {
    if (!this.shelly) return;
    const generation = ++this.generation;

    // Install the late-registration hook before the initial sweep.
    this.onRegisteredCb = (device) => {
      void this.discoverDevice(device, generation).catch((err) =>
        this.logger.error({ err, device: device.name }, "Shelly late discovery failed"),
      );
    };
    this.shelly.onDeviceRegistered(this.onRegisteredCb);

    // Await discovery for every already-registered device so enumeration is complete.
    const devices = this.shelly.getDevices();
    await Promise.all(
      devices.map((device) =>
        this.discoverDevice(device, generation).catch((err) => {
          this.logger.error(
            { err, device: device.name },
            "Shelly component discovery failed for device — continuing with others",
          );
        }),
      ),
    );

    // `stop()` may have run during the await; do not let this lifecycle resume.
    if (generation !== this.generation) return;

    // The inventory sweep is complete; destructive reconciliation may now run.
    this.enumerated = true;

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    this.generation += 1;
    this.enumerated = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.onRegisteredCb && this.shelly) {
      this.shelly.offDeviceRegistered(this.onRegisteredCb);
    }
    this.onRegisteredCb = null;
    this.shelly?.clearChannelRecords();
    for (const name of Array.from(this.mqttSubscriptions.keys())) {
      this.removeMqttSubscriptions(name);
    }
    this.tracked.clear();
    this.lastPushAt.clear();
    this.entries.clear();
    this.entryKeys.clear();
    this.registrations.clear();
    this.discoveredComponents.clear();
    this.discoveryInFlight.clear();
    this.listeners.clear();
  }

  list(): DeviceDescriptor[] {
    return Array.from(this.entries.values()).map((entry) => this.toDescriptor(entry));
  }

  get(deviceId: string): DeviceDescriptor | undefined {
    const entry = this.entries.get(deviceId);
    return entry ? this.toDescriptor(entry) : undefined;
  }

  async command(
    deviceId: string,
    properties: Record<string, unknown>,
  ): Promise<DeviceCommandOutcome> {
    if (!this.shelly) return { status: "unavailable" };
    const entry = this.entries.get(deviceId);
    if (!entry) return { status: "not_found" };
    // A retained channel is unreachable; reject it rather than dispatching.
    if (entry.retained) return { status: "not_found" };

    const validation = validateCommand(shellyCapabilitiesFor(entry.type), properties);
    if (!validation.ok) return { status: "invalid", error: validation.error };

    try {
      if (entry.type === "cover") {
        if (typeof properties.position === "number") {
          await this.shelly.coverGoToPosition(entry.id, properties.position);
        }
        // Validation confined `action` to the declared enum; map each to its `Cover.*` primitive.
        if (properties.action === "open") {
          await this.shelly.coverOpen(entry.id);
        } else if (properties.action === "close") {
          await this.shelly.coverClose(entry.id);
        } else if (properties.action === "stop") {
          await this.shelly.coverStop(entry.id);
        }
      } else if (typeof properties.on === "boolean") {
        if (properties.on) {
          await this.shelly.turnOn(entry.id);
        } else {
          await this.shelly.turnOff(entry.id);
        }
      }
    } catch (err) {
      this.logger.error({ err, device: entry.id }, "Shelly command dispatch failed");
      throw err;
    }
    return { status: "ok" };
  }

  subscribe(listener: DeviceChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Discovery and materialization
  // ---------------------------------------------------------------------------

  /**
   * Discover a physical device's components and materialize its logical entries.
   * Idempotent: concurrent and repeated runs reuse the in-flight promise.
   */
  private discoverDevice(device: ShellyDevice, generation: number): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();

    const existing = this.discoveryInFlight.get(device.name);
    if (existing) return existing;

    const promise = this.runDiscovery(device, generation).finally(() => {
      if (this.discoveryInFlight.get(device.name) === promise) {
        this.discoveryInFlight.delete(device.name);
      }
    });
    this.discoveryInFlight.set(device.name, promise);
    return promise;
  }

  private async runDiscovery(device: ShellyDevice, generation: number): Promise<void> {
    if (!this.shelly) return;
    if (generation !== this.generation) return;

    this.registrations.set(device.name, device);
    if (device.transport === "mqtt" && device.topicPrefix) {
      this.addMqttSubscriptions(device);
    }

    let components: ShellyDiscoveredComponent[] = [];
    try {
      components = await this.shelly.discoverComponents(device.name);
    } catch (err) {
      this.logger.error({ err, device: device.name }, "Shelly component discovery failed");
      components = [];
    }

    // `stop()` (or a fresh `start()`) may have run while discovery was in
    // flight; do not resurrect state for a lifecycle that has ended.
    if (generation !== this.generation) return;

    this.discoveredComponents.set(device.name, components);
    this.rebuildEntries();

    // Seed every MQTT-transport entry's current status so `start()` and late
    // registration both enumerate complete descriptors.
    await this.seedMqttEntries(device.name, generation);
  }

  /**
   * Recompute the logical entry set from the latest discovery results; vanished
   * channels are retained and marked unreachable rather than dropped.
   */
  private rebuildEntries(): void {
    const provisional: ProvisionalEntry[] = [];

    // Count component names across all devices so a name is an identity only when unique.
    const nameCounts = new Map<string, number>();
    for (const components of this.discoveredComponents.values()) {
      for (const component of components) {
        if (component.name === null) continue;
        nameCounts.set(component.name, (nameCounts.get(component.name) ?? 0) + 1);
      }
    }

    // A channel carrying more than one component kind (e.g. `switch:0` and
    // `cover:0`) cannot be disambiguated by the channel number alone.
    const ambiguousChannels = new Map<string, Set<number>>();
    for (const [baseName, components] of this.discoveredComponents) {
      const kindsByChannel = new Map<number, Set<ShellyComponentKind>>();
      for (const component of components) {
        let kinds = kindsByChannel.get(component.channel);
        if (!kinds) {
          kinds = new Set();
          kindsByChannel.set(component.channel, kinds);
        }
        kinds.add(component.kind);
      }
      const ambiguous = new Set<number>();
      for (const [channel, kinds] of kindsByChannel) {
        if (kinds.size > 1) ambiguous.add(channel);
      }
      ambiguousChannels.set(baseName, ambiguous);
    }

    for (const [baseName, components] of this.discoveredComponents) {
      const base = this.registrations.get(baseName);
      if (!base) continue;

      if (components.length <= 1) {
        // A single component is the base registration's logical entry.
        const component = components[0];
        const kind: ShellyComponentKind =
          component?.kind ?? (base.type === "cover" ? "cover" : "switch");
        provisional.push({
          entry: {
            id: baseName,
            baseName,
            channel: component?.channel ?? 0,
            kind,
            type: component ? this.effectiveType(base.type, component.kind) : base.type,
            configuredName: null,
            defaultLabel: baseName,
            baseIdentity: true,
            displayName: baseName,
            retained: false,
          },
          idCandidates: [baseName],
          keepBaseIdentity: true,
        });
        continue;
      }

      const ambiguous = ambiguousChannels.get(baseName);
      for (const component of components) {
        const nameIsUnique = component.name !== null && (nameCounts.get(component.name) ?? 0) === 1;
        const isAmbiguous = ambiguous?.has(component.channel) ?? false;
        const defaultLabel = isAmbiguous
          ? `${baseName} ${component.kind} ${component.channel}`
          : `${baseName} ${component.channel}`;
        const idCandidates: string[] = [];
        if (nameIsUnique && component.name !== null) idCandidates.push(component.name);
        idCandidates.push(this.channelId(baseName, component.channel));
        idCandidates.push(this.kindChannelId(baseName, component.kind, component.channel));
        provisional.push({
          entry: {
            id: idCandidates[0],
            baseName,
            channel: component.channel,
            kind: component.kind,
            type: this.effectiveType(base.type, component.kind),
            configuredName: component.name,
            defaultLabel,
            baseIdentity: false,
            displayName: defaultLabel,
            retained: false,
          },
          idCandidates,
          keepBaseIdentity: false,
        });
      }
    }

    // Resolve ids against every base registration name and assigned id, in a
    // deterministic order so collisions resolve identically across restarts.
    const orderedProvisional = [...provisional].sort((a, b) => {
      const byBaseName = a.entry.baseName.localeCompare(b.entry.baseName);
      if (byBaseName !== 0) return byBaseName;
      const byKind = a.entry.kind.localeCompare(b.entry.kind);
      if (byKind !== 0) return byKind;
      return a.entry.channel - b.entry.channel;
    });
    const usedIds = new Set<string>(this.registrations.keys());
    for (const provisionalEntry of orderedProvisional) {
      if (provisionalEntry.keepBaseIdentity) {
        // A single-component entry intentionally keeps its own registration name.
        provisionalEntry.entry.id = provisionalEntry.entry.baseName;
        continue;
      }
      const id = pickUniqueId(provisionalEntry.idCandidates, usedIds);
      provisionalEntry.entry.id = id;
      usedIds.add(id);
    }

    // Materialize the merged logical entry set; display names are assigned
    // afterwards in one pass over the complete set.
    const merged: Map<string, ShellyLogicalEntry> = new Map();
    const mergedKeys: Map<string, string> = new Map();
    for (const provisionalEntry of provisional) {
      merged.set(provisionalEntry.entry.id, provisionalEntry.entry);
      mergedKeys.set(
        this.entryKey(
          provisionalEntry.entry.baseName,
          provisionalEntry.entry.kind,
          provisionalEntry.entry.channel,
        ),
        provisionalEntry.entry.id,
      );
    }

    // Retain prior entries whose channel vanished; reserve their ids first and
    // re-resolve any that collide with a live entry to a fresh unique id.
    const mergeRetained: Array<{ key: string; old: ShellyLogicalEntry }> = [];
    for (const old of this.entries.values()) {
      const key = this.entryKey(old.baseName, old.kind, old.channel);
      if (mergedKeys.has(key)) continue;
      mergeRetained.push({ key, old });
    }
    for (const { old } of mergeRetained) usedIds.add(old.id);

    const retained: ShellyLogicalEntry[] = [];
    for (const { key, old } of mergeRetained) {
      let entry = old;
      if (merged.has(old.id) || this.registrations.has(old.id)) {
        const id = pickUniqueId(
          [
            this.channelId(old.baseName, old.channel),
            this.kindChannelId(old.baseName, old.kind, old.channel),
          ],
          usedIds,
        );
        usedIds.add(id);
        // Carry the retained channel's tracked state onto its new id so the
        // live claimant of the old id starts from a clean slate.
        const state = this.tracked.get(old.id);
        if (state) {
          this.tracked.set(id, state);
          this.tracked.delete(old.id);
        }
        entry = { ...old, id };
      }
      entry = { ...entry, retained: true };
      merged.set(entry.id, entry);
      mergedKeys.set(key, entry.id);
      retained.push(entry);
    }

    // Assign human-facing labels in one deterministic pass over the merged set
    // so no two entries can share a label.
    this.resolveDisplayNames(merged.values());

    const removedIds = new Set(this.entries.keys());
    this.entries.clear();
    for (const [id, entry] of merged) this.entries.set(id, entry);
    this.entryKeys.clear();
    for (const [key, id] of mergedKeys) this.entryKeys.set(key, id);

    // Materialize the service-side channel records that let a command addressed
    // by logical id thread the right RPC channel; records no longer backed by an
    // entry are pruned.
    if (this.shelly) {
      const keepByBase = new Map<string, Set<string>>();
      for (const entry of this.entries.values()) {
        let keep = keepByBase.get(entry.baseName);
        if (!keep) {
          keep = new Set();
          keepByBase.set(entry.baseName, keep);
        }
        keep.add(entry.id);
      }

      for (const [baseName, components] of this.discoveredComponents) {
        const keep = keepByBase.get(baseName) ?? new Set<string>();
        for (const component of components) {
          const id = this.entryKeys.get(this.entryKey(baseName, component.kind, component.channel));
          const entry = id ? this.entries.get(id) : undefined;
          if (!entry) continue;
          if (components.length <= 1 && entry.channel === 0) continue;
          this.shelly.registerChannel(baseName, entry.channel, {
            name: entry.id,
            type: entry.type,
          });
        }
        // A single-component device at channel 0 needs no channel record; drop
        // its base id from the keep set so a stale record is pruned.
        const baseEntry = this.entries.get(baseName);
        if (components.length <= 1 && baseEntry?.channel === 0) {
          keep.delete(baseName);
        }
        this.shelly.pruneChannels(baseName, keep);
      }
    }

    for (const id of removedIds) {
      if (!merged.has(id)) this.tracked.delete(id);
    }

    for (const entry of this.entries.values()) {
      const metered = this.componentMetered(entry);
      const existing = this.tracked.get(entry.id);
      if (!existing) {
        // Seed metering from discovery and state/observation from the durable
        // store, so first enumeration is complete before any poll or notification.
        this.tracked.set(entry.id, this.trackedFor(entry));
      } else if (metered) {
        existing.metered = true;
      }
    }

    // A retained entry is unreachable because discovery no longer reports its
    // channel for a device it still knows about.
    for (const entry of retained) {
      if (this.discoveredComponents.has(entry.baseName)) {
        this.updateTracked(entry.id, { reachable: false });
      }
    }
  }

  /**
   * Assign every entry's human-facing label in a single deterministic pass so
   * labels are globally unique and independent of discovery order.
   */
  private resolveDisplayNames(entries: Iterable<ShellyLogicalEntry>): void {
    const all = Array.from(entries);
    const used = new Set<string>(this.registrations.keys());

    const configuredNameCounts = new Map<string, number>();
    for (const entry of all) {
      if (entry.configuredName === null) continue;
      configuredNameCounts.set(
        entry.configuredName,
        (configuredNameCounts.get(entry.configuredName) ?? 0) + 1,
      );
    }

    const ordered = [...all].sort((a, b) => {
      const byBaseName = a.baseName.localeCompare(b.baseName);
      if (byBaseName !== 0) return byBaseName;
      const byKind = a.kind.localeCompare(b.kind);
      if (byKind !== 0) return byKind;
      return a.channel - b.channel;
    });

    for (const entry of ordered) {
      // Only a live single-component entry may claim the bare base identity; a
      // retained one falls through to its channel-qualified label.
      if (entry.baseIdentity && !entry.retained) {
        entry.displayName = entry.baseName;
        continue;
      }

      const configuredName = entry.configuredName;
      if (
        configuredName !== null &&
        configuredNameCounts.get(configuredName) === 1 &&
        !used.has(configuredName)
      ) {
        entry.displayName = configuredName;
        used.add(configuredName);
        continue;
      }

      let label = entry.defaultLabel;
      if (used.has(label)) {
        label = `${entry.baseName} ${entry.kind} ${entry.channel}`;
      }
      if (used.has(label)) {
        let suffix = 2;
        while (used.has(`${label} ${suffix}`)) suffix += 1;
        label = `${label} ${suffix}`;
      }
      entry.displayName = label;
      used.add(label);
    }
  }

  private effectiveType(baseType: ShellyDeviceType, kind: ShellyComponentKind): ShellyDeviceType {
    if (kind === "cover") return "cover";
    return baseType === "outlet" ? "outlet" : "switch";
  }

  private channelId(baseName: string, channel: number): string {
    return `${baseName}_${channel}`;
  }

  /** A channel fallback that includes the component kind (`switch:0` vs `cover:0`). */
  private kindChannelId(baseName: string, kind: ShellyComponentKind, channel: number): string {
    return `${baseName}_${kind}_${channel}`;
  }

  /** Whether this entry's component reported metering at discovery, matched by kind + channel. */
  private componentMetered(entry: ShellyLogicalEntry): boolean {
    const components = this.discoveredComponents.get(entry.baseName);
    const component = components?.find((c) => c.kind === entry.kind && c.channel === entry.channel);
    return component?.metered ?? false;
  }

  private entryKey(baseName: string, kind: ShellyComponentKind, channel: number): string {
    return `${baseName}\u0000${kind}:${channel}`;
  }

  private initialObservation(baseName: string): DeviceObservation {
    const base = this.registrations.get(baseName);
    return base?.transport === "mqtt"
      ? { mode: "push", observedAt: Date.now() }
      : { mode: "polled", observedAt: Date.now(), refreshIntervalMs: this.pollIntervalMs };
  }

  // ---------------------------------------------------------------------------
  // MQTT subscriptions and notification dispatch
  // ---------------------------------------------------------------------------

  private addMqttSubscriptions(device: ShellyDevice): void {
    if (this.mqttSubscriptions.has(device.name)) return;

    const topicPrefix = device.topicPrefix as string;
    const eventsTopic = `${topicPrefix}/events/rpc`;
    const onlineTopic = `${topicPrefix}/online`;

    const eventsHandler: MqttMessageHandler = (_topic, payload) => {
      this.handleNotifyStatus(device.name, payload as Record<string, unknown>);
    };
    const onlineHandler: MqttMessageHandler = (_topic, payload) => {
      this.handleOnline(device.name, payload as unknown);
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

  private removeMqttSubscriptions(deviceName: string): void {
    const handles = this.mqttSubscriptions.get(deviceName);
    if (!handles) return;
    this.mqtt.unsubscribe(handles.eventsTopic, handles.eventsHandler);
    this.mqtt.unsubscribe(handles.onlineTopic, handles.onlineHandler);
    this.mqttSubscriptions.delete(deviceName);
  }

  /**
   * Apply every recognized `switch:N`/`cover:N` key in a notification to its
   * matching channel entry; unknown keys are ignored.
   */
  private handleNotifyStatus(baseName: string, payload: Record<string, unknown>): void {
    if (payload?.method !== "NotifyStatus" && payload?.method !== "NotifyFullStatus") return;
    const params = payload.params;
    if (params === null || typeof params !== "object") {
      this.logger.warn(
        { device: baseName, method: payload.method, payload },
        "Received malformed Shelly notification (missing params) — skipping",
      );
      return;
    }

    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      const match = /^(switch|cover):(\d+)$/.exec(key);
      if (!match) continue;
      if (value === null || typeof value !== "object") continue;

      const componentKind = match[1] as ShellyComponentKind;
      const channel = Number.parseInt(match[2], 10);
      const id = this.entryKeys.get(this.entryKey(baseName, componentKind, channel));
      if (!id) continue;
      const entry = this.entries.get(id);
      if (!entry) continue;
      // A retained channel must not be resurrected by a status notification.
      if (entry.retained) continue;

      const observedAt = Date.now();
      this.lastPushAt.set(this.entryKey(baseName, componentKind, channel), observedAt);
      const state = this.normalize(entry.type, value as Record<string, unknown>);
      this.updateTracked(id, {
        state,
        observation: { mode: "push", observedAt },
      });
    }
  }

  /** The `online` (LWT) payload marks every channel entry reachable or not. */
  private handleOnline(baseName: string, payload: unknown): void {
    if (typeof payload !== "boolean") {
      this.logger.warn(
        { device: baseName, payload },
        "Received malformed Shelly online payload — skipping",
      );
      return;
    }
    for (const entry of this.entries.values()) {
      if (entry.baseName === baseName && !entry.retained) {
        this.updateTracked(entry.id, { reachable: payload });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Status seeding at subscription
  // ---------------------------------------------------------------------------

  /**
   * Request and apply the current status for every MQTT-transport entry of a
   * device, so a push-backed descriptor carries its properties from first
   * enumeration. A failed seed is logged and non-fatal.
   */
  private async seedMqttEntries(baseName: string, generation: number): Promise<void> {
    const shelly = this.shelly;
    if (!shelly) return;
    // Only an MQTT device with a topic prefix has a channel to query.
    const registration = this.registrations.get(baseName);
    if (registration?.transport !== "mqtt" || !registration.topicPrefix) return;

    const entries = Array.from(this.entries.values()).filter(
      (entry) => entry.baseName === baseName && !entry.retained,
    );
    await Promise.all(
      entries.map(async (entry) => {
        const requestedAt = Date.now();
        let patch: Partial<TrackedShellyState> | null = null;
        try {
          const raw =
            entry.type === "cover"
              ? await shelly.getCoverStatus(entry.id)
              : await shelly.getStatus(entry.id);
          const state = this.normalize(entry.type, raw as unknown as Record<string, unknown>);
          patch = { state, observation: { mode: "push", observedAt: Date.now() } };
        } catch (err) {
          // A failed or timed-out seed is non-fatal: log and keep existing state.
          this.logger.error({ err, device: entry.id }, "Shelly status seed failed — continuing");
        }

        // Never resume a lifecycle that ended while the request was in flight,
        // and never apply a seed that failed.
        if (!patch || generation !== this.generation) return;

        // Re-resolve the entry by its logical key after the await, since discovery
        // may have re-resolved its id or retained the channel.
        const key = this.entryKey(entry.baseName, entry.kind, entry.channel);
        const currentId = this.entryKeys.get(key);
        if (!currentId) return;
        const current = this.entries.get(currentId);
        if (!current || current.retained) return;

        // A push applied after this seed's request was issued is newer; drop the
        // stale seed rather than overwrite the pushed value.
        const lastPushAt = this.lastPushAt.get(key);
        if (lastPushAt !== undefined && lastPushAt > requestedAt) return;

        this.updateTracked(currentId, patch);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // HTTP polling
  // ---------------------------------------------------------------------------

  /**
   * One poll tick: refresh each HTTP-transport device's channels independently.
   * A per-channel error is caught, logged, and marked unreachable.
   */
  private async poll(): Promise<void> {
    if (!this.shelly) return;
    for (const base of this.registrations.values()) {
      if (base.transport !== "http") continue;

      // Snapshot the entries so a re-registration during the awaited status
      // request — which rebuilds the entry map — cannot mutate the iteration.
      for (const entry of Array.from(this.entries.values())) {
        if (entry.baseName !== base.name) continue;
        // A retained channel is absent from the inventory; polling it would resurrect it.
        if (entry.retained) continue;

        let patch: Partial<TrackedShellyState>;
        try {
          const raw =
            entry.type === "cover"
              ? await this.shelly.getCoverStatus(entry.id)
              : await this.shelly.getStatus(entry.id);
          const state = this.normalize(entry.type, raw as unknown as Record<string, unknown>);
          patch = {
            state,
            reachable: true,
            observation: {
              mode: "polled",
              observedAt: Date.now(),
              refreshIntervalMs: this.pollIntervalMs,
            },
          };
        } catch (err) {
          this.logger.error({ err, device: entry.id }, "Shelly poll failed for device — skipping");
          patch = { reachable: false };
        }

        // Re-resolve the entry after the await: a re-registration may have
        // retained this channel or reused its id. Never write onto an unrelated entry.
        const current = this.entries.get(entry.id);
        if (
          !current ||
          current.retained ||
          current.baseName !== entry.baseName ||
          current.kind !== entry.kind ||
          current.channel !== entry.channel
        ) {
          continue;
        }

        this.updateTracked(entry.id, patch);
      }
    }
  }

  private normalize(type: ShellyDeviceType, raw: Record<string, unknown>): Record<string, unknown> {
    if (type === "cover") {
      const cover = raw as unknown as ShellyCoverStatus;
      return { position: cover.current_pos, state: cover.state };
    }
    const sw = raw as unknown as ShellySwitchStatus;
    const state: Record<string, unknown> = {
      on: sw.output,
      power: sw.apower,
      voltage: sw.voltage,
      current: sw.current,
    };
    // Cumulative active energy (Wh) from `aenergy.total`; only a finite reading
    // is surfaced, so the property's presence marks a metering device.
    const total = sw.aenergy?.total;
    if (typeof total === "number" && Number.isFinite(total)) {
      state.energy = total;
    }
    return state;
  }

  private updateTracked(id: string, patch: Partial<TrackedShellyState>): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    const existing = this.trackedFor(entry);
    const updated: TrackedShellyState = {
      // Merge the patch's defined keys onto the last-known state so a partial
      // `NotifyStatus` preserves attributes it does not carry.
      state: patch.state ? { ...existing.state, ...definedState(patch.state) } : existing.state,
      reachable: patch.reachable ?? existing.reachable,
      metered: patch.metered ?? existing.metered,
      observation: patch.observation ?? existing.observation,
    };
    this.tracked.set(id, updated);
    // Record the observation where it is delivered, never on a read; a
    // reachability-only patch carries no observation and records nothing.
    if (patch.observation) {
      this.deviceStateStore?.record(
        qualifyDeviceId(this.id, id),
        updated.state,
        updated.observation,
      );
    }
    this.notify(entry);
  }

  /**
   * The tracked state for an entry, falling back to the durable store's
   * last-known record (used verbatim) when there is no in-memory observation.
   */
  private trackedFor(entry: ShellyLogicalEntry): TrackedShellyState {
    const tracked = this.tracked.get(entry.id);
    if (tracked) return tracked;
    const restored = this.deviceStateStore?.get(qualifyDeviceId(this.id, entry.id));
    return {
      state: restored?.state ?? {},
      // Reachability is not persisted, so a restored device seeds as reachable.
      reachable: true,
      metered: this.componentMetered(entry),
      observation: restored?.observation ?? this.initialObservation(entry.baseName),
    };
  }

  private notify(entry: ShellyLogicalEntry): void {
    const descriptor = this.toDescriptor(entry);
    for (const listener of this.listeners) {
      try {
        listener(descriptor);
      } catch (err) {
        this.logger.error({ err, device: entry.id }, "Error in device change listener");
      }
    }
  }

  private toDescriptor(entry: ShellyLogicalEntry): DeviceDescriptor {
    const tracked = this.trackedFor(entry);
    // Shelly has no metering flag, so a channel is "metered" once discovery
    // reports it or it has reported a cumulative reading; energy is omitted until then.
    const metered =
      tracked.metered ||
      (typeof tracked.state.energy === "number" && Number.isFinite(tracked.state.energy));
    return {
      source: this.id,
      id: entry.id,
      qualifiedId: qualifyDeviceId(this.id, entry.id),
      displayName: entry.displayName,
      state: tracked.state,
      capabilities: shellyCapabilitiesFor(entry.type, { metered }),
      reachable: tracked.reachable,
      observation: tracked.observation,
      // Stamped by `AggregateDeviceSource`; a source does not know visibility preferences.
      hidden: false,
    };
  }
}
