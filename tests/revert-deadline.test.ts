import { describe, expect, it } from "bun:test";
import type { DeviceObservation } from "../src/core/device-sources/device-source.js";
import {
  computeRevertDeadlineMs,
  POLLED_DEFAULT_DEADLINE_MS,
  POLLED_MARGIN_MS,
  PUSH_BACKED_DEADLINE_MS,
} from "../src/core/web-ui/app/lib/revert-deadline.js";

describe("computeRevertDeadlineMs", () => {
  it("gives a push-backed device a short fixed deadline", () => {
    const observation: DeviceObservation = { mode: "push", observedAt: Date.now() };
    expect(computeRevertDeadlineMs(observation)).toBe(PUSH_BACKED_DEADLINE_MS);
  });

  it("gives a polled device its reported refresh interval plus a margin", () => {
    const observation: DeviceObservation = {
      mode: "polled",
      observedAt: Date.now(),
      refreshIntervalMs: 30_000,
    };
    expect(computeRevertDeadlineMs(observation)).toBe(30_000 + POLLED_MARGIN_MS);
  });

  it("gives a polled device with a long refresh interval at least that interval", () => {
    // design.md scenario: "A polled device is given until its next refresh" —
    // the deadline must be at least the reported interval, never shorter.
    const observation: DeviceObservation = {
      mode: "polled",
      observedAt: Date.now(),
      refreshIntervalMs: 60_000,
    };
    expect(computeRevertDeadlineMs(observation)).toBeGreaterThanOrEqual(60_000);
  });

  it("gives the push-backed device a deadline shorter than a slow polled device's", () => {
    const push: DeviceObservation = { mode: "push", observedAt: Date.now() };
    const polled: DeviceObservation = {
      mode: "polled",
      observedAt: Date.now(),
      refreshIntervalMs: 60_000,
    };
    expect(computeRevertDeadlineMs(push)).toBeLessThan(computeRevertDeadlineMs(polled));
  });

  it("falls back to a default deadline for a polled device reporting no interval", () => {
    const observation: DeviceObservation = { mode: "polled", observedAt: Date.now() };
    expect(computeRevertDeadlineMs(observation)).toBe(POLLED_DEFAULT_DEADLINE_MS);
  });

  it("ignores a non-finite reported interval and falls back to the default", () => {
    const observation: DeviceObservation = {
      mode: "polled",
      observedAt: Date.now(),
      refreshIntervalMs: Number.NaN,
    };
    expect(computeRevertDeadlineMs(observation)).toBe(POLLED_DEFAULT_DEADLINE_MS);
  });
});
