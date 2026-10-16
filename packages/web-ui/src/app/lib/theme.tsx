/**
 * Theme selection: reads the document's scheme, exposes the preference and
 * resolved theme, and persists an explicit choice.
 */
import { useCallback, useEffect, useState } from "react";
import {
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
} from "../../components/theme-bootstrap.js";
import {
  applyResolvedTheme,
  readStoredPreference,
  writeStoredPreference,
} from "./theme-storage.js";

export type { ResolvedTheme, ThemePreference };

/** The value returned by {@link useTheme}. */
export interface UseThemeResult {
  /** The persisted preference: an explicit scheme, or `"system"`. */
  preference: ThemePreference;
  /** The scheme currently applied to the document. */
  resolvedTheme: ResolvedTheme;
  /** Persist and apply a new preference. */
  setTheme: (preference: ThemePreference) => void;
}

/** The system's current preference, defaulting to dark when unavailable. */
function systemThemeNow(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** A `prefers-color-scheme` query, or null when unsupported. */
function systemQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia("(prefers-color-scheme: dark)");
}

/** Reads, applies, and updates the active light/dark/system scheme. */
export function useTheme(): UseThemeResult {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(systemThemeNow);

  const resolvedTheme: ResolvedTheme = resolveTheme(preference, systemTheme);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (preference !== "system") return;
    const query = systemQuery();
    if (!query) return;
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemTheme(event.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference): void => {
    setPreference(next);
    writeStoredPreference(next);
  }, []);

  return { preference, resolvedTheme, setTheme };
}
