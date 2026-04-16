/** Shared log-display utilities used by LogsTab and OverviewTab. */

import type { LogEntry } from "../types.js";

// ── Constants ─────────────────────────────────────────────────────────────

export const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

/**
 * Fields shown in the primary row — excluded from the extra-fields expansion.
 */
export const HIDDEN_FIELDS = new Set([
  "level",
  "time",
  "msg",
  "pid",
  "hostname",
  "automation",
  "service",
]);

export const LEVEL_OPTIONS = [
  { value: "0", label: "All" },
  { value: "10", label: "TRACE+" },
  { value: "20", label: "DEBUG+" },
  { value: "30", label: "INFO+" },
  { value: "40", label: "WARN+" },
  { value: "50", label: "ERROR+" },
];

// ── Helper functions ───────────────────────────────────────────────────────

export function levelColor(level: number): string {
  if (level <= 20) return "cyan";
  if (level === 30) return "green";
  if (level === 40) return "yellow";
  return "red";
}

/** Raw CSS color for use in non-Mantine style props (e.g. border-left). */
export function levelCssColor(level: number): string {
  if (level <= 20) return "var(--mantine-color-cyan-5)";
  if (level === 30) return "var(--mantine-color-green-5)";
  if (level === 40) return "var(--mantine-color-yellow-5)";
  return "var(--mantine-color-red-5)";
}

/** Abbreviated time string shown in the log row. */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

/** Full date + time string shown in a tooltip. */
export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

/** Returns all entry keys that are NOT in the primary row display set. */
export function extraFields(entry: LogEntry): [string, unknown][] {
  return Object.entries(entry).filter(([k]) => !HIDDEN_FIELDS.has(k));
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}

/** Stable identity key for a log entry — used as expansion-state map key. */
export function entryKey(entry: LogEntry): string {
  return `${entry.time}-${entry.level}-${entry.msg}`;
}
