#!/usr/bin/env bun
/**
 * The wall harness's development server: serves the control document at `/` and
 * the stage document at `/stage.html`, rebuilding in memory on source changes.
 * Uses `Bun.build` rather than `Bun.serve`'s HTML import, whose Tailwind build
 * ignores `styles/app.css`'s `@source` globs. Nothing is written to disk.
 */
import { watch } from "node:fs";
import { extname, join } from "node:path";
import tailwind from "bun-plugin-tailwind";
import {
  IDLE_REBUILD,
  type RebuildState,
  requestRebuild,
  settleRebuild,
} from "../src/app/wall/harness/rebuild-loop.js";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const APP_DIR = join(PACKAGE_ROOT, "src/app");
const HARNESS_DIR = join(APP_DIR, "wall/harness");
/** `@ts-ha/shared` resolves to source under the `development` condition, so its edits rebuild too. */
const SHARED_DIR = join(PACKAGE_ROOT, "..", "shared", "src");

const CONTROL_DOCUMENT = join(HARNESS_DIR, "harness.html");
const STAGE_DOCUMENT = join(HARNESS_DIR, "stage.html");
const STAGE_ROUTE = "/stage.html";

const DEFAULT_PORT = 3553;
/** How long to coalesce a burst of filesystem events before rebuilding, in milliseconds. */
const REBUILD_DEBOUNCE_MS = 80;

interface ServedAsset {
  body: Uint8Array | string;
  type: string;
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

/**
 * Compiles both harness documents in one bundle, with the same Tailwind plugin
 * and `development` conditions the shipped build uses.
 */
async function compile(): Promise<Map<string, ServedAsset>> {
  const result = await Bun.build({
    entrypoints: [CONTROL_DOCUMENT, STAGE_DOCUMENT],
    plugins: [tailwind],
    target: "browser",
    format: "esm",
    splitting: true,
    minify: false,
    jsx: { runtime: "automatic", importSource: "react" },
    conditions: ["development"],
  });

  if (!result.success) {
    for (const log of result.logs) console.error("[harness]", log.message ?? log);
    throw new Error("the harness bundle failed to build");
  }

  const assets = new Map<string, ServedAsset>();
  for (const artifact of result.outputs) {
    if (artifact.kind === "sourcemap") continue;
    const name = artifact.path.replace(/^\.\//, "");
    assets.set(name, {
      body: new Uint8Array(await artifact.arrayBuffer()),
      type: contentType(name),
    });
  }
  return assets;
}

/** The read-only port from `--port <n>` / `--port=<n>`; the harness has no other configuration. */
function portFromArgs(args: readonly string[]): number {
  const index = args.indexOf("--port");
  const inline = args.find((arg) => arg.startsWith("--port="));
  const raw = inline?.slice("--port=".length) ?? (index >= 0 ? args[index + 1] : undefined);
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

let assets = await compile();
console.log(`[harness] built ${assets.size} asset(s)`);

const server = Bun.serve({
  port: portFromArgs(Bun.argv.slice(2)),
  // Loopback only: this serves the app's own source bundle.
  hostname: "127.0.0.1",
  fetch(request) {
    const path = new URL(request.url).pathname;
    const name = path === "/" ? "harness.html" : path.slice(1);
    const asset = assets.get(name);
    if (!asset) {
      return new Response(
        `Not found. Open / for the harness panel or ${STAGE_ROUTE} for the stage document.\n`,
        { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    return new Response(asset.body, {
      headers: {
        "content-type": asset.type,
        // Documents are not content-hashed, so never cache them.
        "cache-control": "no-store",
      },
    });
  },
});

console.log(`[harness] panel  ${server.url.href}`);
console.log(`[harness] stage  ${new URL(STAGE_ROUTE, server.url).href}`);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let state: RebuildState = IDLE_REBUILD;

/**
 * Builds until no change arrived while building, so a change that lands
 * mid-build is re-run rather than dropped.
 */
async function rebuildLoop(): Promise<void> {
  for (;;) {
    const started = Bun.nanoseconds();
    try {
      assets = await compile();
      const ms = Math.round((Bun.nanoseconds() - started) / 1_000_000);
      console.log(`[harness] rebuilt ${assets.size} asset(s) in ${ms}ms — reload to see it`);
    } catch (err) {
      // Keep serving the last good bundle on a mid-edit syntax error.
      console.error("[harness] rebuild failed, still serving the previous bundle");
      console.error(err);
    }

    const settled = settleRebuild(state);
    state = settled.next;
    if (!settled.run) return;
  }
}

/** Starts a build now, or coalesces the request into the one already running. */
function requestBuild(): void {
  const requested = requestRebuild(state);
  state = requested.next;
  if (requested.run) void rebuildLoop();
}

function scheduleRebuild(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    requestBuild();
  }, REBUILD_DEBOUNCE_MS);
}

const watchers: Array<ReturnType<typeof watch>> = [];
for (const dir of [APP_DIR, SHARED_DIR]) {
  try {
    watchers.push(watch(dir, { recursive: true }, () => scheduleRebuild()));
  } catch {
    console.error(`[harness] could not watch ${dir}; reload after a manual rerun instead`);
  }
}

process.on("SIGINT", () => {
  for (const watcher of watchers) watcher.close();
  if (debounceTimer) clearTimeout(debounceTimer);
  server.stop(true);
  process.exit(0);
});
