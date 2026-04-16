import { JS } from "../assets/app-js.js";
import { CSS } from "../assets/style-css.js";

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
 * React + Mantine frontend. Both the CSS (Mantine styles) and the compiled JS
 * bundle are inlined so the dashboard loads with a single HTTP request and
 * requires no external network access.
 *
 * The data-base-path attribute is read by the React app to prefix all API
 * calls with the correct path (e.g. /status/api/status).
 */
export function htmlShell({ basePath, hasAuth: _hasAuth }: HtmlShellOptions): string {
  // Inline equivalent of Mantine's <ColorSchemeScript defaultColorScheme="auto" />.
  // Sets data-mantine-color-scheme on <html> before the React bundle loads,
  // preventing a flash of the wrong color scheme on first paint.
  const colorSchemeScript = `(function(){try{var s=localStorage.getItem("mantine-color-scheme");if(s==="light"||s==="dark"){document.documentElement.setAttribute("data-mantine-color-scheme",s);}else{var m=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-mantine-color-scheme",m?"dark":"light");}}catch(e){}})();`;

  return `<!DOCTYPE html>
<html lang="en" data-base-path="${esc(basePath)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Home Automation — Status</title>
  <script>${colorSchemeScript}</script>
  <style>${CSS}</style>
</head>
<body>
  <div id="app"></div>
  <script type="module">${JS}</script>
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
      background: light-dark(#f8f9fa, #1a1b1e);
      color: light-dark(#212529, #c1c2c5);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color-scheme: light dark;
    }
    .card {
      background: light-dark(#fff, #25262b);
      border: 1px solid light-dark(#dee2e6, #373a40);
      border-radius: 8px;
      padding: 32px;
      width: 100%;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-shadow: 0 4px 24px rgba(0,0,0,.1);
    }
    h1 { font-size: 20px; font-weight: 700; color: #228be6; text-align: center; }
    p { font-size: 12px; color: light-dark(#868e96, #909296); text-align: center; margin-top: -12px; }
    label { font-size: 12px; font-weight: 600; display: block; margin-bottom: 5px; }
    input[type=password] {
      width: 100%; padding: 8px 12px;
      border: 1px solid light-dark(#ced4da, #373a40);
      border-radius: 4px;
      background: light-dark(#fff, #1a1b1e);
      color: inherit;
      font-size: 14px;
      outline: none;
    }
    input[type=password]:focus { border-color: #228be6; }
    button {
      width: 100%; padding: 10px;
      background: #228be6; color: #fff;
      border: none; border-radius: 4px;
      font-size: 14px; font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #1c7ed6; }
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
