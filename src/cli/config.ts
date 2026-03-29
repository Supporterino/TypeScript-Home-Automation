import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * A saved remote target for the CLI.
 */
export interface CliTarget {
  /** Friendly name for this target. */
  name: string;
  /** Host and port (e.g. "192.168.1.100:8080"). */
  host: string;
  /** Bearer token for authentication (empty if no auth). */
  token: string;
}

/**
 * CLI configuration file structure.
 */
interface CliConfig {
  /** The currently active target name. */
  activeTarget: string;
  /** Saved targets. */
  targets: Record<string, CliTarget>;
}

const CONFIG_PATH = join(homedir(), ".config", "ts-ha", "config.json");

const DEFAULT_CONFIG: CliConfig = {
  activeTarget: "local",
  targets: {
    local: { name: "local", host: "localhost:8080", token: "" },
  },
};

/**
 * Load the CLI config file. Creates the default if it doesn't exist.
 */
export async function loadCliConfig(): Promise<CliConfig> {
  try {
    const data = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(data) as CliConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      await saveCliConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    throw err;
  }
}

/**
 * Save the CLI config file.
 */
export async function saveCliConfig(config: CliConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Get the active target from config.
 */
export async function getActiveTarget(): Promise<CliTarget> {
  const config = await loadCliConfig();
  const target = config.targets[config.activeTarget];
  if (!target) {
    throw new Error(
      `Active target "${config.activeTarget}" not found in config. Run "ts-ha config list" to see available targets.`,
    );
  }
  return target;
}

/**
 * Add or update a target.
 */
export async function addTarget(name: string, host: string, token: string): Promise<void> {
  const config = await loadCliConfig();
  config.targets[name] = { name, host, token };
  await saveCliConfig(config);
}

/**
 * Remove a target.
 */
export async function removeTarget(name: string): Promise<boolean> {
  const config = await loadCliConfig();
  if (!(name in config.targets)) return false;
  if (name === "local") throw new Error('Cannot remove the "local" target');

  delete config.targets[name];
  if (config.activeTarget === name) {
    config.activeTarget = "local";
  }
  await saveCliConfig(config);
  return true;
}

/**
 * Set the active target.
 */
export async function setActiveTarget(name: string): Promise<void> {
  const config = await loadCliConfig();
  if (!(name in config.targets)) {
    throw new Error(`Target "${name}" not found. Run "ts-ha config add ${name} <host>" first.`);
  }
  config.activeTarget = name;
  await saveCliConfig(config);
}

/**
 * List all targets.
 */
export async function listTargets(): Promise<{ targets: CliTarget[]; active: string }> {
  const config = await loadCliConfig();
  return {
    targets: Object.values(config.targets),
    active: config.activeTarget,
  };
}

/**
 * Get the config file path (for display purposes).
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}
