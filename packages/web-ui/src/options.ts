/**
 * Web UI option parsing (design.md D3, D8; specs/web-ui "Enabling", "URL Path").
 *
 * `@ts-ha/web-ui` owns its own configuration: it reads `WEB_UI_ENABLED` and
 * `WEB_UI_PATH` and nothing else. The auth token is never read here — the
 * registering entry point supplies the core engine's resolved
 * `httpServer.token`, so the shell, asset, and login routes share one secret
 * definition with the core `/api/*` middleware (design.md D8).
 */

/** Environment variables the web UI package parses. */
const ENV_ENABLED = "WEB_UI_ENABLED";
const ENV_PATH = "WEB_UI_PATH";

/** Default mount path when `WEB_UI_PATH` is unset. */
export const DEFAULT_WEB_UI_PATH = "/status";

/** Options the web UI plugin is constructed with. */
export interface WebUiOptions {
  /** URL path prefix the UI is served beneath. Always starts with `/`. */
  path: string;
  /** Auth token supplied by the registering entry point. Empty = no auth. */
  token: string;
}

/**
 * Parse `WEB_UI_ENABLED` / `WEB_UI_PATH` into plugin options.
 *
 * Returns `null` when the UI is disabled (unset or a false-y value), so a
 * caller can skip constructing the plugin entirely. Throws when
 * `WEB_UI_PATH` is set to a value that does not start with `/`.
 */
export function parseWebUiOptions(env: NodeJS.ProcessEnv = process.env): WebUiOptions | null {
  if (!isEnabled(env[ENV_ENABLED])) return null;

  const path = env[ENV_PATH] ?? DEFAULT_WEB_UI_PATH;
  if (!path.startsWith("/")) {
    throw new Error(`${ENV_PATH} must start with "/": received "${path}"`);
  }

  return { path, token: "" };
}

/**
 * Whether `WEB_UI_ENABLED` is set to a true-y value.
 *
 * Matches the boolean vocabulary the removed core schema accepted
 * (`booleanEnv`): `1`, `true`, `yes` (case-insensitive) are true; everything
 * else (including unset, `0`, `false`, `no`) is false.
 */
function isEnabled(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
