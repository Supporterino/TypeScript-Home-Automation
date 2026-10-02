/**
 * Client-side reserved-state-key predicate (design.md D20; task 10.16b).
 *
 * The server already refuses to serve, write, or delete a reserved internal
 * key through the public state API (`isReservedStateKey()` in
 * `packages/core/src/state/state-manager.ts`, tasks 2.12–2.13) — this is not a second
 * line of defence against that. It exists so the state *view* itself never
 * renders a row for one, and offers no free-text key field that could even
 * be used to attempt writing one: rooms cannot be destroyed and enabled
 * flags cannot be flipped from the state view, because there is nothing
 * there to click.
 *
 * The prefix is the shared `INTERNAL_STATE_PREFIX` contract constant
 * (design.md D9), so the browser bundle and the server's guard derive from
 * one literal rather than two hand-synchronised copies.
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
