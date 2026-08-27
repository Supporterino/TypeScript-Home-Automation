/**
 * Optimistic-command revert deadline (design.md D21; task 10.12b).
 *
 * A command that is neither confirmed nor rejected must still revert
 * eventually, and a single deadline for every device is wrong at both ends:
 * short enough to be useful on a push-backed device, it reverts a working
 * polled device before its next refresh; long enough for the slowest polled
 * device, it leaves a failed push-backed command looking successful for
 * seconds.
 *
 * The deadline is derived from the device's own {@link DeviceObservation}
 * (carried on its descriptor) rather than from any per-family knowledge in
 * the client — this module never asks which source produced the device.
 */

import type { DeviceObservation } from "../../../device-sources/device-source.js";

/** Fixed deadline for a push-backed device — confirmation normally arrives in milliseconds. */
export const PUSH_BACKED_DEADLINE_MS = 3_000;

/** Safety margin added on top of a polled device's own reported refresh interval. */
export const POLLED_MARGIN_MS = 2_000;

/** Fallback margin-inclusive deadline for a polled device that, unusually, reports no refresh interval. */
export const POLLED_DEFAULT_DEADLINE_MS = 10_000;

/**
 * Computes how long an optimistic command should be allowed to stand
 * unconfirmed before reverting, from the device's observation mode alone.
 *
 * A push-backed device gets {@link PUSH_BACKED_DEADLINE_MS}. A polled device
 * gets its own reported `refreshIntervalMs` plus {@link POLLED_MARGIN_MS},
 * or {@link POLLED_DEFAULT_DEADLINE_MS} if it reports none.
 */
export function computeRevertDeadlineMs(observation: DeviceObservation): number {
  if (observation.mode === "push") return PUSH_BACKED_DEADLINE_MS;

  const interval = observation.refreshIntervalMs;
  if (typeof interval === "number" && Number.isFinite(interval) && interval > 0) {
    return interval + POLLED_MARGIN_MS;
  }
  return POLLED_DEFAULT_DEADLINE_MS;
}
