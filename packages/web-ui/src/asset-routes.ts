import type { Hono } from "hono";
import { clientAcceptsGzip, selectAssetBody } from "./assets/asset-types.js";
import { ASSETS } from "./assets/manifest.js";

/**
 * Build a sub-path relative to the UI base path, handling the root case.
 *   subpath("/status", "assets/x.js") → "/status/assets/x.js"
 *   subpath("/", "assets/x.js")       → "/assets/x.js"
 */
function subpath(basePath: string, suffix: string): string {
  return basePath === "/" ? `/${suffix}` : `${basePath}/${suffix}`;
}

/**
 * Register the content-addressed asset routes beneath the UI path.
 *
 * Assets are unauthenticated (the shell must load before a session exists)
 * and carry no instance data, so this is safe. Each response is served
 * gzip-compressed when the client accepts it, and immutably cached — the
 * URL itself changes whenever the content does (design.md D8, D26).
 */
export function registerAssetRoutes(app: Hono, basePath: string): void {
  app.get(subpath(basePath, "assets/:fileName"), (c) => {
    const fileName = c.req.param("fileName");
    const asset = ASSETS.find((a) => a.fileName === fileName);
    if (!asset) return c.notFound();

    const acceptsGzip = clientAcceptsGzip(c.req.header("accept-encoding"));
    const { body, contentEncoding } = selectAssetBody(asset, acceptsGzip);

    const headers: Record<string, string> = {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    if (contentEncoding) headers["Content-Encoding"] = contentEncoding;

    // Built as a plain Response rather than c.body(): Hono's body helper
    // narrows to Uint8Array<ArrayBuffer>, which the base64-decoded buffer
    // does not structurally satisfy.
    return new Response(body as BodyInit, { status: 200, headers });
  });
}

/** URLs of every asset required for first paint, in manifest order. */
export function firstPaintAssetUrls(basePath: string): { js: string[]; css: string[] } {
  const js: string[] = [];
  const css: string[] = [];
  for (const asset of ASSETS) {
    if (!asset.firstPaint) continue;
    const url = subpath(basePath, `assets/${asset.fileName}`);
    if (asset.contentType === "text/css") css.push(url);
    else js.push(url);
  }
  return { js, css };
}
