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

  async listAutomations(): Promise<{
    automations: { name: string; triggers: { type: string; [key: string]: unknown }[] }[];
    count: number;
  }> {
    return this.get("/debug/automations");
  }

  async getAutomation(
    name: string,
  ): Promise<{ name: string; triggers: { type: string; [key: string]: unknown }[] }> {
    return this.get(`/debug/automations/${encodeURIComponent(name)}`);
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  async listState(): Promise<{ state: Record<string, unknown>; count: number }> {
    return this.get("/debug/state");
  }

  async getState(key: string): Promise<{ key: string; value: unknown; exists: boolean }> {
    return this.get(`/debug/state/${encodeURIComponent(key)}`);
  }

  async setState(
    key: string,
    value: unknown,
  ): Promise<{ key: string; value: unknown; previous: unknown }> {
    return this.request(`/debug/state/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(value),
    });
  }

  async deleteState(key: string): Promise<{ key: string; deleted: boolean }> {
    return this.request(`/debug/state/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private authHeaders(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // Merge auth headers with any existing headers
    const headers = {
      ...this.authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    };

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (err) {
      throw new Error(
        `Failed to connect to ${this.baseUrl}. Is the engine running?\n${(err as Error).message}`,
      );
    }

    const body = await response.json();

    if (!response.ok) {
      const msg = (body as { error?: string }).error ?? `HTTP ${response.status}`;
      throw new Error(msg);
    }

    return body as T;
  }
}
