/**
 * The Shelly `DeviceSource` (design.md D1–D6; tasks 3.1–3.10).
 *
 * Preserves the transport split already established for the HomeKit-facing
 * Shelly source: an MQTT-transport device is push-backed from its
 * `NotifyStatus` and `online` (LWT) topics and excluded from polling; an
 * HTTP-transport device is refreshed on a configurable interval. Devices
 * registered after the source has started are picked up without a restart.
 *
 * A physical Shelly registration is expanded into one logical entry per
 * discovered `switch:N`/`cover:N` component. A single-component device keeps
 * the base registration's identity unchanged; a multi-component device is
 * enumerated as one entry per channel with a D4-derived identity, and its base
 * registration is not a logical device.
 *
 * Shelly publishes no capability schema, so each entry's description comes
 * from `shellyCapabilitiesFor()` — an authored, per-type description that
 * satisfies the rich descriptor requirement in full.
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

/** Per-channel-entry tracked runtime state, normalised to the shared property names in `shelly-capabilities.ts`. */
interface TrackedShellyState {
  state: Record<string, unknown>;
  reachable: boolean;
  /** Whether this channel is known to be metered from discovery or a live reading. */
  metered: boolean;
  observation: DeviceObservation;
}

/** One logical Shelly device, materialized from a physical registration and a discovered component channel. */
interface ShellyLogicalEntry {
  /** Logical device id, unique within the source (design.md D4). */
  id: string;
  /** Name of the physical registration this entry belongs to. */
  baseName: string;
  /** Component channel this entry addresses. */
  channel: number;
  /** Discovered component kind (`switch` vs `cover`). */
  kind: ShellyComponentKind;
  /** Effective kind (cover, else the registration's switch/outlet) used for capabilities and commands. */
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
   * Whether this entry is retained from a previous discovery because its
   * channel is absent from the current inventory (design.md D4, task 3.9). A
   * retained entry stays enumerated and unreachable, is never resurrected by a
   * presence message or a poll, and is never commandable.
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
 * deterministically suffixed variant of the last candidate. This keeps every
 * logical identity unique even when configured names, channel fallbacks, and
 * base registration names collide.
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
 * Keep only the keys a normalized state patch actually defines. `normalize()`
 * always emits the readable keys it knows about — with `undefined` for a field
 * the frame did not carry — so spreading the raw patch would overwrite a
 * seeded value with `undefined`. Filtering here lets `updateTracked` merge a
 * partial frame onto the last-known state without resurrecting an attribute the
 * transport has not reported (spec: "Incremental notifications still apply",
 * "A never-reported attribute is absent, not synthesized").
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
   * Time each logical channel last received a push notification, keyed by the
   * logical `entryKey` (base name + kind + channel) so it survives an id
   * re-resolution. A seed whose request was issued before this time is stale
   * and is dropped (design.md: "A stale seeded value could be shown as
   * current").
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
   * Monotonic lifecycle generation. Bumped by every `start()` and `stop()` so
   * an in-flight discovery or a suspended `start()` from a previous lifecycle
   * cannot install a timer or rebuild state after the source was stopped.
   */
  private generation = 0;

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

  async start(): Promise<void> {
    if (!this.shelly) return;
    const generation = ++this.generation;

    // Install the late-registration hook before the initial sweep so a device
    // registered while `start()` is in flight is not dropped.
    this.onRegisteredCb = (device) => {
      void this.discoverDevice(device, generation).catch((err) =>
        this.logger.error({ err, device: device.name }, "Shelly late discovery failed"),
      );
    };
    this.shelly.onDeviceRegistered(this.onRegisteredCb);

    // Await discovery for every already-registered device so enumeration is
    // complete and deterministic once `start()` resolves (design.md D2).
    // Isolation is per device: an unexpected rejection from one device's
    // discovery must not reject the whole source or block the others.
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

    // `stop()` may have run during the await; do not install a timer that would
    // never be cleared, and do not let this lifecycle resume.
    if (generation !== this.generation) return;

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    this.generation += 1;
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
    // A retained (vanished) channel is enumerated but unreachable; it may still
    // carry a stale service record, so reject it rather than dispatching to a
    // component the current inventory no longer reports.
    if (entry.retained) return { status: "not_found" };

    const validation = validateCommand(shellyCapabilitiesFor(entry.type), properties);
    if (!validation.ok) return { status: "invalid", error: validation.error };

    try {
      if (entry.type === "cover") {
        if (typeof properties.position === "number") {
          await this.shelly.coverGoToPosition(entry.id, properties.position);
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
   * Discover a physical device's components and materialize its logical
   * entries. Idempotent: repeated runs reuse the in-flight promise and, once
   * complete, merge fresh components over the existing entries without
   * duplicating them or losing tracked state (design.md D2).
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

    // Seed every MQTT-transport entry's current status before discovery
    // settles, so `start()` and late registration both enumerate complete
    // descriptors (design.md D2, D3). HTTP-transport entries are already
    // refreshed by `poll()`.
    await this.seedMqttEntries(device.name, generation);
  }

  /**
   * Recompute the logical entry set from the latest per-device discovery
   * results. A single component keeps the base identity; multiple components
   * get D4 ids; a device whose discovery yielded nothing falls back to a
   * single channel-0 entry using its declared type. Entries whose channel is
   * absent from a later inventory are retained and marked unreachable rather
   * than dropped (task 3.9).
   */
  private rebuildEntries(): void {
    const provisional: ProvisionalEntry[] = [];

    // Count every configured component name across all registered devices'
    // discovery results, so a name is only used as an identity when it is
    // unique device-wide and source-wide (design.md D4, task 3.5).
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
        // A single discovered component *is* the base registration's logical
        // entry; no duplicate identity is materialized (design.md D1).
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

    // Resolve ids against every base registration name and every id already
    // assigned, so a configured name cannot shadow a registration or another
    // channel and every entry stays independently addressable (design.md D4).
    // Resolve over a deterministic ordering (base name, kind, channel) so a
    // configured name that collides with another entry's generated candidate is
    // claimed identically across restarts, independent of discovery completion
    // order (design.md D4).
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

    // Materialize the merged logical entry set (live provisional entries first,
    // then retained ones below). Display names are assigned afterwards in one
    // pass over the complete set, not here (design.md D4).
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

    // Retain prior entries whose channel vanished from a later inventory. A
    // retained entry must never overwrite a live entry that reclaimed its id,
    // nor keep a base registration name: reserve every retained id first, then
    // re-resolve a colliding retained entry to a fresh unique id — and with it
    // prune any stale base-named channel record — so no two logical devices
    // share one identity (design.md D4, task 3.9).
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

    // Assign human-facing labels in one deterministic pass over the complete
    // merged set (live + retained), so no two entries — including a retained
    // channel and the live channel that replaced it — can share a label
    // (design.md D4; "Per-Channel Logical Identity").
    this.resolveDisplayNames(merged.values());

    const removedIds = new Set(this.entries.keys());
    this.entries.clear();
    for (const [id, entry] of merged) this.entries.set(id, entry);
    this.entryKeys.clear();
    for (const [key, id] of mergedKeys) this.entryKeys.set(key, id);

    // Materialize the service-side channel records that let a command addressed
    // by logical id thread the right RPC channel (design.md D1). A
    // single-component device at channel 0 keeps its base registration and
    // needs no record; a sole component at a non-zero channel still needs one
    // so its descriptor and commands agree. Records no longer backed by an
    // entry are pruned, so a component rename does not leave the old id
    // commandable forever.
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
        // A single-component device whose live component sits at channel 0
        // keeps its base registration and materializes no channel record. Drop
        // the base id from the keep set so a record left by a previous
        // non-zero-channel discovery is pruned; otherwise a command on the base
        // id would still thread the removed channel (design.md D1). A sole
        // component at a non-zero channel, and every multi-component channel,
        // stay in the keep set.
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
        // Seed metering from discovery so a metered channel's descriptor
        // declares energy from first enumeration, before any poll or
        // notification (design.md D7), and seed state/observation from the
        // durable store so a restart's first enumeration reports the
        // device's last-known value before a new observation arrives
        // (design.md D2, D4).
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
   * Assign every entry's human-facing label in a single deterministic pass over
   * the merged live + retained set, so labels are globally unique and never
   * depend on discovery completion order (design.md D4).
   *
   * The reserved set is seeded with every base registration name, so no
   * configured name, `<base> <channel>` fallback, or bare base identity can
   * shadow a registration. A configured name is shown bare only when it is
   * unique across every entry's configured name and still unused; otherwise the
   * entry falls back to its channel-qualified label, disambiguating further with
   * the component kind and then a numeric suffix until the label is free. A
   * single-component entry always keeps its base name.
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
      // A single-component device keeps its base registration's name; because
      // every base name is reserved, no other entry can claim it. Only a live
      // entry may claim the bare base identity — a retained entry that once was
      // the sole component falls through to its channel-qualified label so it
      // cannot duplicate the live entry's label.
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

  /**
   * A channel fallback that includes the component kind, used when a channel
   * number is shared by more than one kind (`switch:0` vs `cover:0`).
   */
  private kindChannelId(baseName: string, kind: ShellyComponentKind, channel: number): string {
    return `${baseName}_${kind}_${channel}`;
  }

  /**
   * Whether a channel's component reported metering at discovery, matched by
   * its own kind + channel rather than the device-level registration.
   */
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
   * Apply every recognized `switch:N`/`cover:N` key present in a notification
   * to its matching channel entry (design.md D1, D3; task 3.6). Both the full
   * (`NotifyFullStatus`) and incremental (`NotifyStatus`) methods carry the same
   * component keys, so each is dispatched through the identical per-component
   * path. Unknown keys are ignored.
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
      // A retained (vanished) channel must not be resurrected by a status
      // notification for a component the current inventory no longer reports
      // (design.md D4, task 3.9).
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

  /** The `online` (LWT) payload marks every channel entry of the physical device reachable/unreachable. */
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
   * Request and apply the current component status for every MQTT-transport
   * entry of a device through the same RPC status query `poll()` uses, so a
   * push-backed descriptor carries its readable properties from first
   * enumeration (design.md D2, D3). `events/rpc` is not retained, so a
   * connect-time full status may have been published before the source
   * subscribed; the query closes that gap.
   *
   * Only MQTT-transport entries are seeded — HTTP-transport entries are
   * refreshed by `poll()` and must not be double-seeded. Isolation is per
   * entry: a failed or timed-out seed is logged and leaves the entry with the
   * state it has, without rejecting the source or blocking the device's other
   * channels.
   */
  private async seedMqttEntries(baseName: string, generation: number): Promise<void> {
    const shelly = this.shelly;
    if (!shelly) return;
    // Mirror `addMqttSubscriptions`: only a device that actually subscribed —
    // MQTT transport *and* a topic prefix — has a channel to query. A
    // prefix-less MQTT registration would otherwise issue `Switch.GetStatus`
    // over `"undefined/rpc"` and stall `start()` on the 5 s RPC timeout.
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
          // A failed or timed-out seed is non-fatal: log and leave the entry
          // with the state it already has (design.md D3).
          this.logger.error({ err, device: entry.id }, "Shelly status seed failed — continuing");
        }

        // Never resume a lifecycle that ended while the request was in flight,
        // and never apply a seed that failed.
        if (!patch || generation !== this.generation) return;

        // Re-resolve the entry by its logical key after the await: a
        // concurrent discovery may have re-resolved this channel's id (a
        // configured-name candidate is dropped once a duplicate name appears
        // anywhere), and a re-registration may have retained this channel. The
        // key encodes baseName/kind/channel, so resolving through it preserves
        // the "never write onto a retained or unrelated entry" guarantee
        // without losing the seed on an id re-resolution (design.md D3, D4).
        const key = this.entryKey(entry.baseName, entry.kind, entry.channel);
        const currentId = this.entryKeys.get(key);
        if (!currentId) return;
        const current = this.entries.get(currentId);
        if (!current || current.retained) return;

        // A push notification applied after this seed's request was issued
        // describes a state newer than the snapshot the device took before the
        // change; drop the stale seed rather than overwrite the pushed value
        // with it. Keyed by the logical channel so it survives an id
        // re-resolution. `rebuildEntries()` stamps the entry's initial
        // observation before this runs, so a silent device is never suppressed.
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
   * One poll tick: refresh each HTTP-transport device's component channels
   * independently (task 3.7). MQTT-transport devices are bridged via push
   * status/presence instead. Per-channel errors are caught, logged, and marked
   * unreachable so one channel cannot abort the tick or block the others.
   */
  private async poll(): Promise<void> {
    if (!this.shelly) return;
    for (const base of this.registrations.values()) {
      if (base.transport !== "http") continue;

      // Snapshot the entries so a re-registration during the awaited status
      // request — which rebuilds the entry map — cannot mutate the iteration.
      for (const entry of Array.from(this.entries.values())) {
        if (entry.baseName !== base.name) continue;
        // A retained channel is absent from the current inventory, so polling
        // it would both target a vanished component and resurrect it as
        // reachable, contradicting the retained-channel invariant.
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

        // Re-resolve the entry after the await: a re-registration while the
        // request was in flight may have retained this channel — and may even
        // have re-resolved its id onto a live channel. Never write stale poll
        // data onto a retained or unrelated entry (design.md D4, task 3.9).
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
    // Cumulative active energy, mapped from `aenergy.total` (Wh). A device
    // without metering omits the whole `aenergy` object; only a finite
    // reading is surfaced, so the property's presence itself distinguishes a
    // metering device from one that merely reports nothing (design.md D7).
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
      // `NotifyStatus` preserves the seeded attributes it does not carry and
      // never resurrects an attribute the transport has not reported (spec:
      // "Incremental notifications still apply"). A full frame — HTTP poll,
      // `NotifyFullStatus`, or RPC seed — defines every key it reports, so the
      // merge is equivalent to a replace for those keys.
      state: patch.state ? { ...existing.state, ...definedState(patch.state) } : existing.state,
      reachable: patch.reachable ?? existing.reachable,
      metered: patch.metered ?? existing.metered,
      observation: patch.observation ?? existing.observation,
    };
    this.tracked.set(id, updated);
    // Record the observation where it is made and delivered — a poll, a push
    // notification, or an RPC seed — never on a read (`list()`/`get()`/
    // `toDescriptor()`), which would churn observedAt and the write-behind
    // file (design.md D2). A reachability-only patch carries no observation
    // and records nothing.
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
   * last-known record when the entry has no in-memory observation yet
   * (design.md D2, D4). A restored record's state and observation are used
   * verbatim — observedAt stays the time it was recorded, never the read
   * time, so a restored value reads as last-known rather than live.
   */
  private trackedFor(entry: ShellyLogicalEntry): TrackedShellyState {
    const tracked = this.tracked.get(entry.id);
    if (tracked) return tracked;
    const restored = this.deviceStateStore?.get(qualifyDeviceId(this.id, entry.id));
    return {
      state: restored?.state ?? {},
      // Reachability is not persisted — design.md D1 scopes a record to state +
      // observation — so a restored device seeds as reachable until its next
      // observation reports otherwise.
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
    // reports it or it has actually reported a cumulative reading (design.md
    // D7). Until then — and for channels that never report one — the energy
    // capability is omitted, never declared with a zero.
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
      // Stamped by `AggregateDeviceSource` (design.md D8) — a source does
      // not know a user's visibility preference for its own devices.
      hidden: false,
    };
  }
}
