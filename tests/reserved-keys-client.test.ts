import { describe, expect, it } from "bun:test";
import { AUTOMATION_ENABLED_PREFIX } from "../src/core/automation-manager.js";
import { ROOM_PREFIX } from "../src/core/room-manager.js";
import { isReservedStateKey as serverIsReservedStateKey } from "../src/core/state/state-manager.js";
import {
  filterReservedKeys,
  isReservedStateKey,
  RESERVED_STATE_KEY_PREFIX,
} from "../src/core/web-ui/app/lib/reserved-keys.js";

describe("client-side isReservedStateKey", () => {
  it("rejects a room definition key", () => {
    expect(isReservedStateKey(`${ROOM_PREFIX}abc-123`)).toBe(true);
  });

  it("rejects an automation-enabled flag key", () => {
    expect(isReservedStateKey(`${AUTOMATION_ENABLED_PREFIX}my-automation`)).toBe(true);
  });

  it("accepts an ordinary state key", () => {
    expect(isReservedStateKey("night_mode")).toBe(false);
    expect(isReservedStateKey("motion-light:lights_on")).toBe(false);
  });

  it("agrees with the server-side predicate for every case", () => {
    const keys = [
      "night_mode",
      `${ROOM_PREFIX}living-room`,
      `${AUTOMATION_ENABLED_PREFIX}foo`,
      "$internal:room-assignment:zigbee:0xabc",
      "",
      "$internal",
    ];
    for (const key of keys) {
      expect(isReservedStateKey(key)).toBe(serverIsReservedStateKey(key));
    }
  });

  it("uses the same prefix literal the server reserves", () => {
    expect(RESERVED_STATE_KEY_PREFIX).toBe("$internal:");
  });
});

describe("filterReservedKeys", () => {
  it("keeps ordinary keys and drops reserved ones", () => {
    const state = {
      night_mode: true,
      [`${ROOM_PREFIX}living-room`]: { id: "living-room", name: "Living Room" },
      [`${AUTOMATION_ENABLED_PREFIX}foo`]: false,
      "motion-light:lights_on": false,
    };
    const filtered = filterReservedKeys(state);
    expect(Object.keys(filtered).sort()).toEqual(["motion-light:lights_on", "night_mode"]);
  });

  it("returns an empty object for a fully reserved input", () => {
    const state = { [`${ROOM_PREFIX}a`]: {} };
    expect(filterReservedKeys(state)).toEqual({});
  });

  it("returns an empty object for an empty input", () => {
    expect(filterReservedKeys({})).toEqual({});
  });
});
