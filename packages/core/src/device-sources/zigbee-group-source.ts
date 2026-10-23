/**
 * The Zigbee group `DeviceSource`, exposing each Zigbee2MQTT group as an ordinary
 * device. A group has no exposes of its own, so member capabilities are intersected
 * and member state aggregated from the same `DeviceRegistry` `ZigbeeDeviceSource` reads.
 */

import type {
  Capability,
  CapabilityAccess,
  CapabilityRange,
  DeviceObservation,
} from "@ts-ha/shared";
import type { ZigbeeDevice, ZigbeeGroup } from "@ts-ha/shared/types";
import type { Logger } from "pino";
import type { MqttService } from "../mqtt/mqtt-service.js";
import type {
  DeviceRegistry,
  DeviceStateChangeHandler,
  GroupsChangedHandler,
} from "../zigbee/device-registry.js";
import {
  flattenByProperty,
  translateCommandProperties,
  validateCommand,
} from "./command-validation.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "./device-source.js";
import { qualifyDeviceId } from "./device-source.js";
import type { DeviceStateStore } from "./device-state-store.js";
import { ZIGBEE_SOURCE_ID } from "./zigbee-source.js";

export const ZIGBEE_GROUP_SOURCE_ID = "zigbee-group";

// ---------------------------------------------------------------------------
// Capability intersection
// ---------------------------------------------------------------------------

/** Intersects a numeric range across members. `"drop"` means the intersection is empty. */
function intersectRange(caps: Capability[]): CapabilityRange | undefined | "drop" {
  let min = Number.NEGATIVE_INFINITY;
  let max = Number.POSITIVE_INFINITY;
  let anyDeclared = false;

  for (const c of caps) {
    if (c.range?.min !== undefined) {
      min = Math.max(min, c.range.min);
      anyDeclared = true;
    }
    if (c.range?.max !== undefined) {
      max = Math.min(max, c.range.max);
      anyDeclared = true;
    }
  }

  if (!anyDeclared) return undefined;
  if (min > max) return "drop";
  return {
    min: min === Number.NEGATIVE_INFINITY ? undefined : min,
    max: max === Number.POSITIVE_INFINITY ? undefined : max,
  };
}

/** Intersects enum `permittedValues` across members. `"drop"` means no shared value remains. */
function intersectPermittedValues(caps: Capability[]): (string | number)[] | undefined | "drop" {
  const lists = caps
    .map((c) => c.permittedValues)
    .filter((v): v is (string | number)[] => v !== undefined);
  if (lists.length === 0) return undefined;

  const [first, ...rest] = lists;
  const intersected = first.filter((v) => rest.every((list) => list.includes(v)));
  if (intersected.length === 0) return "drop";
  return intersected;
}

/**
 * Intersect one property's capability across every member that declares it; returns `null`
 * when the property does not survive (incompatible type, empty range, no shared value).
 */
function intersectCapability(caps: Capability[]): Capability | null {
  const first = caps[0];
  if (!first) return null;
  if (!caps.every((c) => c.valueType === first.valueType)) return null;

  const access: CapabilityAccess = {
    readable: caps.every((c) => c.access.readable),
    writable: caps.every((c) => c.access.writable),
  };

  const result: Capability = {
    kind: first.kind,
    property: first.property,
    access,
    valueType: first.valueType,
  };
  if (first.name !== undefined) result.name = first.name;
  if (first.unit !== undefined) result.unit = first.unit;
  if (first.step !== undefined) result.step = first.step;

  if (first.valueType === "numeric") {
    const range = intersectRange(caps);
    if (range === "drop") return null;
    if (range) result.range = range;
  }

  if (first.valueType === "enum") {
    const permitted = intersectPermittedValues(caps);
    if (permitted === "drop") return null;
    if (permitted) result.permittedValues = permitted;
  }

  if (first.valueType === "boolean") {
    const onValues = caps.map((c) => c.valueOn ?? true);
    const offValues = caps.map((c) => c.valueOff ?? false);
    if (!onValues.every((v) => v === onValues[0]) || !offValues.every((v) => v === offValues[0])) {
      return null;
    }
    result.valueOn = onValues[0];
    result.valueOff = offValues[0];
  }

  return result;
}

/** A leaf capability together with the `kind` of the top-level container it was nested under, if any. */
interface FlattenedEntry {
  capability: Capability;
  containerKind: string | null;
}

/**
 * Like `flattenByProperty`, but also records which top-level container
 * capability (e.g. `kind: "light"`) each leaf property was nested under, so
 * intersection can rebuild that structure afterward.
 */
function flattenWithContainer(
  capabilities: Capability[],
  containerKind: string | null,
  into: Map<string, FlattenedEntry> = new Map(),
): Map<string, FlattenedEntry> {
  for (const capability of capabilities) {
    if (capability.property) {
      into.set(capability.property, { capability, containerKind });
    }
    if (capability.features) {
      flattenWithContainer(capability.features, capability.kind, into);
    }
  }
  return into;
}

/**
 * Intersect the capabilities of every group member into the group's declared set: a
 * property is kept only when every member declares it compatibly.
 */
export function intersectCapabilities(memberCapabilitySets: Capability[][]): Capability[] {
  if (memberCapabilitySets.length === 0) return [];

  const flattenedPerMember = memberCapabilitySets.map((caps) => flattenWithContainer(caps, null));
  const [first, ...rest] = flattenedPerMember;
  if (!first) return [];

  const sharedProperties = [...first.keys()].filter((property) =>
    rest.every((map) => map.has(property)),
  );

  const topLevel: Capability[] = [];
  const containerBuckets = new Map<string, Capability[]>();

  for (const property of sharedProperties) {
    const entries = flattenedPerMember.map((map) => map.get(property)) as FlattenedEntry[];
    const intersected = intersectCapability(entries.map((e) => e.capability));
    if (!intersected) continue;

    const containerKind = entries[0]?.containerKind ?? null;
    if (!containerKind) {
      topLevel.push(intersected);
      continue;
    }
    let bucket = containerBuckets.get(containerKind);
    if (!bucket) {
      bucket = [];
      containerBuckets.set(containerKind, bucket);
    }
    bucket.push(intersected);
  }

  const result: Capability[] = [...topLevel];
  for (const [kind, features] of containerBuckets) {
    result.push({
      kind,
      access: { readable: true, writable: true },
      valueType: "composite",
      features,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

/**
 * Derive a group's reported state from its members': a boolean reports on when any
 * member does; a numeric reports the mean across members currently on; anything no
 * member reports is omitted.
 */
export function deriveGroupState(
  capabilities: Capability[],
  memberStates: Record<string, unknown>[],
): Record<string, unknown> {
  const flat = flattenByProperty(capabilities);
  const booleanCapabilities = [...flat.values()].filter((c) => c.valueType === "boolean");

  const isMemberOn = (state: Record<string, unknown>): boolean =>
    booleanCapabilities.some((c) => {
      if (!c.property || !(c.property in state)) return false;
      return state[c.property] === (c.valueOn ?? true);
    });

  const result: Record<string, unknown> = {};

  for (const capability of flat.values()) {
    const property = capability.property;
    if (!property) continue;

    if (capability.valueType === "boolean") {
      const reporting = memberStates.filter((s) => property in s);
      if (reporting.length === 0) continue;
      const onValue = capability.valueOn ?? true;
      const offValue = capability.valueOff ?? false;
      const anyOn = reporting.some((s) => s[property] === onValue);
      result[property] = anyOn ? onValue : offValue;
      continue;
    }

    if (capability.valueType === "numeric") {
      const onMembers = memberStates.filter(isMemberOn);
      const pool = booleanCapabilities.length > 0 ? onMembers : memberStates;
      const values = pool.map((s) => s[property]).filter((v): v is number => typeof v === "number");
      if (values.length === 0) continue;
      result[property] = values.reduce((sum, v) => sum + v, 0) / values.length;
      continue;
    }

    // Other value types have no derivation rule — report the first member's
    // value if any reports it, otherwise omit.
    const reporter = memberStates.find((s) => property in s);
    if (reporter) result[property] = reporter[property];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Device source
// ---------------------------------------------------------------------------

export class ZigbeeGroupDeviceSource implements DeviceSource {
  readonly id = ZIGBEE_GROUP_SOURCE_ID;

  private readonly listeners: Set<DeviceChangeListener> = new Set();
  private readonly setChangedListeners: Set<() => void> = new Set();
  /** Per-member-friendly-name state handlers, rebuilt on every group-list change. */
  private readonly memberStateHandlers: Map<string, DeviceStateChangeHandler> = new Map();
  /** IEEE address → set of group ids containing that member, rebuilt on `onGroupsChanged`. */
  private ieeeToGroupIds: Map<string, Set<number>> = new Map();
  private onGroupsChangedCb: GroupsChangedHandler | null = null;
  private onGroupListAppliedCb: (() => void) | null = null;

  constructor(
    private readonly registry: DeviceRegistry | null,
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
    private readonly deviceStateStore?: DeviceStateStore,
  ) {}

  get available(): boolean {
    return this.registry !== null;
  }

  /** True once the registry has received an authoritative `bridge/groups` array. */
  get hasEnumerated(): boolean {
    return this.registry?.hasReceivedGroupList ?? false;
  }

  start(): void {
    if (!this.registry) return;

    this.rebuildIndexAndSubscriptions();

    this.onGroupsChangedCb = () => this.rebuildIndexAndSubscriptions();
    this.registry.onGroupsChanged(this.onGroupsChangedCb);
    this.onGroupListAppliedCb = () => {
      for (const listener of this.setChangedListeners) {
        try {
          listener();
        } catch (err) {
          this.logger.error({ err }, "Error in device set change listener");
        }
      }
    };
    this.registry.onGroupListApplied(this.onGroupListAppliedCb);
  }

  stop(): void {
    if (this.registry) {
      if (this.onGroupsChangedCb) this.registry.offGroupsChanged(this.onGroupsChangedCb);
      if (this.onGroupListAppliedCb) this.registry.offGroupListApplied(this.onGroupListAppliedCb);
      for (const [friendlyName, handler] of this.memberStateHandlers) {
        this.registry.offDeviceStateChange(friendlyName, handler);
      }
    }
    this.onGroupsChangedCb = null;
    this.onGroupListAppliedCb = null;
    this.memberStateHandlers.clear();
    this.setChangedListeners.clear();
    this.ieeeToGroupIds.clear();
    this.listeners.clear();
  }

  list(): DeviceDescriptor[] {
    if (!this.registry) return [];
    return this.registry.getGroups().map((group) => this.toDescriptor(group));
  }

  get(deviceId: string): DeviceDescriptor | undefined {
    const group = this.findGroup(deviceId);
    return group ? this.toDescriptor(group) : undefined;
  }

  async command(
    deviceId: string,
    properties: Record<string, unknown>,
  ): Promise<DeviceCommandOutcome> {
    if (!this.registry) return { status: "unavailable" };
    const group = this.findGroup(deviceId);
    if (!group) return { status: "not_found" };

    const capabilities = this.capabilitiesFor(group);
    const validation = validateCommand(capabilities, properties);
    if (!validation.ok) return { status: "invalid", error: validation.error };

    // Published once, to the group's friendly name — Zigbee2MQTT multicasts it to
    // every member. No optimistic state write: the reported state stays derived.
    this.mqtt.publishToDevice(
      group.friendly_name,
      translateCommandProperties(capabilities, properties),
    );
    return { status: "ok" };
  }

  subscribe(listener: DeviceChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to authoritative group-list changes that emit no descriptor notification. */
  onDeviceSetChanged(listener: () => void): () => void {
    this.setChangedListeners.add(listener);
    return () => this.setChangedListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private findGroup(deviceId: string): ZigbeeGroup | undefined {
    if (!this.registry) return undefined;
    const id = Number(deviceId);
    if (!Number.isFinite(id)) return undefined;
    return this.registry.getGroup(id);
  }

  private findDeviceByIeee(ieeeAddress: string): ZigbeeDevice | undefined {
    return this.registry?.getDevices().find((d) => d.ieee_address === ieeeAddress);
  }

  /**
   * Rebuild the IEEE → group-ids index and the per-member state subscriptions from
   * the registry's current group list; called on start and on every groups change.
   */
  private rebuildIndexAndSubscriptions(): void {
    if (!this.registry) return;

    for (const [friendlyName, handler] of this.memberStateHandlers) {
      this.registry.offDeviceStateChange(friendlyName, handler);
    }
    this.memberStateHandlers.clear();

    const index = new Map<string, Set<number>>();
    for (const group of this.registry.getGroups()) {
      for (const member of group.members) {
        let ids = index.get(member.ieee_address);
        if (!ids) {
          ids = new Set();
          index.set(member.ieee_address, ids);
        }
        ids.add(group.id);
      }
    }
    this.ieeeToGroupIds = index;

    for (const ieeeAddress of index.keys()) {
      const device = this.findDeviceByIeee(ieeeAddress);
      if (!device) continue;
      if (this.memberStateHandlers.has(device.friendly_name)) continue;

      const handler: DeviceStateChangeHandler = () => this.onMemberStateChange(ieeeAddress);
      this.memberStateHandlers.set(device.friendly_name, handler);
      this.registry.onDeviceStateChange(device.friendly_name, handler);
    }
  }

  /** A member's state changed — recompute and notify only the groups containing it. */
  private onMemberStateChange(ieeeAddress: string): void {
    const groupIds = this.ieeeToGroupIds.get(ieeeAddress);
    if (!groupIds) return;
    for (const groupId of groupIds) {
      const group = this.registry?.getGroup(groupId);
      if (group) this.notify(group);
    }
  }

  private notify(group: ZigbeeGroup): void {
    const descriptor = this.toDescriptor(group);
    // Recorded for durability/pruning: when `toDescriptor` seeded members from the store,
    // this re-record writes the same derived state and the oldest member observation.
    this.deviceStateStore?.record(descriptor.qualifiedId, descriptor.state, descriptor.observation);
    for (const listener of this.listeners) {
      try {
        listener(descriptor);
      } catch (err) {
        this.logger.error({ err, group: group.friendly_name }, "Error in device change listener");
      }
    }
  }

  /**
   * Resolves each member to its current device record, state, and observation, seeding
   * from the durable store when the registry holds no state for it; skips any member not
   * yet known.
   */
  private resolveMembers(
    group: ZigbeeGroup,
  ): { device: ZigbeeDevice; state: Record<string, unknown>; observation: DeviceObservation }[] {
    const resolved: {
      device: ZigbeeDevice;
      state: Record<string, unknown>;
      observation: DeviceObservation;
    }[] = [];
    for (const member of group.members) {
      const device = this.findDeviceByIeee(member.ieee_address);
      if (!device) continue;
      const qualifiedId = qualifyDeviceId(ZIGBEE_SOURCE_ID, device.ieee_address);
      const registryState = this.registry?.getDeviceState(device.friendly_name);
      // `=== undefined`, not truthiness: a real `{}` payload from the registry is a fresh
      // observation and must win over a stored seed.
      const stored =
        registryState === undefined ? this.deviceStateStore?.get(qualifiedId) : undefined;
      resolved.push({
        device,
        state: registryState ?? stored?.state ?? {},
        observation: stored?.observation ?? { mode: "push", observedAt: Date.now() },
      });
    }
    return resolved;
  }

  private capabilitiesFor(group: ZigbeeGroup): Capability[] {
    const members = this.resolveMembers(group);
    return intersectCapabilities(members.map(({ device }) => device.definition?.exposes ?? []));
  }

  private toDescriptor(group: ZigbeeGroup): DeviceDescriptor {
    const members = this.resolveMembers(group);
    const capabilities = intersectCapabilities(
      members.map(({ device }) => device.definition?.exposes ?? []),
    );
    const state = deriveGroupState(
      capabilities,
      members.map(({ state }) => state),
    );
    // A group is only as fresh as its stalest member, so report the oldest observation
    // among the members whose state it aggregates.
    const observedAt =
      members.length === 0
        ? Date.now()
        : Math.min(...members.map(({ observation }) => observation.observedAt));

    return {
      source: this.id,
      id: String(group.id),
      qualifiedId: qualifyDeviceId(this.id, String(group.id)),
      displayName: group.friendly_name,
      state,
      capabilities,
      reachable: true,
      observation: { mode: "push", observedAt },
      // Stamped by `AggregateDeviceSource`; a source does not know visibility preferences.
      hidden: false,
      memberQualifiedIds: members.map(({ device }) =>
        qualifyDeviceId(ZIGBEE_SOURCE_ID, device.ieee_address),
      ),
    };
  }
}
