import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_GRID_COLUMNS, WALL_GRID_MAX_ROWS } from "@ts-ha/shared";
import { WALL_WIDGET_CONFIG_SCHEMAS, wallProfileConfigSchema } from "@ts-ha/shared/wall-schema";
import { resolveBands } from "../src/app/wall/bands.js";
import { isWallDeviceClass } from "../src/app/wall/cards/device-class.js";
import { widgetTitle } from "../src/app/wall/frame.js";
import { wallGridMetrics } from "../src/app/wall/grid.js";
import { DEFAULT_DRAFT } from "../src/app/wall/harness/draft.js";
import { fixtureSetFor, WALL_HARNESS_FIXTURES } from "../src/app/wall/harness/fixtures.js";
import {
  applyHarnessUpdate,
  DEFAULT_FIXTURE_CONTROLS,
  EMPTY_STAGE_STATE,
  HARNESS_PANEL_SIZES,
  HARNESS_UPDATE,
  type HarnessBenchControls,
  type HarnessUpdate,
  parseHarnessUpdate,
} from "../src/app/wall/harness/messages.js";
import {
  IDLE_REBUILD,
  requestRebuild,
  settleRebuild,
} from "../src/app/wall/harness/rebuild-loop.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import { boundDeviceReadOnly, resolveEffectiveMin } from "../src/app/wall/slim.js";
import { WALL_TYPE_RAMP } from "../src/app/wall/type-ramp.js";
import { linkTileLayout } from "../src/app/wall/widgets/link-model.js";
import { temperatureWidgetState } from "../src/app/wall/widgets/temperature-model.js";

/**
 * The wall harness's shell and stage: the pure parts asserted directly; the two
 * documents asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const HARNESS_DIR = join(APP_DIR, "wall/harness");

/** The bench inputs the panel sends, in their default (stage-agreeing) shape. */
function benchControls(): HarnessBenchControls {
  return {
    widget: null,
    contained: false,
    tier: "compact",
    cardForm: "compact",
    rendererHeightPx: 128,
    rowUnit: 56,
  };
}

/** A well-formed panel update, overridable field by field. */
function panelUpdate(overrides: Partial<HarnessUpdate> = {}): HarnessUpdate {
  return {
    type: HARNESS_UPDATE,
    mode: "stage",
    theme: "dark",
    config: DEFAULT_DRAFT,
    fixtures: DEFAULT_FIXTURE_CONTROLS,
    bench: benchControls(),
    ...overrides,
  };
}

/** Comments removed, so prose about a function is not mistaken for a call to it. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(relative: string): Promise<string> {
  return stripComments(await readFile(join(HARNESS_DIR, relative), "utf8"));
}

/** The wall's own layout vocabulary: none of it may appear in a harness module. */
const WALL_LAYOUT_TOKENS = ["gridPlacementStyle", "resolveRowUnit", "resolveBands"];

/** Reads that would let a deployment — rather than a call site — select what the harness shows. */
const RUNTIME_SELECTION_TOKENS = [
  /\bprocess\.env\b/,
  /\bimport\.meta\.env\b/,
  /\blocation\s*\.\s*(?:search|hash)\b/,
  /\bURLSearchParams\b/,
];

describe("the harness draft", () => {
  it("is a profile the shared schema and every widget's own schema accept", () => {
    const parsed = wallProfileConfigSchema.safeParse(DEFAULT_DRAFT);
    expect(parsed.success).toBe(true);

    const layouts = [DEFAULT_DRAFT.widgets, DEFAULT_DRAFT.orientations?.portrait ?? []];
    for (const layout of layouts) {
      const ids = new Set<string>();
      for (const widget of layout) {
        expect(ids.has(widget.id), widget.id).toBe(false);
        ids.add(widget.id);
        expect(WALL_WIDGET_CONFIG_SCHEMAS[widget.type].safeParse(widget.config).success).toBe(true);
        expect(widget.x + widget.w).toBeLessThanOrEqual(WALL_GRID_COLUMNS);
        expect(widget.y + widget.h).toBeLessThanOrEqual(WALL_GRID_MAX_ROWS);
      }
    }
  });

  it("places every widget at or above its effective minimum", () => {
    const layouts = [DEFAULT_DRAFT.widgets, DEFAULT_DRAFT.orientations?.portrait ?? []];
    const devices = new Map(
      WALL_HARNESS_FIXTURES.devices.map((device) => [device.qualifiedId, device]),
    );

    for (const layout of layouts) {
      expect(layout.length).toBeGreaterThan(1);
      for (const widget of layout) {
        const descriptor = WALL_WIDGET_REGISTRY[widget.type];
        const qualifiedId =
          typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
        // The effective minimum reads the widget's bound fixture device, so a control-less
        // typed device may sit at one row while a control-bearing one keeps two.
        const minimum = resolveEffectiveMin(
          descriptor,
          widgetTitle(widget) !== null,
          boundDeviceReadOnly(descriptor, devices.get(qualifiedId)),
        );
        expect(widget.w, `${widget.id} width`).toBeGreaterThanOrEqual(minimum.w);
        expect(widget.h, `${widget.id} height`).toBeGreaterThanOrEqual(minimum.h);
        expect(widget.w, `${widget.id} width`).toBeLessThanOrEqual(descriptor.max.w);
        expect(widget.h, `${widget.id} height`).toBeLessThanOrEqual(descriptor.max.h);
      }
    }
  });

  it("carries a one-row link and a one-row read-only device, so a walk reaches both", () => {
    const layouts = [DEFAULT_DRAFT.widgets, DEFAULT_DRAFT.orientations?.portrait ?? []];
    const devices = new Map(
      WALL_HARNESS_FIXTURES.devices.map((device) => [device.qualifiedId, device]),
    );

    for (const layout of layouts) {
      // The one-row link draws the route flush, so its whole cell is the anchor.
      const link = layout.find((widget) => widget.type === "link");
      if (!link) throw new Error("the draft carries no link widget");
      expect(link.h).toBe(1);
      expect(linkTileLayout(link)).toBe("flush");

      // The one-row read-only device: authorable only through its effective minimum,
      // which the fixture's control-less device resolves.
      const readOnly = layout.find((widget) => {
        if (!isWallDeviceClass(widget.type)) return false;
        const descriptor = WALL_WIDGET_REGISTRY[widget.type];
        const qualifiedId =
          typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
        return boundDeviceReadOnly(descriptor, devices.get(qualifiedId));
      });
      if (!readOnly) throw new Error("the draft carries no one-row read-only device");

      const descriptor = WALL_WIDGET_REGISTRY[readOnly.type];
      expect(readOnly.h).toBe(1);
      expect(resolveEffectiveMin(descriptor, false, true).h).toBe(1);
      // The plain type minimum would not admit it: the fixture's device is what does.
      expect(resolveEffectiveMin(descriptor, false, false).h).toBeGreaterThan(readOnly.h);
    }
  });

  it("fits both panels, so the stage shows the composition rather than the too-large explanation", () => {
    for (const panel of ["landscape", "portrait"] as const) {
      const layout =
        panel === "portrait" ? (DEFAULT_DRAFT.orientations?.portrait ?? []) : DEFAULT_DRAFT.widgets;
      const metrics = wallGridMetrics(HARNESS_PANEL_SIZES[panel].height, layout);

      expect(metrics.outcome, panel).toBe("fits");
    }
  });

  it("groups widgets into zone bands, so the bands are part of what the stage shows", () => {
    const bands = resolveBands(DEFAULT_DRAFT.widgets);

    expect(bands.length).toBeGreaterThan(1);
    for (const band of bands) {
      expect(band.w).toBeGreaterThan(0);
      expect(band.h).toBeGreaterThan(0);
    }
  });

  it("carries a distinct portrait override, so the orientation the stage reports is observable", () => {
    const portrait = DEFAULT_DRAFT.orientations?.portrait ?? [];

    expect(portrait.length).toBeGreaterThan(0);
    expect(portrait.map((widget) => `${widget.id}:${widget.x},${widget.y}`)).not.toEqual(
      DEFAULT_DRAFT.widgets.map((widget) => `${widget.id}:${widget.x},${widget.y}`),
    );
  });

  it("binds a temperature widget to each sensor, so a walk reaches both reading cases", () => {
    // The temperature widget presents its sensor's humidity where the sensor declares one
    // and only its temperature where it does not.
    const devices = new Map(
      WALL_HARNESS_FIXTURES.devices.map((device) => [device.qualifiedId, device]),
    );

    for (const layout of [DEFAULT_DRAFT.widgets, DEFAULT_DRAFT.orientations?.portrait ?? []]) {
      const readings = layout
        .filter((widget) => widget.type === "temperature")
        .map((widget) => {
          const qualifiedId =
            typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
          return temperatureWidgetState(devices.get(qualifiedId) ?? null, qualifiedId);
        });

      expect(
        readings.some((state) => state.status === "reading" && state.humidity !== undefined),
      ).toBe(true);
      expect(
        readings.some((state) => state.status === "reading" && state.humidity === undefined),
      ).toBe(true);
    }
  });
});

describe("the harness panel geometry", () => {
  it("uses the panel's real size as the stage's viewport", () => {
    expect(HARNESS_PANEL_SIZES.landscape).toEqual({ width: 1920, height: 1080 });
    expect(HARNESS_PANEL_SIZES.portrait).toEqual({ width: 1080, height: 1920 });
  });

  it("gives the portrait panel the aspect ratio `(orientation: portrait)` matches", () => {
    // The one thing `useOrientation()` reads is that media query, and it matches on the
    // viewport's aspect ratio — which, inside the stage document, is the panel's.
    expect(HARNESS_PANEL_SIZES.portrait.height).toBeGreaterThan(HARNESS_PANEL_SIZES.portrait.width);
    expect(HARNESS_PANEL_SIZES.landscape.width).toBeGreaterThan(
      HARNESS_PANEL_SIZES.landscape.height,
    );
  });

  it("resolves the hero ramp above its floor at the landscape panel", () => {
    // The ramp's `vmin` term on the panel. `clamp(36px, 5vmin, 76px)` collapses to its floor
    // on a small window — which is why the stage is the panel's own viewport.
    const { width, height } = HARNESS_PANEL_SIZES.landscape;
    const vmin = Math.min(width, height) / 100;
    const hero = Math.min(WALL_TYPE_RAMP.heroMax, Math.max(WALL_TYPE_RAMP.heroMin, 5 * vmin));

    expect(hero).toBeGreaterThan(WALL_TYPE_RAMP.heroMin);
    expect(hero).toBeCloseTo(54);
  });
});

describe("the harness stage document", () => {
  it("mounts the production providers and the production wall grid", async () => {
    const stage = await source("stage.tsx");

    expect(stage).toContain("<RouterProvider");
    expect(stage).toContain("<DataStoreProvider");
    expect(stage).toContain('from "../WallGrid.js"');
    // The grid renders the composition the schema last accepted, never the raw message field.
    expect(stage).toContain("<WallGrid config={config} />");
    expect(stage).toContain("applyHarnessUpdate(current, next)");
    expect(stage).not.toContain("<WallGrid config={update.config} />");
  });

  it("re-implements no wall layout", async () => {
    for (const file of ["stage.tsx", "HarnessPanel.tsx", "draft.ts", "main.tsx"]) {
      const content = await source(file);
      for (const token of WALL_LAYOUT_TOKENS) {
        expect(content, `${file} must not reference ${token}`).not.toContain(token);
      }
    }
  });

  it("applies the panel's fixture controls through the fixture roster", async () => {
    const stage = await source("stage.tsx");

    expect(stage).toContain("fixtureSetFor(update.fixtures)");
    // The store's fixture set is a mount-time input, so the stage remounts its
    // provider when the controls change rather than re-seeding a live one.
    expect(stage).toContain("key={fixtureControlsKey(update.fixtures)}");
  });

  it("reloads the stage for a panel change and for nothing else", async () => {
    const panel = await source("HarnessPanel.tsx");
    const stage = await source("stage.tsx");

    // The iframe carries the panel as its key, so a panel change tears the document down.
    expect(panel).toContain("key={panel}");
    expect(panel).toContain('src="/stage.html"');
    expect(panel).toContain("sendHarnessUpdate(");
    for (const content of [panel, stage]) {
      expect(content).not.toContain("location.reload");
    }
  });

  it("selects nothing from the environment, the query string, or a config key", async () => {
    for (const file of ["stage.tsx", "HarnessPanel.tsx", "main.tsx", "messages.ts", "draft.ts"]) {
      const content = await source(file);
      expect(
        RUNTIME_SELECTION_TOKENS.filter((token) => token.test(content)),
        file,
      ).toEqual([]);
    }
  });
});

describe("the harness dev server's rebuild loop", () => {
  it("starts building when a change arrives and nothing is in flight", () => {
    const requested = requestRebuild(IDLE_REBUILD);

    expect(requested.run).toBe(true);
    expect(requested.next).toEqual({ building: true, pending: false });
  });

  it("coalesces a change that arrives mid-build into a re-run instead of dropping it", () => {
    const building = requestRebuild(IDLE_REBUILD).next;
    const during = requestRebuild(building);

    // The regression this guards: a change landing while a build is in flight
    // must not be swallowed — the loop owes a re-run.
    expect(during.run).toBe(false);
    expect(during.next).toEqual({ building: true, pending: true });
  });

  it("re-runs a finished build when one was owed, and goes idle otherwise", () => {
    const owed = settleRebuild({ building: true, pending: true });
    expect(owed.run).toBe(true);
    expect(owed.next).toEqual({ building: true, pending: false });

    const idle = settleRebuild({ building: true, pending: false });
    expect(idle.run).toBe(false);
    expect(idle.next).toEqual(IDLE_REBUILD);
  });

  it("builds exactly twice for a change that lands during the first build", () => {
    // One pass of the loop, in order: a change starts a build, a second change
    // arrives while it runs, the build finishes, and the owed re-run happens.
    let state = IDLE_REBUILD;
    let builds = 0;
    let transitions = 0;

    const request = () => {
      const requested = requestRebuild(state);
      state = requested.next;
      if (requested.run) builds += 1;
      transitions += 1;
    };
    const settle = () => {
      const settled = settleRebuild(state);
      state = settled.next;
      if (settled.run) builds += 1;
      transitions += 1;
    };

    request(); // change one: build starts
    request(); // change two, mid-build: coalesced
    settle(); // build one finished: the owed re-run starts
    settle(); // build two finished: nothing owed

    expect(builds).toBe(2);
    expect(transitions).toBe(4);
    expect(state).toEqual(IDLE_REBUILD);
  });
});

describe("the harness message contract", () => {
  it("accepts the panel's update and the stage's readiness announcement", () => {
    const update = parseHarnessUpdate(panelUpdate());

    expect(update?.mode).toBe("stage");
    expect(update?.theme).toBe("dark");
    expect(update?.config).toEqual(DEFAULT_DRAFT);
    expect(update?.fixtures).toEqual(DEFAULT_FIXTURE_CONTROLS);
    expect(update?.bench.widget).toBeNull();
  });

  it("ignores a malformed message rather than throwing on it", () => {
    const valid = panelUpdate();

    const rejected: readonly unknown[] = [
      undefined,
      null,
      "harness:update",
      { type: "some:other" },
      { ...valid, mode: "somewhere" },
      { ...valid, theme: "sepia" },
      { ...valid, fixtures: { ...DEFAULT_FIXTURE_CONTROLS, device: "nope" } },
      { ...valid, fixtures: { ...DEFAULT_FIXTURE_CONTROLS, on: "yes" } },
      { ...valid, fixtures: { ...DEFAULT_FIXTURE_CONTROLS, brightnessPercent: Number.NaN } },
      { ...valid, bench: { ...benchControls(), tier: "huge" } },
      { ...valid, bench: { ...benchControls(), rendererHeightPx: Number.POSITIVE_INFINITY } },
      { ...valid, bench: { ...benchControls(), widget: { id: "x" } } },
    ];

    for (const message of rejected) {
      expect(parseHarnessUpdate(message)).toBeNull();
    }
  });

  it("refuses a composition the schema rejects without discarding the rest of the message", () => {
    // A draft the panel's controls can author into an invalid state: the composition must
    // not reach the stage, but the surface, scheme, fixture controls, and bench must.
    const refused = panelUpdate({
      mode: "bench",
      theme: "light",
      config: { widgets: [{ id: "overlapping" }] } as never,
      fixtures: { ...DEFAULT_FIXTURE_CONTROLS, device: "cover", on: false },
      bench: { ...benchControls(), tier: "roomy", rendererHeightPx: 200 },
    });
    const update = parseHarnessUpdate(refused);

    expect(update).not.toBeNull();
    expect(update?.config).toBeNull();
    expect(update?.mode).toBe("bench");
    expect(update?.theme).toBe("light");
    expect(update?.fixtures.device).toBe("cover");
    expect(update?.fixtures.on).toBe(false);
    expect(update?.bench.tier).toBe("roomy");
    expect(update?.bench.rendererHeightPx).toBe(200);
  });

  it("keeps the composition the schema last accepted while a refused draft is fixed", () => {
    const accepted = parseHarnessUpdate(panelUpdate());
    if (accepted === null || accepted.config === null) throw new Error("the draft must parse");

    const state = applyHarnessUpdate(EMPTY_STAGE_STATE, accepted);
    expect(state.config).toEqual(DEFAULT_DRAFT);

    // A refused draft applies everything else and leaves the composition alone…
    const refused = parseHarnessUpdate(
      panelUpdate({ theme: "light", config: { widgets: [{ id: "overlapping" }] } as never }),
    );
    if (refused === null) throw new Error("the message itself must still be accepted");
    const next = applyHarnessUpdate(state, refused);

    expect(next.config).toEqual(DEFAULT_DRAFT);
    expect(next.update?.theme).toBe("light");

    // …and a later valid draft replaces it.
    const recovered = parseHarnessUpdate(
      panelUpdate({ config: { widgets: [] } as never, theme: "light" }),
    );
    if (recovered === null || recovered.config === null) throw new Error("the draft must parse");

    expect(applyHarnessUpdate(next, recovered).config).toEqual({ widgets: [] });
  });

  it("clamps a control percentage instead of letting it reach the fixture", () => {
    const update = parseHarnessUpdate(
      panelUpdate({
        fixtures: { ...DEFAULT_FIXTURE_CONTROLS, brightnessPercent: 900, colorTempPercent: -40 },
      }),
    );

    expect(update?.fixtures.brightnessPercent).toBe(100);
    expect(update?.fixtures.colorTempPercent).toBe(0);
  });
});

describe("the harness fixture controls", () => {
  it("drives the selected device through its declared capabilities", () => {
    const controls = {
      ...DEFAULT_FIXTURE_CONTROLS,
      device: "light",
      on: false,
      brightnessPercent: 70,
    } as const;
    const light = fixtureSetFor(controls).devices.find(
      (device) => device.qualifiedId === "fixture:light-kitchen",
    );

    // The declared 0-254 brightness range, and the declared "ON"/"OFF" encoding
    // the capability authors — driven through the shared helpers, not a literal.
    expect(light?.state.brightness).toBe(178);
    expect(light?.state.state).toBe("OFF");
    expect(light?.state.color_temp).toBe(327);
  });

  it("removes the selected device from the map when it is not present", () => {
    const set = fixtureSetFor({
      ...DEFAULT_FIXTURE_CONTROLS,
      device: "cover",
      devicePresent: false,
    });

    expect(set.devices.some((device) => device.qualifiedId === "fixture:cover-blinds")).toBe(false);
    // The room keeps the authored membership and reports the member unavailable —
    // exactly how the store derives a room from a snapshot whose device is gone.
    const member = set.rooms[0]?.members.find(
      (entry) => entry.qualifiedId === "fixture:cover-blinds",
    );
    expect(member?.available).toBe(false);
    expect(member?.device).toBeNull();
  });

  it("keeps every other device when one is absent", () => {
    const set = fixtureSetFor({
      ...DEFAULT_FIXTURE_CONTROLS,
      device: "light",
      devicePresent: false,
    });

    expect(set.devices.length).toBe(WALL_HARNESS_FIXTURES.devices.length - 1);
    expect(set.devices.some((device) => device.qualifiedId === "fixture:switch-hall")).toBe(true);
  });

  it("withholds the two readings the panel switches off, so those widgets fetch again", () => {
    const supplied = fixtureSetFor(DEFAULT_FIXTURE_CONTROLS);
    const withheld = fixtureSetFor({ ...DEFAULT_FIXTURE_CONTROLS, weather: false, energy: false });

    expect(supplied.weather).toBeDefined();
    expect(supplied.energy).toBeDefined();
    expect(withheld.weather).toBeUndefined();
    expect(withheld.energy).toBeUndefined();
  });

  it("reports an unavailable room member when its device is absent", () => {
    const set = fixtureSetFor({
      ...DEFAULT_FIXTURE_CONTROLS,
      device: "entity",
      devicePresent: false,
    });
    const member = set.rooms[0]?.members.find(
      (entry) => entry.qualifiedId === "fixture:sensor-hall",
    );

    expect(member?.available).toBe(false);
    expect(member?.device).toBeNull();
  });
});
