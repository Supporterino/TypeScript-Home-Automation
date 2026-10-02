import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createEngine, type Engine, type EngineOptions } from "@ts-ha/core";

/**
 * Default automations directory, resolved against the current working
 * directory (specs/cli "Run Command").
 */
export const DEFAULT_AUTOMATIONS_DIR = "./automations";

/** The package loaded on demand when the web UI is enabled (design.md D3, D4). */
const WEB_UI_PACKAGE = "@ts-ha/web-ui";

/**
 * Raw `WEB_UI_ENABLED` import gate (design.md D3; specs/web-ui "Enabling").
 *
 * This is a string comparison, not option parsing — `@ts-ha/web-ui` remains the
 * sole parser. It MUST match the package's enablement vocabulary exactly
 * (`true`/`1`/`yes`, trimmed, case-insensitive), otherwise a value the package
 * accepts would run headless here.
 */
function isWebUiEnabled(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** Options the web UI plugin expects; declared locally so the CLI has no core/web-ui type edge. */
interface WebUiOptions {
  path: string;
  token: string;
}

/** Structural shape of the optional `@ts-ha/web-ui` exports `run` consumes. */
interface WebUiModule {
  parseWebUiOptions(env?: NodeJS.ProcessEnv): WebUiOptions | null;
  createWebUiService(options: WebUiOptions): unknown;
}

/** Injectable seams so the bootstrap is testable without spawning a process. */
export interface RunCommandOptions {
  /** Explicit automations directory (a relative value resolves against `cwd`). */
  automationsDir?: string;
  /** Base directory for relative resolution. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Environment read for the raw `WEB_UI_ENABLED` gate. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Engine factory. Defaults to `createEngine` from `@ts-ha/core`. */
  engineFactory?: (options: EngineOptions) => Engine;
  /** Dynamic importer for the optional web UI package. */
  importWebUi?: () => Promise<WebUiModule>;
  /** Signal registrar. Defaults to `process.on`. */
  registerSignal?: (signal: NodeJS.Signals, handler: () => void | Promise<void>) => void;
  /** Process exit. Defaults to `process.exit`. */
  exit?: (code: number) => void;
}

function defaultImportWebUi(): Promise<WebUiModule> {
  // Variable specifier: the optional peer must stay unresolvable at build time
  // so a headless install is not forced to carry the frontend tree (D4).
  return import(WEB_UI_PACKAGE) as unknown as Promise<WebUiModule>;
}

/** True only for a failed module resolution — other import errors must surface unchanged. */
function isModuleNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return true;
  }
  if (err instanceof Error) {
    return /Cannot find (module|package)|ERR_MODULE_NOT_FOUND/.test(err.message);
  }
  return false;
}

/**
 * Import the optional web UI package, parse its options, and register its
 * plugin with the engine. The import gate is the caller's raw string check;
 * option parsing stays inside `@ts-ha/web-ui` (design.md D3, D8).
 */
async function registerWebUi(
  engine: Engine,
  env: NodeJS.ProcessEnv,
  importWebUi: () => Promise<WebUiModule>,
): Promise<void> {
  let webUi: WebUiModule;
  try {
    webUi = await importWebUi();
  } catch (err) {
    if (isModuleNotFoundError(err)) {
      throw new Error(
        `WEB_UI_ENABLED is set but the optional "${WEB_UI_PACKAGE}" package is not installed. ` +
          `Install it with "npm install ${WEB_UI_PACKAGE}".`,
      );
    }
    throw err;
  }

  const options = webUi.parseWebUiOptions(env);
  if (!options) return;

  engine.services.register(
    "web-ui",
    webUi.createWebUiService({
      path: options.path,
      token: engine.config.httpServer.token,
    }),
  );
}

/**
 * Boot a local engine: resolve the automations directory, register the
 * optional web UI when enabled, install graceful shutdown handlers, and start.
 */
export async function runCommand(options: RunCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const engineFactory = options.engineFactory ?? createEngine;
  const importWebUi = options.importWebUi ?? defaultImportWebUi;
  const registerSignal =
    options.registerSignal ??
    ((signal, handler) => {
      process.on(signal, handler);
    });
  const exit = options.exit ?? ((code) => process.exit(code));

  const automationsDir = resolve(cwd, options.automationsDir ?? DEFAULT_AUTOMATIONS_DIR);
  const engine = engineFactory({ automationsDir });

  if (!existsSync(automationsDir)) {
    engine.logger.warn(
      { automationsDir },
      `Automations directory does not exist: ${automationsDir}. Starting with zero automations.`,
    );
  }

  // Raw string gate only — the package parses its own options (design.md D3).
  if (isWebUiEnabled(env.WEB_UI_ENABLED)) {
    await registerWebUi(engine, env, importWebUi);
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    engine.logger.info({ signal }, "Shutdown signal received");
    await engine.stop();
    exit(0);
  };

  registerSignal("SIGINT", () => shutdown("SIGINT"));
  registerSignal("SIGTERM", () => shutdown("SIGTERM"));

  try {
    await engine.start();
  } catch (err) {
    engine.logger.fatal({ err }, "Failed to start Home Automation Engine");
    exit(1);
  }
}
