import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../http/utils.js";
import { ICON_SVG } from "./assets/icon-svg.js";
import { htmlShell, loginShell } from "./components/html-shell.js";

/**
 * Register web UI routes directly on an existing Hono app.
 *
 * Called by `HttpServer.mountWebUi()` when the web UI is enabled. It handles:
 *   - The HTML shell (dashboard page)
 *   - Login / logout flow when a token is configured
 *
 * All data API routes (`/api/*`) are served directly by `HttpServer`.
 */
export function registerWebUiRoutes(app: Hono, path: string, token: string): void {
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
  app.get(path, (c) => {
    if (!isAuthorized(c)) {
      return c.redirect(subpath("login"));
    }
    const html = htmlShell({ basePath: path, hasAuth });
    return c.html(html);
  });

  // Trailing-slash redirect — omitted when path is "/" to avoid registering "//".
  if (path !== "/") {
    app.get(`${path}/`, (c) => c.redirect(path));
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
      return c.html(loginShell({ basePath: path, error: "Invalid access token." }), 401);
    }

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
