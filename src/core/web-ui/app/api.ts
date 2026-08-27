/** Typed fetch wrappers for the web UI API, plus the realtime event stream. */

import type {
  Automation,
  AutomationRelationships,
  Capability,
  DeviceDescriptor,
  ExecutionRecord,
  HomekitStatus,
  LogEntry,
  RoomWithMembers,
  StateMap,
  StatusData,
  TriggerContext,
} from "./types.js";

let _token = "";
let _basePath = "/status";

export function initApi(basePath: string, token: string) {
  _basePath = basePath;
  _token = token;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(path, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  if (res.status === 401) {
    window.location.href = `${_basePath}/login`;
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Status ──────────────────────────────────────────────────────────────

export function fetchStatus(): Promise<StatusData> {
  return apiFetch<StatusData>("/api/status");
}

// ── Automations ─────────────────────────────────────────────────────────

export async function fetchAutomations(): Promise<Automation[]> {
  const res = await apiFetch<{ automations: Automation[]; count: number }>("/api/automations");
  return res.automations;
}

export function fetchAutomation(name: string): Promise<Automation> {
  return apiFetch<Automation>(`/api/automations/${encodeURIComponent(name)}`);
}

export function setAutomationEnabled(name: string, enabled: boolean): Promise<Automation> {
  return apiFetch<Automation>(`/api/automations/${encodeURIComponent(name)}/enabled`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export async function fetchAutomationSource(name: string): Promise<string> {
  const res = await apiFetch<{ name: string; source: string }>(
    `/api/automations/${encodeURIComponent(name)}/source`,
  );
  return res.source;
}

export async function fetchAutomationHistory(name: string): Promise<ExecutionRecord[]> {
  const res = await apiFetch<{ name: string; history: ExecutionRecord[] }>(
    `/api/automations/${encodeURIComponent(name)}/history`,
  );
  return res.history;
}

export function fetchAutomationRelationships(name: string): Promise<AutomationRelationships> {
  return apiFetch<AutomationRelationships & { name: string }>(
    `/api/automations/${encodeURIComponent(name)}/relationships`,
  );
}

export async function triggerAutomation(
  name: string,
  context: Record<string, unknown>,
): Promise<void> {
  await apiFetch(`/api/automations/${encodeURIComponent(name)}/trigger`, {
    method: "POST",
    body: JSON.stringify(context),
  });
}

/** Builds a minimal manual-trigger body for {@link triggerAutomation} from an automation's declared trigger types. */
export function manualTriggerContext(type: TriggerContext["type"]): Record<string, unknown> {
  return { type };
}

// ── State ───────────────────────────────────────────────────────────────

export async function fetchState(): Promise<StateMap> {
  const res = await apiFetch<{ state: StateMap; count: number }>("/api/state");
  return res.state;
}

export async function setStateKey(key: string, value: unknown): Promise<void> {
  await apiFetch(`/api/state/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify(value),
  });
}

export async function deleteStateKey(key: string): Promise<void> {
  await apiFetch(`/api/state/${encodeURIComponent(key)}`, { method: "DELETE" });
}

// ── Logs ────────────────────────────────────────────────────────────────

export async function fetchLogs(limit = 200): Promise<LogEntry[]> {
  const res = await apiFetch<{ entries: LogEntry[]; count: number }>(`/api/logs?limit=${limit}`);
  return res.entries;
}

// ── Device catalog ──────────────────────────────────────────────────────

export async function fetchDeviceCatalog(): Promise<DeviceDescriptor[]> {
  const res = await apiFetch<{ devices: DeviceDescriptor[]; count: number; sources: string[] }>(
    "/api/device-catalog",
  );
  return res.devices;
}

export function fetchDevice(qualifiedId: string): Promise<DeviceDescriptor> {
  return apiFetch<DeviceDescriptor>(`/api/device-catalog/${encodeURIComponent(qualifiedId)}`);
}

export async function sendDeviceCommand(
  qualifiedId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  await apiFetch(`/api/device-catalog/${encodeURIComponent(qualifiedId)}/command`, {
    method: "POST",
    body: JSON.stringify(properties),
  });
}

export async function assignDeviceRoom(qualifiedId: string, roomId: string): Promise<void> {
  await apiFetch(`/api/device-catalog/${encodeURIComponent(qualifiedId)}/room`, {
    method: "PUT",
    body: JSON.stringify({ roomId }),
  });
}

export async function unassignDeviceRoom(qualifiedId: string): Promise<void> {
  await apiFetch(`/api/device-catalog/${encodeURIComponent(qualifiedId)}/room`, {
    method: "DELETE",
  });
}

// ── Rooms ───────────────────────────────────────────────────────────────

export async function fetchRooms(): Promise<RoomWithMembers[]> {
  const res = await apiFetch<{ rooms: RoomWithMembers[]; count: number }>("/api/rooms");
  return res.rooms;
}

export async function fetchUnassignedDevices(): Promise<DeviceDescriptor[]> {
  const res = await apiFetch<{ devices: DeviceDescriptor[]; count: number }>(
    "/api/rooms/unassigned",
  );
  return res.devices;
}

export function createRoom(name: string): Promise<{ id: string; name: string }> {
  return apiFetch("/api/rooms", { method: "POST", body: JSON.stringify({ name }) });
}

export function renameRoom(id: string, name: string): Promise<{ id: string; name: string }> {
  return apiFetch(`/api/rooms/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function deleteRoom(id: string): Promise<void> {
  await apiFetch(`/api/rooms/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── HomeKit ─────────────────────────────────────────────────────────────

/** `null` when the HomeKit service is not configured (the route itself is unregistered → 404). */
export async function fetchHomekitStatus(): Promise<HomekitStatus | null> {
  try {
    return await apiFetch<HomekitStatus>("/api/homekit/status");
  } catch {
    return null;
  }
}

// ── Realtime event stream ───────────────────────────────────────────────

/**
 * Opens the realtime event stream (design.md D9; specs/web-ui "Data
 * Sources"). Cookie-based session auth travels automatically with an
 * `EventSource` request — there is no way to attach an `Authorization`
 * header to one — so this relies entirely on the session cookie set at
 * login, exactly like every other same-origin browser navigation here.
 */
export function openEventStream(): EventSource {
  return new EventSource("/api/events");
}
