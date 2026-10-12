import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_WIDGET_TYPES } from "@ts-ha/shared";
import { type CardArchetype, cardDrawsNoSurface } from "../src/app/lib/card-archetype.js";
import { wallFrameDrawsSurface } from "../src/app/wall/frame.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";

/**
 * The single-surface invariant (design.md D2, D4; specs/wall-display "A card is
 * a single surface"). The pure decisions — the frame's surface and a tile's —
 * compose the invariant directly; the wiring that passes them together is
 * asserted structurally, since there is no DOM harness — the same style as
 * `wall-read-only.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const ARCHETYPES: readonly CardArchetype[] = ["light", "toggle", "cover", "readout", "default"];

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(relative: string): Promise<string> {
  return stripComments(await readFile(join(APP_DIR, relative), "utf8"));
}

/** A tile's surface count, derived from the real decision rather than hard-coded. */
function tileSurfaces(archetype: CardArchetype, wall: boolean, contained: boolean): number {
  return cardDrawsNoSurface(archetype, wall, contained) ? 0 : 1;
}

describe("wallFrameDrawsSurface", () => {
  it("keeps the grammar-derived surface for every non-device widget type", () => {
    for (const type of WALL_WIDGET_TYPES) {
      if (type === "device") continue;
      const grammar = WALL_WIDGET_REGISTRY[type].grammar;
      expect(wallFrameDrawsSurface(type, grammar)).toBe(grammar === "control");
    }
  });

  it("makes the device widget's frame chrome-less so its tile owns the surface", () => {
    expect(WALL_WIDGET_REGISTRY.device.grammar).toBe("control");
    expect(wallFrameDrawsSurface("device", "control")).toBe(false);
  });

  it("draws exactly one surface for a room or favorites card, for every archetype", () => {
    for (const type of ["room", "favorites"] as const) {
      const grammar = WALL_WIDGET_REGISTRY[type].grammar;
      const frameSurfaces = wallFrameDrawsSurface(type, grammar) ? 1 : 0;
      expect(frameSurfaces).toBe(1);
      // A contained tile must draw no surface of its own; deriving it from the
      // real decision means a regression that surfaces a contained tile fails.
      for (const archetype of ARCHETYPES) {
        expect(frameSurfaces + tileSurfaces(archetype, true, true)).toBe(1);
      }
    }
  });

  it("draws exactly one surface for an actionable single-device card", () => {
    // The device frame draws none; its tile draws its own surface once.
    const frameSurfaces = wallFrameDrawsSurface("device", "control") ? 1 : 0;
    expect(frameSurfaces).toBe(0);
    expect(frameSurfaces + tileSurfaces("toggle", true, false)).toBe(1);
    expect(frameSurfaces + tileSurfaces("light", true, false)).toBe(1);
  });

  it("draws no surface for a chrome-less readout single-device card", () => {
    const frameSurfaces = wallFrameDrawsSurface("device", "control") ? 1 : 0;
    expect(frameSurfaces + tileSurfaces("readout", true, false)).toBe(0);
  });
});

describe("contained wiring", () => {
  it("WidgetFrame passes the surface decision to the widget renderer", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");
    expect(widgetFrame).toContain("wallFrameDrawsSurface");
    expect(widgetFrame).toContain("contained={drawsSurface}");
    expect(widgetFrame).toContain("<Renderer");
  });

  it("RoomWidget and FavoritesWidget forward contained to their device tiles", async () => {
    const room = await source("wall/widgets/RoomWidget.tsx");
    const favorites = await source("wall/widgets/FavoritesWidget.tsx");
    expect(room).toContain("contained={contained}");
    expect(favorites).toContain("contained={contained}");
  });

  it("WallDeviceTile forwards contained to the shared DeviceTile", async () => {
    const wallTile = await source("wall/widgets/WallDeviceTile.tsx");
    expect(wallTile).toContain("contained={props.contained}");
  });

  it("DeviceTile skips its Paper via the pure surface decision", async () => {
    const tile = await source("components/DeviceTile.tsx");
    expect(tile).toContain("cardDrawsNoSurface(archetype, wall, contained === true)");
    expect(tile).toContain("if (surfaceLess)");
  });
});
