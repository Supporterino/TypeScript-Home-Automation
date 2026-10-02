import { firstPaintAssetUrls } from "../asset-routes.js";

export interface HtmlShellOptions {
  /** URL path prefix where the web UI is mounted, e.g. "/status". */
  basePath: string;
  /**
   * Whether the engine has a token configured.
   * Reserved for future use (e.g. showing a logout link in the React app).
   */
  hasAuth: boolean;
}

/**
 * Returns the full HTML document for the web UI dashboard.
 *
 * The page is a minimal shell — a single <div id="app"> mount point for the
 * React + Mantine frontend. The compiled JS and CSS bundles are referenced by
 * their content-addressed asset URLs rather than inlined, so they are
 * cacheable across requests and across views (design.md D8). The shell's size
 * is therefore independent of the compiled application's size.
 *
 * The data-base-path attribute is read by the React app to prefix all API
 * calls with the correct path (e.g. /status/api/status).
 */
export function htmlShell({ basePath, hasAuth: _hasAuth }: HtmlShellOptions): string {
  // Inline equivalent of Mantine's <ColorSchemeScript defaultColorScheme="auto" />.
  // Sets data-mantine-color-scheme on <html> before the React bundle loads,
  // preventing a flash of the wrong color scheme on first paint.
  const colorSchemeScript = `(function(){try{var s=localStorage.getItem("mantine-color-scheme");if(s==="light"||s==="dark"){document.documentElement.setAttribute("data-mantine-color-scheme",s);}else{var m=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-mantine-color-scheme",m?"dark":"light");}}catch(e){}})();`;

  const iconPath = basePath === "/" ? "/icon.svg" : `${basePath}/icon.svg`;
  const manifestPath = basePath === "/" ? "/manifest.json" : `${basePath}/manifest.json`;

  const { js, css } = firstPaintAssetUrls(basePath);
  const cssLinks = css.map((href) => `  <link rel="stylesheet" href="${esc(href)}" />`).join("\n");
  const jsScripts = js
    .map((src) => `  <script type="module" src="${esc(src)}"></script>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en" data-base-path="${esc(basePath)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ts-ha</title>
  <meta name="application-name" content="ts-ha" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="ts-ha" />
  <meta name="theme-color" content="#38BDF8" />
  <link rel="manifest" href="${esc(manifestPath)}" />
  <link rel="apple-touch-icon" href="${esc(iconPath)}" />
  <link rel="icon" type="image/svg+xml" href="${esc(iconPath)}" />
  <script>${colorSchemeScript}</script>
${cssLinks}
</head>
<body>
  <div id="app"></div>
${jsScripts}
</body>
</html>`;
}

/**
 * Escape a string for safe use in an HTML attribute value.
 */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns the login page HTML.
 * Intentionally plain HTML — no React, works without JS, rendered server-side.
 */
export function loginShell({ basePath, error }: { basePath: string; error?: string }): string {
  const errorHtml = error
    ? `<div style="color:#fa5252;background:rgba(250,82,82,.1);border:1px solid rgba(250,82,82,.4);border-radius:4px;padding:8px 12px;font-size:13px">${esc(error)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Home Automation — Login</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      background: light-dark(#F1F5F9, #0B1120);
      color: light-dark(#0F172A, #F8FAFC);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color-scheme: light dark;
    }
    .card {
      background: light-dark(#FFFFFF, #151E2E);
      border: 1px solid light-dark(#E2E8F0, rgba(255,255,255,.08));
      border-radius: 14px;
      padding: 32px;
      width: 100%;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,.32);
    }
    h1 { font-size: 20px; font-weight: 700; color: #38BDF8; text-align: center; }
    p { font-size: 12px; color: light-dark(#64748B, #94A3B8); text-align: center; margin-top: -12px; }
    label { font-size: 12px; font-weight: 600; display: block; margin-bottom: 5px; }
    input[type=password] {
      width: 100%; padding: 8px 12px;
      border: 1px solid light-dark(#E2E8F0, rgba(255,255,255,.08));
      border-radius: 10px;
      background: light-dark(#FFFFFF, #1E2940);
      color: inherit;
      font-size: 14px;
      outline: none;
    }
    input[type=password]:focus { border-color: #38BDF8; }
    button {
      width: 100%; padding: 10px;
      background: #0284C7; color: #fff;
      border: none; border-radius: 10px;
      font-size: 14px; font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #0369A1; }
  </style>
</head>
<body>
  <div class="card">
    <h1>ts-ha</h1>
    <p>Home Automation Web UI</p>
    ${errorHtml}
    <form method="POST" action="${esc(basePath === "/" ? "/login" : `${basePath}/login`)}">
      <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:16px">
        <label for="token-input">Access Token</label>
        <input
          type="password"
          id="token-input"
          name="token"
          placeholder="Enter your access token"
          autofocus
          required
        />
      </div>
      <button type="submit">Connect</button>
    </form>
  </div>
</body>
</html>`;
}
