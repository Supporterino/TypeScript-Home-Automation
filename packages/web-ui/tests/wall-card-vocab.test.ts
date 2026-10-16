import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import { WALL_MIN_CONTROL_GAP } from "../src/app/wall/registry.js";

/**
 * The wall's single card vocabulary: every surface composes the ported module and
 * carries no vocabulary of its own.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");

/**
 * The retired vocabulary's module slug, assembled from its parts: this check
 * exists to prove no file names it, so a literal here would be a leftover reference.
 */
const RETIRED_VOCABULARY = ["card", "vocab"].join("-");

/** The parts that vocabulary declared — no surface may name one again. */
const RETIRED_PARTS = [
  "WallCardGlyph",
  "WallCardMetric",
  "WallCardStat",
  "WallCardHead",
  "WallCardAffordance",
  "WallButton",
  "wallAffordanceStyle",
  "wallControlGapPx",
] as const;

/** The parts the ported module declares for the wall's widgets and its chrome. */
const WIDGET_VOCABULARY = [
  "WallCardLabel",
  "WallCardReading",
  "WallCardStateItem",
  "WallCardControl",
  "WallCardRoute",
  "WallCardMessage",
] as const;

/** The ported module itself — the one declaration site of the widget vocabulary. */
const ANATOMY = "wall/cards/card-anatomy.tsx";

/** Every widget renderer: the wall's own surfaces, each composing the vocabulary. */
const WIDGET_SURFACES = [
  "wall/widgets/ClockWidget.tsx",
  "wall/widgets/WeatherWidget.tsx",
  "wall/widgets/EnergyWidget.tsx",
  "wall/widgets/StatusWidget.tsx",
  "wall/widgets/TemperatureWidget.tsx",
  "wall/widgets/SceneWidget.tsx",
  "wall/widgets/LinkWidget.tsx",
  "wall/widgets/RoomWidget.tsx",
  "wall/widgets/FavoritesWidget.tsx",
  "wall/widgets/DeviceGridWidget.tsx",
  "wall/widgets/PagedTileGrid.tsx",
  "wall/widgets/DeviceWidget.tsx",
] as const;

/**
 * The chrome a widget is drawn inside — the framed container and the grid —
 * which composes the same vocabulary.
 */
const CHROME_SURFACES = ["wall/WidgetFrame.tsx", "wall/WallGrid.tsx"] as const;

/**
 * The wall view draws the wall's own route affordance for a wall reached from a
 * link, so it composes the vocabulary too.
 */
const WALL_VIEW = "views/WallView.tsx";

const ALL_SURFACES = [...WIDGET_SURFACES, ...CHROME_SURFACES, WALL_VIEW] as const;

/**
 * A Lumen design token — a Tailwind class or a `var(--…)` outside the Hearth
 * namespace.
 */
const LUMEN_TOKEN =
  /(?<!hearth-)(?:text-(?:muted|danger|info|stale|ink)\b|font-display|rounded-(?:tile|pill|input)|motion-toggle|var\(--(?:info|on|off|stale|danger|accent|surface|hairline|canvas|text|bg|font|e[0-9]|radius|motion)\b)/;

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(relative: string): Promise<string> {
  return stripComments(await readFile(join(APP_DIR, relative), "utf8"));
}

describe("every wall surface composes the ported vocabulary", () => {
  for (const relative of ALL_SURFACES) {
    it(`${relative} imports the ported module`, async () => {
      const text = await source(relative);

      expect(text).toMatch(/from "[^"]*cards\/card-anatomy\.js"/);
    });
  }
});

describe("no wall surface carries a vocabulary of its own", () => {
  it("retires the wall's earlier non-device vocabulary module", async () => {
    // The module itself is gone, not merely unreferenced: a file re-created at its
    // path fails here before it can become a second vocabulary again.
    const retired = join(APP_DIR, "wall/widgets", `${RETIRED_VOCABULARY}.tsx`);
    const gone = await readFile(retired, "utf8").then(
      () => false,
      () => true,
    );

    expect(gone, "the retired module is gone").toBe(true);
  });

  for (const relative of ALL_SURFACES) {
    it(`${relative} names no retired part and declares no part itself`, async () => {
      const text = await source(relative);

      // The retired vocabulary is gone: neither its module nor any part it declared
      // may be named by a surface.
      expect(text).not.toContain(RETIRED_VOCABULARY);
      for (const part of RETIRED_PARTS) {
        // A whole word: `WallCardStat` is a prefix of the ported `WallCardStateItem`,
        // which every surface composes.
        expect(text, `${part} is retired`).not.toMatch(new RegExp(`\\b${part}\\b`));
      }

      // The parts are declared once, in the ported module: a surface that declared
      // one would be a second declaration of a treatment the ported table owns.
      for (const part of WIDGET_VOCABULARY) {
        expect(text, `${part} is used here, not declared`).not.toContain(`function ${part}`);
        expect(text, `${part} is used here, not declared`).not.toContain(`const ${part} =`);
      }
    });
  }

  it("declares each widget part exactly once, in the ported module", async () => {
    const anatomy = await source(ANATOMY);

    for (const part of WIDGET_VOCABULARY) {
      expect(anatomy).toContain(`export function ${part}`);
    }
  });
});

describe("the wall's own surfaces carry no Lumen token", () => {
  for (const relative of [...WIDGET_SURFACES, ...CHROME_SURFACES]) {
    it(`${relative} draws Hearth tokens and no literal colour`, async () => {
      const text = await source(relative);

      expect(text).not.toMatch(LUMEN_TOKEN);
      expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
  }
});

describe("a widget's controls are the ported control treatment", () => {
  it("keeps the ported control spacing at or above the wall's adjacent-control floor", () => {
    expect(WALL_CARD_METRICS.controlSpacing).toBeGreaterThanOrEqual(WALL_MIN_CONTROL_GAP);
  });

  it("draws every widget control from the ported control parts", async () => {
    // The controls repointed onto the ported treatment, and the part each one draws:
    // a room's batch commands, the page controls, and the route affordances.
    const expected: Readonly<Record<string, readonly string[]>> = {
      "wall/widgets/RoomWidget.tsx": [
        '<WallCardActions distribution="distributed">',
        "<WallCardControl",
      ],
      "wall/widgets/PagedTileGrid.tsx": ["<WallCardActions", "<WallCardIconButton"],
      "wall/widgets/LinkWidget.tsx": ["<WallCardRoute"],
      "views/WallView.tsx": ["<WallCardRoute"],
    };

    for (const [relative, parts] of Object.entries(expected)) {
      const text = await source(relative);
      for (const part of parts) {
        expect(text, `${relative} draws ${part}`).toContain(part);
      }
    }
  });
});

describe("the wall view's own overlay chrome", () => {
  it("carries the wall's Hearth scope, so the ported treatment resolves", async () => {
    const view = await source(WALL_VIEW);

    // The way back and the refetch banner sit *beside* the grid rather than inside its
    // Hearth scope, so the ready state carries the scope itself.
    expect(view).toContain('data-wall-chunk=""');
    // A scope, not the wall chunk's own identity marker (which the grid renders).
    expect(view).not.toContain("WALL_CHUNK_MARKER");
  });

  it("draws the refetch affordance from the ported parts and the ported surface", async () => {
    const view = await source(WALL_VIEW);
    const ready = view.slice(
      view.indexOf('state === "ready"'),
      view.indexOf("{backTo !== null && ("),
    );

    // The wall's own chrome: the ported control for the dismissal and the wall's
    // message form for the detail, on the ported card surface.
    expect(ready).toContain("<WallCardIconButton");
    expect(ready).toContain("<WallCardMessage>");
    expect(ready).toContain("var(--hearth-card-radius)");
    expect(ready).toContain("var(--hearth-card-padding)");
    expect(ready).not.toContain("<IconButton");
    expect(ready).not.toContain("rounded-tile");
  });

  it("draws the way back as the ported route affordance, in the wall's own scope", async () => {
    const view = await source(WALL_VIEW);
    // The ready state alone: the unknown-profile explanation's own way back is the
    // dashboard shell's Lumen button, not a wall surface.
    const ready = view.slice(
      view.indexOf('state === "ready"'),
      view.indexOf('state === "unknown"'),
    );
    const back = ready.slice(ready.indexOf("{backTo !== null && ("));

    expect(back).toContain("<WallCardRoute");
    expect(back).toContain("to={backTo}");
    expect(back).not.toContain("<Link to={backTo}");
    // Its placement is the wall's own tokens, which the view's scope resolves.
    expect(back).toContain("var(--hearth-space-4)");
  });
});
