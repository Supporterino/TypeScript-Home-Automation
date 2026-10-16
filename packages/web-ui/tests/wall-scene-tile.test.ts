import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
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
  SCENE_COMPACT_HEIGHT_PX,
  SCENE_LARGE_GLYPH_PX,
  SCENE_MIN_SPAN,
  SCENE_ROW_HEIGHT_PX,
  SCENE_STACKED_HEIGHT_PX,
  sceneTileInset,
  sceneTileLayout,
} from "../src/app/wall/widgets/scene-model.js";

/**
 * Structural assertions for the wall scene button: the pressable tile, its glyph
 * and label anatomy, and its explicit pressed/busy states.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const SCENE = join(APP_DIR, "wall/widgets/SceneWidget.tsx");
const WIDGETS = join(APP_DIR, "wall/widgets");
/** The ported module where the wall's control treatment is declared once. */
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");

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

describe("the scene button is the wall's ported control", () => {
  it("draws the ported control height and radius rather than a treatment of its own", async () => {
    const source = await sceneSource();

    // The tile's button is the vocabulary's labelled control: the ported control height
    // — the wall's touch target — and the ported control radius, from the ported table.
    expect(source).toContain("minHeight: WALL_CARD_METRICS.controlHeight");
    expect(source).toContain("borderRadius: WALL_CARD_METRICS.controlRadius");
    expect(source).not.toContain("--hearth-radius-md");
    expect(WALL_CARD_METRICS.controlHeight).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
  });

  it("labels the control through the vocabulary's primary line", async () => {
    const source = await sceneSource();
    const anatomy = await readSource(ANATOMY);

    // The label is the same line of type a device card's name is: the vocabulary's
    // label part, which falls back to the ported primary size.
    expect(source).toContain("<WallCardLabel>");
    expect(anatomy).toContain("size ?? WALL_CARD_PRIMARY_FONT_SIZE");
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
  it("owns its compositions' budgets, derived from the parts they draw", () => {
    // The scene's budgets are its *own* — the glyph, the label's one line, and the
    // button's inset — not the wall light card's full form, which the scene does not need.
    // The compact one-row form draws flush, so its budget is the parts alone.
    expect(SCENE_COMPACT_HEIGHT_PX).toBe(
      Math.max(wallTileMetrics("wall").control, SCENE_LABEL_LINE_PX),
    );
    expect(SCENE_ROW_HEIGHT_PX).toBe(2 * SCENE_INSET_PX + SCENE_COMPACT_HEIGHT_PX);
    expect(SCENE_STACKED_HEIGHT_PX).toBe(
      2 * SCENE_INSET_PX + SCENE_LARGE_GLYPH_PX + 8 + SCENE_LABEL_LINE_PX,
    );
    // The stacked composition is the taller one, the compact the shortest, and every
    // composition holds the wall's touch target for the glyph tile it draws.
    expect(SCENE_STACKED_HEIGHT_PX).toBeGreaterThan(SCENE_ROW_HEIGHT_PX);
    expect(SCENE_ROW_HEIGHT_PX).toBeGreaterThan(SCENE_COMPACT_HEIGHT_PX);
    expect(SCENE_COMPACT_HEIGHT_PX).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
    expect(SCENE_LARGE_GLYPH_PX).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
    // Far below the ported card's full stack, which the scene is never measured
    // against: that budget is what kept this tile on the row at every legal span.
    expect(SCENE_STACKED_HEIGHT_PX).toBeLessThan(WALL_FULL_CARD_HEIGHT_PX);
  });

  it("resolves the compact form at a one-row placement and the framed forms above it", () => {
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      expect(
        sceneTileLayout({ rendererHeightPx: rowUnit, placement: SCENE_MIN_SPAN }),
        `${rowUnit}px row unit`,
      ).toBe("compact");
    }
    // The compact one-row form draws flush; the framed row and stack share the button's
    // inset, so the whole cell is the target only where there is no surface.
    expect(sceneTileInset("compact")).not.toBe(sceneTileInset("row"));
    expect(sceneTileInset("row")).toBe(sceneTileInset("column"));
  });

  it("resolves each framed composition at its own budget's threshold", () => {
    // A placement above the type's one-row minimum, so the box alone decides between
    // the framed row and the framed stack.
    const above = { w: SCENE_MIN_SPAN.w, h: SCENE_MIN_SPAN.h + 1 };

    expect(sceneTileLayout({ rendererHeightPx: SCENE_STACKED_HEIGHT_PX, placement: above })).toBe(
      "column",
    );
    expect(
      sceneTileLayout({ rendererHeightPx: SCENE_STACKED_HEIGHT_PX - 1, placement: above }),
    ).toBe("row");
    expect(sceneTileLayout({ rendererHeightPx: SCENE_ROW_HEIGHT_PX, placement: above })).toBe(
      "row",
    );
  });

  it("keeps a one-row scene within its cell, at or above the wall's touch target", () => {
    // The chrome-less renderer box is the whole cell, and the compact composition fits
    // it: the wall's minimum touch target is the floor the row unit holds.
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const box = rendererBoxHeightPx({
        cellHeightPx: cardHeightPx({ rows: 1, rowUnit }),
        framed: false,
        titled: false,
      });
      expect(box).toBe(cardHeightPx({ rows: 1, rowUnit }));
      expect(box).toBeGreaterThanOrEqual(SCENE_COMPACT_HEIGHT_PX);
      expect(box).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
      expect(sceneTileLayout({ rendererHeightPx: box, placement: SCENE_MIN_SPAN })).toBe("compact");
    }
    // The tight case: the wall's shortest row unit still holds its touch target.
    expect(cardHeightPx({ rows: 1, rowUnit: ROW_UNIT_MIN })).toBeGreaterThanOrEqual(
      WALL_MIN_TOUCH_TARGET,
    );
  });

  it("explains a titled one-row scene instead of drawing a sub-target control", () => {
    // A title shrinks the chrome-less renderer box below the box a minimum-span scene
    // gets, so the frame's contained explanation stands in — never a sub-42px control.
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const minimumBox = minimumRendererBoxHeightPx({
        descriptor: WALL_WIDGET_REGISTRY.scene,
        rowUnit,
        framed: false,
      });
      const titledBox = rendererBoxHeightPx({
        cellHeightPx: cardHeightPx({ rows: 1, rowUnit }),
        framed: false,
        titled: true,
      });
      expect(titledBox).toBeLessThan(minimumBox);
      expect(
        composesMinimumSpan({
          placement: SCENE_MIN_SPAN,
          descriptor: WALL_WIDGET_REGISTRY.scene,
          rendererHeightPx: titledBox,
          minimumRendererHeightPx: minimumBox,
        }),
      ).toBe(false);
    }
  });

  it("mirrors the registry's own minimum span for the scene type", () => {
    expect(SCENE_MIN_SPAN).toEqual(WALL_WIDGET_REGISTRY.scene.min);
    expect(SCENE_MIN_SPAN).toEqual({ w: 2, h: 1 });
  });

  it("keeps a one-row placement compact even where the box affords the stack", () => {
    // The scene's own one-row minimum is the first gate: even where the renderer box
    // affords the stacked budget, a one-row placement composes the compact form.
    const largeBox = rendererBoxHeightPx({
      cellHeightPx: cardHeightPx({ rows: SCENE_MIN_SPAN.h + 2, rowUnit: ROW_UNIT_MAX }),
      framed: true,
      titled: false,
    });
    expect(largeBox).toBeGreaterThanOrEqual(SCENE_STACKED_HEIGHT_PX);

    expect(
      sceneTileLayout({ rendererHeightPx: largeBox, placement: SCENE_MIN_SPAN }),
      "the one-row minimum keeps the compact form even where the box affords the stack",
    ).toBe("compact");
    expect(
      sceneTileLayout({
        rendererHeightPx: largeBox,
        placement: { w: SCENE_MIN_SPAN.w, h: SCENE_MIN_SPAN.h + 1 },
      }),
    ).toBe("column");
  });

  it("keeps the row where the box cannot hold the taller composition", () => {
    // A two-row cell at the floors gives the renderer 96 px — the row, not the stacked
    // composition — however wide it is.
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

  it("composes differently at a larger span than at its one-row minimum", () => {
    // A card at a larger span MUST NOT repeat the composition it renders at its
    // one-row minimum: the one-row placement is compact, a larger span composes the
    // framed row or stack.
    const descriptor = WALL_WIDGET_REGISTRY.scene;
    expect(descriptor.min.h).toBe(1);

    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const boxFor = (rows: number): number =>
        rendererBoxHeightPx({
          cellHeightPx: cardHeightPx({ rows, rowUnit }),
          framed: true,
          titled: false,
        });

      for (const columns of [2, 4, 6]) {
        // The one-row cell is the compact form; the two-row cell is the framed row, its
        // box too short for the stack at either row unit.
        expect(
          sceneTileLayout({ rendererHeightPx: boxFor(1), placement: { w: columns, h: 1 } }),
          `${columns}×1 at ${rowUnit}px`,
        ).toBe("compact");
        expect(
          sceneTileLayout({ rendererHeightPx: boxFor(2), placement: { w: columns, h: 2 } }),
          `${columns}×2 at ${rowUnit}px`,
        ).toBe("row");
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

    // The crux: on a box that affords the stacked budget, the scene's *own one-row
    // minimum* is what keeps the minimum card's composition distinct from a larger
    // card's.
    const topBox = rendererBoxHeightPx({
      cellHeightPx: cardHeightPx({ rows: 4, rowUnit: ROW_UNIT_MAX }),
      framed: true,
      titled: false,
    });
    expect(topBox).toBeGreaterThanOrEqual(SCENE_STACKED_HEIGHT_PX);
    const minimum = sceneTileLayout({ rendererHeightPx: topBox, placement: SCENE_MIN_SPAN });
    const taller = sceneTileLayout({
      rendererHeightPx: topBox,
      placement: { w: SCENE_MIN_SPAN.w, h: SCENE_MIN_SPAN.h + 1 },
    });
    expect(minimum).toBe("compact");
    expect(taller).not.toBe(minimum);
  });

  it("composes a composition that fits the box, for every framed card the frame renders", () => {
    // Every reachable framed placement — two rows and above — at both row-unit bounds:
    // the composition it resolves fits the box. (A scene carries no title: its config
    // is `{automation, label}`, so there is no titled scene cell to compose.)
    const descriptor = WALL_WIDGET_REGISTRY.scene;

    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const minimumBox = minimumRendererBoxHeightPx({ descriptor, rowUnit, framed: true });

      for (const rows of [2, 3, 4, 5, 6]) {
        for (const columns of [2, 4]) {
          const where = `${columns}×${rows} at ${rowUnit}px`;
          const placement = { w: columns, h: rows };
          const box = rendererBoxHeightPx({
            cellHeightPx: cardHeightPx({ rows, rowUnit }),
            framed: true,
            titled: false,
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
  });

  it("leaves the frame to explain a sub-minimum box, and draws nothing itself", async () => {
    const source = await sceneSource();

    // The tile has no explanation path of its own: the frame's guard is the single
    // place the wall explains a card it cannot render.
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
    expect(source).toContain("sceneTileInset(layout)");
    expect(source).toContain("SCENE_LARGE_GLYPH_SIZE");
  });

  it("audits every wall renderer that reads the area tier", async () => {
    // The area tier answers "how much room the placement has", not "what fits the box":
    // every module that reads it must use it for type scale only.
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
