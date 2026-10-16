/**
 * Pure log-entry filtering by level threshold, automation substring, and
 * free-text search.
 */

import type { LogEntry } from "../types.js";

export interface LogFilter {
  /** Minimum level (inclusive); `0` means no threshold. */
  minLevel: number;
  /** Case-insensitive substring match against `entry.automation`. */
  automation: string;
  /** Case-insensitive substring match against the message or any field. */
  text: string;
}

export const EMPTY_LOG_FILTER: LogFilter = { minLevel: 0, automation: "", text: "" };

export function isLogFilterActive(filter: LogFilter): boolean {
  return filter.minLevel > 0 || filter.automation !== "" || filter.text !== "";
}

/** Whether a single entry matches `filter` — for bulk filtering and live appends. */
export function matchesLogFilter(entry: LogEntry, filter: LogFilter): boolean {
  if (filter.minLevel > 0 && entry.level < filter.minLevel) return false;

  if (filter.automation) {
    const automation = (entry.automation ?? "").toLowerCase();
    if (!automation.includes(filter.automation.toLowerCase())) return false;
  }

  if (filter.text) {
    const needle = filter.text.toLowerCase();
    const msg = (entry.msg ?? "").toLowerCase();
    if (!msg.includes(needle) && !JSON.stringify(entry).toLowerCase().includes(needle)) {
      return false;
    }
  }

  return true;
}

/** Filters a batch of entries against `filter`, preserving order. */
export function filterLogEntries(entries: LogEntry[], filter: LogFilter): LogEntry[] {
  return entries.filter((entry) => matchesLogFilter(entry, filter));
}
