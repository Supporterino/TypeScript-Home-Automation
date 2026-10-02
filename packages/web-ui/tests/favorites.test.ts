import { describe, expect, it } from "bun:test";
import {
  FAVORITES_STATE_KEY,
  favoritesFromState,
  isFavorite,
  parseFavorites,
  toggleFavorite,
} from "../src/app/lib/favorites.js";

// Pure list logic — no DOM, no React. The store's optimistic write and the
// stream reconciliation are thin wrappers over these functions (design.md
// D9; specs/web-ui "Favorites"; task 8.1).

describe("parseFavorites", () => {
  it("returns an empty list for a non-array value", () => {
    expect(parseFavorites(undefined)).toEqual([]);
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites("favorites")).toEqual([]);
    expect(parseFavorites({ a: 1 })).toEqual([]);
  });

  it("keeps only string entries", () => {
    expect(parseFavorites(["zigbee:0x1", 42, null, "shelly:plug"])).toEqual([
      "zigbee:0x1",
      "shelly:plug",
    ]);
  });

  it("drops duplicate identifiers", () => {
    expect(parseFavorites(["zigbee:0x1", "zigbee:0x1"])).toEqual(["zigbee:0x1"]);
  });

  it("returns an empty list for an empty array", () => {
    expect(parseFavorites([])).toEqual([]);
  });
});

describe("isFavorite", () => {
  it("reports membership", () => {
    expect(isFavorite(["zigbee:0x1"], "zigbee:0x1")).toBe(true);
    expect(isFavorite(["zigbee:0x1"], "shelly:plug")).toBe(false);
  });
});

describe("toggleFavorite", () => {
  it("adds an identifier that is not present", () => {
    expect(toggleFavorite([], "zigbee:0x1")).toEqual(["zigbee:0x1"]);
    expect(toggleFavorite(["shelly:plug"], "zigbee:0x1")).toEqual(["shelly:plug", "zigbee:0x1"]);
  });

  it("removes an identifier that is present", () => {
    expect(toggleFavorite(["zigbee:0x1", "shelly:plug"], "zigbee:0x1")).toEqual(["shelly:plug"]);
  });
});

describe("favoritesFromState", () => {
  it("reads the favorites key from the state map", () => {
    expect(favoritesFromState({ [FAVORITES_STATE_KEY]: ["zigbee:0x1"] })).toEqual(["zigbee:0x1"]);
  });

  it("returns an empty list when the key is absent", () => {
    expect(favoritesFromState({ night_mode: true })).toEqual([]);
  });

  it("reflects a remote update by re-deriving from the changed value", () => {
    // A state event from another client replaces the key's value; the
    // derived list follows without any local toggle.
    const before = favoritesFromState({ [FAVORITES_STATE_KEY]: ["zigbee:0x1"] });
    const after = favoritesFromState({
      [FAVORITES_STATE_KEY]: ["zigbee:0x1", "shelly:plug"],
    });
    expect(before).toEqual(["zigbee:0x1"]);
    expect(after).toEqual(["zigbee:0x1", "shelly:plug"]);
  });
});
