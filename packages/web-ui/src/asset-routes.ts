import type { Hono } from "hono";
import { clientAcceptsGzip, selectAssetBody } from "./assets/asset-types.js";
import { ASSETS } from "./assets/manifest.js";

/** Build a sub-path relative to the UI base path, handling the root case. */
function subpath(basePath: string, suffix: string): string {
  return basePath === "/" ? `/${suffix}` : `${basePath}/${suffix}`;
}

/**
 * Register the content-addressed asset routes beneath the UI path. Assets are
 * unauthenticated and immutably cached; the URL changes with the content.
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

    // Plain Response, not c.body(): Hono narrows to Uint8Array<ArrayBuffer>,
    // which the decoded buffer does not satisfy.
    return new Response(body as BodyInit, { status: 200, headers });
  });
}

/**
 * URLs of every asset required for first paint, in manifest order. Only scripts
 * and stylesheets; first-paint fonts load via the stylesheet's `@font-face`.
 */
export function firstPaintAssetUrls(basePath: string): { js: string[]; css: string[] } {
  const js: string[] = [];
  const css: string[] = [];
  for (const asset of ASSETS) {
    if (!asset.firstPaint) continue;
    const url = subpath(basePath, `assets/${asset.fileName}`);
    if (asset.contentType === "text/css") css.push(url);
    else if (asset.contentType === "application/javascript") js.push(url);
  }
  return { js, css };
}
