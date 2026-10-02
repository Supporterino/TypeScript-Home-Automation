#!/usr/bin/env bun
/**
 * Workspace-aware development entry point (design.md D6; task 6.2).
 *
 * Builds `@ts-ha/web-ui` once, then runs two children side by side:
 *   - a watcher over the web-ui frontend source that regenerates the asset
 *     manifest on change, and
 *   - the local engine (`ts-ha run`) under `--hot`.
 *
 * The engine always serves whatever the generated asset manifest currently
 * contains, so a frontend edit is visible in the browser without an engine
 * restart. This is a watcher, not `bun --filter` orchestration.
 *
 * `--conditions=development` is passed to the engine so workspace imports
 * resolve to source (the activation mechanism in design.md D6).
 */

import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const BUN = process.execPath;
const WEB_UI_BUILD = join(ROOT, "packages/web-ui/scripts/build-web-ui.ts");
const CLI_ENTRY = join(ROOT, "packages/cli/src/index.ts");

console.log("[dev] Building web UI once before starting…");
const initial = spawnSync(BUN, ["run", "--filter", "@ts-ha/web-ui", "build:web-ui"], {
  stdio: "inherit",
  cwd: ROOT,
});
if (initial.status !== 0) {
  process.exit(initial.status ?? 1);
}

const watcher = spawn(BUN, ["run", WEB_UI_BUILD, "--watch"], {
  stdio: "inherit",
  cwd: ROOT,
});

const engine = spawn(BUN, ["--conditions=development", "--hot", CLI_ENTRY, "run"], {
  stdio: "inherit",
  cwd: ROOT,
});

let shuttingDown = false;
function shutdown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  watcher.kill();
  engine.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

engine.on("exit", (code) => shutdown(code ?? 0));
watcher.on("exit", (code) => {
  if (!shuttingDown && code !== 0 && code !== null) {
    console.error(`[dev] Web UI watcher exited unexpectedly (code ${code})`);
  }
});
