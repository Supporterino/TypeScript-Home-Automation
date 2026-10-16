import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Capability,
  type DeviceDescriptor,
  WALL_WIDGET_TYPES,
  type WallWidget,
  type WallWidgetType,
} from "@ts-ha/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type DataStoreFixtures, DataStoreProvider } from "../src/app/lib/data-store.js";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import {
  minimumRendererBoxHeightPx,
  rendererBoxHeightPx,
  WALL_TOO_SMALL_MESSAGE,
  wallBandChrome,
  wallChromeTextStyle,
  wallFrameChrome,
  widgetTitle,
} from "../src/app/wall/frame.js";
import { ROW_UNIT_MAX, ROW_UNIT_MIN, WALL_COMPACT_CARD_HEIGHT_PX } from "../src/app/wall/grid.js";
import { WALL_FRAME_INSET_PX, WALL_FRAME_RESERVED_PX } from "../src/app/wall/pages.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import { effectiveSpanDescriptor } from "../src/app/wall/slim.js";
import {
  cardHeightPx,
  composesMinimumSpan,
  resolveCardFormForHeight,
  resolveSpanTier,
  WALL_FULL_CARD_HEIGHT_PX,
  WALL_TITLE_BLOCK_PX,
  WALL_TITLE_ROWS,
} from "../src/app/wall/span.js";
import { WidgetFrame } from "../src/app/wall/WidgetFrame.js";

// Pure frame decisions — no DOM. The ambient/control grammar and the opt-in title
// rule are the whole frame's behaviour.

const APP_DIR = join(import.meta.dir, "..", "src/app");

/** Removes block and line comments so prose is not mistaken for markup. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(relative: string): Promise<string> {
  return stripComments(await readFile(join(APP_DIR, relative), "utf8"));
}

/**
 * A Lumen design token — a Tailwind class or a `var(--…)` outside the Hearth
 * namespace.
 */
const LUMEN_TOKEN =
  /(?<!hearth-)(?:text-(?:muted|danger|info|stale|ink)\b|font-display|font-semibold|font-bold|uppercase|tracking-wide|rounded-(?:tile|pill|input)|var\(--(?:text|bg|font|radius|space|e[0-9]|motion)\b)/;

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
    expect(chrome.padding).toBeNull();
  });

  it("renders a control widget as a Hearth surface tile", () => {
    const chrome = wallFrameChrome("control");
    expect(chrome.surface).toBe(true);
    expect(chrome.background).toBe("var(--hearth-surface)");
    expect(chrome.borderColor).toBe("var(--hearth-hairline)");
    expect(chrome.radius).toBe("var(--hearth-card-radius)");
    expect(chrome.padding).toBe("var(--hearth-card-padding)");
  });

  it("draws the *ported card surface*, not Hearth's own radius scale", () => {
    // A control widget's tile is a device card's surface: the ported card radius and
    // padding, so a panel cannot show two different cards.
    const chrome = wallFrameChrome("control");

    expect(chrome.radius).toBe("var(--hearth-card-radius)");
    expect(chrome.radius).not.toBe("var(--hearth-radius-md)");
    expect(chrome.padding).toBe("var(--hearth-card-padding)");
    expect(chrome.padding).not.toBe("var(--hearth-space-4)");
  });

  it("derives the surface from each type's descriptor grammar", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const grammar = WALL_WIDGET_REGISTRY[type].grammar;
      expect(wallFrameChrome(grammar).surface).toBe(grammar === "control");
    }
  });
});

describe("wallBandChrome", () => {
  it("draws a zone band from Hearth's own band field and the ported card surface", () => {
    const chrome = wallBandChrome();
    expect(chrome.background).toBe("var(--hearth-band)");
    expect(chrome.radius).toBe("var(--hearth-card-radius)");
    // A band and the card standing on it are the same surface: the ported radius and padding.
    expect(chrome.padding).toBe("var(--hearth-card-padding)");
  });

  it("keeps the band distinct from a member's surface", () => {
    // A band groups *behind* its members: a member keeps its own tile surface,
    // so the band never nests one surface inside another.
    expect(wallBandChrome().background).not.toBe(wallFrameChrome("control").background);
  });

  it("shares the member card's radius and padding, so one panel shows one surface", () => {
    const band = wallBandChrome();
    const control = wallFrameChrome("control");

    expect(band.radius).toBe(control.radius);
    expect(band.padding).toBe(control.padding);
  });
});

describe("the wall chrome's ported text treatment", () => {
  it("reads the ported family, weight and tracking from the card table", () => {
    const style = wallChromeTextStyle();

    expect(style.fontFamily).toBe("var(--hearth-font-display)");
    expect(style.fontWeight).toBe(WALL_CARD_METRICS.primaryWeight);
    expect(style.letterSpacing).toBe(`${WALL_CARD_METRICS.primaryTracking}px`);
  });

  it("carries no size and no colour, so a caller keeps the wall's own tier", () => {
    // The chrome's *sizes* are the wall's and its role is its own — the treatment is the
    // ported table's family/weight/tracking alone.
    expect(Object.keys(wallChromeTextStyle()).sort()).toEqual([
      "fontFamily",
      "fontWeight",
      "letterSpacing",
    ]);
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
  it("derives the tier from the widget's own registry spans", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const descriptor = WALL_WIDGET_REGISTRY[type];
      // The frame resolves with the same spans the editor's size rule enforces, so a
      // renderer's composition and the legal spans cannot drift.
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

    // The frame spends part of the cell on its inset and on the title above the renderer,
    // so the form is resolved from what is left.
    expect(widgetFrame).toContain("rendererBoxHeightPx(");
    expect(widgetFrame).toContain("cellHeightPx: cardHeightPx({ rows: widget.h, rowUnit })");
    expect(widgetFrame).toContain("framed: drawsSurface");
    expect(widgetFrame).toContain("titled: title !== null");
    expect(widgetFrame).toContain("resolveCardFormForHeight(");
  });

  it("hands the surface decision its placement, so a one-row scene is chrome-less", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");

    // A scene's frame is placement-aware: the one-row cell draws no surface, so the
    // scene's own composition is what fills it.
    expect(widgetFrame).toContain("wallFrameDrawsSurface(widget.type, descriptor.grammar, widget)");
  });

  it("explains a placement below the type's minimum on either axis, or below the box its minimum needs", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");

    // The wall's convention for something that cannot be shown: a contained explanation
    // in its own vocabulary, never a clipped card.
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

    // A renderer with its own multi-form composition resolves against the box, not a global form.
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
    // The confirmation the minimum spans are derived against: a two-row device cell at
    // the floors is the ported compact card's own budget.
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const box = deviceBox(DEVICE.min.h, rowUnit, false);
      expect(box).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
      expect(deviceComposes(DEVICE.min.h, rowUnit, false)).toBe(true);
    }
  });

  it("explains a *titled* card at the type's minimum span instead of clipping it", () => {
    // A configured title is drawn above the renderer inside the same cell, so a titled
    // two-row card's box is below the compact budget — the frame explains it.
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

  it("reserves the ported card surface's own padding, not Hearth's spacing scale", () => {
    // The frame's inset *is* the ported card padding, so the box is the cell minus that inset.
    expect(WALL_FRAME_INSET_PX).toBe(WALL_CARD_METRICS.padding);
    expect(WALL_FRAME_RESERVED_PX).toBe(2 * WALL_CARD_METRICS.padding);
    expect(rendererBoxHeightPx({ cellHeightPx: CELL, framed: true, titled: false })).toBe(
      CELL - 2 * WALL_CARD_METRICS.padding,
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
    // The band a cell enters the full form in: tall enough to hold the full composition,
    // not tall enough to hold it *and* the title the frame draws above the renderer.
    const cellHeightPx = WALL_FULL_CARD_HEIGHT_PX + WALL_TITLE_BLOCK_PX - 1;
    const untitled = rendererBoxHeightPx({ cellHeightPx, framed: false, titled: false });
    const titled = rendererBoxHeightPx({ cellHeightPx, framed: false, titled: true });

    expect(resolveCardFormForHeight(untitled)).toBe("full");
    expect(resolveCardFormForHeight(titled)).toBe("compact");
    expect(resolveCardFormForHeight(titled)).not.toBe(resolveCardFormForHeight(untitled));
  });
});

describe("the frame's surface and the wall's own chrome", () => {
  it("pads the surface with the chrome's own ported inset, never a literal", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");

    // The surface's radius and padding are the pure chrome's, mapped to real CSS
    // properties — so a control widget's tile is a device card's surface.
    expect(widgetFrame).toContain("padding: chrome.padding ?? undefined");
    expect(widgetFrame).toContain("borderRadius: chrome.radius ?? undefined");
    expect(widgetFrame).not.toContain("--hearth-space-4");
    expect(widgetFrame).not.toContain("--hearth-radius-md");
  });

  it("draws the opt-in title with the ported treatment and the wall's own title tier", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");

    // The title is the wall's chrome, not widget content: the ported family/weight/tracking,
    // the wall's title tier, and its own quiet colour.
    expect(widgetFrame).toContain("...wallChromeTextStyle()");
    expect(widgetFrame).toContain("fontSize: WALL_TITLE_FONT_SIZE");
    expect(widgetFrame).not.toContain("uppercase");
    expect(widgetFrame).not.toContain("font-semibold");
  });

  it("carries no Lumen token in the chrome", async () => {
    for (const relative of ["wall/frame.ts", "wall/WidgetFrame.tsx", "wall/WallGrid.tsx"]) {
      const text = await source(relative);

      expect(text, relative).not.toMatch(LUMEN_TOKEN);
      expect(text, relative).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("reads the chrome's treatment from the ported table, not from a literal pair", async () => {
    const frameModule = await source("wall/frame.ts");

    // A chrome caption cannot drift from the card surface beside it: the treatment is read
    // from `WALL_CARD_METRICS` rather than written as a second table.
    expect(frameModule).toContain("fontWeight: WALL_CARD_METRICS.primaryWeight");
    expect(frameModule).toMatch(/letterSpacing: `\$\{WALL_CARD_METRICS\.primaryTracking\}px`/);
  });
});

/** The capabilities of a lock reporting a readable state and nothing writable. */
const READ_ONLY_LOCK_CAPS: Capability[] = [
  {
    kind: "lock",
    property: "state",
    access: { readable: true, writable: false },
    valueType: "enum",
    permittedValues: ["LOCK", "UNLOCK"],
  },
];

/** The capabilities of a lock whose state both reads and writes. */
const WRITABLE_LOCK_CAPS: Capability[] = [
  {
    kind: "lock",
    property: "state",
    access: { readable: true, writable: true },
    valueType: "enum",
    permittedValues: ["LOCK", "UNLOCK"],
  },
];

function lockDevice(qualifiedId: string, capabilities: Capability[]): DeviceDescriptor {
  return {
    source: "test",
    id: qualifiedId,
    qualifiedId,
    displayName: "Front door",
    state: { state: "LOCK" },
    capabilities,
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
  };
}

function lockFixtures(devices: DeviceDescriptor[]): DataStoreFixtures {
  return { devices, state: {}, rooms: [], automations: [], transport: "live" };
}

/** Renders one widget through the frame, inside the store the wall renders it in. */
function renderFrame(widget: WallWidget, devices: DeviceDescriptor[]): string {
  return renderToStaticMarkup(
    createElement(
      DataStoreProvider,
      { fixtures: lockFixtures(devices) },
      createElement(WidgetFrame, { widget, rowUnit: ROW_UNIT_MIN }),
    ),
  );
}

describe("the frame's device-aware too-small guard", () => {
  /** A one-row typed lock widget bound to `test:lock`. */
  const ONE_ROW_LOCK: WallWidget = {
    id: "lock-1",
    type: "lock",
    config: { qualifiedId: "test:lock" },
    x: 0,
    y: 0,
    w: WALL_WIDGET_REGISTRY.lock.min.w,
    h: 1,
  };

  it("compares the guard against the effective descriptor's minimum", () => {
    const light = WALL_WIDGET_REGISTRY.light;
    const controlBearing = minimumRendererBoxHeightPx({
      descriptor: effectiveSpanDescriptor(light, false),
      rowUnit: ROW_UNIT_MIN,
      framed: false,
    });
    const readOnly = minimumRendererBoxHeightPx({
      descriptor: effectiveSpanDescriptor(light, true),
      rowUnit: ROW_UNIT_MIN,
      framed: false,
    });

    expect(controlBearing).toBeGreaterThan(readOnly);
    // A one-row cell at the floors is exactly the read-only minimum box.
    expect(readOnly).toBe(ROW_UNIT_MIN);
  });

  it("renders a one-row read-only device and explains a one-row control-bearing one", () => {
    const readOnlyHtml = renderFrame(ONE_ROW_LOCK, [lockDevice("test:lock", READ_ONLY_LOCK_CAPS)]);
    // A control-less device composes its card in a one-row cell rather than the explanation.
    expect(readOnlyHtml).not.toContain(WALL_TOO_SMALL_MESSAGE);

    const controlHtml = renderFrame(ONE_ROW_LOCK, [lockDevice("test:lock", WRITABLE_LOCK_CAPS)]);
    // A control-bearing device keeps the two-row minimum, so the wall explains the cell.
    expect(controlHtml).toContain(WALL_TOO_SMALL_MESSAGE);
  });

  it("degrades to the type's static minimum when the bound device is absent", () => {
    const html = renderFrame(ONE_ROW_LOCK, []);
    expect(html).toContain(WALL_TOO_SMALL_MESSAGE);
  });

  it("resolves its bound device and hands the guard the effective descriptor", async () => {
    const widgetFrame = await source("wall/WidgetFrame.tsx");

    expect(widgetFrame).toContain("useDataStore()");
    expect(widgetFrame).toContain("boundDeviceReadOnly(descriptor, devicesByQualifiedId.get(");
    expect(widgetFrame).toContain(
      "const effective = effectiveSpanDescriptor(descriptor, readOnly)",
    );
    expect(widgetFrame).toContain("descriptor: effective,");
  });
});
