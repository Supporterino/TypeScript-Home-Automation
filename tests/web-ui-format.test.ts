import { describe, expect, it } from "bun:test";
import { formatAge, isObservationStale } from "../src/core/web-ui/app/lib/format.js";

describe("formatAge", () => {
  it("formats seconds", () => {
    expect(formatAge(8_000)).toBe("8s");
    expect(formatAge(0)).toBe("0s");
  });

  it("formats minutes", () => {
    expect(formatAge(2 * 60_000)).toBe("2m");
  });

  it("formats hours", () => {
    expect(formatAge(3 * 60 * 60_000)).toBe("3h");
  });

  it("formats days", () => {
    expect(formatAge(5 * 24 * 60 * 60_000)).toBe("5d");
  });

  it("clamps a negative elapsed time to 0s", () => {
    expect(formatAge(-100)).toBe("0s");
  });
});

describe("isObservationStale", () => {
  it("is never stale for a push-backed observation (no refresh interval)", () => {
    expect(isObservationStale(1000, undefined, 999_999)).toBe(false);
  });

  it("is stale once elapsed exceeds the refresh interval", () => {
    expect(isObservationStale(0, 30_000, 40_000)).toBe(true);
    expect(isObservationStale(0, 30_000, 20_000)).toBe(false);
  });
});
