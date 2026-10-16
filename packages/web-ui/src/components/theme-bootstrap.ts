/**
 * The no-flash theme bootstrap: resolves and applies the scheme to `<html>`
 * before first paint. Kept React-free so the server bundle can import it.
 */

/** The `localStorage` key the theme preference is persisted under. */
export const THEME_STORAGE_KEY = "ts-ha-theme";

/** The scheme the user can select; `"system"` follows `prefers-color-scheme`. */
export type ThemePreference = "light" | "dark" | "system";

/** The scheme actually applied to the document. */
export type ResolvedTheme = "light" | "dark";

/**
 * Resolves the document scheme from the persisted preference: `"system"`
 * defers to `system`, anything else is used as-is.
 */
export function resolveTheme(preference: ThemePreference, system: ResolvedTheme): ResolvedTheme {
  return preference === "system" ? system : preference;
}

/**
 * Returns the inline script that sets `data-theme` before first paint, from the
 * persisted preference or the system one; a blocked `localStorage` still falls back.
 */
export function themeBootstrapScript(): string {
  return (
    "(function(){" +
    `var k=${JSON.stringify(THEME_STORAGE_KEY)};` +
    'var d=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";' +
    'try{var s=localStorage.getItem(k);if(s==="light"||s==="dark")d=s;}catch(e){}' +
    'document.documentElement.setAttribute("data-theme",d);' +
    "})();"
  );
}
