import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WallWidget } from "@ts-ha/shared";
import { addWidget, updateWidgetPlacement } from "../src/app/wall/editor/model.js";
import {
  minimumRendererBoxHeightPx,
  rendererBoxHeightPx,
  wallFrameDrawsSurface,
  widgetTitle,
} from "../src/app/wall/frame.js";
import { wallGridMetrics } from "../src/app/wall/grid.js";
import {
  NO_BENCH_OVERRIDES,
  panelFitSummary,
  panelRowUnit,
  reachableRendererHeights,
  resolveBenchControls,
  widgetValues,
} from "../src/app/wall/harness/computed.js";
import {
  activeTarget,
  clearOrientationOverride,
  DEFAULT_DRAFT,
  editActiveList,
  shownWidgets,
} from "../src/app/wall/harness/draft.js";
import { HARNESS_PANEL_SIZES, type HarnessPanel } from "../src/app/wall/harness/messages.js";
import { getWidgetDescriptor } from "../src/app/wall/registry.js";
import { cardHeightPx, resolveCardFormForHeight, resolveSpanTier } from "../src/app/wall/span.js";
import { deviceGridIds, resolveDeviceGridPage } from "../src/app/wall/widgets/device-grid-model.js";

/**
 * The harness panel and bench: everything the panel shows or sets is asserted against
 * the wall's own functions.
 */
const HARNESS_DIR = join(import.meta.dir, "..", "src/app/wall/harness");
const PANELS: readonly HarnessPanel[] = ["landscape", "portrait"];

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(file: string): Promise<string> {
  return stripComments(await readFile(join(HARNESS_DIR, file), "utf8"));
}

/** A widget of the default draft's panel layout, by id. */
function draftWidget(panel: HarnessPanel, id: string): WallWidget {
  const widget = shownWidgets(DEFAULT_DRAFT, panel).find((candidate) => candidate.id === id);
  if (!widget) throw new Error(`no draft widget "${id}" in the ${panel} layout`);
  return widget;
}

/** The wall's own chain for one widget, computed here to compare against `widgetValues`. */
function expectedValues(widget: WallWidget, rowUnit: number) {
  const descriptor = getWidgetDescriptor(widget.type);
  const framed = wallFrameDrawsSurface(widget.type, descriptor.grammar);
  const titled = widgetTitle(widget) !== null;
  const cellHeightPx = cardHeightPx({ rows: widget.h, rowUnit });
  const rendererHeightPx = rendererBoxHeightPx({ cellHeightPx, framed, titled });

  return {
    descriptor,
    framed,
    titled,
    cellHeightPx,
    rendererHeightPx,
    tier: resolveSpanTier(widget, descriptor),
    cardForm: resolveCardFormForHeight(rendererHeightPx),
    minimum: minimumRendererBoxHeightPx({ descriptor, rowUnit, framed }),
  };
}

describe("the panel's Stage-computed values", () => {
  it("takes the row unit from the wall's own metrics for the panel's own size", () => {
    for (const panel of PANELS) {
      const widgets = shownWidgets(DEFAULT_DRAFT, panel);
      const height = HARNESS_PANEL_SIZES[panel].height;

      expect(panelRowUnit(widgets, height)).toBe(wallGridMetrics(height, widgets).rowUnit);
    }
  });

  it("equals the wall's own derivation for a titled card, a chrome-less device, and a paged grid", () => {
    for (const panel of PANELS) {
      const rowUnit = panelRowUnit(
        shownWidgets(DEFAULT_DRAFT, panel),
        HARNESS_PANEL_SIZES[panel].height,
      );
      const clock = draftWidget(panel, "clock-hero");
      const titled: WallWidget = { ...clock, config: { title: "Home" } };
      const device = draftWidget(panel, "device-light");
      const grid = draftWidget(panel, "device-grid");

      for (const widget of [titled, device, grid]) {
        const expected = expectedValues(widget, rowUnit);
        const actual = widgetValues(widget, rowUnit);

        expect(actual.cellHeightPx, `${panel} ${widget.id}`).toBe(expected.cellHeightPx);
        expect(actual.rendererHeightPx, `${panel} ${widget.id}`).toBe(expected.rendererHeightPx);
        expect(actual.tier, `${panel} ${widget.id}`).toBe(expected.tier);
        expect(actual.cardForm, `${panel} ${widget.id}`).toBe(expected.cardForm);
        expect(actual.framed, `${panel} ${widget.id}`).toBe(expected.framed);
        expect(actual.titled, `${panel} ${widget.id}`).toBe(expected.titled);
        expect(actual.minimumRendererHeightPx, `${panel} ${widget.id}`).toBe(expected.minimum);
        expect(actual.tooSmall, `${panel} ${widget.id}`).toBe(false);
      }

      // The type-specific checks the three widgets stand for: the `device` widget's frame is
      // chrome-less, the titled clock spends rows on its title, and the grid pages.
      expect(widgetValues(device, rowUnit).framed).toBe(false);
      expect(widgetValues(titled, rowUnit).rendererHeightPx).toBeLessThan(
        widgetValues(clock, rowUnit).rendererHeightPx,
      );

      const page = resolveDeviceGridPage({
        ids: deviceGridIds(grid.config),
        span: grid,
        rowUnit,
        page: 0,
      });
      expect(page.pageCount, `${panel} grid pages`).toBeGreaterThan(1);
    }
  });

  it("reports the editor's own fit verdict for the list this panel renders", () => {
    // The default draft fits both panels…
    for (const panel of PANELS) {
      expect(panelFitSummary(shownWidgets(DEFAULT_DRAFT, panel), panel)).toBeNull();
    }

    // …and a 20-row composition fits the portrait panel but not the landscape
    // one, so the verdict is the panel's own rather than a constant.
    const tall = {
      widgets: Array.from({ length: 5 }, (_, index) => ({
        id: `grid-${index}`,
        type: "devices" as const,
        config: { qualifiedIds: ["fixture:light-kitchen"] },
        x: 0,
        y: index * 4,
        w: 12,
        h: 4,
      })),
    };

    expect(panelFitSummary(tall.widgets, "landscape")).not.toBeNull();
    expect(panelFitSummary(tall.widgets, "portrait")).toBeNull();
  });
});

describe("the panel's draft mutations", () => {
  it("clamps a span below the type's minimum through the editor's own rule", () => {
    const clamped = editActiveList(DEFAULT_DRAFT, "landscape", (config) =>
      updateWidgetPlacement(config, "device-light", { x: 0, y: 0, w: 1, h: 1 }),
    );
    const placed = shownWidgets(clamped, "landscape").find(
      (widget) => widget.id === "device-light",
    );
    const minimum = getWidgetDescriptor("light").min;

    expect(placed?.w).toBe(minimum.w);
    expect(placed?.h).toBe(minimum.h);
  });

  it("edits the portrait override — not the base layout — while portrait is shown", () => {
    expect(activeTarget(DEFAULT_DRAFT, "portrait")).toBe("override");
    expect(activeTarget(DEFAULT_DRAFT, "landscape")).toBe("base");

    const edited = editActiveList(DEFAULT_DRAFT, "portrait", (config) =>
      updateWidgetPlacement(config, "device-light", { x: 0, y: 0, w: 1, h: 1 }),
    );
    const override = shownWidgets(edited, "portrait").find(
      (widget) => widget.id === "device-light",
    );
    const base = shownWidgets(edited, "landscape").find((widget) => widget.id === "device-light");

    expect(override?.w).toBe(getWidgetDescriptor("light").min.w);
    expect(base?.w).toBe(draftWidget("landscape", "device-light").w);
  });

  it("adds a widget of any registered type at the editor's own free position", () => {
    const before = shownWidgets(DEFAULT_DRAFT, "landscape");
    const added = editActiveList(DEFAULT_DRAFT, "landscape", (config) =>
      addWidget(config, "status"),
    );
    const next = shownWidgets(added, "landscape");
    const widget = next.find(
      (candidate) => !before.some((existing) => existing.id === candidate.id),
    );

    expect(next.length).toBe(before.length + 1);
    expect(widget?.type).toBe("status");
    expect(widget?.w).toBe(getWidgetDescriptor("status").defaults.w);
  });

  it("drops the panel's override so the base layout renders again", () => {
    const cleared = clearOrientationOverride(DEFAULT_DRAFT, "portrait");

    expect(activeTarget(cleared, "portrait")).toBe("base");
    expect(shownWidgets(cleared, "portrait")).toEqual(shownWidgets(DEFAULT_DRAFT, "landscape"));
  });
});

describe("the bench", () => {
  it("renders the registry's renderer without the widget frame in the path", async () => {
    const bench = await source("Bench.tsx");

    expect(bench).not.toContain("WidgetFrame");
    expect(bench).toContain("getWidgetDescriptor(widget.type)");
    expect(bench).toContain("<Renderer");
    for (const prop of [
      "contained={controls.contained}",
      "tier={controls.tier}",
      "cardForm={controls.cardForm}",
      "rendererHeightPx={controls.rendererHeightPx}",
      "rowUnit={controls.rowUnit}",
    ]) {
      expect(bench, prop).toContain(prop);
    }
  });

  it("gives the bench surface a Hearth scope of its own", async () => {
    const bench = await source("Bench.tsx");
    const stage = await source("stage.tsx");

    // Hearth declares every `--hearth-*` token under `[data-wall-chunk]` and nowhere else,
    // and in bench mode the wall grid that carries that scope is not rendered.
    expect(stage).toContain("<Bench widget={update.bench.widget} controls={update.bench} />");
    expect(bench).toContain('data-wall-chunk=""');
    // A scope, not a marker: the wall grid's `data-wall-chunk` value is the wall
    // chunk's own signal for the asset test, and the bench must not become it.
    expect(bench).not.toContain("WALL_CHUNK_MARKER");
  });

  it("starts from the Stage-computed values and takes the panel's overrides", () => {
    const widget = draftWidget("landscape", "device-light");
    const rowUnit = panelRowUnit(shownWidgets(DEFAULT_DRAFT, "landscape"), 1080);
    const values = widgetValues(widget, rowUnit);

    const untouched = resolveBenchControls(widget, values, rowUnit, NO_BENCH_OVERRIDES);
    expect(untouched.contained).toBe(values.framed);
    expect(untouched.tier).toBe(values.tier);
    expect(untouched.cardForm).toBe(values.cardForm);
    expect(untouched.rendererHeightPx).toBe(values.rendererHeightPx);
    expect(untouched.rowUnit).toBe(rowUnit);

    const overridden = resolveBenchControls(widget, values, rowUnit, {
      ...NO_BENCH_OVERRIDES,
      rendererHeightPx: 200,
      cardForm: "compact",
    });
    expect(overridden.rendererHeightPx).toBe(200);
    expect(overridden.cardForm).toBe("compact");
    expect(overridden.tier).toBe(values.tier);
  });

  it("marks a renderer height no legal span of the type produces as unreachable", () => {
    for (const panel of PANELS) {
      const rowUnit = panelRowUnit(
        shownWidgets(DEFAULT_DRAFT, panel),
        HARNESS_PANEL_SIZES[panel].height,
      );
      const widget = draftWidget(panel, "device-light");
      const values = widgetValues(widget, rowUnit);
      const reachable = reachableRendererHeights(widget, rowUnit);

      // The Stage-computed height is by definition one a legal placement produces.
      expect(reachable, panel).toContain(values.rendererHeightPx);

      // A one-row cell is below the type's minimum, so the editor clamps it and
      // its height is not in the set — the override that is visibly an artifact.
      const belowMinimum = rendererBoxHeightPx({
        cellHeightPx: cardHeightPx({ rows: 1, rowUnit }),
        framed: values.framed,
        titled: values.titled,
      });
      expect(reachable, panel).not.toContain(belowMinimum);
      expect(belowMinimum).toBeLessThan(values.rendererHeightPx);
    }
  });
});

describe("the harness's arithmetic", () => {
  it("computes every span and box value through the wall's own functions", async () => {
    const computed = await source("computed.ts");

    for (const call of [
      "resolveSpanTier(",
      "cardHeightPx(",
      "rendererBoxHeightPx(",
      "resolveCardFormForHeight(",
      "minimumRendererBoxHeightPx(",
      "wallFrameDrawsSurface(",
      "wallGridMetrics(",
      "widgetTitle(",
      "getWidgetDescriptor(",
      "updateWidgetPlacement(",
    ]) {
      expect(computed, call).toContain(call);
    }
  });

  it("re-implements no span, row-unit, or panel arithmetic anywhere in the harness", async () => {
    const forbidden: readonly RegExp[] = [
      /\browUnit\s*\*/,
      /\*\s*rowUnit\b/,
      /\b(widget|selected|placed|override)\.[wh]\s*\*/,
      /\*\s*\w+\.h\b/,
      /\b1080\b/,
      /\b1920\b/,
      /WALL_FULL_CARD_HEIGHT_PX/,
      /WALL_COMPACT_CARD_HEIGHT_PX/,
      /WALL_TITLE_BLOCK_PX/,
      /WALL_TITLE_ROWS/,
      /\bWALL_TYPE_RAMP\b/,
    ];

    for (const file of ["computed.ts", "Bench.tsx", "HarnessPanel.tsx", "draft.ts", "stage.tsx"]) {
      const content = await source(file);
      expect(
        forbidden.filter((token) => token.test(content)),
        file,
      ).toEqual([]);
    }
  });

  it("edits the draft through the editor's own mutations", async () => {
    const panel = await source("HarnessPanel.tsx");

    expect(panel).toContain('from "../editor/model.js"');
    for (const mutation of [
      "addWidget(",
      "removeWidget(",
      "updateWidgetPlacement(",
      "updateWidgetZone(",
      "updateWidgetConfig(",
      "validateProfileDraft(",
    ]) {
      expect(panel, mutation).toContain(mutation);
    }
  });
});

describe("the scheme toggle", () => {
  it("sets the stage document's Hearth scope instead of a class", async () => {
    const stage = await source("stage.tsx");
    const panel = await source("HarnessPanel.tsx");

    // Hearth's light palette is scoped `[data-theme="light"] [data-wall-chunk]`, so the
    // attribute goes on the stage document's root — the panel's document is a different one.
    expect(stage).toContain("document.documentElement.dataset.theme = update.theme");
    // The panel only sends its choice; it applies no scheme mechanism of its own.
    expect(panel).not.toContain("dataset");
    expect(panel).not.toContain("classList");
    expect(panel).toContain("theme,");
  });
});
