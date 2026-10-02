/**
 * Favorites over an ordinary state key (design.md D9; specs/web-ui
 * "Favorites").
 *
 * Favorites are a JSON array of qualified identifiers stored under one
 * ordinary state key, so they persist and propagate to every connected
 * client through the state snapshot and stream that already exist — no
 * parallel API, no device change. This module is the pure list logic only;
 * the data store owns the optimistic write and stream reconciliation.
 */

/** The ordinary state key favorites are stored under (design.md D9). */
export const FAVORITES_STATE_KEY = "favorites";

/** Coerces any stored value into a de-duplicated list of qualified identifiers. */
export function parseFavorites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && !out.includes(entry)) out.push(entry);
  }
  return out;
}

/** Derives the favorites list from a state snapshot or stream-reconciled map. */
export function favoritesFromState(state: Record<string, unknown>): string[] {
  return parseFavorites(state[FAVORITES_STATE_KEY]);
}

/** Whether `qualifiedId` is in the favorites list. */
export function isFavorite(list: string[], qualifiedId: string): boolean {
  return list.includes(qualifiedId);
}

/** Returns a new list with `qualifiedId` added when absent or removed when present. */
export function toggleFavorite(list: string[], qualifiedId: string): string[] {
  return list.includes(qualifiedId)
    ? list.filter((id) => id !== qualifiedId)
    : [...list, qualifiedId];
}
