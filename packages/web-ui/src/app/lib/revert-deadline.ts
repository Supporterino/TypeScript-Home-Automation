/**
 * Optimistic-command revert deadline, derived from a device's own observation.
 */

import type { DeviceObservation } from "@ts-ha/shared";

/** Fixed deadline for a push-backed device — confirmation normally arrives in milliseconds. */
export const PUSH_BACKED_DEADLINE_MS = 3_000;

/** Safety margin added on top of a polled device's own reported refresh interval. */
export const POLLED_MARGIN_MS = 2_000;

/** Fallback deadline for a polled device that reports no refresh interval. */
export const POLLED_DEFAULT_DEADLINE_MS = 10_000;

/**
 * Computes how long an optimistic command may stand unconfirmed before
 * reverting: a fixed push deadline, or a polled device's own interval plus margin.
 */
export function computeRevertDeadlineMs(observation: DeviceObservation): number {
  if (observation.mode === "push") return PUSH_BACKED_DEADLINE_MS;

  const interval = observation.refreshIntervalMs;
  if (typeof interval === "number" && Number.isFinite(interval) && interval > 0) {
    return interval + POLLED_MARGIN_MS;
  }
  return POLLED_DEFAULT_DEADLINE_MS;
}
