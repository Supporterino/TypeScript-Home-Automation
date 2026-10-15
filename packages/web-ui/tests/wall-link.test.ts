import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_WIDGET_CONFIG_SCHEMAS } from "@ts-ha/shared/wall-schema";
import { wallPath } from "../src/app/lib/router.js";
import { WALL_CARD_METRICS, WALL_CARD_PRIMARY_FONT_SIZE } from "../src/app/wall/cards/metrics.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import { WALL_TITLE_FONT_SIZE, WALL_TYPE_RAMP } from "../src/app/wall/type-ramp.js";
import { linkLabel, linkLabelFontSize, linkTarget } from "../src/app/wall/widgets/link-model.js";

/**
 * The wall link widget (wall-zones-and-fit D11; specs/wall-display "Wall
 * Navigation", "Widget Catalog"). The label rules are pure, so they are asserted
 * directly; the affordance's wiring — the route it opens and its touch target —
 * is asserted structurally, since there is no DOM harness.
 */
const RENDERER = join(import.meta.dir, "..", "src/app/wall/widgets/LinkWidget.tsx");

/** Removes block and line comments so prose is not mistaken for markup. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function rendererSource(): Promise<string> {
  return stripComments(await readFile(RENDERER, "utf8"));
}

describe("linkTarget", () => {
  it("resolves the configured target profile", () => {
    expect(linkTarget({ target: "Kitchen" })).toBe("Kitchen");
  });

  it("trims surrounding whitespace from the target", () => {
    expect(linkTarget({ target: "  Upstairs hall  " })).toBe("Upstairs hall");
  });

  it("resolves no target when none is configured", () => {
    expect(linkTarget({})).toBeNull();
    expect(linkTarget({ target: "" })).toBeNull();
    expect(linkTarget({ target: "   " })).toBeNull();
    expect(linkTarget({ target: 42 })).toBeNull();
  });
});

describe("linkLabel", () => {
  it("prefers the configured label", () => {
    expect(linkLabel({ target: "Kitchen", label: "Kitchen lights" }, "Kitchen")).toBe(
      "Kitchen lights",
    );
  });

  it("falls back to the target profile's own name", () => {
    expect(linkLabel({ target: "Kitchen" }, "Kitchen")).toBe("Kitchen");
  });

  it("ignores a blank label and reports nothing without a target", () => {
    expect(linkLabel({ target: "Kitchen", label: "   " }, "Kitchen")).toBe("Kitchen");
    expect(linkLabel({}, null)).toBeNull();
  });
});

describe("linkLabelFontSize", () => {
  it("sets a compact link's label at the ported primary size", () => {
    // A link's label is supporting text, so its minimum-span composition draws it at
    // the ported card system's own primary size rather than the wall's retired label
    // tier (design.md W1, W2; specs/wall-display "Supporting text is drawn at the
    // ported sizes").
    expect(linkLabelFontSize("compact")).toBe(WALL_CARD_PRIMARY_FONT_SIZE);
    expect(WALL_CARD_PRIMARY_FONT_SIZE).toBe(`${WALL_CARD_METRICS.primarySize}px`);
  });

  it("sets a link with room on the title tier", () => {
    expect(linkLabelFontSize("regular")).toBe(WALL_TITLE_FONT_SIZE);
    expect(linkLabelFontSize("roomy")).toBe(WALL_TITLE_FONT_SIZE);
    // A link with room never repeats the size its minimum span draws, and the
    // compact size is the ported primary size — at or below the wall's title tier.
    expect(WALL_TYPE_RAMP.titleMin).toBeGreaterThanOrEqual(WALL_CARD_METRICS.primarySize);
    expect(linkLabelFontSize("regular")).not.toBe(linkLabelFontSize("compact"));
  });
});

describe("the link descriptor", () => {
  it("is a control widget bound to the shared link schema", () => {
    const descriptor = WALL_WIDGET_REGISTRY.link;

    expect(descriptor.type).toBe("link");
    expect(descriptor.grammar).toBe("control");
    expect(descriptor.configSchema).toBe(WALL_WIDGET_CONFIG_SCHEMAS.link);
    expect(typeof descriptor.renderer).toBe("function");
  });

  it("declares a min span that holds a touch target and stays within its bounds", () => {
    const { min, defaults, max } = WALL_WIDGET_REGISTRY.link;

    expect(min.w).toBeGreaterThanOrEqual(2);
    expect(min.h).toBeGreaterThanOrEqual(2);
    expect(min.w).toBeLessThanOrEqual(defaults.w);
    expect(defaults.w).toBeLessThanOrEqual(max.w);
    expect(min.h).toBeLessThanOrEqual(defaults.h);
    expect(defaults.h).toBeLessThanOrEqual(max.h);
  });
});

describe("navigation resolves the target profile", () => {
  it("addresses the target profile through the router", () => {
    const target = linkTarget({ target: "Kitchen" });
    expect(target).not.toBeNull();
    if (target === null) return;

    expect(wallPath("/", target)).toBe("/wall/Kitchen");
    expect(wallPath("/home", target)).toBe("/home/wall/Kitchen");
  });

  it("addresses a profile whose name needs escaping", () => {
    const target = linkTarget({ target: "Upstairs hall" });
    if (target === null) throw new Error("expected a target");

    expect(wallPath("/", target)).toBe("/wall/Upstairs%20hall");
  });
});

describe("the link renderer", () => {
  it("opens the target through the wall's route affordance and the shared router", async () => {
    const source = await rendererSource();

    expect(source).toContain("wallPath(basePath, target)");
    expect(source).toContain('from "../../lib/router-context.js"');
    // The route affordance is the vocabulary's own part, which draws the shared
    // router's link (design.md W1) — the widget composes it, never a bare anchor.
    expect(source).toContain("<WallCardRoute");
    expect(source).not.toContain("window.location");
  });

  it("renders a touch-sized affordance that needs no hover", async () => {
    const source = await rendererSource();

    // The ported control treatment is the wall's touch target in both directions and
    // is declared once, in the vocabulary (asserted by `wall-card-anatomy.test.ts`):
    // the route draws the ported control height and radius, never a pill of its own.
    expect(source).toContain("<WallCardRoute");
    expect(WALL_CARD_METRICS.controlHeight).toBeGreaterThanOrEqual(42);
    expect(source).not.toContain("onMouseEnter");
    expect(source).not.toContain(":hover");
  });

  it("labels the affordance from the config, shortened for its card", async () => {
    const source = await rendererSource();

    expect(source).toContain("linkLabel(widget.config, target)");
    expect(source).toContain("shortDeviceName(");
    expect(source).toContain("linkLabelFontSize(tier)");
  });

  it("explains a link with no target rather than drawing a dead affordance", async () => {
    const source = await rendererSource();

    expect(source).toContain("target === null");
    expect(source).toContain("WallCardMessage");
  });
});
