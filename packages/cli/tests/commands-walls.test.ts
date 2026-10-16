import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { WallProfile } from "@ts-ha/shared";
import type { DebugClient } from "../src/client.js";
import { createWall, deleteWall, getWall, listWalls, updateWall } from "../src/commands/walls.js";

const originalLog = console.log;
const originalError = console.error;
const originalExit = process.exit;

const wall: WallProfile = { name: "hall", version: 1, config: { widgets: [] } };

function createClient(overrides: Partial<Record<string, unknown>> = {}): DebugClient {
  return {
    getWalls: mock(async () => ({ walls: [wall], count: 1 })),
    getWall: mock(async () => wall),
    createWall: mock(async (name: string, config: unknown) => ({ name, version: 1, config })),
    updateWall: mock(async (name: string, input: { config?: unknown }) => ({
      name,
      version: 1,
      config: input.config,
    })),
    deleteWall: mock(async (name: string) => ({ name, deleted: true })),
    ...overrides,
  } as unknown as DebugClient;
}

function output(log: ReturnType<typeof mock>): string {
  return log.mock.calls.map((call) => call.join(" ")).join("\n");
}

function calls(fn: unknown): unknown[][] {
  return (fn as ReturnType<typeof mock>).mock.calls;
}

beforeEach(() => {
  console.log = mock(() => {}) as unknown as typeof console.log;
  console.error = mock(() => {}) as unknown as typeof console.error;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  process.exit = originalExit;
});

describe("walls list/get", () => {
  it("lists wall profiles", async () => {
    const client = createClient();

    await listWalls(client, false);

    const text = output(console.log as ReturnType<typeof mock>);
    expect(text).toContain("hall");
    expect(text).toContain("VERSION");
  });

  it("prints one profile's configuration", async () => {
    const client = createClient();

    await getWall(client, "hall", false);

    expect(output(console.log as ReturnType<typeof mock>)).toContain("Widgets:");
  });
});

describe("walls create/update/rm", () => {
  it("parses the config argument and creates a profile", async () => {
    const client = createClient();

    await createWall(client, "hall", '{"widgets":[]}', false);

    expect(calls(client.createWall)[0]).toEqual(["hall", { widgets: [] }]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain('Created wall "hall"');
  });

  it("updates a profile with the parsed config", async () => {
    const client = createClient();

    await updateWall(client, "hall", '{"widgets":[]}', false);

    expect(calls(client.updateWall)[0]).toEqual(["hall", { config: { widgets: [] } }]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain('Updated wall "hall"');
  });

  it("deletes a profile", async () => {
    const client = createClient();

    await deleteWall(client, "hall", false);

    expect(calls(client.deleteWall)[0]).toEqual(["hall"]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain('Deleted wall "hall"');
  });

  it("rejects a non-JSON config and exits", async () => {
    const client = createClient();
    process.exit = mock((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as unknown as typeof process.exit;

    await expect(createWall(client, "hall", "not json", false)).rejects.toThrow("exit:1");
    expect(output(console.error as ReturnType<typeof mock>)).toContain("Invalid JSON config");
  });

  it("rejects a non-object config and exits", async () => {
    const client = createClient();
    process.exit = mock((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as unknown as typeof process.exit;

    await expect(createWall(client, "hall", "[]", false)).rejects.toThrow("exit:1");
    expect(output(console.error as ReturnType<typeof mock>)).toContain(
      "Wall config must be a JSON object",
    );
  });
});
