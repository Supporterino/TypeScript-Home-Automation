import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { minimumRendererBoxHeightPx, rendererBoxHeightPx } from "../src/app/wall/frame.js";
import { ROW_UNIT_MAX, ROW_UNIT_MIN } from "../src/app/wall/grid.js";
import { WALL_MIN_TOUCH_TARGET, WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import { wallTileMetrics } from "../src/app/wall/scale.js";
import {
  cardHeightPx,
  composesMinimumSpan,
  WALL_FULL_CARD_HEIGHT_PX,
} from "../src/app/wall/span.js";
import { WALL_TYPE_RAMP } from "../src/app/wall/type-ramp.js";
import {
  SCENE_LARGE_GLYPH_PX,
  SCENE_MIN_SPAN,
  SCENE_ROW_HEIGHT_PX,
  SCENE_STACKED_HEIGHT_PX,
  sceneTileLayout,
} from "../src/app/wall/widgets/scene-model.js";

/**
 * Structural assertions for the wall scene button (design.md D11, D14;
 * specs/wall-display "Scene Buttons Trigger Automations"). There is no DOM
 * harness here, so the render decisions — the full-bleed pressable tile, the
 * leading scene glyph + label anatomy, the explicit pressed/busy states, and the
 * unchanged trigger and error-surfacing path — are asserted against the
 * widget's source, the same style as `wall-card-archetypes.test.ts` /
 * `cover-transport.test.ts`. The pure trigger-request decision stays covered by
 * `wall-scene.test.ts`.
 *
 * Re-pointed at the shared Hearth card vocabulary (design.md D11, D14); each
 * assertion's intent is unchanged.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const SCENE = join(APP_DIR, "wall/widgets/SceneWidget.tsx");
const WIDGETS = join(APP_DIR, "wall/widgets");

/** The scene button's own inset, in CSS pixels per side — Hearth's `--hearth-space-3`. */
const SCENE_INSET_PX = 12;

/** The scene label's single line, in CSS pixels — the label tier at the body leading. */
const SCENE_LABEL_LINE_PX = Math.ceil(WALL_TYPE_RAMP.label * 1.5);

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function readSource(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

async function sceneSource(): Promise<string> {
  return readSource(SCENE);
}

describe("scene button is a full-bleed pressable tile", () => {
  it("fills its widget area with a pressable element", async () => {
    const source = await sceneSource();
    expect(source).toContain("<button");
    expect(source).toContain('height: "100%"');
    expect(source).toContain('width: "100%"');
    expect(source).toContain("onClick={() => void handleTrigger()}");
  });

  it("presents a leading scene glyph beside the label at its minimum span", async () => {
    const source = await sceneSource();
    expect(source).toContain('from "lucide-react"');
    expect(source).toContain("<Play");
    expect(source).toContain("SCENE_GLYPH_SIZE");
    expect(source).toContain("{label}");
    // The glyph leads the label on the shared card vocabulary row.
    expect(source).toContain("WallCardLabel");
    expect(source).toContain('"column" : "row"');
  });

  it("meets the wall's minimum touch target", () => {
    expect(wallTileMetrics("wall").control).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
  });

  it("is keyboard-operable and never hover-only", async () => {
    const source = await sceneSource();
    expect(source).toContain("onPointerDown");
    expect(source).toContain("onKeyDown");
    expect(source).not.toMatch(/onMouseEnter|onMouseOver|onPointerEnter|onPointerOver/);
  });
});

describe("scene button state presentation", () => {
  it("exposes an explicit, token-driven pressed/active state", async () => {
    const source = await sceneSource();
    expect(source).toContain("data-pressed");
    expect(source).toContain("const [pressed, setPressed] = useState(false)");
    expect(source).toContain('"var(--hearth-surface-raised)"');
    expect(source).toContain('"var(--hearth-e2)"');
  });

  it("exposes a busy state while triggering", async () => {
    const source = await sceneSource();
    expect(source).toContain("data-busy");
    expect(source).toContain("aria-busy={busy}");
    expect(source).toContain("<Spinner");
  });

  it("reserves the geometry so states change paint, not layout", async () => {
    const source = await sceneSource();
    // The busy indicator overlays the glyph rather than displacing it.
    expect(source).toContain('className="absolute"');
    // States toggle opacity/background/shadow only — never width or height.
    expect(source).toContain("opacity: busy ? 0 : 1");
    expect(source).toContain(
      'background: pressed ? "var(--hearth-surface-raised)" : "transparent"',
    );
  });

  it("uses Hearth tokens rather than literal colors", async () => {
    const source = await sceneSource();
    expect(source).toContain("var(--hearth-");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("scene button keeps its trigger and error path", () => {
  it("still builds its request through sceneTriggerRequest", async () => {
    const source = await sceneSource();
    expect(source).toContain("sceneTriggerRequest(automationName, automations)");
    expect(source).toContain("triggerAutomation(request.name, manualTriggerContext(request.type))");
  });

  it("surfaces a failure on the widget", async () => {
    const source = await sceneSource();
    expect(source).toContain("var(--hearth-danger)");
    expect(source).toContain('"Could not trigger this automation"');
  });
});

describe("scene tile composes for its space (wall-zones-and-fit D3, D4, 4.2)", () => {
  it("owns both its compositions' budgets, derived from the parts they draw", () => {
    // The scene's budgets are the scene's *own* — the ~72 px glyph, the label's
    // one line, and the button's inset — not the wall light card's full form
    // (346 px), which the scene needs nowhere near. One budget per composition,
    // each measured against what it actually needs.
    expect(SCENE_ROW_HEIGHT_PX).toBe(
      2 * SCENE_INSET_PX + Math.max(wallTileMetrics("wall").control, SCENE_LABEL_LINE_PX),
    );
    expect(SCENE_STACKED_HEIGHT_PX).toBe(
      2 * SCENE_INSET_PX + SCENE_LARGE_GLYPH_PX + 8 + SCENE_LABEL_LINE_PX,
    );
    // The stacked composition is the taller one, and both hold the wall's touch
    // target for the glyph tile they draw.
    expect(SCENE_STACKED_HEIGHT_PX).toBeGreaterThan(SCENE_ROW_HEIGHT_PX);
    expect(SCENE_ROW_HEIGHT_PX).toBeGreaterThan(wallTileMetrics("wall").control);
    expect(SCENE_LARGE_GLYPH_PX).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
    // Far below the ported card's full stack, which the scene is never measured
    // against: that budget is what kept this tile on the row at every legal span.
    expect(SCENE_STACKED_HEIGHT_PX).toBeLessThan(WALL_FULL_CARD_HEIGHT_PX);
  });

  it("resolves each composition at its own budget's threshold", () => {
    // A card larger than the type's minimum span, so the box alone decides.
    const larger = { w: SCENE_MIN_SPAN.w + 2, h: SCENE_MIN_SPAN.h + 2 };

    expect(sceneTileLayout({ rendererHeightPx: SCENE_STACKED_HEIGHT_PX, placement: larger })).toBe(
      "column",
    );
    expect(
      sceneTileLayout({ rendererHeightPx: SCENE_STACKED_HEIGHT_PX - 1, placement: larger }),
    ).toBe("row");
    expect(sceneTileLayout({ rendererHeightPx: SCENE_ROW_HEIGHT_PX, placement: larger })).toBe(
      "row",
    );
    // Below the row's own budget the tile still resolves the row — the frame is
    // what guarantees such a box never reaches it (the test below).
    expect(sceneTileLayout({ rendererHeightPx: SCENE_ROW_HEIGHT_PX - 1, placement: larger })).toBe(
      "row",
    );
  });

  it("draws the row in every box the frame lets through", () => {
    // The frame only renders a card whose box holds the box a minimum-span card
    // gets (`frame.ts`'s `minimumRendererBoxHeightPx`), and that floor — the scene
    // is a `control` widget, so its cell minus the frame's inset — already holds
    // the row's own budget. The tile therefore needs no sub-budget case: whatever
    // the frame passes composes without clipping.
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const floor = minimumRendererBoxHeightPx({
        descriptor: WALL_WIDGET_REGISTRY.scene,
        rowUnit,
        framed: true,
      });
      expect(floor, `the frame's floor at ${rowUnit}px rows holds the row`).toBeGreaterThanOrEqual(
        SCENE_ROW_HEIGHT_PX,
      );
      expect(sceneTileLayout({ rendererHeightPx: floor, placement: SCENE_MIN_SPAN })).toBe("row");
    }
  });

  it("mirrors the registry's own minimum span for the scene type", () => {
    expect(SCENE_MIN_SPAN).toEqual(WALL_WIDGET_REGISTRY.scene.min);
  });

  it("keeps the type's minimum span off the stacked composition", () => {
    // The scene's own minimum span is the second gate: even where the box affords
    // the stacked budget, the minimum-span card composes the row, so a box-only
    // rule could not draw the type's *minimum* composition identically to every
    // larger span — which the "a card at a larger span MUST NOT repeat the
    // composition it renders at a smaller span" requirement forbids.
    const largeBox = rendererBoxHeightPx({
      cellHeightPx: cardHeightPx({ rows: SCENE_MIN_SPAN.h + 2, rowUnit: ROW_UNIT_MAX }),
      framed: true,
      titled: false,
    });
    expect(largeBox).toBeGreaterThanOrEqual(SCENE_STACKED_HEIGHT_PX);

    expect(
      sceneTileLayout({ rendererHeightPx: largeBox, placement: SCENE_MIN_SPAN }),
      "the minimum span keeps the row even where the box affords the stack",
    ).toBe("row");
    for (const placement of [
      { w: SCENE_MIN_SPAN.w + 1, h: SCENE_MIN_SPAN.h },
      { w: SCENE_MIN_SPAN.w, h: SCENE_MIN_SPAN.h + 1 },
    ]) {
      expect(
        sceneTileLayout({ rendererHeightPx: largeBox, placement }),
        `${placement.w}×${placement.h} takes the stack`,
      ).toBe("column");
    }
  });

  it("keeps the row where the box cannot hold the taller composition", () => {
    // A two-row cell at the floors gives the renderer 96 px — the row, not the
    // stacked composition — however wide it is. A wide-but-short cell is
    // `regular` by area while still only two rows tall, and centring the large
    // glyph there would clip it.
    for (const columns of [2, 4, 6]) {
      const box = rendererBoxHeightPx({
        cellHeightPx: cardHeightPx({ rows: 2, rowUnit: ROW_UNIT_MIN }),
        framed: true,
        titled: false,
      });
      const placement = { w: columns, h: 2 };
      expect(sceneTileLayout({ rendererHeightPx: box, placement }), `${columns}×2`).toBe("row");
      expect(SCENE_ROW_HEIGHT_PX).toBeLessThanOrEqual(box);
      expect(SCENE_STACKED_HEIGHT_PX).toBeGreaterThan(box);
    }
  });

  it("composes differently at a larger span than at its minimum", () => {
    // specs/wall-display "Span-Aware Card Presentation": a card at a larger span
    // MUST NOT repeat the composition it renders at a smaller span. The type's
    // minimum keeps the row at every row unit; a larger span composes the stack
    // wherever its box affords it — the 3–5 row band and a genuinely large card at
    // both bounds, and a wider two-row card at the taller one.
    const descriptor = WALL_WIDGET_REGISTRY.scene;
    expect(descriptor.min.h).toBe(2);

    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const boxFor = (rows: number): number =>
        rendererBoxHeightPx({
          cellHeightPx: cardHeightPx({ rows, rowUnit }),
          framed: true,
          titled: false,
        });
      const affordsStack = boxFor(2) >= SCENE_STACKED_HEIGHT_PX;

      for (const columns of [2, 4, 6]) {
        expect(
          sceneTileLayout({ rendererHeightPx: boxFor(2), placement: { w: columns, h: 2 } }),
          `${columns}×2 at ${rowUnit}px`,
        ).toBe(columns === 2 ? "row" : affordsStack ? "column" : "row");
        for (const rows of [3, 4, 5]) {
          expect(
            sceneTileLayout({ rendererHeightPx: boxFor(rows), placement: { w: columns, h: rows } }),
            `${columns}×${rows} at ${rowUnit}px`,
          ).toBe("column");
        }
        // Beyond the type's own maximum, so the rule is not an artefact of the
        // legal span range.
        expect(
          sceneTileLayout({ rendererHeightPx: boxFor(8), placement: { w: columns, h: 8 } }),
          `${columns}×8 at ${rowUnit}px`,
        ).toBe("column");
      }
    }

    // The crux: on a box that affords the stacked budget the scene's *own minimum
    // span* is what keeps the minimum card's composition distinct from a larger
    // card's.
    const topBox = rendererBoxHeightPx({
      cellHeightPx: cardHeightPx({ rows: 4, rowUnit: ROW_UNIT_MAX }),
      framed: true,
      titled: false,
    });
    expect(topBox).toBeGreaterThanOrEqual(SCENE_STACKED_HEIGHT_PX);
    const minimum = sceneTileLayout({ rendererHeightPx: topBox, placement: SCENE_MIN_SPAN });
    const wider = sceneTileLayout({
      rendererHeightPx: topBox,
      placement: { w: SCENE_MIN_SPAN.w + 2, h: SCENE_MIN_SPAN.h },
    });
    expect(minimum).toBe("row");
    expect(wider).not.toBe(minimum);
  });

  it("composes a composition that fits the box, for every card the frame renders", () => {
    // Every legal placement, both row-unit bounds, titled and untitled, at the
    // type's minimum span and above it. A card only reaches the tile when the
    // frame's guard passes it — its box holds the box a minimum-span card gets
    // (`frame.ts`'s `minimumRendererBoxHeightPx`); the ones the guard rejects are
    // the frame's to explain, not the tile's (wall-frame.test.ts). For every card
    // that does reach it, the composition it resolves fits the box.
    const descriptor = WALL_WIDGET_REGISTRY.scene;

    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const minimumBox = minimumRendererBoxHeightPx({ descriptor, rowUnit, framed: true });

      for (const rows of [2, 3, 4, 5, 6]) {
        for (const titled of [false, true]) {
          for (const columns of [2, 4]) {
            const where = `${columns}×${rows} at ${rowUnit}px, titled=${titled}`;
            const placement = { w: columns, h: rows };
            const box = rendererBoxHeightPx({
              cellHeightPx: cardHeightPx({ rows, rowUnit }),
              framed: true,
              titled,
            });
            const renders = composesMinimumSpan({
              placement,
              descriptor,
              rendererHeightPx: box,
              minimumRendererHeightPx: minimumBox,
            });
            if (!renders) continue;

            const layout = sceneTileLayout({ rendererHeightPx: box, placement });
            const budget = layout === "column" ? SCENE_STACKED_HEIGHT_PX : SCENE_ROW_HEIGHT_PX;
            expect(budget, `${where} draws the ${layout} within its box`).toBeLessThanOrEqual(box);
          }
        }
      }
    }
  });

  it("leaves the frame to explain a sub-minimum box, and draws nothing itself", async () => {
    const source = await sceneSource();

    // The tile has no explanation path of its own: the frame's guard is the single
    // place the wall explains a card it cannot render (specs/wall-display
    // "Panel Fit"), and the guard's floor is above the row's own budget.
    expect(source).not.toContain("WallCardMessage");
    expect(source).not.toContain("WALL_TOO_SMALL_MESSAGE");
    expect(source).not.toContain('layout === "none"');
  });

  it("drives the direction and the glyph scale from the box", async () => {
    const source = await sceneSource();
    expect(source).toContain("sceneTileLayout({ rendererHeightPx, placement: widget })");
    expect(source).toContain("rendererHeightPx }: WallWidgetProps");
    expect(source).not.toContain("sceneTileLayout(tier)");
    expect(source).not.toContain("sceneTileLayout(cardForm)");
    // The scene resolves its own compositions, so it reads neither the placement's
    // area tier nor the light card's form.
    expect(source).not.toMatch(/\btier\b/);
    expect(source).not.toContain("cardForm");
    expect(source).toContain('flexDirection: stacked ? "column" : "row"');
    expect(source).toContain("data-layout={layout}");
    expect(source).toContain("const glyphSide = stacked ?");
    expect(source).toContain("SCENE_LARGE_GLYPH_SIZE");
  });

  it("audits every wall renderer that reads the area tier", async () => {
    // The area tier answers "how much room the placement has", not "what fits the
    // box" — a type whose `min` and `defaults` coincide is `regular` at any
    // wider-but-short placement. Every widget-layer module that reads the tier must
    // therefore use it for type scale only (or pass it through to the shared tile);
    // a composition decision must consume the height-resolved renderer box and its
    // own budget instead. A new module that reaches for the tier, or that selects a
    // composition from the light card's form, fails here until it is classified.
    const TYPE_SCALE_ONLY: Record<string, readonly string[]> = {
      "TemperatureWidget.tsx": ["wallReadoutFontSize(tier)"],
      "LinkWidget.tsx": ["linkLabelFontSize(tier)"],
    };
    // Reading the tier: destructuring it from props, typing it, or comparing it.
    // A tile's `tier="compact"` prop value is not a read.
    const READS_TIER = /\btier\s*[,}:]/;
    const LAYOUT_FROM_TIER = /tier\s*(?:===|!==|==|!=|\.)/;
    const LAYOUT_FROM_FORM = /cardForm\s*(?:===|!==|==|!=)/;
    const files = (await readdir(WIDGETS)).filter(
      (name) => name.endsWith(".tsx") && name !== "PagedTileGrid.tsx",
    );
    expect(files.length).toBeGreaterThan(5);

    for (const name of files) {
      const text = await readSource(join(WIDGETS, name));
      const allowed = TYPE_SCALE_ONLY[name];
      expect(text, `${name} selects a composition from the card form`).not.toMatch(
        LAYOUT_FROM_FORM,
      );
      if (allowed === undefined) {
        expect(text, `${name} reads the area tier`).not.toMatch(READS_TIER);
      } else {
        for (const pattern of allowed) {
          expect(text, `${name} uses ${pattern}`).toContain(pattern);
        }
        // Never a composition: no comparison against a tier.
        expect(text, `${name} selects a composition from the tier`).not.toMatch(LAYOUT_FROM_TIER);
      }
      expect(text, name).not.toContain("sceneTileLayout(tier)");
      expect(text, name).not.toContain("sceneTileLayout(cardForm)");
    }
  });

  it("preserves the pressed, busy, and error states in both compositions", async () => {
    const source = await sceneSource();
    // The states are shared by the one pressable element, not re-implemented
    // per composition: only the direction and glyph scale branch on the form.
    expect(source).toContain('data-pressed={pressed ? "" : undefined}');
    expect(source).toContain('data-busy={busy ? "" : undefined}');
    expect(source).toContain("const [pressed, setPressed] = useState(false)");
    expect(source).toContain("const [busy, setBusy] = useState(false)");
    expect(source).toContain("<Spinner");
    expect(source).toContain('role="alert"');
    expect(source).toContain("opacity: busy ? 0 : 1");
  });
});
