import { firstPaintAssetUrls } from "../asset-routes.js";
import { themeBootstrapScript } from "./theme-bootstrap.js";

export interface HtmlShellOptions {
  /** URL path prefix where the web UI is mounted, e.g. "/status". */
  basePath: string;
  /** Whether the engine has a token configured. */
  hasAuth: boolean;
}

/**
 * Returns the full HTML document for the web UI dashboard: a minimal shell
 * with the content-addressed JS/CSS bundles and the theme bootstrap.
 */
export function htmlShell({ basePath, hasAuth: _hasAuth }: HtmlShellOptions): string {
  // No-flash theme bootstrap: sets data-theme on <html> before the bundle loads.
  const themeBootstrap = themeBootstrapScript();

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
  <meta name="theme-color" content="#0B0F17" />
  <link rel="manifest" href="${esc(manifestPath)}" />
  <link rel="apple-touch-icon" href="${esc(iconPath)}" />
  <link rel="icon" type="image/svg+xml" href="${esc(iconPath)}" />
  <script>${themeBootstrap}</script>
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
    ? `<div style="color:light-dark(#DC2626,#F87171);background:light-dark(rgba(220,38,38,.1),rgba(248,113,113,.1));border:1px solid light-dark(rgba(220,38,38,.4),rgba(248,113,113,.4));border-radius:4px;padding:8px 12px;font-size:13px">${esc(error)}</div>`
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
      background: light-dark(#F6F8FC, #0B0F17);
      color: light-dark(#0D1526, #F3F6FC);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color-scheme: light dark;
    }
    .card {
      background: light-dark(#FFFFFF, #121826);
      border: 1px solid light-dark(#DCE3EF, rgba(255,255,255,.08));
      border-radius: 14px;
      padding: 32px;
      width: 100%;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,.32);
    }
    h1 { font-size: 20px; font-weight: 700; color: light-dark(#2563EB, #5EA8FF); text-align: center; }
    p { font-size: 12px; color: light-dark(#5B6B85, #9AA6BC); text-align: center; margin-top: -12px; }
    label { font-size: 12px; font-weight: 600; display: block; margin-bottom: 5px; }
    input[type=password] {
      width: 100%; padding: 8px 12px;
      border: 1px solid light-dark(#DCE3EF, rgba(255,255,255,.08));
      border-radius: 10px;
      background: light-dark(#EEF2F9, #1A2334);
      color: inherit;
      font-size: 14px;
      outline: none;
    }
    input[type=password]:focus { border-color: light-dark(#2563EB, #5EA8FF); }
    button {
      width: 100%; padding: 10px;
      background: light-dark(#2563EB, #5EA8FF); color: light-dark(#FFFFFF, #0B0F17);
      border: none; border-radius: 10px;
      font-size: 14px; font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: light-dark(#1D4ED8, #7CB8FF); }
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
