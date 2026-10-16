import { afterEach, describe, expect, it, mock } from "bun:test";
import { DebugClient, httpStatusOf } from "../src/client.js";

const originalFetch = globalThis.fetch;

function mockFetch(body: unknown, status = 200): ReturnType<typeof mock> {
  const fn = mock(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function calls(fn: ReturnType<typeof mock>): [string, RequestInit][] {
  return fn.mock.calls as [string, RequestInit][];
}

function bodyOf(init: RequestInit): unknown {
  return JSON.parse(init.body as string);
}

describe("DebugClient device control", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends a device command with the properties as the raw body", async () => {
    const fetchMock = mockFetch({ qualifiedId: "zigbee:1", status: "ok" });

    const client = new DebugClient("engine");
    const result = await client.sendDeviceCommand("zigbee:1", { state: "ON" });

    expect(result).toEqual({ qualifiedId: "zigbee:1", status: "ok" });
    const [url, init] = calls(fetchMock)[0];
    expect(url).toBe("http://engine/api/device-catalog/zigbee%3A1/command");
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ state: "ON" });
  });

  it("maps a refused device command to an error carrying the status", async () => {
    mockFetch({ error: "Invalid command", qualifiedId: "zigbee:1" }, 400);

    const client = new DebugClient("engine");
    const error = await client
      .sendDeviceCommand("zigbee:1", { state: "ON" })
      .catch((err: unknown) => err);

    expect(httpStatusOf(error)).toBe(400);
    expect((error as Error).message).toBe("Invalid command");
  });

  it("hides with PUT and unhides with DELETE", async () => {
    const fetchMock = mockFetch({ qualifiedId: "zigbee:1", hidden: true });

    const client = new DebugClient("engine");
    await client.setDeviceHidden("zigbee:1", true);
    expect(calls(fetchMock)[0][1].method).toBe("PUT");

    await client.setDeviceHidden("zigbee:1", false);
    expect(calls(fetchMock)[1][1].method).toBe("DELETE");
  });

  it("assigns and unassigns a device's room", async () => {
    const fetchMock = mockFetch({ qualifiedId: "zigbee:1", roomId: "living" });

    const client = new DebugClient("engine");
    await client.assignDeviceRoom("zigbee:1", "living");
    expect(calls(fetchMock)[0][0]).toBe("http://engine/api/device-catalog/zigbee%3A1/room");
    expect(calls(fetchMock)[0][1].method).toBe("PUT");
    expect(bodyOf(calls(fetchMock)[0][1])).toEqual({ roomId: "living" });

    await client.unassignDeviceRoom("zigbee:1");
    expect(calls(fetchMock)[1][1].method).toBe("DELETE");
  });

  it("maps an unknown room on assign to a 404 error", async () => {
    mockFetch({ error: "Room not found", roomId: "nope" }, 404);

    const client = new DebugClient("engine");
    const error = await client.assignDeviceRoom("zigbee:1", "nope").catch((err: unknown) => err);

    expect(httpStatusOf(error)).toBe(404);
    expect((error as Error).message).toBe("Room not found");
  });
});

describe("DebugClient room control", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates, renames, and deletes rooms", async () => {
    const fetchMock = mockFetch({ id: "living", name: "Living Room" });

    const client = new DebugClient("engine");
    await client.createRoom("Living Room");
    expect(calls(fetchMock)[0][0]).toBe("http://engine/api/rooms");
    expect(calls(fetchMock)[0][1].method).toBe("POST");
    expect(bodyOf(calls(fetchMock)[0][1])).toEqual({ name: "Living Room" });

    await client.renameRoom("living", "Lounge");
    expect(calls(fetchMock)[1][0]).toBe("http://engine/api/rooms/living");
    expect(calls(fetchMock)[1][1].method).toBe("PUT");
    expect(bodyOf(calls(fetchMock)[1][1])).toEqual({ name: "Lounge" });

    await client.deleteRoom("living");
    expect(calls(fetchMock)[2][1].method).toBe("DELETE");
  });

  it("maps a duplicate room name to a 409 error", async () => {
    mockFetch({ error: "A room named X already exists" }, 409);

    const client = new DebugClient("engine");
    const error = await client.createRoom("X").catch((err: unknown) => err);

    expect(httpStatusOf(error)).toBe(409);
  });

  it("sends a room command and returns the bare outcome array", async () => {
    const results = [
      { qualifiedId: "zigbee:1", outcome: "applied" },
      { qualifiedId: "shelly:tv", outcome: "skipped" },
    ];
    const fetchMock = mockFetch(results);

    const client = new DebugClient("engine");
    const received = await client.sendRoomCommand("living", { state: "ON" });

    expect(received).toEqual(results);
    expect(calls(fetchMock)[0][0]).toBe("http://engine/api/rooms/living/command");
    expect(bodyOf(calls(fetchMock)[0][1])).toEqual({ state: "ON" });
  });
});

describe("DebugClient wall administration", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates, updates, and deletes wall profiles", async () => {
    const wall = { name: "hall", version: 1, config: { widgets: [] } };
    const fetchMock = mockFetch(wall);

    const client = new DebugClient("engine");
    await client.createWall("hall", { widgets: [] });
    expect(calls(fetchMock)[0][0]).toBe("http://engine/api/walls");
    expect(calls(fetchMock)[0][1].method).toBe("POST");
    expect(bodyOf(calls(fetchMock)[0][1])).toEqual({ name: "hall", config: { widgets: [] } });

    await client.updateWall("hall", { config: { widgets: [] } });
    expect(calls(fetchMock)[1][0]).toBe("http://engine/api/walls/hall");
    expect(calls(fetchMock)[1][1].method).toBe("PUT");
    expect(bodyOf(calls(fetchMock)[1][1])).toEqual({ config: { widgets: [] } });

    await client.deleteWall("hall");
    expect(calls(fetchMock)[2][1].method).toBe("DELETE");
  });

  it("maps an invalid wall config to a 400 error", async () => {
    mockFetch({ error: "Invalid config" }, 400);

    const client = new DebugClient("engine");
    const error = await client.createWall("hall", { widgets: [] }).catch((err: unknown) => err);

    expect(httpStatusOf(error)).toBe(400);
  });
});
