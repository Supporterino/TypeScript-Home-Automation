#!/usr/bin/env bun
/**
 * Build script for the web UI frontend.
 *
 * Uses Bun.build to compile the React + Mantine app into content-hashed,
 * code-split, pre-compressed JS and CSS assets, then writes them as a
 * generated asset manifest module that the server serves from
 * content-addressed routes (see `packages/web-ui/src/asset-routes.ts`).
 *
 * Run automatically via:
 *   - prebuild      (bun run build)
 *   - build:web-ui  (bun run build:web-ui)
 *   - build:web-ui --watch (wired into `bun run dev`)
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BuiltAsset } from "../src/assets/asset-types.js";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const ENTRY = join(PACKAGE_ROOT, "src/app/index.tsx");
const APP_DIR = join(PACKAGE_ROOT, "src/app");
const OUT_MANIFEST = join(PACKAGE_ROOT, "src/assets/manifest.ts");

// The display face is referenced from `styles/tokens.css` by this relative
// path. Bun's CSS bundler inlines `url()` assets as base64 data URLs
// (oven-sh/bun#24599), so the reference is marked external, the file is
// emitted as its own content-hashed asset below, and the CSS url is rewritten
// to point at it (design.md D3).
const FONT_SOURCE = join(APP_DIR, "fonts/plus-jakarta-sans-latin.woff2");
const FONT_CSS_REF = "../fonts/plus-jakarta-sans-latin.woff2";

const WATCH = process.argv.includes("--watch");

/** MIME type for a given emitted file extension. */
function contentTypeFor(path: string): string {
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".woff2")) return "font/woff2";
  return "application/javascript";
}

/**
 * Emits the self-hosted display face as a content-hashed first-paint asset.
 * Returns null when the font has not been added to the tree yet.
 */
async function buildFontAsset(): Promise<BuiltAsset | null> {
  if (!existsSync(FONT_SOURCE)) return null;

  const rawBytes = new Uint8Array(await Bun.file(FONT_SOURCE).arrayBuffer());
  const hash = new Bun.CryptoHasher("sha256").update(rawBytes).digest("hex").slice(0, 8);
  const fileName = `plus-jakarta-sans-latin-${hash}.woff2`;
  const gzipBytes = Bun.gzipSync(rawBytes);

  return {
    fileName,
    contentType: "font/woff2",
    hash,
    rawBase64: Buffer.from(rawBytes).toString("base64"),
    gzipBase64: Buffer.from(gzipBytes).toString("base64"),
    firstPaint: true,
  };
}

/** Points the stylesheet's external font reference at the emitted asset. */
function rewriteFontReference(cssBytes: Uint8Array, fontFileName: string): Uint8Array {
  const css = new TextDecoder().decode(cssBytes);
  if (!css.includes(FONT_CSS_REF)) return cssBytes;
  return new TextEncoder().encode(css.split(FONT_CSS_REF).join(fontFileName));
}

async function buildOnce(): Promise<boolean> {
  const fontAsset = await buildFontAsset();

  const result = await Bun.build({
    entrypoints: [ENTRY],
    target: "browser",
    format: "esm",
    minify: true,
    // Content-hashed, split output — non-first-paint chunks (behind a
    // dynamic import) are emitted separately from the entry bundle.
    splitting: true,
    naming: "[dir]/[name]-[hash].[ext]",
    // Override the repo-wide jsxImportSource (@opentui/react) so the browser
    // bundle uses standard React JSX, not OpenTUI intrinsics.
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
    // Keep the CSS font url as a relative path instead of inlining the woff2
    // as base64; we emit and rewrite it ourselves after the build (D3).
    external: ["*.woff2"],
    // Fold `process.env.NODE_ENV` so React/ReactDOM resolve to their
    // production builds. Bun's `development` resolution condition (kept for
    // `@ts-ha/shared` source) otherwise drags in the dev runtime, which alone
    // costs well over the first-paint budget.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    // Resolve `@ts-ha/shared` to its TypeScript source rather than a
    // not-yet-built `dist`, so the asset build is order-free (design.md D6).
    conditions: ["development"],
    // No outdir → in-memory artifacts only; we write them ourselves below.
  });

  if (!result.success) {
    console.error("[build-web-ui] Build failed:");
    for (const log of result.logs) {
      console.error(" ", log);
    }
    return false;
  }

  const assets: BuiltAsset[] = [];

  for (const artifact of result.outputs) {
    if (artifact.kind === "sourcemap") continue;

    // artifact.path looks like "./index-<hash>.js" or "./chunk-<hash>.js".
    const fileName = artifact.path.replace(/^\.\//, "").replace(/^\.\/+/, "");

    let rawBytes = new Uint8Array(await artifact.arrayBuffer());
    if (fontAsset && fileName.endsWith(".css")) {
      rawBytes = rewriteFontReference(rawBytes, fontAsset.fileName);
    }
    const gzipBytes = Bun.gzipSync(rawBytes);

    assets.push({
      fileName,
      contentType: contentTypeFor(fileName),
      hash: artifact.hash ?? "",
      rawBase64: Buffer.from(rawBytes).toString("base64"),
      gzipBase64: Buffer.from(gzipBytes).toString("base64"),
      // "chunk" artifacts are only reachable via a dynamic import and are
      // therefore excluded from the first-paint budget (design.md D24).
      firstPaint: artifact.kind !== "chunk",
    });
  }

  if (fontAsset) assets.push(fontAsset);

  if (assets.filter((a) => a.contentType === "application/javascript").length === 0) {
    console.error("[build-web-ui] No JS output produced.");
    return false;
  }

  const manifestSource = `/** Auto-generated by scripts/build-web-ui.ts — do not edit directly. */
import type { BuiltAsset } from "./asset-types.js";

export const ASSETS: readonly BuiltAsset[] = ${JSON.stringify(assets, null, 2)};
`;

  await Bun.write(OUT_MANIFEST, manifestSource);

  const jsAssets = assets.filter((a) => a.contentType === "application/javascript");
  const cssAssets = assets.filter((a) => a.contentType === "text/css");
  const fontAssets = assets.filter((a) => a.contentType.startsWith("font/"));
  const rawTotalKb = (
    assets.reduce((sum, a) => sum + Buffer.from(a.rawBase64, "base64").length, 0) / 1024
  ).toFixed(1);
  const gzipTotalKb = (
    assets.reduce((sum, a) => sum + Buffer.from(a.gzipBase64, "base64").length, 0) / 1024
  ).toFixed(1);
  console.log(
    `[build-web-ui] Done. ${jsAssets.length} JS, ${cssAssets.length} CSS, ` +
      `${fontAssets.length} font asset(s). Raw: ${rawTotalKb} KB, gzip: ${gzipTotalKb} KB.`,
  );

  return true;
}

async function main() {
  // Skip if the entry point doesn't exist yet (e.g. during initial bun install
  // before the repo is fully set up, or in CI environments building only the
  // server-side package).
  if (!existsSync(ENTRY)) {
    console.log("[build-web-ui] Entry point not found, skipping.");
    return;
  }

  console.log("[build-web-ui] Building React + Mantine frontend…");
  const ok = await buildOnce();
  if (!ok && !WATCH) process.exit(1);

  if (!WATCH) return;

  console.log(`[build-web-ui] Watching ${APP_DIR} for changes…`);

  let pending = false;
  let running = false;

  async function rebuild() {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    pending = false;
    console.log("[build-web-ui] Change detected, rebuilding…");
    await buildOnce();
    running = false;
    if (pending) await rebuild();
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleRebuild() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      rebuild();
    }, 100);
  }

  try {
    const { watch } = await import("node:fs");
    const watcher = watch(APP_DIR, { recursive: true }, () => {
      scheduleRebuild();
    });
    // Keep the process alive.
    process.on("SIGINT", () => {
      watcher.close();
      process.exit(0);
    });
  } catch (err) {
    console.error(
      "[build-web-ui] Recursive filesystem watching is not supported on this platform; " +
        "watch mode is unavailable. Re-run `bun run build:web-ui` manually after editing.",
      err,
    );
  }
}

await main();
