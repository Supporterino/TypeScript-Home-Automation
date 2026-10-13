/**
 * The no-flash theme bootstrap (design.md D4; specs/web-ui "Theme Selection").
 *
 * The dashboard shell inlines {@link themeBootstrapScript} in `<head>` so the
 * resolved scheme is applied to `<html>` before the first paint; `useTheme()`
 * in the app persists the preference to the same key. This module is kept free
 * of React and of any `src/app/**` dependency so the server bundle can import
 * it while the app bundle shares one source of truth for the storage key and
 * the script.
 */

/** The `localStorage` key the theme preference is persisted under. */
export const THEME_STORAGE_KEY = "ts-ha-theme";

/** The scheme the user can select; `"system"` follows `prefers-color-scheme`. */
export type ThemePreference = "light" | "dark" | "system";

/** The scheme actually applied to the document. */
export type ResolvedTheme = "light" | "dark";

/**
 * Resolves the scheme applied to the document from the persisted preference:
 * an explicit `"light"`/`"dark"` is used as-is, and `"system"` defers to the
 * caller's current system scheme. Pure, so the resolution rule is unit-testable
 * without a DOM (design.md D4).
 */
export function resolveTheme(preference: ThemePreference, system: ResolvedTheme): ResolvedTheme {
  return preference === "system" ? system : preference;
}

/**
 * Returns the inline script that sets `document.documentElement.dataset.theme`
 * before first paint: it resolves the system preference first, then lets a
 * readable persisted preference override it, and finally applies a concrete
 * `"light"`/`"dark"` value unconditionally. Only the `localStorage` read is
 * guarded by try/catch — a blocked `localStorage` (private mode, Safari
 * "Block All Cookies" raising on the getter) leaves the system fallback in
 * place, so the attribute is still set rather than the page keeping the
 * `:root` default until React corrects it.
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
