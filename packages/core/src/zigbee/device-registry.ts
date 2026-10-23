import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  BridgeEventPayload,
  ZigbeeDevice,
  ZigbeeGroup,
  ZigbeeGroupMember,
} from "@ts-ha/shared/types";
import type { Logger } from "pino";
import type { Config } from "../config.js";
import type { MqttMessageHandler, MqttService } from "../mqtt/mqtt-service.js";
import { readJsonWithBackup, writeJsonAtomically } from "../state/json-persistence.js";
import { mapZ2MExposes } from "./z2m-mapper.js";

/**
 * Persistence options for the `DeviceRegistry`: when `persist` is true, the device list
 * and last-known states are saved on shutdown and restored as a cold-start seed.
 */
export interface DeviceRegistryPersistenceOptions {
  /**
   * Whether to persist the device list and state on shutdown and restore on startup.
   *
   * @default true
   */
  persist?: boolean;

  /**
   * Path to the JSON file for device registry persistence; used when `persist` is true.
   *
   * @default "./device-registry.json"
   */
  filePath?: string;
}

export type DeviceStateChangeHandler = (
  state: Record<string, unknown>,
  prev: Record<string, unknown> | undefined,
) => void;

export type DeviceAddedHandler = (device: ZigbeeDevice) => void;
export type DeviceRemovedHandler = (device: ZigbeeDevice) => void;

/** Fired whenever a `bridge/groups` message changes the tracked group set. */
export type GroupsChangedHandler = () => void;

/**
 * Human-readable name mappings for Zigbee2MQTT devices: an explicit per-device map plus
 * a fallback transform.
 */
export interface DeviceNiceNames {
  /** Per-device overrides: `friendly_name` → display name. */
  devices?: Record<string, string>;

  /** Fallback transform applied when no per-device entry exists. */
  transform?: (friendlyName: string) => string;
}

/**
 * Discovers Zigbee2MQTT devices and tracks their state, subscribing to `bridge/devices`
 * and `bridge/event`. Device state updates are merged onto the previously-known state.
 */
export class DeviceRegistry {
  /** Keyed by `friendly_name`. */
  private readonly devices: Map<string, ZigbeeDevice> = new Map();

  /** Last-known state per device, keyed by `friendly_name`. */
  private readonly deviceStates: Map<string, Record<string, unknown>> = new Map();

  /** Keyed by numeric group id. */
  private readonly groups: Map<number, ZigbeeGroup> = new Map();

  /** Handlers fired whenever a `bridge/groups` message changes the tracked set. */
  private readonly groupsChangedHandlers: Set<GroupsChangedHandler> = new Set();

  /** Handlers fired once per applied `bridge/devices` payload. */
  private readonly deviceListAppliedHandlers: Set<() => void> = new Set();

  /** Handlers fired once per applied `bridge/groups` payload. */
  private readonly groupListAppliedHandlers: Set<() => void> = new Set();

  /** Whether an authoritative `bridge/devices` array has arrived since `start()`. */
  private deviceListReceived = false;

  /** Whether an authoritative `bridge/groups` array has arrived since `start()`. */
  private groupListReceived = false;

  /** Per-device state change handlers. */
  private readonly stateHandlers: Map<string, Set<DeviceStateChangeHandler>> = new Map();

  /** Handlers fired when a device is added to the registry. */
  private readonly deviceAddedHandlers: Set<DeviceAddedHandler> = new Set();

  /** Handlers fired when a device is removed from the registry. */
  private readonly deviceRemovedHandlers: Set<DeviceRemovedHandler> = new Set();

  /**
   * Active per-device MQTT handlers, keyed by `friendly_name`.
   * Stored so they can be passed to `mqtt.unsubscribe()` during cleanup.
   */
  private readonly mqttDeviceHandlers: Map<string, MqttMessageHandler> = new Map();

  /** Handler for the `bridge/devices` topic — stored for unsubscribe. */
  private bridgeDevicesHandler: MqttMessageHandler | null = null;

  /** Handler for the `bridge/groups` topic — stored for unsubscribe. */
  private bridgeGroupsHandler: MqttMessageHandler | null = null;

  /** Handler for the `bridge/event` topic — stored for unsubscribe. */
  private bridgeEventHandler: MqttMessageHandler | null = null;

  private readonly persist: boolean;
  private readonly filePath: string;

  constructor(
    private readonly mqtt: MqttService,
    private readonly config: Config,
    private readonly logger: Logger,
    private readonly niceNames: DeviceNiceNames = {},
    persistenceOptions: DeviceRegistryPersistenceOptions = {},
  ) {
    this.persist = persistenceOptions.persist ?? true;
    this.filePath = persistenceOptions.filePath ?? "./device-registry.json";
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Restore persisted device list and state from disk (if persistence is enabled),
   * recovering from the `.bak` backup when the primary is missing or corrupt. Must be
   * called before `start()` so that the registry is seeded before MQTT subscriptions
   * fire. Incoming MQTT data always wins over persisted data.
   */
  async load(): Promise<void> {
    if (!this.persist) return;

    await readJsonWithBackup(this.filePath, this.logger, "device registry", (parsed, file) =>
      this.restore(parsed, file),
    );
  }

  /**
   * Load a parsed snapshot: last-known states first, then groups, then device metadata
   * with per-device MQTT subscriptions. A wrong-typed top-level field throws so the
   * caller falls back to the backup; malformed entries inside well-typed fields are
   * skipped with a warning so one bad record cannot discard the rest of the snapshot.
   */
  private restore(parsed: Record<string, unknown>, file: string): void {
    if (!isPlainObject(parsed)) {
      throw new Error("Device registry snapshot is not an object");
    }

    // Validate every top-level field before applying anything: a structurally invalid
    // snapshot is recoverable from `.bak`, and throwing here cannot leave a half-applied
    // primary that the backup apply would merge into.
    const states = snapshotObjectField(parsed.states, "states");
    const groups = snapshotArrayField(parsed.groups, "groups");
    const devices = snapshotObjectField(parsed.devices, "devices");

    if (states !== undefined) {
      for (const [name, state] of Object.entries(states)) {
        if (!isPlainObject(state)) {
          this.logger.warn(
            { friendlyName: name },
            "Skipping malformed device state entry while restoring the device registry",
          );
          continue;
        }
        this.deviceStates.set(name, state);
      }
    }

    // Restore tracked groups; a snapshot without a `groups` key loads as an empty list.
    // Members are filtered individually so one bad member cannot discard its group.
    if (groups !== undefined) {
      for (const candidate of groups) {
        if (!isPersistedGroup(candidate)) {
          this.logger.warn(
            { group: candidate },
            "Skipping malformed group entry while restoring the device registry",
          );
          continue;
        }
        const members: ZigbeeGroupMember[] = [];
        for (const member of candidate.members) {
          if (isPersistedGroupMember(member)) {
            members.push(member);
          } else {
            this.logger.warn(
              { groupId: candidate.id, member },
              "Skipping malformed group member while restoring the device registry",
            );
          }
        }
        this.groups.set(candidate.id, { ...candidate, members });
      }
    }

    // Restore device metadata and register per-device MQTT subscriptions.
    // Coordinator is never persisted, but guard anyway.
    // We do this after states so that if a state handler fires immediately
    // on subscription it already has the restored state to merge into.
    if (devices !== undefined) {
      const prefix = this.config.zigbee2mqttPrefix;
      for (const candidate of Object.values(devices)) {
        if (!isPersistedDevice(candidate)) {
          this.logger.warn(
            { device: candidate },
            "Skipping malformed device entry while restoring the device registry",
          );
          continue;
        }
        if (candidate.type === "Coordinator") continue;

        const device = candidate;
        const { friendly_name } = device;
        this.devices.set(friendly_name, device);

        const topic = `${prefix}/${friendly_name}`;
        const handler: MqttMessageHandler = (_topic, payload) => {
          this.handleDeviceState(friendly_name, payload);
        };
        // Register the handler before subscribing so a throwing subscribe cannot leave a
        // live handler in MqttService that stop() has no record of.
        this.mqttDeviceHandlers.set(friendly_name, handler);
        try {
          this.mqtt.subscribe(topic, handler);
        } catch (err) {
          this.mqttDeviceHandlers.delete(friendly_name);
          try {
            this.mqtt.unsubscribe(topic, handler);
          } catch (unsubscribeErr) {
            this.logger.warn(
              { err: unsubscribeErr, friendlyName: friendly_name },
              "Failed to unsubscribe after a failed restore subscription",
            );
          }
          // A subscription failure must not be mistaken for file corruption by the
          // readJsonWithBackup caller — log it and keep the remaining devices.
          this.logger.error(
            { err, friendlyName: friendly_name },
            "Failed to subscribe to restored device topic",
          );
        }
      }
    }

    this.logger.info(
      { devices: this.devices.size, states: this.deviceStates.size, file },
      "Device registry restored from disk",
    );
  }

  /**
   * Persist the current device list and state to disk (if persistence is enabled).
   * Called by the engine before `stop()` on shutdown.
   */
  async save(): Promise<void> {
    if (!this.persist) return;

    try {
      // Serialize each entry individually so one bad value cannot abort the
      // entire save — unserializable entries are skipped and logged. Building the
      // maps from entries keeps a `__proto__` key an own data property.
      const deviceEntries: [string, ZigbeeDevice][] = [];
      for (const [name, device] of this.devices) {
        try {
          JSON.stringify(device);
          deviceEntries.push([name, device]);
        } catch (err) {
          this.logger.warn(
            { err, friendlyName: name },
            "Skipping unserializable device while persisting the device registry",
          );
        }
      }
      const devicesObj = Object.fromEntries(deviceEntries);

      const stateEntries: [string, Record<string, unknown>][] = [];
      for (const [name, state] of this.deviceStates) {
        try {
          JSON.stringify(state);
          stateEntries.push([name, state]);
        } catch (err) {
          this.logger.warn(
            { err, friendlyName: name },
            "Skipping unserializable device state while persisting the device registry",
          );
        }
      }
      const statesObj = Object.fromEntries(stateEntries);

      const groupsArr: ZigbeeGroup[] = [];
      for (const [id, group] of this.groups) {
        try {
          JSON.stringify(group);
          groupsArr.push(group);
        } catch (err) {
          this.logger.warn(
            { err, groupId: id },
            "Skipping unserializable group while persisting the device registry",
          );
        }
      }

      // Every surviving entry serialized individually, so this cannot throw.
      const contents = JSON.stringify(
        { devices: devicesObj, states: statesObj, groups: groupsArr },
        null,
        2,
      );

      await mkdir(dirname(this.filePath), { recursive: true });
      await writeJsonAtomically(this.filePath, contents, this.logger, "device registry");

      this.logger.info(
        {
          devices: Object.keys(devicesObj).length,
          states: Object.keys(statesObj).length,
          groups: groupsArr.length,
          file: this.filePath,
        },
        "Device registry persisted to disk",
      );
    } catch (err) {
      this.logger.error({ err, file: this.filePath }, "Failed to persist device registry");
    }
  }

  /**
   * Subscribe to bridge topics and begin tracking devices.
   * Must be called after the MQTT client is connected.
   */
  start(): void {
    const prefix = this.config.zigbee2mqttPrefix;

    // Subscribe to the retained device list
    this.bridgeDevicesHandler = (_topic, payload) => {
      this.handleBridgeDevices(payload as unknown as ZigbeeDevice[]);
    };
    this.mqtt.subscribe(`${prefix}/bridge/devices`, this.bridgeDevicesHandler);

    // Subscribe to the retained group list
    this.bridgeGroupsHandler = (_topic, payload) => {
      this.handleBridgeGroups(payload as unknown as ZigbeeGroup[]);
    };
    this.mqtt.subscribe(`${prefix}/bridge/groups`, this.bridgeGroupsHandler);

    // Subscribe to real-time join/leave events
    this.bridgeEventHandler = (_topic, payload) => {
      this.handleBridgeEvent(payload as unknown as BridgeEventPayload);
    };
    this.mqtt.subscribe(`${prefix}/bridge/event`, this.bridgeEventHandler);

    this.logger.info("Device registry started");
  }

  /**
   * Unsubscribe all topics and clear internal state.
   */
  stop(): void {
    const prefix = this.config.zigbee2mqttPrefix;

    if (this.bridgeDevicesHandler) {
      this.mqtt.unsubscribe(`${prefix}/bridge/devices`, this.bridgeDevicesHandler);
      this.bridgeDevicesHandler = null;
    }

    if (this.bridgeGroupsHandler) {
      this.mqtt.unsubscribe(`${prefix}/bridge/groups`, this.bridgeGroupsHandler);
      this.bridgeGroupsHandler = null;
    }

    if (this.bridgeEventHandler) {
      this.mqtt.unsubscribe(`${prefix}/bridge/event`, this.bridgeEventHandler);
      this.bridgeEventHandler = null;
    }

    // Unsubscribe all per-device topics
    for (const [friendlyName, handler] of this.mqttDeviceHandlers) {
      this.mqtt.unsubscribe(`${prefix}/${friendlyName}`, handler);
    }

    this.mqttDeviceHandlers.clear();
    this.devices.clear();
    this.deviceStates.clear();
    this.groups.clear();
    // A stopped registry holds nothing authoritative; a later empty list after restart
    // must not be mistaken for an enumeration of the pre-stop state.
    this.deviceListReceived = false;
    this.groupListReceived = false;

    this.logger.info("Device registry stopped");
  }

  // ---------------------------------------------------------------------------
  // Discovery API
  // ---------------------------------------------------------------------------

  /** Return all tracked non-coordinator devices. */
  getDevices(): ZigbeeDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Whether an authoritative `bridge/devices` array has arrived since `start()`. A
   * restored snapshot is a seed, not an enumeration, so it does not set this.
   */
  get hasReceivedDeviceList(): boolean {
    return this.deviceListReceived;
  }

  /**
   * Whether an authoritative `bridge/groups` array has arrived since `start()`. A
   * restored snapshot is a seed, not an enumeration, so it does not set this.
   */
  get hasReceivedGroupList(): boolean {
    return this.groupListReceived;
  }

  /** Return a single device by `friendly_name`, or `undefined` if not found. */
  getDevice(friendlyName: string): ZigbeeDevice | undefined {
    return this.devices.get(friendlyName);
  }

  /** Return `true` if the named device is currently tracked. */
  hasDevice(friendlyName: string): boolean {
    return this.devices.has(friendlyName);
  }

  /** Return all tracked Zigbee groups. */
  getGroups(): ZigbeeGroup[] {
    return Array.from(this.groups.values());
  }

  /** Return a single group by its numeric id, or `undefined` if not tracked. */
  getGroup(id: number): ZigbeeGroup | undefined {
    return this.groups.get(id);
  }

  /** Register a handler that fires once per `bridge/groups` message that changes the set. */
  onGroupsChanged(handler: GroupsChangedHandler): void {
    this.groupsChangedHandlers.add(handler);
  }

  /** Remove a previously-registered groups-changed handler. */
  offGroupsChanged(handler: GroupsChangedHandler): void {
    this.groupsChangedHandlers.delete(handler);
  }

  /**
   * Register a handler that fires once per applied `bridge/devices` payload, after the
   * whole list — removals, additions, and their notifications — has been processed.
   */
  onDeviceListApplied(handler: () => void): void {
    this.deviceListAppliedHandlers.add(handler);
  }

  /** Remove a previously-registered device-list-applied handler. */
  offDeviceListApplied(handler: () => void): void {
    this.deviceListAppliedHandlers.delete(handler);
  }

  /**
   * Register a handler that fires once per applied `bridge/groups` payload, after the
   * tracked set has been updated and the groups-changed handlers have run.
   */
  onGroupListApplied(handler: () => void): void {
    this.groupListAppliedHandlers.add(handler);
  }

  /** Remove a previously-registered group-list-applied handler. */
  offGroupListApplied(handler: () => void): void {
    this.groupListAppliedHandlers.delete(handler);
  }

  /**
   * Return a human-readable display name for `friendly_name` (per-device entry, then
   * transform, else the raw name); works before the device is seen on the network.
   */
  getNiceName(friendlyName: string): string {
    return (
      this.niceNames.devices?.[friendlyName] ??
      this.niceNames.transform?.(friendlyName) ??
      friendlyName
    );
  }

  // ---------------------------------------------------------------------------
  // State API
  // ---------------------------------------------------------------------------

  /**
   * Return the last-known merged state for a device, or `undefined` if no
   * state has been received yet.
   */
  getDeviceState(friendlyName: string): Record<string, unknown> | undefined {
    return this.deviceStates.get(friendlyName);
  }

  /**
   * Register a handler that fires whenever a device's state changes.
   * The handler receives the **full merged** new state and the previous state.
   */
  onDeviceStateChange(friendlyName: string, handler: DeviceStateChangeHandler): void {
    let handlers = this.stateHandlers.get(friendlyName);
    if (!handlers) {
      handlers = new Set();
      this.stateHandlers.set(friendlyName, handlers);
    }
    handlers.add(handler);
  }

  /** Remove a previously-registered state change handler. */
  offDeviceStateChange(friendlyName: string, handler: DeviceStateChangeHandler): void {
    this.stateHandlers.get(friendlyName)?.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Device list change listeners
  // ---------------------------------------------------------------------------

  /** Register a handler called whenever a new device is added to the registry. */
  onDeviceAdded(handler: DeviceAddedHandler): void {
    this.deviceAddedHandlers.add(handler);
  }

  /** Remove a previously-registered device-added handler. */
  offDeviceAdded(handler: DeviceAddedHandler): void {
    this.deviceAddedHandlers.delete(handler);
  }

  /** Register a handler called whenever a device is removed from the registry. */
  onDeviceRemoved(handler: DeviceRemovedHandler): void {
    this.deviceRemovedHandlers.add(handler);
  }

  /** Remove a previously-registered device-removed handler. */
  offDeviceRemoved(handler: DeviceRemovedHandler): void {
    this.deviceRemovedHandlers.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Map a device's `definition.exposes` from the raw Zigbee2MQTT shape into the
   * source-neutral capability vocabulary, returning a new object and leaving the input
   * untouched.
   */
  private mapExposes(device: ZigbeeDevice): ZigbeeDevice {
    if (!device.definition) return device;
    return {
      ...device,
      definition: {
        ...device.definition,
        exposes: mapZ2MExposes(device.definition.exposes as unknown),
      },
    };
  }

  /**
   * Handle a payload from `{prefix}/bridge/devices`.
   * Diffs the incoming list against the current registry and subscribes /
   * unsubscribes per-device topics as needed.
   */
  private handleBridgeDevices(incoming: ZigbeeDevice[]): void {
    if (!Array.isArray(incoming)) {
      this.logger.warn("bridge/devices payload is not an array — ignoring");
      return;
    }

    // Build a set of incoming friendly names (excluding coordinators)
    const incomingMap = new Map<string, ZigbeeDevice>();
    for (const device of incoming) {
      // Basic structural validation — skip malformed entries
      if (!device || typeof device !== "object" || typeof device.friendly_name !== "string") {
        continue;
      }
      if (device.type === "Coordinator") continue;
      incomingMap.set(device.friendly_name, this.mapExposes(device));
    }

    // Detect removals — devices in current registry but not in the new list
    for (const [friendlyName, device] of this.devices) {
      if (!incomingMap.has(friendlyName)) {
        this.removeDevice(friendlyName, device);
      }
    }

    // Detect additions and updates. Notifications are deferred until the whole
    // authoritative list is applied, so a listener that reconciles on readiness cannot
    // observe a partial enumeration and prune records for devices later in this payload.
    const added: ZigbeeDevice[] = [];
    for (const [friendlyName, device] of incomingMap) {
      if (this.devices.has(friendlyName)) {
        // Update device definition in place (e.g. after rename or re-interview)
        this.devices.set(friendlyName, device);
      } else {
        this.addDevice(device);
        added.push(device);
      }
    }

    // An array — including an empty one — is the bridge's authoritative device list.
    this.deviceListReceived = true;

    for (const device of added) {
      this.fireDeviceAdded(device);
    }

    // Fired after the full list and its notifications, so a topology consumer sees a
    // complete enumeration (a removal-only payload sends no descriptor notification).
    for (const handler of this.deviceListAppliedHandlers) {
      try {
        handler();
      } catch (err) {
        this.logger.error({ err }, "Error in onDeviceListApplied handler");
      }
    }
  }

  /**
   * Handle a `{prefix}/bridge/groups` payload, diffing it against the tracked groups
   * (additions, in-place updates, removals); a malformed payload is skipped with a warning.
   */
  private handleBridgeGroups(incoming: ZigbeeGroup[]): void {
    if (!Array.isArray(incoming)) {
      this.logger.warn("bridge/groups payload is not an array — ignoring");
      return;
    }

    // An array — including an empty one — is the bridge's authoritative group list.
    this.groupListReceived = true;

    const incomingMap = new Map<number, ZigbeeGroup>();
    for (const group of incoming) {
      if (
        !group ||
        typeof group !== "object" ||
        typeof group.id !== "number" ||
        typeof group.friendly_name !== "string"
      ) {
        this.logger.warn({ group }, "Malformed group entry — skipping");
        continue;
      }
      incomingMap.set(group.id, group);
    }

    let changed = false;

    // Detect removals — groups currently tracked but absent from the new list.
    for (const id of this.groups.keys()) {
      if (!incomingMap.has(id)) {
        this.groups.delete(id);
        changed = true;
      }
    }

    // Detect additions and updates.
    for (const [id, group] of incomingMap) {
      const existing = this.groups.get(id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(group)) {
        this.groups.set(id, group);
        changed = true;
      }
    }

    if (changed) {
      for (const handler of this.groupsChangedHandlers) {
        try {
          handler();
        } catch (err) {
          this.logger.error({ err }, "Error in onGroupsChanged handler");
        }
      }
    }

    // Fired per applied payload, even when the set is unchanged: an authoritative group
    // list can remove a group without any descriptor notification.
    for (const handler of this.groupListAppliedHandlers) {
      try {
        handler();
      } catch (err) {
        this.logger.error({ err }, "Error in onGroupListApplied handler");
      }
    }
  }

  /**
   * Handle a payload from `{prefix}/bridge/event`.
   * On join or leave events, re-request the full device list to keep the
   * registry consistent with the broker's authoritative state.
   */
  private handleBridgeEvent(event: BridgeEventPayload): void {
    if (!event || typeof event !== "object" || typeof event.type !== "string") {
      this.logger.warn("bridge/event payload is malformed — ignoring");
      return;
    }

    if (event.type === "device_joined" || event.type === "device_leave") {
      if (
        !event.data ||
        typeof event.data !== "object" ||
        typeof event.data.friendly_name !== "string"
      ) {
        this.logger.warn(
          { type: event.type },
          "bridge/event missing usable data.friendly_name — skipping",
        );
        return;
      }

      this.logger.info(
        { type: event.type, friendlyName: event.data.friendly_name },
        "Bridge device event — refreshing device list",
      );
      // Request a fresh bridge/devices publish
      const prefix = this.config.zigbee2mqttPrefix;
      this.mqtt.publish(`${prefix}/bridge/request/devices`, {});
    }
  }

  /**
   * Add a device to the registry: store metadata and subscribe to its topic. The
   * `onDeviceAdded` listeners are fired by the caller once the whole list is applied.
   */
  private addDevice(device: ZigbeeDevice): void {
    const { friendly_name } = device;
    const prefix = this.config.zigbee2mqttPrefix;

    this.devices.set(friendly_name, device);

    const handler: MqttMessageHandler = (_topic, payload) => {
      this.handleDeviceState(friendly_name, payload);
    };
    this.mqttDeviceHandlers.set(friendly_name, handler);
    this.mqtt.subscribe(`${prefix}/${friendly_name}`, handler);

    this.logger.debug({ friendlyName: friendly_name }, "Device added to registry");
  }

  /** Fire `onDeviceAdded` listeners for a device whose metadata is already registered. */
  private fireDeviceAdded(device: ZigbeeDevice): void {
    for (const cb of this.deviceAddedHandlers) {
      try {
        cb(device);
      } catch (err) {
        this.logger.error(
          { err, friendlyName: device.friendly_name },
          "Error in onDeviceAdded handler",
        );
      }
    }
  }

  /**
   * Remove a device from the registry: clear its state, unsubscribe from its
   * topic, and fire `onDeviceRemoved` listeners.
   */
  private removeDevice(friendlyName: string, device: ZigbeeDevice): void {
    const prefix = this.config.zigbee2mqttPrefix;

    this.devices.delete(friendlyName);
    this.deviceStates.delete(friendlyName);

    const handler = this.mqttDeviceHandlers.get(friendlyName);
    if (handler) {
      this.mqtt.unsubscribe(`${prefix}/${friendlyName}`, handler);
      this.mqttDeviceHandlers.delete(friendlyName);
    }

    this.logger.debug({ friendlyName }, "Device removed from registry");

    for (const cb of this.deviceRemovedHandlers) {
      try {
        cb(device);
      } catch (err) {
        this.logger.error({ err, friendlyName }, "Error in onDeviceRemoved handler");
      }
    }
  }

  /**
   * Merge an incoming device state payload into the current state and notify
   * any registered handlers.
   */
  private handleDeviceState(friendlyName: string, payload: Record<string, unknown>): void {
    // Guard against non-object payloads (e.g. a bare availability string such
    // as "online", a number, or null) which would corrupt state when spread.
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      this.logger.debug({ friendlyName, payload }, "Ignoring non-object device state payload");
      return;
    }

    const prev = this.deviceStates.get(friendlyName);
    const next = { ...prev, ...payload };
    this.deviceStates.set(friendlyName, next);

    const handlers = this.stateHandlers.get(friendlyName);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(next, prev);
      } catch (err) {
        this.logger.error({ err, friendlyName }, "Error in device state change handler");
      }
    }
  }
}

/** Structural guard for a JSON object read back from a snapshot. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural guard for a persisted device entry read back from disk. */
function isPersistedDevice(value: unknown): value is ZigbeeDevice {
  if (!isPlainObject(value)) return false;
  return typeof value.friendly_name === "string" && typeof value.ieee_address === "string";
}

/** Structural guard for a persisted group member read back from disk. */
function isPersistedGroupMember(value: unknown): value is ZigbeeGroupMember {
  if (!isPlainObject(value)) return false;
  return typeof value.ieee_address === "string" && typeof value.endpoint === "number";
}

/** A persisted group entry whose members have not been filtered yet. */
interface PersistedGroupCandidate {
  id: number;
  friendly_name: string;
  members: unknown[];
}

/**
 * Structural guard for a persisted group entry read back from disk. Individual members are
 * filtered separately so one malformed member cannot discard its group.
 */
function isPersistedGroup(value: unknown): value is PersistedGroupCandidate {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "number" &&
    typeof value.friendly_name === "string" &&
    Array.isArray(value.members)
  );
}

/** Read an optional snapshot field as a plain object, throwing on a wrong type. */
function snapshotObjectField(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new Error(`Device registry snapshot has a malformed \`${field}\` field`);
  }
  return value;
}

/** Read an optional snapshot field as an array, throwing on a wrong type. */
function snapshotArrayField(value: unknown, field: string): unknown[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`Device registry snapshot has a malformed \`${field}\` field`);
  }
  return value;
}
