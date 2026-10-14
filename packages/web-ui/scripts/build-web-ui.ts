#!/usr/bin/env bun
/**
 * Build script for the web UI frontend.
 *
 * Uses Bun.build to compile the React + Tailwind CSS app into content-hashed,
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
import { join, resolve } from "node:path";
import tailwind from "bun-plugin-tailwind";
import type { BuiltAsset } from "../src/assets/asset-types.js";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const ENTRY = join(PACKAGE_ROOT, "src/app/index.tsx");
const APP_DIR = join(PACKAGE_ROOT, "src/app");
const OUT_MANIFEST = join(PACKAGE_ROOT, "src/assets/manifest.ts");

// The display face is referenced from `styles/app.css` by this relative
// path. Bun's CSS bundler inlines `url()` assets as base64 data URLs
// (oven-sh/bun#24599), so the reference is marked external, the file is
// emitted as its own content-hashed asset below, and the CSS url is rewritten
// to point at it (design.md D3, D10).
const FONT_SOURCE = join(APP_DIR, "fonts/plus-jakarta-sans-latin.woff2");
const FONT_CSS_REF = "../fonts/plus-jakarta-sans-latin.woff2";

const WATCH = process.argv.includes("--watch");

/**
 * Whether a `hearth.css` import comes from a wall **display** module — the only
 * place Hearth belongs (design.md D5, D8; task 1.3). The editor
 * (`wall/editor/**`) is deliberately excluded: it stays on Lumen and lives in a
 * different lazy chunk, so a stray editor import must fall through to the normal
 * CSS path and be caught by `web-ui-assets.test.ts` rather than being silently
 * emitted as an on-demand asset.
 */
function isWallDisplayImporter(importer: string): boolean {
  return /[\\/]wall[\\/]/.test(importer) && !/[\\/]wall[\\/]editor[\\/]/.test(importer);
}

/**
 * Delivers the wall's stylesheet on demand (design.md D5; specs/wall-display
 * "On-Demand Wall Stylesheet"; specs/web-ui "On-Demand Feature Stylesheets").
 *
 * Bun folds every imported stylesheet into the entry CSS, so a plain CSS import
 * would put Hearth in the dashboard's first paint. A wall-display import is
 * loaded here as a `file` asset instead, so Bun emits it as its own
 * content-hashed stylesheet, referenced by the wall chunk and absent from the
 * entry CSS. A wall sheet imported from anywhere else — the entry or the editor
 * — is left to the normal CSS path on purpose, where `web-ui-assets.test.ts`
 * fails rather than silently shipping Hearth to every dashboard load. Registered
 * before `bun-plugin-tailwind` so this loader wins for the wall sheet.
 */
function wallStylesheetPlugin(): Bun.BunPlugin {
  const NAMESPACE = "wall-stylesheet";
  return {
    name: "wall-stylesheet",
    setup(build) {
      build.onResolve({ filter: /hearth\.css$/ }, (args) => {
        if (!isWallDisplayImporter(args.importer)) return undefined;
        return { path: resolve(args.resolveDir, args.path), namespace: NAMESPACE };
      });
      build.onLoad({ filter: /hearth\.css$/, namespace: NAMESPACE }, async ({ path }) => ({
        contents: await Bun.file(path).text(),
        loader: "file",
      }));
    },
  };
}

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
    // Compile the Tailwind v4 stylesheet as part of this same bundle step
    // (design.md D2). `app.css` is the CSS entry, reached through the entry
    // module's import; no PostCSS pipeline is introduced.
    // `bun-plugin-tailwind` default-exports the plugin instance, not a factory.
    plugins: [wallStylesheetPlugin(), tailwind],
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
      // "chunk" artifacts and copied "file" assets are only reachable through
      // the dynamic import that references them — the lazy route chunks and the
      // wall's on-demand stylesheet — so they are excluded from the first-paint
      // budget (design.md D5, D24).
      firstPaint: artifact.kind !== "chunk" && artifact.loader !== "file",
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

  console.log("[build-web-ui] Building React frontend (Tailwind CSS)…");
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
