import { afterEach, describe, expect, it, mock } from "bun:test";
import type { DeviceDescriptor } from "@ts-ha/shared";
import { DebugClient } from "../src/client.js";

const originalFetch = globalThis.fetch;

function mockFetch(body: unknown, status = 200): ReturnType<typeof mock> {
  const fn = mock(
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function fetchCalls(): [string, RequestInit][] {
  return (globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls as [
    string,
    RequestInit,
  ][];
}

function makeDescriptor(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    source: "zigbee",
    id: "0x00124b0024c0ffee",
    qualifiedId: "zigbee:0x00124b0024c0ffee",
    displayName: "Living Room Light",
    state: { state: "ON" },
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 1_700_000_000_000 },
    hidden: false,
    ...overrides,
  };
}

describe("DebugClient device catalog", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("requests the unified device catalog", async () => {
    const catalog = { devices: [makeDescriptor()], count: 1, sources: ["zigbee"] };
    const fetchMock = mockFetch(catalog);

    const client = new DebugClient("engine:8080");
    const result = await client.getDeviceCatalog();

    expect(result).toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchCalls()[0];
    expect(url).toBe("http://engine:8080/api/device-catalog");
  });

  it("encodes the qualified id when fetching a single device", async () => {
    const fetchMock = mockFetch(makeDescriptor());

    const client = new DebugClient("engine:8080");
    await client.getDevice("zigbee:0x00124b0024c0ffee");

    const [url] = fetchCalls()[0];
    expect(url).toBe("http://engine:8080/api/device-catalog/zigbee%3A0x00124b0024c0ffee");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("attaches the bearer token when configured", async () => {
    mockFetch({ devices: [], count: 0, sources: [] });

    const client = new DebugClient("engine:8080", "secret");
    await client.getDeviceCatalog();

    const [, init] = fetchCalls()[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("omits the authorization header when no token is configured", async () => {
    mockFetch({ devices: [], count: 0, sources: [] });

    const client = new DebugClient("engine:8080");
    await client.getDeviceCatalog();

    const [, init] = fetchCalls()[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("surfaces the engine's not-found error", async () => {
    mockFetch({ error: "Device not found", qualifiedId: "zigbee:nope" }, 404);

    const client = new DebugClient("engine:8080");
    await expect(client.getDevice("zigbee:nope")).rejects.toThrow("Device not found");
  });
});
