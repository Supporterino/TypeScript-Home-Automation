import { describe, expect, it } from "bun:test";
import { WALL_CARD_FULL_HEIGHT_PX } from "../src/app/wall/cards/card-composition.js";
import { rendererBoxHeightPx } from "../src/app/wall/frame.js";
import {
  ROW_UNIT_MAX,
  ROW_UNIT_MIN,
  WALL_COMPACT_CARD_HEIGHT_PX,
  WALL_GUTTER_MIN_PX,
} from "../src/app/wall/grid.js";
import {
  WALL_MIN_CONTROL_GAP,
  WALL_MIN_TOUCH_TARGET,
  WALL_WIDGET_REGISTRY,
  type WallWidgetSpan,
} from "../src/app/wall/registry.js";
import {
  cardHeightPx,
  composesMinimumSpan,
  resolveCardFormForHeight,
  resolveSpanTier,
  WALL_FULL_CARD_HEIGHT_PX,
  WALL_TITLE_BLOCK_PX,
  WALL_TITLE_ROWS,
  type WallCardForm,
  type WallSpanDescriptor,
} from "../src/app/wall/span.js";

/**
 * The form a card composes in a cell of `rows` rows. A typed device widget's
 * frame is chrome-less, so its card's box *is* the cell: the render path resolves
 * the form from the renderer's box (`frame.ts`'s `rendererBoxHeightPx`), which for
 * that type is the cell height.
 */
function formForCell(input: { rows: number; rowUnit: number; gutterPx?: number }): WallCardForm {
  return resolveCardFormForHeight(cardHeightPx(input));
}

// Pure tier selection — no DOM (design.md D2, D3; specs/wall-display
// "Span-Aware Card Presentation"). A card composes itself for its declared span,
// so the tier is derived from the type's own registry spans.

/** The `clock` type's spans: min area 6, default area 18, max area 32. */
const CLOCK: WallSpanDescriptor = {
  min: { w: 3, h: 2 },
  defaults: { w: 6, h: 3 },
  max: { w: 8, h: 4 },
};

describe("resolveSpanTier", () => {
  it("resolves a placement at the type's minimum to compact", () => {
    expect(resolveSpanTier(CLOCK.min, CLOCK)).toBe("compact");
  });

  it("resolves a placement at the type's default to regular", () => {
    expect(resolveSpanTier(CLOCK.defaults, CLOCK)).toBe("regular");
  });

  it("resolves a placement at the type's maximum to roomy", () => {
    expect(resolveSpanTier(CLOCK.max, CLOCK)).toBe("roomy");
  });

  it("keeps a placement just inside the compact ceiling compact and just above it regular", () => {
    // The compact ceiling is the midpoint of the min (6) and default (18) areas, 12.
    expect(resolveSpanTier({ w: 4, h: 3 }, CLOCK)).toBe("compact");
    expect(resolveSpanTier({ w: 4, h: 4 }, CLOCK)).toBe("regular");
  });

  it("keeps a placement just below the roomy floor regular and at it roomy", () => {
    // The roomy floor is the midpoint of the default (18) and max (32) areas, 25.
    expect(resolveSpanTier({ w: 6, h: 4 }, CLOCK)).toBe("regular");
    expect(resolveSpanTier({ w: 5, h: 5 }, CLOCK)).toBe("roomy");
  });

  it("resolves compact when a type's default is its minimum", () => {
    // Every typed device widget's default span *is* its minimum, so its smallest
    // card must still compose compact rather than repeating the regular form.
    const descriptor: WallSpanDescriptor = {
      min: { w: 2, h: 2 },
      defaults: { w: 2, h: 2 },
      max: { w: 6, h: 6 },
    };

    expect(resolveSpanTier({ w: 2, h: 2 }, descriptor)).toBe("compact");
    expect(resolveSpanTier({ w: 6, h: 6 }, descriptor)).toBe("roomy");
  });

  it("resolves a placement below the minimum compact and above the maximum roomy", () => {
    const descriptor: WallSpanDescriptor = {
      min: { w: 4, h: 4 },
      defaults: { w: 6, h: 4 },
      max: { w: 12, h: 10 },
    };

    expect(resolveSpanTier({ w: 1, h: 1 }, descriptor)).toBe("compact");
    expect(resolveSpanTier({ w: 12, h: 24 }, descriptor)).toBe("roomy");
  });

  it("distinguishes the tiers a widget type actually declares", () => {
    for (const [type, descriptor] of Object.entries(WALL_WIDGET_REGISTRY)) {
      expect(resolveSpanTier(descriptor.min, descriptor), `${type} at its minimum span`).toBe(
        "compact",
      );
      expect(resolveSpanTier(descriptor.max, descriptor), `${type} at its maximum span`).toBe(
        "roomy",
      );

      const defaultTier = resolveSpanTier(descriptor.defaults, descriptor);
      const defaultIsMinimum =
        descriptor.defaults.w === descriptor.min.w && descriptor.defaults.h === descriptor.min.h;
      const expected = defaultIsMinimum ? "compact" : "regular";
      expect(defaultTier, `${type} at its default span`).toBe(expected);
    }
  });
});

describe("WALL_FULL_CARD_HEIGHT_PX", () => {
  it("is the ported card's own full-content budget, read from the card module", () => {
    // The compact card is its state item and one control row; the full form adds a
    // second control row. Both budgets are the cards' own, so the wall's form
    // boundary and the cards it ports cannot drift (design.md D2, D5).
    expect(WALL_FULL_CARD_HEIGHT_PX).toBe(WALL_CARD_FULL_HEIGHT_PX);
    expect(WALL_FULL_CARD_HEIGHT_PX).toBeGreaterThan(WALL_COMPACT_CARD_HEIGHT_PX);
    expect(Number.isInteger(WALL_FULL_CARD_HEIGHT_PX)).toBe(true);
  });
});

describe("resolveCardFormForHeight", () => {
  it("takes the full form at its threshold and the compact form below", () => {
    // The ported card's full-content budget is the boundary; everything shorter —
    // including the compact budget a minimum-span cell guarantees — composes
    // compact, so a card never overflows the box it was given.
    expect(resolveCardFormForHeight(WALL_FULL_CARD_HEIGHT_PX)).toBe("full");
    expect(resolveCardFormForHeight(WALL_FULL_CARD_HEIGHT_PX - 1)).toBe("compact");
    expect(resolveCardFormForHeight(WALL_COMPACT_CARD_HEIGHT_PX)).toBe("compact");
    expect(resolveCardFormForHeight(0)).toBe("compact");
  });

  it("composes a richer form for a taller box rather than repeating a smaller one", () => {
    expect(resolveCardFormForHeight(WALL_COMPACT_CARD_HEIGHT_PX)).not.toBe(
      resolveCardFormForHeight(WALL_FULL_CARD_HEIGHT_PX),
    );
  });
});

describe("resolveCardFormForHeight over the cell geometry", () => {
  it("keeps a card at its minimum span on the compact form", () => {
    // A two-row cell is the wall's minimum device placement, and both row-unit
    // bounds are far shorter than the full form's budget.
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      expect(formForCell({ rows: 2, rowUnit })).toBe("compact");
    }
  });

  it("takes the full form only where the full form fits the cell", () => {
    for (const rows of [2, 3, 4, 5, 6]) {
      for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
        const form = formForCell({ rows, rowUnit });
        const cellPx = rows * rowUnit + (rows - 1) * WALL_GUTTER_MIN_PX;
        const budget = form === "compact" ? WALL_COMPACT_CARD_HEIGHT_PX : WALL_FULL_CARD_HEIGHT_PX;
        expect(budget, `${form} at ${rows} rows × ${rowUnit}px fits`).toBeLessThanOrEqual(cellPx);
      }
    }
  });

  it("never leaves a legal device placement without a fitting form", () => {
    // The compact budget is the height the two-row minimum span holds at the
    // floors, so a card placed at the type's minimum always has a form that fits.
    expect(2 * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX).toBeGreaterThanOrEqual(
      WALL_COMPACT_CARD_HEIGHT_PX,
    );
    expect(WALL_WIDGET_REGISTRY.light.min.h).toBe(2);
  });

  it("reads a row unit below the wall's floor as the floor", () => {
    expect(formForCell({ rows: 3, rowUnit: 0 })).toBe(
      formForCell({ rows: 3, rowUnit: ROW_UNIT_MIN }),
    );
  });

  it("assumes the gutter floor, so a shorter cell never takes the full form", () => {
    // The decision must hold for the smallest cell the layout can produce: with a
    // larger gutter assumed, a cell would look taller than it can be drawn.
    expect(formForCell({ rows: 3, rowUnit: ROW_UNIT_MIN, gutterPx: WALL_GUTTER_MIN_PX })).toBe(
      "compact",
    );
    expect(
      WALL_MIN_CONTROL_GAP,
      "the control gap the wall's spacing rhythm is built from",
    ).toBeGreaterThan(0);
  });
});

describe("composesMinimumSpan", () => {
  const descriptor = WALL_WIDGET_REGISTRY.favorites;

  // The favorites type is a `control` widget, so its frame draws a surface —
  // `framed: true` here is the real geometry. The frame's inset cancels on both
  // sides of the comparison, so the rule answers the same for a chrome-less frame.
  function box(placement: WallWidgetSpan, rowUnit: number, titled = false): number {
    return rendererBoxHeightPx({
      cellHeightPx: cardHeightPx({ rows: placement.h, rowUnit }),
      framed: true,
      titled,
    });
  }

  function minimumBox(rowUnit: number): number {
    return box(descriptor.min, rowUnit, false);
  }

  function composes(placement: WallWidgetSpan, rowUnit: number, titled = false): boolean {
    return composesMinimumSpan({
      placement,
      descriptor,
      rendererHeightPx: box(placement, rowUnit, titled),
      minimumRendererHeightPx: minimumBox(rowUnit),
    });
  }

  it("accepts a placement at or above the type's own minimum", () => {
    expect(composes(descriptor.min, ROW_UNIT_MIN)).toBe(true);
    expect(composes(descriptor.defaults, ROW_UNIT_MIN)).toBe(true);
  });

  it("rejects a legacy placement below a re-derived minimum", () => {
    // A profile authored before a minimum was raised — or written through the API —
    // can still carry a shorter cell; the wall explains it rather than clipping it
    // (specs/wall-display "Panel Fit": overflow becomes an explanation).
    expect(composes({ w: descriptor.min.w, h: descriptor.min.h - 1 }, ROW_UNIT_MIN)).toBe(false);
  });

  it("rejects a placement narrower than the type's minimum", () => {
    // Width matters as much as height: a cell one column narrow reflows the
    // card's control or tile row — a page-control row that wraps loses a whole
    // touch-target row — so a sub-minimum width is explained too.
    const legacy = { w: descriptor.min.w - 1, h: descriptor.min.h };
    expect(composes(legacy, ROW_UNIT_MIN)).toBe(false);
    expect(legacy.h).toBe(descriptor.min.h);
  });

  it("explains a titled card at the type's minimum span, and renders it one row taller", () => {
    // The title is drawn above the renderer inside the *same* cell, so the cell
    // must be taller than the type's minimum by the title block before the card
    // can render what that minimum guarantees — otherwise the frame's overflow
    // would take the card's bottom row.
    const atMinimum = { w: descriptor.min.w, h: descriptor.min.h };
    expect(composes(atMinimum, ROW_UNIT_MIN, true)).toBe(false);
    expect(composes({ w: atMinimum.w, h: atMinimum.h + WALL_TITLE_ROWS }, ROW_UNIT_MIN, true)).toBe(
      true,
    );
    // The same cell, title-aware: untitled it is the type's minimum card, titled
    // it is below the box that card needs.
    expect(composes(atMinimum, ROW_UNIT_MIN, false)).toBe(true);
    expect(composes(atMinimum, ROW_UNIT_MIN, false)).not.toBe(
      composes(atMinimum, ROW_UNIT_MIN, true),
    );
  });

  it("accepts every untitled legal placement of every type on both axes", () => {
    // The rule can only ever explain a placement the editor would not author (or a
    // titled card's cell, which the editor's floor now raises): each type's own
    // minimum, default, and maximum all compose.
    for (const [type, entry] of Object.entries(WALL_WIDGET_REGISTRY)) {
      for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
        for (const placement of [entry.min, entry.defaults, entry.max]) {
          expect(
            composesMinimumSpan({
              placement,
              descriptor: entry,
              rendererHeightPx: rendererBoxHeightPx({
                cellHeightPx: cardHeightPx({ rows: placement.h, rowUnit }),
                framed: true,
                titled: false,
              }),
              minimumRendererHeightPx: rendererBoxHeightPx({
                cellHeightPx: cardHeightPx({ rows: entry.min.h, rowUnit }),
                framed: true,
                titled: false,
              }),
            }),
            `${type} at ${placement.w}×${placement.h}, ${rowUnit}px rows`,
          ).toBe(true);
        }
      }
    }
  });

  it("holds at every row unit, because both sides scale with it", () => {
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      expect(composes(descriptor.min, rowUnit)).toBe(true);
      expect(composes({ w: descriptor.min.w, h: descriptor.min.h - 1 }, rowUnit)).toBe(false);
      expect(composes(descriptor.min, rowUnit, true)).toBe(false);
    }
  });
});

describe("WALL_TITLE_ROWS", () => {
  it("is the title block measured in the wall's shortest row", () => {
    expect(WALL_TITLE_ROWS).toBe(Math.ceil(WALL_TITLE_BLOCK_PX / ROW_UNIT_MIN));
    expect(WALL_TITLE_ROWS).toBeGreaterThanOrEqual(1);
    // One row of the shortest cell still covers the title, which is what makes the
    // row rule the exact row form of the box rule.
    expect(WALL_TITLE_ROWS * ROW_UNIT_MIN).toBeGreaterThanOrEqual(WALL_TITLE_BLOCK_PX);
  });

  it("stays one row when the frame's inset is re-derived from the ported padding", () => {
    // The row floor reads the title block and the row unit — the ported card's own
    // compact budget — and never the frame's inset, so the inset's re-derivation
    // (design.md W3) leaves the editor's span floors where they were: 1 row.
    expect(WALL_TITLE_ROWS).toBe(1);
    expect(WALL_TITLE_BLOCK_PX).toBeLessThanOrEqual(ROW_UNIT_MIN * WALL_TITLE_ROWS);
  });

  it("is the row form of the render guard, at every type and row unit", () => {
    // The editor floors a titled widget at `min.h + WALL_TITLE_ROWS`; the wall
    // explains a titled card whose box is below the box a minimum-span card gets.
    // They agree exactly — a titled card one row above the minimum always renders,
    // and one at the minimum never does — so the editor can neither admit a
    // placement the wall explains nor refuse one it renders.
    for (const [type, entry] of Object.entries(WALL_WIDGET_REGISTRY)) {
      const boxOf = (rows: number, rowUnit: number, titled: boolean): number =>
        rendererBoxHeightPx({
          cellHeightPx: cardHeightPx({ rows, rowUnit }),
          framed: true,
          titled,
        });

      for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
        const minimumBox = boxOf(entry.min.h, rowUnit, false);
        for (const extra of [0, 1, 2]) {
          const h = entry.min.h + extra;
          const renders = composesMinimumSpan({
            placement: { w: entry.min.w, h },
            descriptor: entry,
            rendererHeightPx: boxOf(h, rowUnit, true),
            minimumRendererHeightPx: minimumBox,
          });
          expect(renders, `${type} at min.h + ${extra} rows, titled, ${rowUnit}px rows`).toBe(
            extra >= WALL_TITLE_ROWS,
          );
        }
      }
    }
  });
});

describe("the ported touch target", () => {
  it("holds the minimum-span cell for the compact card at the gutter floor", () => {
    expect(2 * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX).toBeGreaterThanOrEqual(
      WALL_COMPACT_CARD_HEIGHT_PX,
    );
    expect(WALL_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(42);
  });
});
