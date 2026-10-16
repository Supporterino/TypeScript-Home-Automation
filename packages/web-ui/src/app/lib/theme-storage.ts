/**
 * The pure, DOM-injected plumbing behind `useTheme()`: reading, writing, and
 * applying the persisted theme preference.
 */
import {
  type ResolvedTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../../components/theme-bootstrap.js";

/** The subset of `Storage` the theme preference reads and writes. */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The subset of the document root the resolved scheme is applied to. */
export interface ThemeRoot {
  dataset: { theme?: string };
}

/** The live `localStorage`, or `null` when there is no storage (SSR/no DOM). */
function currentStorage(): ThemeStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

/** The live `<html>` element, or `null` when there is no document (SSR/no DOM). */
function currentRoot(): ThemeRoot | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

/**
 * Reads the persisted preference, defaulting to `"system"` when nothing is
 * stored, the value is unrecognised, or storage is unavailable (private mode).
 */
export function readStoredPreference(
  storage: ThemeStorage | null = currentStorage(),
): ThemePreference {
  if (storage === null) return "system";
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage can be unavailable; fall through to the default.
  }
  return "system";
}

/** Persists an explicit preference; best-effort. */
export function writeStoredPreference(
  preference: ThemePreference,
  storage: ThemeStorage | null = currentStorage(),
): void {
  if (storage === null) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Persistence is best-effort; the in-memory preference still applies.
  }
}

/** Applies the resolved scheme to the document root's `data-theme`. */
export function applyResolvedTheme(
  resolved: ResolvedTheme,
  root: ThemeRoot | null = currentRoot(),
): void {
  if (root === null) return;
  root.dataset.theme = resolved;
}
