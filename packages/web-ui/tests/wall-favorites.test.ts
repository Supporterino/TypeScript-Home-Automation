import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeviceDescriptor } from "../src/app/types.js";
import { WALL_CARD_METRICS, WALL_CARD_SECONDARY_FONT_SIZE } from "../src/app/wall/cards/metrics.js";
import { favoriteDevices } from "../src/app/wall/widgets/favorites-model.js";

// Pure selection for the wall favorites widget — no DOM. The displayed set is
// derived from the favorites list and live device map on every render, so a
// change streamed from another client is reflected (design.md D7; task 5.6).

function device(qualifiedId: string): DeviceDescriptor {
  return {
    source: "zigbee",
    id: qualifiedId,
    qualifiedId,
    displayName: qualifiedId,
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
  };
}

function devices(...ids: string[]): Map<string, DeviceDescriptor> {
  return new Map(ids.map((id) => [id, device(id)]));
}

describe("favoriteDevices", () => {
  it("resolves the favorited identifiers to live descriptors in favorites order", () => {
    const result = favoriteDevices(["zigbee:b", "zigbee:a"], devices("zigbee:a", "zigbee:b"));
    expect(result.map((d) => d.qualifiedId)).toEqual(["zigbee:b", "zigbee:a"]);
  });

  it("drops an identifier with no live descriptor", () => {
    const result = favoriteDevices(["zigbee:a", "shelly:gone"], devices("zigbee:a"));
    expect(result.map((d) => d.qualifiedId)).toEqual(["zigbee:a"]);
  });

  it("returns an empty set when nothing is favorited", () => {
    expect(favoriteDevices([], devices("zigbee:a"))).toEqual([]);
  });

  it("yields the updated set when the favorites list changes", () => {
    // This is the shape of a streamed favorites update: the state event
    // replaces the list, and the derived set follows on the next render.
    const before = favoriteDevices(["zigbee:a"], devices("zigbee:a", "shelly:plug"));
    const after = favoriteDevices(["zigbee:a", "shelly:plug"], devices("zigbee:a", "shelly:plug"));

    expect(before.map((d) => d.qualifiedId)).toEqual(["zigbee:a"]);
    expect(after.map((d) => d.qualifiedId)).toEqual(["zigbee:a", "shelly:plug"]);
  });

  it("reflects a removal by dropping the device from the set", () => {
    const devicesById = devices("zigbee:a", "zigbee:b");
    expect(favoriteDevices(["zigbee:a", "zigbee:b"], devicesById)).toHaveLength(2);
    expect(favoriteDevices(["zigbee:b"], devicesById).map((d) => d.qualifiedId)).toEqual([
      "zigbee:b",
    ]);
  });
});

// The card's own chrome, composed from the wall's single card vocabulary
// (design.md W1, W2; specs/wall-display "Wall Visual Language", "Supporting text
// is drawn at the ported sizes"). There is no DOM harness here, so the
// composition is asserted structurally — the same style as the wall's other
// widget tests.
const APP_DIR = join(import.meta.dir, "..", "src/app");
const FAVORITES_WIDGET = join(APP_DIR, "wall/widgets/FavoritesWidget.tsx");
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function readSource(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

describe("the favorites card's own chrome", () => {
  it("leads with the vocabulary's state item at the ported glyph side", async () => {
    const widget = await readSource(FAVORITES_WIDGET);

    // The head is the vocabulary's own state item — the ported circular affordance
    // and its label — so the widget declares no head of its own.
    expect(widget).toContain("<WallCardStateItem");
    expect(widget).toContain("WALL_CARD_GLYPH_SIZE");
  });

  it("draws the favorite count at the ported secondary size", async () => {
    const widget = await readSource(FAVORITES_WIDGET);
    const anatomy = await readSource(ANATOMY);

    // The count is the widget's caption (design.md W2), so it is handed to the
    // vocabulary's own reading part with no tier of its own — the part falls back to
    // the ported secondary size, the smallest the ported table declares.
    expect(widget).toContain("<WallCardReading>{devices.length}</WallCardReading>");
    expect(anatomy).toContain("size = WALL_CARD_SECONDARY_FONT_SIZE");
    expect(WALL_CARD_SECONDARY_FONT_SIZE).toBe(`${WALL_CARD_METRICS.secondarySize}px`);
  });
});
