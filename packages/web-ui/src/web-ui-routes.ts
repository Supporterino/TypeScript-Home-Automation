import { SESSION_COOKIE } from "@ts-ha/shared";
import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Logger } from "pino";
import { registerAssetRoutes } from "./asset-routes.js";
import { ICON_SVG } from "./assets/icon-svg.js";
import { htmlShell, loginShell } from "./components/html-shell.js";

/**
 * Every top-level application view segment the client router can navigate to.
 * Must be kept in sync with the client router's registered segments.
 */
export const UI_VIEW_SEGMENTS = [
  "overview",
  "rooms",
  "devices",
  "automations",
  "state",
  "logs",
  "homekit",
  "energy",
  "weather",
  "wall",
  "walls",
] as const;

/**
 * Register the web UI shell and login/logout routes on a Hono app. Data
 * routes under `/api/*` are served by core's `HttpServer`.
 */
export function registerWebUiRoutes(
  app: Hono,
  path: string,
  token: string,
  getLogger: () => Logger | null,
): void {
  const hasAuth = token.length > 0;

  // ── Path helper ───────────────────────────────────────────────────────────

  /** Build a sub-path relative to the UI base path, handling the root case. */
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

  // Unauthenticated and immutably cached; registered here so a disabled
  // instance serves no compiled asset routes.
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
      // Dark-scheme background, so the installed app's chrome matches. Keep in
      // sync with `--bg` in `src/app/styles/app.css`.
      background_color: "#0B0F17",
      theme_color: "#0B0F17",
      icons: [{ src: iconPath, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }],
    });
    return c.body(manifest, 200, { "Content-Type": "application/manifest+json" });
  });

  // ── Dashboard shell ───────────────────────────────────────────────────────

  // Auth is checked inline, not via app.use("/", ...), which would match every
  // route on the server when the UI is mounted at "/".
  // biome-ignore lint/suspicious/noExplicitAny: Hono context type is parameterised; using any here is safe
  function serveShell(c: Context<any>): Response | Promise<Response> {
    if (!isAuthorized(c)) {
      return c.redirect(subpath("login"));
    }
    const html = htmlShell({ basePath: path, hasAuth });
    // Never cache the shell, so a rebuilt bundle's new asset URLs are picked up.
    return c.html(html, 200, { "Cache-Control": "no-store" });
  }

  app.get(path, serveShell);

  // Trailing-slash redirect — omitted when path is "/" to avoid registering "//".
  if (path !== "/") {
    app.get(`${path}/`, (c) => c.redirect(path));
  }

  // Each view segment serves the shell, and anything nested beneath it. Other
  // sub-paths fall through to Hono's default 404.
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
      getLogger()?.warn("Failed login attempt (invalid token)");
      return c.html(loginShell({ basePath: path, error: "Invalid access token." }), 401);
    }

    getLogger()?.info("Successful login");

    // Built manually to attach both Location and Set-Cookie in one response.
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
    getLogger()?.info("User logged out");
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
