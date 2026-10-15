import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_WIDGET_TYPES, type WallWidget, type WallWidgetType } from "@ts-ha/shared";
import {
  minimumRendererBoxHeightPx,
  rendererBoxHeightPx,
  wallBandChrome,
  wallFrameChrome,
  widgetTitle,
} from "../src/app/wall/frame.js";
import { ROW_UNIT_MAX, ROW_UNIT_MIN, WALL_COMPACT_CARD_HEIGHT_PX } from "../src/app/wall/grid.js";
import { WALL_FRAME_RESERVED_PX } from "../src/app/wall/pages.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import {
  cardHeightPx,
  composesMinimumSpan,
  resolveCardFormForHeight,
  resolveSpanTier,
  WALL_FULL_CARD_HEIGHT_PX,
  WALL_TITLE_BLOCK_PX,
  WALL_TITLE_ROWS,
} from "../src/app/wall/span.js";

// Pure frame decisions — no DOM. The ambient/control grammar and the opt-in
// title rule are the whole frame's behaviour (design.md D2, D3; specs/wall-
// display "Wall Glanceability").

function widget(type: WallWidgetType, config: Record<string, unknown> = {}): WallWidget {
  return { id: "a", type, config, x: 0, y: 0, w: 3, h: 2 };
}

describe("wallFrameChrome", () => {
  it("renders an ambient readout without a control surface", () => {
    const chrome = wallFrameChrome("ambient");
    expect(chrome.surface).toBe(false);
    expect(chrome.background).toBeNull();
    expect(chrome.borderColor).toBeNull();
    expect(chrome.radius).toBeNull();
  });

  it("renders a control widget as a Hearth surface tile", () => {
    const chrome = wallFrameChrome("control");
    expect(chrome.surface).toBe(true);
    expect(chrome.background).toBe("var(--hearth-surface)");
    expect(chrome.borderColor).toBe("var(--hearth-hairline)");
    expect(chrome.radius).toBe("var(--hearth-radius-md)");
  });

  it("derives the surface from each type's descriptor grammar", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const grammar = WALL_WIDGET_REGISTRY[type].grammar;
      expect(wallFrameChrome(grammar).surface).toBe(grammar === "control");
    }
  });
});

describe("wallBandChrome", () => {
  it("draws a zone band from Hearth's own band field and radius", () => {
    const chrome = wallBandChrome();
    expect(chrome.background).toBe("var(--hearth-band)");
    expect(chrome.radius).toBe("var(--hearth-radius-md)");
  });

  it("keeps the band distinct from a member's surface", () => {
    // A band groups *behind* its members: a member keeps its own tile surface,
    // so the band never nests one surface inside another.
    expect(wallBandChrome().background).not.toBe(wallFrameChrome("control").background);
  });
});

describe("widgetTitle", () => {
  it("returns null when no title is configured, so no header is rendered", () => {
    expect(widgetTitle(widget("clock"))).toBeNull();
    expect(widgetTitle(widget("light", { qualifiedId: "zigbee:0xabc" }))).toBeNull();
  });

  it("returns the configured title when one is set", () => {
    expect(widgetTitle(widget("clock", { title: "Hallway" }))).toBe("Hallway");
  });

  it("treats a blank configured title as unset", () => {
    expect(widgetTitle(widget("clock", { title: "   " }))).toBeNull();
  });

  it("ignores a non-string title value", () => {
    expect(widgetTitle(widget("clock", { title: 42 }))).toBeNull();
  });
});

describe("the span tier the frame hands its renderer", () => {
  const APP_DIR = join(import.meta.dir, "..", "src/app");

  /** Removes block and line comments so prose is not mistaken for markup. */
  function stripComments(content: string): string {
    return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  }

  async function source(relative: string): Promise<string> {
    return stripComments(await readFile(join(APP_DIR, relative), "utf8"));
  }

  it("derives the tier from the widget's own registry spans", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const descriptor = WALL_WIDGET_REGISTRY[type];
      // The frame resolves with the same spans the editor's size rule enforces,
      // so a renderer's composition and the legal spans cannot drift (D3).
      expect(resolveSpanTier(descriptor.min, descriptor)).toBe("compact");
      expect(resolveSpanTier(descriptor.max, descriptor)).toBe("roomy");
    }
  });

  it("WidgetFrame resolves the tier and passes it, and the row unit, to the renderer", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");

    expect(widgetFrame).toContain("resolveSpanTier(widget, descriptor)");
    expect(widgetFrame).toContain("tier={tier}");
    expect(widgetFrame).toContain("rowUnit={rowUnit}");
  });

  it("WallGrid hands the resolved row unit to the frame", async () => {
    const wallGrid = await source("wall/WallGrid.tsx");

    expect(wallGrid).toContain("rowUnit");
    expect(wallGrid).toContain("<WidgetFrame widget={widget} rowUnit={rowUnit} />");
  });

  it("resolves the form against the renderer's own box, not the whole cell", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");

    // The frame spends part of the cell on its inset (when it draws a surface) and
    // on the title it renders above the renderer, so the form must be resolved
    // from what is left (wall-zones-and-fit D3, D4).
    expect(widgetFrame).toContain("rendererBoxHeightPx(");
    expect(widgetFrame).toContain("cellHeightPx: cardHeightPx({ rows: widget.h, rowUnit })");
    expect(widgetFrame).toContain("framed: drawsSurface");
    expect(widgetFrame).toContain("titled: title !== null");
    expect(widgetFrame).toContain("resolveCardFormForHeight(");
  });

  it("explains a placement below the type's minimum on either axis, or below the box its minimum needs", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");

    // The wall's convention for something that cannot be shown: a contained
    // explanation in its own vocabulary, never a clipped card (specs/wall-display
    // "Panel Fit"). The rule covers every type and every legacy profile, in both
    // axes — and a configured title, because it compares the cards' *boxes*.
    expect(widgetFrame).toContain("placement: widget,");
    expect(widgetFrame).toContain("rendererHeightPx,");
    expect(widgetFrame).toContain("minimumRendererHeightPx: minimumRendererBoxHeightPx({");
    expect(widgetFrame).toContain("<WallCardMessage>{WALL_TOO_SMALL_MESSAGE}</WallCardMessage>");
    // One copy, so the frame's guard and the editor's floor explain the same thing
    // in the same words.
    const frameModule = await source("wall/frame.ts");
    expect(frameModule).toContain("export const WALL_TOO_SMALL_MESSAGE");
    expect(frameModule).toContain("too small for its minimum size");
  });

  it("hands the renderer the box it actually gets, beside the form", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");

    // A renderer whose own multi-form composition has its own budget resolves
    // against the box, not the light card's global form (wall-zones-and-fit D3).
    expect(widgetFrame).toContain("const rendererHeightPx = rendererBoxHeightPx({");
    expect(widgetFrame).toContain("rendererHeightPx={rendererHeightPx}");
    expect(widgetFrame).toContain("resolveCardFormForHeight(rendererHeightPx)");
  });
});

describe("the minimum box a card's guard compares against", () => {
  const DEVICE = WALL_WIDGET_REGISTRY.light;

  /** A typed device widget's frame is chrome-less, so its renderer's box is the whole cell. */
  function deviceBox(rows: number, rowUnit: number, titled: boolean): number {
    return rendererBoxHeightPx({
      cellHeightPx: cardHeightPx({ rows, rowUnit }),
      framed: false,
      titled,
    });
  }

  function deviceMinimumBox(rowUnit: number): number {
    return minimumRendererBoxHeightPx({ descriptor: DEVICE, rowUnit, framed: false });
  }

  function deviceComposes(h: number, rowUnit: number, titled: boolean): boolean {
    return composesMinimumSpan({
      placement: { w: DEVICE.min.w, h },
      descriptor: DEVICE,
      rendererHeightPx: deviceBox(h, rowUnit, titled),
      minimumRendererHeightPx: deviceMinimumBox(rowUnit),
    });
  }

  it("is the box a minimum-span, untitled card gets", () => {
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      expect(deviceMinimumBox(rowUnit)).toBe(deviceBox(DEVICE.min.h, rowUnit, false));
    }
  });

  it("still renders an untitled card at the type's minimum span", () => {
    // The confirmation the minimum spans are derived against: a two-row device
    // cell at the floors is the ported compact card's own budget, and the
    // untitled card passes the guard.
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const box = deviceBox(DEVICE.min.h, rowUnit, false);
      expect(box).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
      expect(deviceComposes(DEVICE.min.h, rowUnit, false)).toBe(true);
    }
  });

  it("explains a *titled* card at the type's minimum span instead of clipping it", () => {
    // A configured title is drawn above the renderer inside the same cell, so a
    // titled two-row device card's box is the compact budget minus the title block
    // — below it — and the frame presents the wall's explanation rather than
    // letting `overflow: hidden` take the card's value-control row.
    const box = deviceBox(DEVICE.min.h, ROW_UNIT_MIN, true);
    expect(box).toBe(WALL_COMPACT_CARD_HEIGHT_PX - WALL_TITLE_BLOCK_PX);
    expect(box).toBeLessThan(WALL_COMPACT_CARD_HEIGHT_PX);
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      expect(deviceComposes(DEVICE.min.h, rowUnit, true)).toBe(false);
    }
  });

  it("is title-aware: the same cell composes differently with and without a title", () => {
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const untitled = deviceComposes(DEVICE.min.h, rowUnit, false);
      const titled = deviceComposes(DEVICE.min.h, rowUnit, true);
      expect(untitled).toBe(true);
      expect(titled).toBe(false);
      expect(untitled).not.toBe(titled);
    }
  });

  it("renders a titled card one row above the type's minimum, at every row unit", () => {
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      expect(deviceComposes(DEVICE.min.h + WALL_TITLE_ROWS, rowUnit, true)).toBe(true);
      expect(deviceComposes(DEVICE.min.h + WALL_TITLE_ROWS - 1, rowUnit, true)).toBe(false);
    }
  });
});

describe("rendererBoxHeightPx", () => {
  const CELL = 400;

  it("gives the renderer the whole cell when the frame draws nothing", () => {
    expect(rendererBoxHeightPx({ cellHeightPx: CELL, framed: false, titled: false })).toBe(CELL);
  });

  it("subtracts the frame's inset when it draws a surface", () => {
    expect(rendererBoxHeightPx({ cellHeightPx: CELL, framed: true, titled: false })).toBe(
      CELL - WALL_FRAME_RESERVED_PX,
    );
  });

  it("subtracts the title block the frame renders above the renderer", () => {
    expect(rendererBoxHeightPx({ cellHeightPx: CELL, framed: false, titled: true })).toBe(
      CELL - WALL_TITLE_BLOCK_PX,
    );
    expect(WALL_TITLE_BLOCK_PX).toBeGreaterThan(0);
  });

  it("never returns a negative box", () => {
    expect(rendererBoxHeightPx({ cellHeightPx: 10, framed: true, titled: true })).toBe(0);
  });

  it("makes a titled card compose the compact form where the bare cell would not", () => {
    // The band a cell enters the full form in: tall enough to hold the full
    // composition, not tall enough to hold it *and* the title the frame draws
    // above the renderer. The title is a first-class `device` option, so a titled
    // card there must compose compactly rather than clip.
    const cellHeightPx = WALL_FULL_CARD_HEIGHT_PX + WALL_TITLE_BLOCK_PX - 1;
    const untitled = rendererBoxHeightPx({ cellHeightPx, framed: false, titled: false });
    const titled = rendererBoxHeightPx({ cellHeightPx, framed: false, titled: true });

    expect(resolveCardFormForHeight(untitled)).toBe("full");
    expect(resolveCardFormForHeight(titled)).toBe("compact");
    expect(resolveCardFormForHeight(titled)).not.toBe(resolveCardFormForHeight(untitled));
  });
});
