/**
 * Pure payload normalisation.
 *
 * API and event-stream payloads are coerced through here before they reach
 * any component, so an unfamiliar shape — `null`, a missing field, or a
 * field of the wrong type — produces a well-formed, renderable value
 * instead of reaching a component and throwing (design.md D23). This is
 * what the error boundary (task 1.0) is a backstop for, not a substitute
 * for.
 *
 * Every function here is a pure coercion: given anything, it returns
 * something safe to render (or, for the event stream, `null` to mean
 * "ignore this event"). None of them throw.
 */

import type {
  Automation,
  AutomationRelationships,
  Capability,
  DeviceDescriptor,
  DeviceObservation,
  ExecutionRecord,
  HomekitStatus,
  LogEntry,
  RequiredServiceStatus,
  Room,
  RoomWithMembers,
  StateMap,
  StatusChecks,
  StatusData,
  StreamEvent,
  TriggerContext,
  TriggerDef,
} from "../types.js";

// ── Primitive coercions ──────────────────────────────────────────────────────

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ── Domain normalisers ───────────────────────────────────────────────────────

export function normalizeStatusChecks(value: unknown): StatusChecks {
  const rec = asRecord(value);
  return {
    mqtt: asBoolean(rec.mqtt),
    engine: asBoolean(rec.engine),
  };
}

export function normalizeStatus(value: unknown): StatusData {
  const rec = asRecord(value);
  return {
    status: rec.status === "ready" ? "ready" : "not ready",
    checks: normalizeStatusChecks(rec.checks),
    startedAt: asNullableNumber(rec.startedAt),
    tz: typeof rec.tz === "string" ? rec.tz : null,
  };
}

export function normalizeTrigger(value: unknown): TriggerDef {
  const rec = asRecord(value);
  const type = rec.type;
  const known = type === "mqtt" || type === "cron" || type === "state" || type === "webhook";
  return { ...rec, type: known ? type : "webhook" };
}

export function normalizeAutomation(value: unknown): Automation {
  const rec = asRecord(value);
  return {
    name: asString(rec.name, "unknown"),
    enabled: asBoolean(rec.enabled, true),
    triggers: asArray(rec.triggers).map(normalizeTrigger),
  };
}

export function normalizeLogEntry(value: unknown): LogEntry {
  const rec = asRecord(value);
  return {
    ...rec,
    level: asNumber(rec.level, 30),
    time: asNumber(rec.time, Date.now()),
    msg: asString(rec.msg, ""),
    automation: typeof rec.automation === "string" ? rec.automation : undefined,
  };
}

export function normalizeState(value: unknown): StateMap {
  return asRecord(value);
}

export function normalizeHomekitStatus(value: unknown): HomekitStatus | null {
  if (value === null || value === undefined) return null;
  const rec = asRecord(value);
  return {
    running: asBoolean(rec.running),
    bridgeName: asString(rec.bridgeName),
    port: asNumber(rec.port),
    username: asString(rec.username),
    persistPath: asString(rec.persistPath),
    accessoryCount: asNumber(rec.accessoryCount),
    bind: Array.isArray(rec.bind)
      ? rec.bind.filter((b): b is string => typeof b === "string")
      : typeof rec.bind === "string"
        ? rec.bind
        : undefined,
  };
}

// ── Capability vocabulary (design.md D22) ───────────────────────────────────

const VALUE_TYPES = new Set(["boolean", "numeric", "enum", "text", "composite", "list", "unknown"]);

export function normalizeCapability(value: unknown): Capability {
  const rec = asRecord(value);
  const accessRec = asRecord(rec.access);
  const valueType =
    typeof rec.valueType === "string" && VALUE_TYPES.has(rec.valueType)
      ? (rec.valueType as Capability["valueType"])
      : "unknown";

  const capability: Capability = {
    kind: asString(rec.kind, "unknown"),
    access: { readable: asBoolean(accessRec.readable), writable: asBoolean(accessRec.writable) },
    valueType,
  };

  if (typeof rec.name === "string") capability.name = rec.name;
  if (typeof rec.property === "string") capability.property = rec.property;
  if (typeof rec.unit === "string") capability.unit = rec.unit;
  if (typeof rec.step === "number") capability.step = rec.step;

  if (rec.range !== undefined) {
    const rangeRec = asRecord(rec.range);
    capability.range = {
      min: asNullableNumber(rangeRec.min) ?? undefined,
      max: asNullableNumber(rangeRec.max) ?? undefined,
    };
  }
  if (Array.isArray(rec.permittedValues)) {
    capability.permittedValues = rec.permittedValues.filter(
      (v): v is string | number => typeof v === "string" || typeof v === "number",
    );
  }
  if (Array.isArray(rec.features)) {
    capability.features = rec.features.map(normalizeCapability);
  }

  return capability;
}

export function normalizeCapabilities(value: unknown): Capability[] {
  return asArray<unknown>(value).map(normalizeCapability);
}

// ── Device descriptors (design.md D2) ───────────────────────────────────────

export function normalizeDeviceDescriptor(value: unknown): DeviceDescriptor {
  const rec = asRecord(value);
  const observationRec = asRecord(rec.observation);
  const mode = observationRec.mode === "polled" ? "polled" : "push";

  const descriptor: DeviceDescriptor = {
    source: asString(rec.source, "unknown"),
    id: asString(rec.id),
    qualifiedId: asString(rec.qualifiedId),
    displayName: asString(rec.displayName, asString(rec.qualifiedId, "Unknown device")),
    state: asRecord(rec.state),
    capabilities: normalizeCapabilities(rec.capabilities),
    reachable: asBoolean(rec.reachable, true),
    observation: {
      mode,
      observedAt: asNumber(observationRec.observedAt, Date.now()),
      refreshIntervalMs: asNullableNumber(observationRec.refreshIntervalMs) ?? undefined,
    },
    hidden: asBoolean(rec.hidden),
  };
  if (Array.isArray(rec.memberQualifiedIds)) {
    descriptor.memberQualifiedIds = rec.memberQualifiedIds.filter(
      (id): id is string => typeof id === "string",
    );
  }
  return descriptor;
}

export function normalizeDeviceDescriptors(value: unknown): DeviceDescriptor[] {
  return asArray<unknown>(value).map(normalizeDeviceDescriptor);
}

// ── Rooms (design.md D14) ────────────────────────────────────────────────────

export function normalizeRoom(value: unknown): Room {
  const rec = asRecord(value);
  return { id: asString(rec.id), name: asString(rec.name, "Unnamed room") };
}

export function normalizeRoomWithMembers(value: unknown): RoomWithMembers {
  const rec = asRecord(value);
  const members = asArray<unknown>(rec.members).map((m) => {
    const memberRec = asRecord(m);
    const available = asBoolean(memberRec.available);
    return {
      qualifiedId: asString(memberRec.qualifiedId),
      available,
      device:
        available && memberRec.device !== null && memberRec.device !== undefined
          ? normalizeDeviceDescriptor(memberRec.device)
          : null,
    };
  });
  return { id: asString(rec.id), name: asString(rec.name, "Unnamed room"), members };
}

export function normalizeRoomsWithMembers(value: unknown): RoomWithMembers[] {
  return asArray<unknown>(value).map(normalizeRoomWithMembers);
}

// ── Automation observability (design.md D11) ────────────────────────────────

export function normalizeExecutionRecord(value: unknown): ExecutionRecord {
  const rec = asRecord(value);
  const outcome = rec.outcome === "failure" ? "failure" : "success";
  const record: ExecutionRecord = {
    startedAt: asNumber(rec.startedAt, Date.now()),
    trigger: asRecord(rec.trigger) as unknown as ExecutionRecord["trigger"],
    durationMs: asNumber(rec.durationMs),
    outcome,
  };
  if (typeof rec.error === "string") record.error = rec.error;
  return record;
}

export function normalizeExecutionHistory(value: unknown): ExecutionRecord[] {
  return asArray<unknown>(value).map(normalizeExecutionRecord);
}

function normalizeRequiredServiceStatus(value: unknown): RequiredServiceStatus {
  const rec = asRecord(value);
  return { name: asString(rec.name), registered: asBoolean(rec.registered) };
}

export function normalizeAutomationRelationships(value: unknown): AutomationRelationships {
  const rec = asRecord(value);
  const declaredRec = asRecord(rec.declared);
  const observedRec = asRecord(rec.observed);
  return {
    declared: {
      requiredServices: asArray<unknown>(declaredRec.requiredServices).map(
        normalizeRequiredServiceStatus,
      ),
      relatedDevices: asArray<unknown>(declaredRec.relatedDevices).filter(
        (d): d is string => typeof d === "string",
      ),
      watchedStateKeys: asArray<unknown>(declaredRec.watchedStateKeys).filter(
        (k): k is string => typeof k === "string",
      ),
    },
    observed: {
      writtenStateKeys: asArray<unknown>(observedRec.writtenStateKeys).filter(
        (k): k is string => typeof k === "string",
      ),
      truncated: asBoolean(observedRec.truncated),
    },
  };
}

// ── Realtime event stream ────────────────────────────────────────────────

function normalizeObservation(value: unknown): DeviceObservation {
  const rec = asRecord(value);
  const mode = rec.mode === "polled" ? "polled" : "push";
  return {
    mode,
    observedAt: asNumber(rec.observedAt, Date.now()),
    refreshIntervalMs: asNullableNumber(rec.refreshIntervalMs) ?? undefined,
  };
}

/**
 * Normalises one decoded SSE payload. An unrecognised or malformed category
 * — a future server version, a corrupt frame — degrades to `{category:
 * "unknown"}` rather than throwing (design.md D23), so the data layer can
 * unconditionally ignore anything it does not recognise.
 */
export function normalizeStreamEvent(value: unknown): StreamEvent {
  const rec = asRecord(value);

  switch (rec.category) {
    case "state":
      return {
        category: "state",
        key: asString(rec.key),
        value: rec.value,
        previous: rec.previous,
      };
    case "log":
      return { category: "log", entry: normalizeLogEntry(rec.entry) };
    case "automation":
      return { category: "automation", name: asString(rec.name), enabled: asBoolean(rec.enabled) };
    case "readiness":
      return { category: "readiness", ready: asBoolean(rec.ready) };
    case "fell_behind":
      return { category: "fell_behind" };
    case "device_state":
      return {
        category: "device_state",
        qualifiedId: asString(rec.qualifiedId),
        properties: asRecord(rec.properties),
        observation: normalizeObservation(rec.observation),
      };
    case "device_reachability":
      return {
        category: "device_reachability",
        qualifiedId: asString(rec.qualifiedId),
        reachable: asBoolean(rec.reachable),
      };
    case "device_appeared":
      return { category: "device_appeared", device: normalizeDeviceDescriptor(rec.device) };
    case "device_disappeared":
      return { category: "device_disappeared", qualifiedId: asString(rec.qualifiedId) };
    case "automation_execution": {
      const outcome = rec.outcome === "failure" ? "failure" : "success";
      return {
        category: "automation_execution",
        automation: asString(rec.automation),
        trigger: asRecord(rec.trigger) as unknown as TriggerContext,
        durationMs: asNumber(rec.durationMs),
        outcome,
      };
    }
    case "room":
      return {
        category: "room",
        id: asString(rec.id),
        room: rec.room === null || rec.room === undefined ? null : normalizeRoom(rec.room),
      };
    case "room_membership":
      return {
        category: "room_membership",
        qualifiedId: asString(rec.qualifiedId),
        roomId: typeof rec.roomId === "string" ? rec.roomId : null,
      };
    case "device_visibility":
      return {
        category: "device_visibility",
        qualifiedId: asString(rec.qualifiedId),
        hidden: asBoolean(rec.hidden),
      };
    default:
      return { category: "unknown" };
  }
}
