/** Cookie name used to store the session token in the browser. */
export const SESSION_COOKIE = "ts-ha-session";

/**
 * Map pino level name to numeric value.
 */
export function levelNameToNumber(level: string): number {
  switch (level.toLowerCase()) {
    case "trace":
      return 10;
    case "debug":
      return 20;
    case "info":
      return 30;
    case "warn":
      return 40;
    case "error":
      return 50;
    case "fatal":
      return 60;
    default:
      return 30;
  }
}
