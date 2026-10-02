import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Engine, EngineOptions } from "@ts-ha/core";
import { DEFAULT_AUTOMATIONS_DIR, runCommand } from "../src/commands/run.js";

// specs/cli "Run Command" (tasks 5.3–5.5). The engine and the optional web UI
// package are injected so these run without MQTT or the frontend tree.

interface FakeEngine {
  engine: Engine;
  warn: ReturnType<typeof mock>;
  start: ReturnType<typeof mock>;
  stop: ReturnType<typeof mock>;
  register: ReturnType<typeof mock>;
}

function createFakeEngine(token = "core-token"): FakeEngine {
  const warn = mock(() => {});
  const info = mock(() => {});
  const fatal = mock(() => {});
  const start = mock(async () => {});
  const stop = mock(async () => {});
  const register = mock(() => {});
  const engine = {
    config: { httpServer: { token } },
    logger: { warn, info, fatal },
    services: { register },
    start,
    stop,
  } as unknown as Engine;
  return { engine, warn, start, stop, register };
}

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ts-ha-run-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runCommand automations directory", () => {
  it("resolves the default directory against the working directory", async () => {
    const cwd = await makeTempDir();
    const { engine } = createFakeEngine();
    let received: EngineOptions | undefined;

    await runCommand({
      cwd,
      engineFactory: (options) => {
        received = options;
        return engine;
      },
      registerSignal: () => {},
      exit: () => {},
    });

    expect(received?.automationsDir).toBe(resolve(cwd, DEFAULT_AUTOMATIONS_DIR));
  });

  it("accepts an explicit absolute directory", async () => {
    const dir = await makeTempDir();
    const { engine, warn } = createFakeEngine();
    let received: EngineOptions | undefined;

    await runCommand({
      automationsDir: dir,
      engineFactory: (options) => {
        received = options;
        return engine;
      },
      registerSignal: () => {},
      exit: () => {},
    });

    expect(received?.automationsDir).toBe(resolve(dir));
    expect(warn).not.toHaveBeenCalled();
  });

  it("resolves a relative directory against the working directory", async () => {
    const cwd = await makeTempDir();
    const { engine } = createFakeEngine();
    let received: EngineOptions | undefined;

    await runCommand({
      cwd,
      automationsDir: "./auto",
      engineFactory: (options) => {
        received = options;
        return engine;
      },
      registerSignal: () => {},
      exit: () => {},
    });

    expect(received?.automationsDir).toBe(join(cwd, "auto"));
  });

  it("warns with the resolved path when the directory is missing", async () => {
    const cwd = await makeTempDir();
    const { engine, warn } = createFakeEngine();

    await runCommand({
      cwd,
      engineFactory: () => engine,
      registerSignal: () => {},
      exit: () => {},
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const [context] = (warn as ReturnType<typeof mock>).mock.calls[0] as [
      { automationsDir: string },
    ];
    expect(context.automationsDir).toBe(join(cwd, "automations"));
  });
});

describe("runCommand shutdown", () => {
  it("stops the engine and exits on SIGTERM", async () => {
    const dir = await makeTempDir();
    const { engine, start, stop } = createFakeEngine();
    const handlers = new Map<string, () => void | Promise<void>>();
    const exit = mock(() => {});

    await runCommand({
      automationsDir: dir,
      engineFactory: () => engine,
      registerSignal: (signal, handler) => {
        handlers.set(signal, handler);
      },
      exit,
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(handlers.has("SIGINT")).toBe(true);
    expect(handlers.has("SIGTERM")).toBe(true);

    await handlers.get("SIGTERM")?.();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("runCommand web UI", () => {
  it("does not import the web UI when disabled", async () => {
    const dir = await makeTempDir();
    const { engine } = createFakeEngine();
    const importWebUi = mock(async () => {
      throw new Error("must not be imported");
    });

    await runCommand({
      automationsDir: dir,
      env: {},
      importWebUi,
      engineFactory: () => engine,
      registerSignal: () => {},
      exit: () => {},
    });

    expect(importWebUi).not.toHaveBeenCalled();
  });

  // The raw gate must agree with the package's enablement vocabulary
  // (`true`/`1`/`yes`, trimmed, case-insensitive) — otherwise a value the
  // package accepts runs headless here (design.md D3).
  it.each([
    "1",
    "TRUE",
    "yes",
    " true ",
  ] as const)("imports the web UI when WEB_UI_ENABLED='%s'", async (value) => {
    const dir = await makeTempDir();
    const { engine } = createFakeEngine();
    const importWebUi = mock(async () => ({
      parseWebUiOptions: () => ({ path: "/status", token: "" }),
      createWebUiService: () => ({ serviceKey: "web-ui" }),
    }));

    await runCommand({
      automationsDir: dir,
      env: { WEB_UI_ENABLED: value },
      importWebUi,
      engineFactory: () => engine,
      registerSignal: () => {},
      exit: () => {},
    });

    expect(importWebUi).toHaveBeenCalledTimes(1);
  });

  it.each([
    "0",
    "FALSE",
    "no",
    "",
    " no ",
  ] as const)("does not import the web UI when WEB_UI_ENABLED='%s'", async (value) => {
    const dir = await makeTempDir();
    const { engine } = createFakeEngine();
    const importWebUi = mock(async () => {
      throw new Error("must not be imported");
    });

    await runCommand({
      automationsDir: dir,
      env: { WEB_UI_ENABLED: value },
      importWebUi,
      engineFactory: () => engine,
      registerSignal: () => {},
      exit: () => {},
    });

    expect(importWebUi).not.toHaveBeenCalled();
  });

  it("registers the plugin under the web-ui key with the core token", async () => {
    const dir = await makeTempDir();
    const { engine, register } = createFakeEngine("core-secret-token");
    const service = { serviceKey: "web-ui" };
    const received: { path: string; token: string }[] = [];
    const importWebUi = mock(async () => ({
      parseWebUiOptions: () => ({ path: "/dashboard", token: "" }),
      createWebUiService: (options: { path: string; token: string }) => {
        received.push(options);
        return service;
      },
    }));

    await runCommand({
      automationsDir: dir,
      env: { WEB_UI_ENABLED: "true" },
      importWebUi,
      engineFactory: () => engine,
      registerSignal: () => {},
      exit: () => {},
    });

    expect(importWebUi).toHaveBeenCalledTimes(1);
    expect(received).toEqual([{ path: "/dashboard", token: "core-secret-token" }]);
    expect(register).toHaveBeenCalledWith("web-ui", service);
  });

  it("passes the injected env through to the web UI option parser", async () => {
    const dir = await makeTempDir();
    const { engine } = createFakeEngine();
    const env = { WEB_UI_ENABLED: "true", WEB_UI_PATH: "/injected" };
    const received: (NodeJS.ProcessEnv | undefined)[] = [];
    const importWebUi = mock(async () => ({
      parseWebUiOptions: (passedEnv?: NodeJS.ProcessEnv) => {
        received.push(passedEnv);
        return passedEnv?.WEB_UI_PATH ? { path: passedEnv.WEB_UI_PATH, token: "" } : null;
      },
      createWebUiService: () => ({ serviceKey: "web-ui" }),
    }));

    await runCommand({
      automationsDir: dir,
      env,
      importWebUi,
      engineFactory: () => engine,
      registerSignal: () => {},
      exit: () => {},
    });

    expect(received).toEqual([env]);
  });

  it("names the missing optional package when the import fails", async () => {
    const dir = await makeTempDir();
    const { engine } = createFakeEngine();
    const missing = Object.assign(new Error("Cannot find module '@ts-ha/web-ui'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    const importWebUi = mock(async () => {
      throw missing;
    });

    await expect(
      runCommand({
        automationsDir: dir,
        env: { WEB_UI_ENABLED: "true" },
        importWebUi,
        engineFactory: () => engine,
        registerSignal: () => {},
        exit: () => {},
      }),
    ).rejects.toThrow("@ts-ha/web-ui");
  });

  it("does not swallow unrelated import errors", async () => {
    const dir = await makeTempDir();
    const { engine } = createFakeEngine();
    const importWebUi = mock(async () => {
      throw new Error("boom");
    });

    await expect(
      runCommand({
        automationsDir: dir,
        env: { WEB_UI_ENABLED: "true" },
        importWebUi,
        engineFactory: () => engine,
        registerSignal: () => {},
        exit: () => {},
      }),
    ).rejects.toThrow("boom");
  });
});
