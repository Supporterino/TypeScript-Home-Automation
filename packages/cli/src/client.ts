import type {
  Automation,
  AutomationRelationships,
  DeviceDescriptor,
  EnergyData,
  ExecutionRecord,
  HomekitStatus,
  Room,
  RoomBatchCommandResponse,
  RoomWithMembers,
  WallProfile,
  WallProfileConfig,
  WeatherData,
  WeatherUnavailable,
} from "@ts-ha/shared";
import { type EventStreamOptions, readEventStream } from "./event-stream.js";

/**
 * A plain `Error` carrying the engine's HTTP status, so a caller can
 * distinguish a refusal (400/503) from an unknown resource (404) — neither of
 * which is a transport failure. Plain `Error` (no subclass) per AGENTS.md.
 */
export function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/** The HTTP status an error carries, when it is an engine error response. */
export function httpStatusOf(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * HTTP client for the engine's debug API.
 */
export class DebugClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(host: string, token?: string) {
    this.baseUrl = host.startsWith("http") ? host : `http://${host}`;
    this.token = token;
  }

  // -------------------------------------------------------------------------
  // Automations
  // -------------------------------------------------------------------------

  async getReadiness(): Promise<{
    status: string;
    checks: { mqtt: boolean; engine: boolean };
    startedAt: number | null;
    tz: string | null;
  }> {
    // Readiness endpoint is unauthenticated, use raw fetch
    const url = `${this.baseUrl}/readyz`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new Error(
        `Failed to connect to ${this.baseUrl}. Is the engine running?\n${(err as Error).message}`,
      );
    }
    return (await response.json()) as {
      status: string;
      checks: { mqtt: boolean; engine: boolean };
      startedAt: number | null;
      tz: string | null;
    };
  }

  async listAutomations(): Promise<{ automations: Automation[]; count: number }> {
    return this.get("/api/automations");
  }

  async getAutomation(name: string): Promise<Automation> {
    return this.get(`/api/automations/${encodeURIComponent(name)}`);
  }

  /** Enable or disable a single automation by name. */
  async setAutomationEnabled(name: string, enabled: boolean): Promise<Automation> {
    return this.request(`/api/automations/${encodeURIComponent(name)}/enabled`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify({ enabled }),
    });
  }

  /** Read the current contents of the file an automation was loaded from. */
  async getAutomationSource(name: string): Promise<{ name: string; source: string }> {
    return this.get(`/api/automations/${encodeURIComponent(name)}/source`);
  }

  /** Retained execution records for one automation (empty if it never ran). */
  async getAutomationHistory(name: string): Promise<{ name: string; history: ExecutionRecord[] }> {
    return this.get(`/api/automations/${encodeURIComponent(name)}/history`);
  }

  /** Declared and observed relationships for one automation. */
  async getAutomationRelationships(
    name: string,
  ): Promise<{ name: string } & AutomationRelationships> {
    return this.get(`/api/automations/${encodeURIComponent(name)}/relationships`);
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  async listState(): Promise<{ state: Record<string, unknown>; count: number }> {
    return this.get("/api/state");
  }

  async getState(key: string): Promise<{ key: string; value: unknown; exists: boolean }> {
    return this.get(`/api/state/${encodeURIComponent(key)}`);
  }

  async setState(
    key: string,
    value: unknown,
  ): Promise<{ key: string; value: unknown; previous: unknown }> {
    return this.request(`/api/state/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(value),
    });
  }

  async deleteState(key: string): Promise<{ key: string; deleted: boolean }> {
    return this.request(`/api/state/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
  }

  // -------------------------------------------------------------------------
  // Devices
  // -------------------------------------------------------------------------

  async getDeviceCatalog(): Promise<{
    devices: DeviceDescriptor[];
    count: number;
    sources: string[];
  }> {
    return this.get("/api/device-catalog");
  }

  async getDevice(qualifiedId: string): Promise<DeviceDescriptor> {
    return this.get(`/api/device-catalog/${encodeURIComponent(qualifiedId)}`);
  }

  /** Issue a command to one device; `properties` is the raw JSON body. */
  async sendDeviceCommand(
    qualifiedId: string,
    properties: Record<string, unknown>,
  ): Promise<{ qualifiedId: string; status: string }> {
    return this.request(`/api/device-catalog/${encodeURIComponent(qualifiedId)}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(properties),
    });
  }

  /** Hide (`PUT`) or unhide (`DELETE`) a device. */
  async setDeviceHidden(
    qualifiedId: string,
    hidden: boolean,
  ): Promise<{ qualifiedId: string; hidden: boolean }> {
    return this.request(`/api/device-catalog/${encodeURIComponent(qualifiedId)}/hidden`, {
      method: hidden ? "PUT" : "DELETE",
    });
  }

  /** Assign a device to a room. */
  async assignDeviceRoom(
    qualifiedId: string,
    roomId: string,
  ): Promise<{ qualifiedId: string; roomId: string }> {
    return this.request(`/api/device-catalog/${encodeURIComponent(qualifiedId)}/room`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify({ roomId }),
    });
  }

  /** Clear a device's room assignment. */
  async unassignDeviceRoom(
    qualifiedId: string,
  ): Promise<{ qualifiedId: string; roomId: string | null }> {
    return this.request(`/api/device-catalog/${encodeURIComponent(qualifiedId)}/room`, {
      method: "DELETE",
    });
  }

  // -------------------------------------------------------------------------
  // Rooms
  // -------------------------------------------------------------------------

  /**
   * List rooms with their current membership.
   *
   * The engine exposes no `/api/rooms/:id`; a single room is selected from
   * this listing by id client-side, exactly as the web UI does.
   */
  async getRooms(): Promise<{ rooms: RoomWithMembers[]; count: number }> {
    return this.get("/api/rooms");
  }

  /** Devices not assigned to any room. */
  async getUnassignedDevices(): Promise<{ devices: DeviceDescriptor[]; count: number }> {
    return this.get("/api/rooms/unassigned");
  }

  async createRoom(name: string): Promise<Room> {
    return this.request("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify({ name }),
    });
  }

  async renameRoom(id: string, name: string): Promise<Room> {
    return this.request(`/api/rooms/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify({ name }),
    });
  }

  async deleteRoom(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.request(`/api/rooms/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  /** Issue one command to every capable member of a room; `properties` is the raw body. */
  async sendRoomCommand(
    id: string,
    properties: Record<string, unknown>,
  ): Promise<RoomBatchCommandResponse> {
    return this.request(`/api/rooms/${encodeURIComponent(id)}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(properties),
    });
  }

  // -------------------------------------------------------------------------
  // Walls
  // -------------------------------------------------------------------------

  async getWalls(): Promise<{ walls: WallProfile[]; count: number }> {
    return this.get("/api/walls");
  }

  async getWall(name: string): Promise<WallProfile> {
    return this.get(`/api/walls/${encodeURIComponent(name)}`);
  }

  async createWall(name: string, config: WallProfileConfig): Promise<WallProfile> {
    return this.request("/api/walls", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify({ name, config }),
    });
  }

  /** Update a wall's config and/or rename it. */
  async updateWall(
    name: string,
    input: { name?: string; config?: WallProfileConfig },
  ): Promise<WallProfile> {
    return this.request(`/api/walls/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(input),
    });
  }

  async deleteWall(name: string): Promise<{ name: string; deleted: boolean }> {
    return this.request(`/api/walls/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // Energy
  // -------------------------------------------------------------------------

  async getEnergy(): Promise<EnergyData> {
    return this.get("/api/energy");
  }

  // -------------------------------------------------------------------------
  // Weather
  // -------------------------------------------------------------------------

  /**
   * Fetch current conditions and forecast.
   *
   * The engine answers `404` when no weather service is registered and `400`
   * when no location is resolvable; both mean the feature is unconfigured
   * rather than errored, so they resolve to a {@link WeatherUnavailable} marker
   * instead of throwing. A `502` or a transport failure still throws.
   */
  async getWeather(): Promise<WeatherData | WeatherUnavailable> {
    const response = await this.fetchRaw("/api/weather", { method: "GET" });

    if (response.status === 404) return { available: false, reason: "service_unregistered" };
    if (response.status === 400) return { available: false, reason: "no_location" };

    const body = await response.json();
    if (!response.ok) {
      const msg = (body as { error?: string }).error ?? `HTTP ${response.status}`;
      throw httpError(msg, response.status);
    }

    return body as WeatherData;
  }

  // -------------------------------------------------------------------------
  // HomeKit
  // -------------------------------------------------------------------------

  /**
   * Runtime HomeKit bridge status, or `null` when the service is not
   * configured (the endpoint answers 404).
   */
  async getHomekitStatus(): Promise<HomekitStatus | null> {
    return this.get<HomekitStatus>("/api/homekit/status").catch(() => null);
  }

  // -------------------------------------------------------------------------
  // Logs
  // -------------------------------------------------------------------------

  async getLogs(options?: { automation?: string; level?: string; limit?: number }): Promise<{
    entries: { level: number; time: number; msg: string; [key: string]: unknown }[];
    count: number;
  }> {
    const params = new URLSearchParams();
    if (options?.automation) params.set("automation", options.automation);
    if (options?.level) params.set("level", options.level);
    if (options?.limit) params.set("limit", String(options.limit));

    const query = params.toString();
    return this.get(`/api/logs${query ? `?${query}` : ""}`);
  }

  // -------------------------------------------------------------------------
  // Trigger
  // -------------------------------------------------------------------------

  async triggerAutomation(
    name: string,
    context: { type: string; [key: string]: unknown },
  ): Promise<{ status: string; automation: string; type: string }> {
    return this.request(`/api/automations/${encodeURIComponent(name)}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(context),
    });
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Read the realtime event stream, carrying this client's host and token.
   * The token stays encapsulated — an `EventSource` cannot attach it, so the
   * reader is fetch-based (design.md D3).
   */
  async streamEvents(options: Omit<EventStreamOptions, "host" | "token">): Promise<void> {
    return readEventStream({ host: this.baseUrl, token: this.token, ...options });
  }

  private authHeaders(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private async fetchRaw(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    // Merge auth headers with any existing headers
    const headers = {
      ...this.authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    };

    try {
      return await fetch(url, { ...init, headers });
    } catch (err) {
      throw new Error(
        `Failed to connect to ${this.baseUrl}. Is the engine running?\n${(err as Error).message}`,
      );
    }
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchRaw(path, init);

    const body = await response.json();

    if (!response.ok) {
      const msg = (body as { error?: string }).error ?? `HTTP ${response.status}`;
      throw httpError(msg, response.status);
    }

    return body as T;
  }
}
