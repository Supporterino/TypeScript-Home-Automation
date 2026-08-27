/** Pure display-formatting helpers, reachable by `bun test` without a DOM (design.md D23). */

/** Formats an elapsed duration as a compact age string: "8s", "2m", "1h", "3d". */
export function formatAge(elapsedMs: number): string {
  if (elapsedMs < 0) return "0s";
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Whether a polled observation is older than its own refresh interval — presented as stale rather than current (design.md "Stale data is labelled"). */
export function isObservationStale(
  observedAt: number,
  refreshIntervalMs: number | undefined,
  now: number,
): boolean {
  if (refreshIntervalMs === undefined) return false;
  return now - observedAt > refreshIntervalMs;
}
