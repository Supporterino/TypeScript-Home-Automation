import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Hono } from "hono";
import pino from "pino";
import {
  type BuiltAsset,
  base64ToBytes,
  clientAcceptsGzip,
  firstPaintTransferredBytes,
  selectAssetBody,
} from "../src/assets/asset-types.js";
import { ASSETS } from "../src/assets/manifest.js";
import { createWebUiService } from "../src/index.js";

// Asset serving is now a `WebUiService` concern, mounted on a bare Hono app.
// This test must not import `@ts-ha/core` (design.md D2, D7; task 3.7).

const logger = pino({ level: "silent" });

async function makeApp({
  token = "",
  path = "/status",
  webUi = true,
}: {
  token?: string;
  path?: string;
  webUi?: boolean;
} = {}): Promise<Hono> {
  const app = new Hono();
  if (webUi) {
    const service = createWebUiService({ path, token });
    service.registerRoutes(app);
    await service.onStart({ logger });
  }
  return app;
}

function req(app: Hono, path: string, headers: Record<string, string> = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { headers }));
}

// ── Generated manifest ──────────────────────────────────────────────────────

describe("build-web-ui manifest", () => {
  it("lists at least one JS and one CSS entry with distinct hashes", () => {
    const jsAssets = ASSETS.filter((a) => a.contentType === "application/javascript");
    const cssAssets = ASSETS.filter((a) => a.contentType === "text/css");
    expect(jsAssets.length).toBeGreaterThanOrEqual(1);
    expect(cssAssets.length).toBeGreaterThanOrEqual(1);

    const hashes = new Set(ASSETS.map((a) => a.hash));
    expect(hashes.size).toBe(ASSETS.length);
  });

  it("every entry carries a compressed body smaller than its raw body", () => {
    // `font/woff2` is already compressed (a woff2 payload *is* a Brotli
    // stream), so gzip cannot shrink it — and generally grows it slightly.
    // The assertion is meaningful only for the compressible JS/CSS assets.
    const precompressed = new Set(["font/woff2"]);
    for (const asset of ASSETS) {
      if (precompressed.has(asset.contentType)) continue;
      const raw = base64ToBytes(asset.rawBase64);
      const gzip = base64ToBytes(asset.gzipBase64);
      expect(gzip.byteLength).toBeLessThan(raw.byteLength);
    }
  });

  it("lists the self-hosted display face as a first-paint font asset", () => {
    const fontAssets = ASSETS.filter((a) => a.contentType === "font/woff2");
    expect(fontAssets.length).toBeGreaterThanOrEqual(1);
    for (const asset of fontAssets) {
      expect(asset.fileName.endsWith(".woff2")).toBe(true);
      expect(asset.firstPaint).toBe(true);
    }
  });

  it("asserts a first-paint budget of 250 KB transferred (gzip JS + CSS + font)", () => {
    const transferred = firstPaintTransferredBytes(ASSETS);
    expect(transferred).toBeLessThanOrEqual(250 * 1024);
  });

  it("fails the budget assertion for a manifest over the ceiling", () => {
    const oversized: BuiltAsset[] = [
      {
        fileName: "huge.js",
        contentType: "application/javascript",
        hash: "deadbeef",
        rawBase64: Buffer.from("x".repeat(1024 * 1024)).toString("base64"),
        gzipBase64: Buffer.from("x".repeat(300 * 1024)).toString("base64"),
        firstPaint: true,
      },
    ];
    expect(firstPaintTransferredBytes(oversized)).toBeGreaterThan(250 * 1024);
  });

  it("excludes non-first-paint chunks from the budget", () => {
    const mixed: BuiltAsset[] = [
      {
        fileName: "entry.js",
        contentType: "application/javascript",
        hash: "a",
        rawBase64: Buffer.from("small").toString("base64"),
        gzipBase64: Buffer.from("small").toString("base64"),
        firstPaint: true,
      },
      {
        fileName: "lazy-chunk.js",
        contentType: "application/javascript",
        hash: "b",
        rawBase64: Buffer.from("x".repeat(1024 * 1024)).toString("base64"),
        gzipBase64: Buffer.from("x".repeat(1024 * 1024)).toString("base64"),
        firstPaint: false,
      },
    ];
    expect(firstPaintTransferredBytes(mixed)).toBe(Buffer.from("small").byteLength);
  });

  it("emits lazy view code as non-first-paint chunks", () => {
    // Every route view beyond the landing/theme is behind a dynamic import
    // (design.md D12), so the built manifest must carry at least one JS chunk
    // excluded from the budget. Energy and weather are among these chunks:
    // their code and data are only fetched once the route is opened.
    const lazyJs = ASSETS.filter(
      (a) => a.contentType === "application/javascript" && !a.firstPaint,
    );
    expect(lazyJs.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Encoding negotiation (pure helper) ──────────────────────────────────────

describe("clientAcceptsGzip", () => {
  it("returns false for a missing header", () => {
    expect(clientAcceptsGzip(undefined)).toBe(false);
    expect(clientAcceptsGzip(null)).toBe(false);
    expect(clientAcceptsGzip("")).toBe(false);
  });

  it("returns true when gzip is listed", () => {
    expect(clientAcceptsGzip("gzip")).toBe(true);
    expect(clientAcceptsGzip("gzip, deflate")).toBe(true);
    expect(clientAcceptsGzip("deflate, gzip;q=1.0")).toBe(true);
  });

  it("returns false when only br is offered", () => {
    expect(clientAcceptsGzip("br")).toBe(false);
  });

  it("returns false when gzip is explicitly disabled via q=0", () => {
    expect(clientAcceptsGzip("gzip;q=0, br")).toBe(false);
  });
});

describe("selectAssetBody", () => {
  const asset: BuiltAsset = {
    fileName: "x.js",
    contentType: "application/javascript",
    hash: "h",
    rawBase64: Buffer.from("raw-body").toString("base64"),
    gzipBase64: Buffer.from("gzip-body").toString("base64"),
    firstPaint: true,
  };

  it("selects the gzip body when the client accepts gzip", () => {
    const { body, contentEncoding } = selectAssetBody(asset, true);
    expect(Buffer.from(body).toString()).toBe("gzip-body");
    expect(contentEncoding).toBe("gzip");
  });

  it("selects the raw body when the client does not accept gzip", () => {
    const { body, contentEncoding } = selectAssetBody(asset, false);
    expect(Buffer.from(body).toString()).toBe("raw-body");
    expect(contentEncoding).toBeNull();
  });
});

// ── Asset routes ─────────────────────────────────────────────────────────────

describe("asset routes", () => {
  it("serves a registered asset with an immutable cache directive", async () => {
    const app = await makeApp();
    const asset = ASSETS[0];
    const res = await req(app, `/status/assets/${asset.fileName}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("content-type")).toContain(asset.contentType);
  });

  it("serves the gzip body with Content-Encoding when the client advertises gzip", async () => {
    const app = await makeApp();
    const asset = ASSETS.find((a) => a.contentType === "application/javascript");
    if (!asset) throw new Error("expected a JS asset in the manifest");
    const res = await req(app, `/status/assets/${asset.fileName}`, {
      "accept-encoding": "gzip, deflate, br",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(base64ToBytes(asset.gzipBase64));
  });

  it("serves the raw body with no Content-Encoding when the client advertises no encoding", async () => {
    const app = await makeApp();
    const asset = ASSETS.find((a) => a.contentType === "application/javascript");
    if (!asset) throw new Error("expected a JS asset in the manifest");
    const res = await req(app, `/status/assets/${asset.fileName}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBeNull();
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(base64ToBytes(asset.rawBase64));
  });

  it("serves the raw body when the client advertises only br", async () => {
    const app = await makeApp();
    const asset = ASSETS.find((a) => a.contentType === "application/javascript");
    if (!asset) throw new Error("expected a JS asset in the manifest");
    const res = await req(app, `/status/assets/${asset.fileName}`, {
      "accept-encoding": "br",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBeNull();
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(base64ToBytes(asset.rawBase64));
  });

  it("404s for an unknown asset file name", async () => {
    const app = await makeApp();
    const res = await req(app, "/status/assets/does-not-exist.js");
    expect(res.status).toBe(404);
  });

  it("registers no asset route when the web UI is not mounted (WEB_UI_ENABLED=false)", async () => {
    const app = await makeApp({ webUi: false });
    const asset = ASSETS[0];
    const res = await req(app, `/status/assets/${asset.fileName}`);
    expect(res.status).toBe(404);
  });

  it("resolves asset routes at the root mount path", async () => {
    const app = await makeApp({ path: "/" });
    const asset = ASSETS[0];
    const res = await req(app, `/assets/${asset.fileName}`);
    expect(res.status).toBe(200);
  });
});

// ── No development-mode branch ───────────────────────────────────────────────

describe("no development-mode branch", () => {
  it("asserts no WEB_UI_DEV symbol exists in the package source", async () => {
    const { execSync } = await import("node:child_process");
    const packageRoot = join(import.meta.dirname, "..");
    let output = "";
    try {
      output = execSync("grep -rl WEB_UI_DEV src/", { cwd: packageRoot }).toString();
    } catch {
      // grep exits non-zero (no match) — that's the expected, passing case.
      output = "";
    }
    expect(output.trim()).toBe("");
  });
});

// ── Code splitting ───────────────────────────────────────────────────────────

describe("code splitting", () => {
  it("produces more than one JS entry when a dynamic import is present", async () => {
    const tmpDir = join(import.meta.dirname, "..", ".tmp-splitting-test");
    const { mkdirSync, rmSync, writeFileSync } = await import("node:fs");
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, "entry.js"),
      'async function load() { const m = await import("./lazy.js"); return m; } load();',
    );
    writeFileSync(join(tmpDir, "lazy.js"), "export const value = 42;");

    const result = await Bun.build({
      entrypoints: [join(tmpDir, "entry.js")],
      target: "browser",
      format: "esm",
      splitting: true,
      naming: "[dir]/[name]-[hash].[ext]",
    });

    rmSync(tmpDir, { recursive: true, force: true });

    expect(result.success).toBe(true);
    const jsOutputs = result.outputs.filter((o) => o.kind !== "sourcemap");
    expect(jsOutputs.length).toBeGreaterThan(1);
  });
});
