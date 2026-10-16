/** Typed fetch wrappers for the web UI API, plus the realtime event stream. */

import type {
  EnergyData,
  RoomBatchCommandResponse,
  WeatherData,
  WeatherUnavailable,
} from "@ts-ha/shared";
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
  WallProfile,
  WallProfileConfig,
} from "./types.js";

let _token = "";
let _basePath = "/status";

export function initApi(basePath: string, token: string) {
  _basePath = basePath;
  _token = token;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetchResponse(path, options);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Performs an authenticated request and applies only the shared 401 redirect,
 * leaving status handling to the caller.
 */
async function apiFetchResponse(path: string, options: RequestInit = {}): Promise<Response> {
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

  return res;
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

/** Builds a minimal manual-trigger body for {@link triggerAutomation}. */
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

export async function hideDevice(qualifiedId: string): Promise<void> {
  await apiFetch(`/api/device-catalog/${encodeURIComponent(qualifiedId)}/hidden`, {
    method: "PUT",
  });
}

export async function unhideDevice(qualifiedId: string): Promise<void> {
  await apiFetch(`/api/device-catalog/${encodeURIComponent(qualifiedId)}/hidden`, {
    method: "DELETE",
  });
}

// ── Rooms ───────────────────────────────────────────────────────────────

export async function fetchRooms(): Promise<RoomWithMembers[]> {
  const res = await apiFetch<{ rooms: RoomWithMembers[]; count: number }>("/api/rooms");
  return res.rooms;
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

/**
 * Issues one property command to every capable member of a room; the response
 * reports each member's outcome so the caller can reconcile them independently.
 */
export function sendRoomCommand(
  roomId: string,
  properties: Record<string, unknown>,
): Promise<RoomBatchCommandResponse> {
  return apiFetch<RoomBatchCommandResponse>(`/api/rooms/${encodeURIComponent(roomId)}/command`, {
    method: "POST",
    body: JSON.stringify(properties),
  });
}

// ── Walls ───────────────────────────────────────────────────────────────

export async function fetchWalls(): Promise<WallProfile[]> {
  const res = await apiFetch<{ walls: WallProfile[]; count: number }>("/api/walls");
  return res.walls;
}

/**
 * Fetches a wall profile, resolving `null` only on a `404`; every other failure
 * still throws, so a transport error is never mistaken for a missing profile.
 */
export async function fetchWallOrNull(name: string): Promise<WallProfile | null> {
  const res = await apiFetchResponse(`/api/walls/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<WallProfile>;
}

export function createWall(name: string, config: WallProfileConfig): Promise<WallProfile> {
  return apiFetch<WallProfile>("/api/walls", {
    method: "POST",
    body: JSON.stringify({ name, config }),
  });
}

export function updateWall(
  name: string,
  input: { name?: string; config?: WallProfileConfig },
): Promise<WallProfile> {
  return apiFetch<WallProfile>(`/api/walls/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteWall(name: string): Promise<void> {
  await apiFetch(`/api/walls/${encodeURIComponent(name)}`, { method: "DELETE" });
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

// ── Energy ──────────────────────────────────────────────────────────────

export function fetchEnergy(): Promise<EnergyData> {
  return apiFetch<EnergyData>("/api/energy");
}

// ── Weather ─────────────────────────────────────────────────────────────

/**
 * Fetches current conditions and forecast. The engine's `404` (no service) and
 * `400` (no location) resolve to a {@link WeatherUnavailable} marker.
 */
export async function fetchWeather(): Promise<WeatherData | WeatherUnavailable> {
  const res = await apiFetchResponse("/api/weather");
  if (res.status === 404) return { available: false, reason: "service_unregistered" };
  if (res.status === 400) return { available: false, reason: "no_location" };
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<WeatherData>;
}

// ── Realtime event stream ───────────────────────────────────────────────

/**
 * Opens the realtime event stream. Auth relies entirely on the session cookie,
 * since an `EventSource` request cannot carry an `Authorization` header.
 */
export function openEventStream(): EventSource {
  return new EventSource("/api/events");
}
