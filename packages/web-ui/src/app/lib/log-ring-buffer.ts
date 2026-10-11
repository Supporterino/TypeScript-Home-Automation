/**
 * The bounded in-memory log buffer (design.md D11; specs/wall-display
 * "Always-On Operation"; specs/web-ui "Logs").
 *
 * The data layer accumulates streamed log entries for the whole session, so
 * the buffer must never grow without limit. Extracted from `data-store.tsx`
 * as a pure module (design.md D23) so the bound is reachable by `bun test`
 * without a DOM.
 */

import type { LogEntry } from "../types.js";

/** How many log entries the in-memory ring buffer retains. */
export const LOG_BUFFER_CAPACITY = 500;

/**
 * Appends `entry` to `logs`, dropping the oldest entries so the result never
 * exceeds `capacity` and always keeps the newest ones. `capacity` defaults to
 * {@link LOG_BUFFER_CAPACITY}; a caller may pass a smaller bound for a
 * deliberately smaller view.
 */
export function applyLogRingBuffer(
  logs: readonly LogEntry[],
  entry: LogEntry,
  capacity = LOG_BUFFER_CAPACITY,
): LogEntry[] {
  const next = [...logs, entry];
  return next.length > capacity ? next.slice(next.length - capacity) : next;
}
