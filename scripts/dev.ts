#!/usr/bin/env bun
/**
 * Development entry point: runs the web UI asset watcher and the
 * hot-reloading engine side by side.
 *
 * There is no `WEB_UI_DEV` flag and no server-side development branch
 * (design.md D8) — the engine always serves whatever the generated asset
 * manifest currently contains. This script only supplies the missing half:
 * a watcher that regenerates the manifest on frontend source change, wired
 * up alongside `bun --hot` so an edit is visible in the browser without a
 * manual rebuild or an engine restart.
 */

import { spawn, spawnSync } from "node:child_process";

console.log("[dev] Building web UI once before starting…");
const initial = spawnSync("bun", ["run", "scripts/build-web-ui.ts"], { stdio: "inherit" });
if (initial.status !== 0) {
  process.exit(initial.status ?? 1);
}

const watcher = spawn("bun", ["run", "scripts/build-web-ui.ts", "--watch"], {
  stdio: "inherit",
});
const engine = spawn("bun", ["run", "--hot", "src/standalone.ts"], {
  stdio: "inherit",
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
