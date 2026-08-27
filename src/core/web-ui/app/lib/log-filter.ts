/**
 * Pure log-entry filtering (design.md D23; task 10.21).
 *
 * Extracted out of the log view component so the filtering behaviour — level
 * threshold, automation-name substring, and free-text search across the
 * message and the whole entry — is reachable by `bun test` without a DOM,
 * and so new entries arriving from the stream can be filtered the same way
 * new-vs-existing, keeping an active filter applied without special-casing.
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

/** Whether a single entry matches `filter` — used for both bulk filtering and live-append checks. */
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
