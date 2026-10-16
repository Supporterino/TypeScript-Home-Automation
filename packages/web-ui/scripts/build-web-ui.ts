#!/usr/bin/env bun
/**
 * Builds the web UI frontend: Bun.build compiles the React + Tailwind app into
 * content-hashed, code-split, pre-compressed assets, written out as a generated
 * manifest module the server serves from content-addressed routes.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import tailwind from "bun-plugin-tailwind";
import type { BuiltAsset } from "../src/assets/asset-types.js";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const ENTRY = join(PACKAGE_ROOT, "src/app/index.tsx");
const APP_DIR = join(PACKAGE_ROOT, "src/app");
const OUT_MANIFEST = join(PACKAGE_ROOT, "src/assets/manifest.ts");

// The display face is referenced from `styles/app.css` by this relative path.
// Bun inlines `url()` assets as base64, so the reference is marked external,
// the font is emitted as its own content-hashed asset, and the CSS url is
// rewritten to point at it.
const FONT_SOURCE = join(APP_DIR, "fonts/plus-jakarta-sans-latin.woff2");
const FONT_CSS_REF = "../fonts/plus-jakarta-sans-latin.woff2";

const WATCH = process.argv.includes("--watch");

/**
 * Whether a `hearth.css` import comes from a wall display module — the only
 * place Hearth belongs. Wall-editor imports are excluded on purpose.
 */
function isWallDisplayImporter(importer: string): boolean {
  return /[\\/]wall[\\/]/.test(importer) && !/[\\/]wall[\\/]editor[\\/]/.test(importer);
}

/**
 * Delivers the wall's stylesheet on demand: a wall-display `hearth.css` import
 * is loaded as a `file` asset, so Bun emits it as its own content-hashed
 * stylesheet instead of folding Hearth into the entry CSS. Registered before
 * `bun-plugin-tailwind` so this loader wins.
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
 * Emits the self-hosted display face as a content-hashed first-paint asset, or
 * null when the font is not in the tree.
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
    // Compile the Tailwind v4 stylesheet in this same bundle step.
    // `bun-plugin-tailwind` default-exports the plugin instance, not a factory.
    plugins: [wallStylesheetPlugin(), tailwind],
    target: "browser",
    format: "esm",
    minify: true,
    // Content-hashed, split output: lazy chunks are emitted separately.
    splitting: true,
    naming: "[dir]/[name]-[hash].[ext]",
    // Override the repo-wide jsxImportSource so the browser bundle uses React JSX.
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
    // Keep the font url relative; we emit and rewrite it after the build.
    external: ["*.woff2"],
    // Fold `process.env.NODE_ENV` so React/ReactDOM resolve to their production
    // builds rather than the dev runtime the `development` condition pulls in.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    // Resolve `@ts-ha/shared` to source, not a not-yet-built `dist`.
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
      // Chunks and copied file assets are only reachable through a dynamic
      // import, so they are excluded from the first-paint budget.
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
  // Skip when the entry point is absent (e.g. a server-only CI build).
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
