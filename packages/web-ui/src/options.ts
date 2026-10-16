/**
 * Web UI option parsing. Reads `WEB_UI_ENABLED` and `WEB_UI_PATH`; the auth
 * token is supplied by the registering entry point, not read here.
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
 * Parse `WEB_UI_ENABLED` / `WEB_UI_PATH` into plugin options. Returns `null`
 * when disabled; throws when `WEB_UI_PATH` does not start with `/`.
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
 * Whether `WEB_UI_ENABLED` is set to a true-y value: `1`, `true`, or `yes`
 * (case-insensitive) are true; everything else is false.
 */
function isEnabled(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
