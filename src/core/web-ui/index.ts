import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Logger } from "pino";
import { SESSION_COOKIE } from "../http/utils.js";
import { registerAssetRoutes } from "./asset-routes.js";
import { ICON_SVG } from "./assets/icon-svg.js";
import { htmlShell, loginShell } from "./components/html-shell.js";

/**
 * Every top-level application view segment the client router can navigate
 * to (design.md D7; specs/web-ui/spec.md "Routes"; task 10.1).
 *
 * Each is registered explicitly below — an exact match and a `/*` nested
 * match, per the spec's `GET {path}/<ui-segment>` and
 * `GET {path}/<ui-segment>/*` rows — rather than a single catch-all beneath
 * the UI path. A catch-all would shadow health probes, webhooks, and the API
 * whenever the UI is mounted at `/`, which is exactly the bug D7 exists to
 * avoid. Adding a new top-level view costs one entry in this array; nothing
 * elsewhere needs to change for it to be served the shell.
 *
 * This array MUST be kept in sync with the client router's registered
 * segments (`src/core/web-ui/app/lib/router.ts`) — a client-side route with
 * no server entry here would 404 on reload; a server entry with no client
 * route would render a blank shell. `tests/status-page.test.ts` asserts each
 * of these serves the shell and that an unregistered segment does not.
 */
export const UI_VIEW_SEGMENTS = [
  "rooms",
  "devices",
  "automations",
  "state",
  "logs",
  "homekit",
] as const;

/**
 * Register web UI routes directly on an existing Hono app.
 *
 * Called by `HttpServer.mountWebUi()` when the web UI is enabled. It handles:
 *   - The HTML shell (dashboard page)
 *   - Login / logout flow when a token is configured
 *
 * All data API routes (`/api/*`) are served directly by `HttpServer`.
 *
 * @param logger Optional logger for authentication events
 */
export function registerWebUiRoutes(app: Hono, path: string, token: string, logger?: Logger): void {
  const hasAuth = token.length > 0;

  // ── Path helper ───────────────────────────────────────────────────────────

  /**
   * Build a sub-path relative to the UI base path, handling the root case.
   *   subpath("login") when path="/status" → "/status/login"
   *   subpath("login") when path="/"       → "/login"
   */
  function subpath(suffix: string): string {
    return path === "/" ? `/${suffix}` : `${path}/${suffix}`;
  }

  // ── Auth helper ───────────────────────────────────────────────────────────

  /** Returns true when the request carries a valid token (cookie or header). */
  // biome-ignore lint/suspicious/noExplicitAny: Hono context type is parameterised; using any here is safe
  function isAuthorized(c: Context<any>): boolean {
    if (!hasAuth) return true;

    // Check Authorization header first (for API clients / JS fetch calls)
    const authHeader = c.req.header("authorization") ?? "";
    if (authHeader === `Bearer ${token}`) return true;

    // Check session cookie (for browser navigation)
    const cookieVal = getCookie(c, SESSION_COOKIE);
    return cookieVal === token;
  }

  // ── Compiled JS/CSS assets ────────────────────────────────────────────────

  // Unauthenticated, content-addressed, immutably cached (design.md D8, D26).
  // Registered here — not when WEB_UI_ENABLED is false — so a disabled
  // instance serves no compiled asset routes at all.
  registerAssetRoutes(app, path);

  // ── PWA assets ────────────────────────────────────────────────────────────

  app.get(subpath("icon.svg"), (c) => {
    return c.body(ICON_SVG, 200, { "Content-Type": "image/svg+xml" });
  });

  app.get(subpath("apple-touch-icon.svg"), (c) => {
    return c.body(ICON_SVG, 200, { "Content-Type": "image/svg+xml" });
  });

  app.get(subpath("manifest.json"), (c) => {
    const iconPath = `${subpath("icon.svg")}`;
    const manifest = JSON.stringify({
      name: "ts-ha",
      short_name: "ts-ha",
      display: "standalone",
      start_url: path,
      scope: path,
      background_color: "#1a1b1e",
      theme_color: "#228be6",
      icons: [{ src: iconPath, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }],
    });
    return c.body(manifest, 200, { "Content-Type": "application/manifest+json" });
  });

  // ── Dashboard shell ───────────────────────────────────────────────────────

  // Auth is checked inline here rather than via app.use() because
  // app.use("/", ...) would match ALL routes on the server, breaking health
  // probes, webhooks, and API endpoints when the UI is mounted at "/".
  // biome-ignore lint/suspicious/noExplicitAny: Hono context type is parameterised; using any here is safe
  function serveShell(c: Context<any>): Response | Promise<Response> {
    if (!isAuthorized(c)) {
      return c.redirect(subpath("login"));
    }
    const html = htmlShell({ basePath: path, hasAuth });
    // The shell is small and changes with each deploy; never cache it, so a
    // rebuilt bundle's new hashed asset URLs are always picked up on reload
    // (design.md D8).
    return c.html(html, 200, { "Cache-Control": "no-store" });
  }

  app.get(path, serveShell);

  // Trailing-slash redirect — omitted when path is "/" to avoid registering "//".
  if (path !== "/") {
    app.get(`${path}/`, (c) => c.redirect(path));
  }

  // Every registered top-level view segment also serves the shell, both at
  // its own path and for anything nested beneath it (a detail path such as
  // a device or automation's own view) — design.md D7; task 10.1. No other
  // path beneath the UI path is registered, so an unknown sub-path (a typo,
  // or a segment the client has never had) falls through to Hono's default
  // 404 rather than the shell.
  for (const segment of UI_VIEW_SEGMENTS) {
    app.get(subpath(segment), serveShell);
    app.get(`${subpath(segment)}/*`, serveShell);
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  app.get(subpath("login"), (c) => {
    // If no auth configured or already authenticated, redirect to dashboard
    if (!hasAuth || isAuthorized(c)) {
      return c.redirect(path);
    }
    return c.html(loginShell({ basePath: path }));
  });

  app.post(subpath("login"), async (c) => {
    if (!hasAuth) return c.redirect(path);

    let formToken = "";
    try {
      const body = await c.req.parseBody();
      formToken = String(body.token ?? "");
    } catch {
      formToken = "";
    }

    if (formToken !== token) {
      logger?.warn("Failed login attempt (invalid token)");
      return c.html(loginShell({ basePath: path, error: "Invalid access token." }), 401);
    }

    logger?.info("Successful login");

    // Set session cookie and redirect to dashboard.
    // We build the Response manually so we can attach both the Location header
    // and the Set-Cookie header in a single response.
    const cookieValue = `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: path,
        "Set-Cookie": cookieValue,
      },
    });
  });

  app.get(subpath("logout"), () => {
    logger?.info("User logged out");
    // Clear the session cookie by expiring it and redirect to the login page
    return new Response(null, {
      status: 302,
      headers: {
        Location: subpath("login"),
        "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
      },
    });
  });
}
