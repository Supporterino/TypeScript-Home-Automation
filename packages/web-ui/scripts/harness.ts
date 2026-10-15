#!/usr/bin/env bun
/**
 * The wall harness's development server (design.md D8, D9; tasks 3.1, 3.2).
 *
 * Serves the two harness documents — the control document at `/` and the stage
 * document at `/stage.html` — and rebuilds them when their source changes, so a
 * reload shows the edit.
 *
 * **Why the documented fallback rather than the fullstack HTML import.** D8's
 * primary shape is `Bun.serve({ routes: { "/*": htmlImport } })`, and on Bun
 * 1.4.3 that server does compile Tailwind — but it ignores the `@source` globs
 * in `styles/app.css`, so none of the wall's `className` sites produce a utility
 * (checked: the served stylesheet contains neither `.flex` nor the app's own
 * `min-h-dvh`, while the shipped build's does). A wall harness that renders the
 * wall's markup without the wall's utilities would misreport exactly the thing
 * it exists to show. So this is D8's stated fallback: `Bun.build` with an
 * explicit `conditions: ["development"]` plus a static server and a
 * watch/rebuild loop in place of HMR.
 *
 * Nothing is written to disk — the artifacts stay in memory and are served from
 * there — so `scripts/build-web-ui.ts`, the asset manifest, and the shipped
 * entrypoint are untouched (design.md D9).
 *
 * Run with `bun run --filter @ts-ha/web-ui harness` (which passes
 * `--conditions=development`, so `@ts-ha/shared` resolves to source).
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
 * Compiles both harness documents in one bundle, so a chunk shared by the panel
 * and the stage is emitted once. The Tailwind plugin is the same one the shipped
 * build uses, which is what makes `@source` scanning work; `development`
 * conditions are what make `@ts-ha/shared` resolve to `src`.
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
  // Loopback only: the harness serves the app's own source bundle, so it has no
  // business being reachable from another machine on a shared network. Bun's
  // default is every interface.
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
        // The browser must never serve a stale bundle from its cache: names are
        // content-hashed, but the documents that reference them are not.
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
 * Builds until no change arrived while building. The scheduling decisions are
 * `rebuild-loop.ts`'s pure transitions — the same rule `scripts/build-web-ui.ts`
 * proves for its own watch loop, so a change that lands mid-build is re-run
 * rather than dropped.
 */
async function rebuildLoop(): Promise<void> {
  for (;;) {
    const started = Bun.nanoseconds();
    try {
      assets = await compile();
      const ms = Math.round((Bun.nanoseconds() - started) / 1_000_000);
      console.log(`[harness] rebuilt ${assets.size} asset(s) in ${ms}ms — reload to see it`);
    } catch (err) {
      // Keep serving the last good bundle so a syntax error mid-edit does not
      // leave the developer with a dead server.
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
