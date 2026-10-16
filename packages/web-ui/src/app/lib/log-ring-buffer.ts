/** The bounded in-memory log buffer that accumulates streamed log entries. */

import type { LogEntry } from "../types.js";

/** How many log entries the in-memory ring buffer retains. */
export const LOG_BUFFER_CAPACITY = 500;

/**
 * Appends `entry` to `logs`, dropping the oldest so the result never exceeds
 * `capacity`. Defaults to {@link LOG_BUFFER_CAPACITY}.
 */
export function applyLogRingBuffer(
  logs: readonly LogEntry[],
  entry: LogEntry,
  capacity = LOG_BUFFER_CAPACITY,
): LogEntry[] {
  const next = [...logs, entry];
  return next.length > capacity ? next.slice(next.length - capacity) : next;
}
