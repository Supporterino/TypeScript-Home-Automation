import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_WIDGET_TYPES } from "@ts-ha/shared";
import { WALL_DEVICE_CLASSES } from "../src/app/wall/cards/device-class.js";
import { wallFrameDrawsSurface } from "../src/app/wall/frame.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";

/**
 * The single-surface invariant: the frame's surface decision is pure, and the
 * wiring that passes it through is asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(relative: string): Promise<string> {
  return stripComments(await readFile(join(APP_DIR, relative), "utf8"));
}

function isDeviceClass(type: string): boolean {
  return (WALL_DEVICE_CLASSES as readonly string[]).includes(type);
}

describe("wallFrameDrawsSurface", () => {
  it("keeps the grammar-derived surface for every non-device widget type above one row", () => {
    for (const type of WALL_WIDGET_TYPES) {
      if (isDeviceClass(type) || type === "scene") continue;
      const grammar = WALL_WIDGET_REGISTRY[type].grammar;
      expect(wallFrameDrawsSurface(type, grammar, WALL_WIDGET_REGISTRY[type].min)).toBe(
        grammar === "control",
      );
    }
  });

  it("makes every typed device widget's frame chrome-less so its card owns the surface", () => {
    for (const type of WALL_DEVICE_CLASSES) {
      expect(WALL_WIDGET_REGISTRY[type].grammar).toBe("control");
      expect(wallFrameDrawsSurface(type, "control", WALL_WIDGET_REGISTRY[type].min)).toBe(false);
    }
  });

  it("draws a surface for a room or favorites card", () => {
    for (const type of ["room", "favorites"] as const) {
      expect(
        wallFrameDrawsSurface(
          type,
          WALL_WIDGET_REGISTRY[type].grammar,
          WALL_WIDGET_REGISTRY[type].min,
        ),
      ).toBe(true);
    }
  });

  it("drops a scene's surface at one row and keeps the framed tile from two rows", () => {
    // The one-row scene renders chrome-less, so the whole cell is its touch target; at
    // two rows the frame draws the surface and the framed glyph-and-label tile returns.
    expect(WALL_WIDGET_REGISTRY.scene.min).toEqual({ w: 2, h: 1 });
    expect(wallFrameDrawsSurface("scene", "control", { w: 2, h: 1 })).toBe(false);
    expect(wallFrameDrawsSurface("scene", "control", { w: 2, h: 2 })).toBe(true);
  });
});

describe("contained wiring", () => {
  it("WidgetFrame passes the placement-aware surface decision to the widget renderer", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");
    expect(widgetFrame).toContain("wallFrameDrawsSurface(widget.type, descriptor.grammar, widget)");
    expect(widgetFrame).toContain("contained={drawsSurface}");
    expect(widgetFrame).toContain("<Renderer");
  });

  it("RoomWidget and FavoritesWidget forward contained to their device cards", async () => {
    const room = await source("wall/widgets/RoomWidget.tsx");
    const favorites = await source("wall/widgets/FavoritesWidget.tsx");
    expect(room).toContain("contained={contained}");
    expect(favorites).toContain("contained={contained}");
  });

  it("the typed device renderer forwards contained to the card it draws", async () => {
    const widget = await source("wall/widgets/DeviceWidget.tsx");
    expect(widget).toContain("contained={contained}");
  });
});
