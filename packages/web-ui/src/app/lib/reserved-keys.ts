/**
 * Client-side reserved-state-key predicate, so the state view never renders or
 * edits a reserved internal key.
 */

import { INTERNAL_STATE_PREFIX } from "@ts-ha/shared";

/** Must match `INTERNAL_STATE_PREFIX` in `@ts-ha/shared`. */
export const RESERVED_STATE_KEY_PREFIX = INTERNAL_STATE_PREFIX;

/** Pure predicate: whether `key` belongs to the reserved internal namespace. */
export function isReservedStateKey(key: string): boolean {
  return key.startsWith(RESERVED_STATE_KEY_PREFIX);
}

/** Filters a state key/value map down to the ordinary, presentable keys. */
export function filterReservedKeys<T>(state: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!isReservedStateKey(key)) out[key] = value;
  }
  return out;
}
