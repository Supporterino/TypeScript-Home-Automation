/**
 * Dracula-inspired color palette for the dashboard.
 */
export const COLORS = {
  bg: "#282a36",
  bgLight: "#44475a",
  fg: "#f8f8f2",
  comment: "#6272a4",
  cyan: "#8be9fd",
  green: "#50fa7b",
  orange: "#ffb86c",
  pink: "#ff79c6",
  purple: "#bd93f9",
  red: "#ff5555",
  yellow: "#f1fa8c",
} as const;

/**
 * Map pino numeric level to display name.
 */
export function levelName(level: number): string {
  if (level <= 10) return "TRACE";
  if (level <= 20) return "DEBUG";
  if (level <= 30) return "INFO";
  if (level <= 40) return "WARN";
  if (level <= 50) return "ERROR";
  return "FATAL";
}

/**
 * Map pino numeric level to a color.
 */
export function levelColor(level: number): string {
  if (level >= 50) return COLORS.red;
  if (level >= 40) return COLORS.orange;
  if (level >= 30) return COLORS.green;
  if (level >= 20) return COLORS.cyan;
  return COLORS.comment;
}

/**
 * Color a value based on its JS type.
 */
export function valueColor(value: unknown): string {
  if (value === null || value === undefined) return COLORS.comment;
  if (typeof value === "boolean") return value ? COLORS.green : COLORS.red;
  if (typeof value === "number") return COLORS.cyan;
  if (typeof value === "string") return COLORS.yellow;
  return COLORS.fg;
}

/**
 * Format a value for compact display.
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const json = JSON.stringify(value);
  return json.length <= 50 ? json : `${json.slice(0, 47)}...`;
}

/**
 * Format uptime from a startedAt timestamp.
 */
export function formatUptime(startedAt: number | null): string {
  if (!startedAt) return "—";
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}
