/** Typed fetch wrappers for the web UI API. */

import type {
  Automation,
  DashboardData,
  DeviceInfo,
  HomekitStatus,
  LogEntry,
  StateMap,
  StatusData,
} from "./types";

let _token = "";
let _basePath = "/status";

export function initApi(basePath: string, token: string) {
  _basePath = basePath;
  _token = token;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  if (res.status === 401) {
    // Redirect to login — clear stored token first
    sessionStorage.removeItem("ts-ha-token");
    window.location.href = `${_basePath}/login`;
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchAll(): Promise<DashboardData> {
  const [statusRes, automationsRes, stateRes, logsRes, devicesRes, homekitRes] = await Promise.all([
    apiFetch<StatusData>("/api/status"),
    apiFetch<{ automations: Automation[]; count: number }>("/api/automations"),
    apiFetch<{ state: StateMap; count: number }>("/api/state"),
    apiFetch<{ entries: LogEntry[]; count: number }>("/api/logs?limit=150"),
    apiFetch<{ devices: DeviceInfo[]; count: number }>("/api/devices")
      .then((r) => ({ devices: r.devices, available: true }))
      .catch((err: unknown) => {
        // 503 means the registry is disabled — surface gracefully
        if ((err as Error).message?.includes("Device registry is disabled")) {
          return { devices: [] as DeviceInfo[], available: false };
        }
        // Any other error (network etc.) — show empty but don't hide the tab
        return { devices: [] as DeviceInfo[], available: true };
      }),
    apiFetch<HomekitStatus>("/api/homekit/status").catch(() => null),
  ]);

  return {
    status: statusRes,
    automations: automationsRes.automations,
    state: stateRes.state,
    logs: logsRes.entries,
    devices: devicesRes.devices,
    devicesAvailable: devicesRes.available,
    homekit: homekitRes,
  };
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

export async function setStateKey(key: string, value: unknown): Promise<void> {
  await apiFetch(`/api/state/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify(value),
  });
}

export async function deleteStateKey(key: string): Promise<void> {
  await apiFetch(`/api/state/${encodeURIComponent(key)}`, { method: "DELETE" });
}
