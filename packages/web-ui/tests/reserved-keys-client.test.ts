import { describe, expect, it } from "bun:test";
import { INTERNAL_STATE_PREFIX } from "@ts-ha/shared";
import {
  filterReservedKeys,
  isReservedStateKey,
  RESERVED_STATE_KEY_PREFIX,
} from "../src/app/lib/reserved-keys.js";

// The client-side predicate and the server-side guard both derive from the
// shared `INTERNAL_STATE_PREFIX` contract constant (design.md D9). This test
// lives in `@ts-ha/web-ui` and must not import `@ts-ha/core`; core asserts its
// own guard against the same shared constant (task 3.7).

describe("client-side isReservedStateKey", () => {
  it("rejects a room definition key", () => {
    expect(isReservedStateKey(`${INTERNAL_STATE_PREFIX}room-assignment:abc`)).toBe(true);
  });

  it("rejects an automation-enabled flag key", () => {
    expect(isReservedStateKey(`${INTERNAL_STATE_PREFIX}automation-enabled:my-automation`)).toBe(
      true,
    );
  });

  it("accepts an ordinary state key", () => {
    expect(isReservedStateKey("night_mode")).toBe(false);
    expect(isReservedStateKey("motion-light:lights_on")).toBe(false);
  });

  it("treats the bare prefix marker as an ordinary key", () => {
    expect(isReservedStateKey("$internal")).toBe(false);
    expect(isReservedStateKey("")).toBe(false);
  });

  it("uses the same prefix literal the server reserves", () => {
    expect(RESERVED_STATE_KEY_PREFIX).toBe("$internal:");
    expect(RESERVED_STATE_KEY_PREFIX).toBe(INTERNAL_STATE_PREFIX);
  });
});

describe("filterReservedKeys", () => {
  it("keeps ordinary keys and drops reserved ones", () => {
    const state = {
      night_mode: true,
      [`${INTERNAL_STATE_PREFIX}room-assignment:living-room`]: {
        id: "living-room",
        name: "Living Room",
      },
      [`${INTERNAL_STATE_PREFIX}automation-enabled:foo`]: false,
      "motion-light:lights_on": false,
    };
    const filtered = filterReservedKeys(state);
    expect(Object.keys(filtered).sort()).toEqual(["motion-light:lights_on", "night_mode"]);
  });

  it("returns an empty object for a fully reserved input", () => {
    const state = { [`${INTERNAL_STATE_PREFIX}a`]: {} };
    expect(filterReservedKeys(state)).toEqual({});
  });

  it("returns an empty object for an empty input", () => {
    expect(filterReservedKeys({})).toEqual({});
  });
});
