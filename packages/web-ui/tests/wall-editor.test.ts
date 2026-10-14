import { describe, expect, it, mock } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  WALL_GRID_COLUMNS,
  WALL_GRID_MAX_ROWS,
  WALL_WIDGET_TYPES,
  WALL_ZONE_MAX_LENGTH,
  type WallProfileConfig,
  type WallWidget,
  type WallWidgetType,
} from "@ts-ha/shared";
import {
  addWidget,
  draftFitError,
  emptyWallConfig,
  removeWidget,
  setLinkTarget,
  submitProfileDraft,
  toggleDeviceSelection,
  updateWidgetConfig,
  updateWidgetPlacement,
  updateWidgetZone,
  validateProfileDraft,
} from "../src/app/wall/editor/model.js";
import { getWidgetDescriptor, WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import { WALL_TITLE_ROWS } from "../src/app/wall/span.js";

const EDITOR_DIR = join(import.meta.dir, "..", "src/app/wall/editor");
const EDITOR = join(EDITOR_DIR, "WallEditor.tsx");
const FIELDS = join(EDITOR_DIR, "WidgetConfigFields.tsx");

/** Removes block and line comments so prose is not mistaken for markup. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function readSource(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

function single(type: WallWidgetType): WallProfileConfig {
  return addWidget(emptyWallConfig(), type);
}

/** A base layout tiled edge-to-edge with `{w, h}` widgets up to `rows`. */
function packedGrid(w: number, h: number, rows: number): WallWidget[] {
  const widgets: WallWidget[] = [];
  for (let y = 0; y + h <= rows; y += h) {
    for (let x = 0; x + w <= WALL_GRID_COLUMNS; x += w) {
      widgets.push({ id: `packed-${y}-${x}`, type: "clock", config: {}, x, y, w, h });
    }
  }
  return widgets;
}

/** The widget at `index`, or a thrown error — keeps the tests free of non-null assertions. */
function widgetAt(config: WallProfileConfig, index: number): WallWidget {
  const widget = config.widgets[index];
  if (!widget) throw new Error(`expected a widget at index ${index}`);
  return widget;
}

/**
 * The minimum type-specific config a widget needs to validate. A room, device,
 * temperature, scene, link, or device-grid widget cannot be meaningful without a
 * selection, so the profile validator rejects it until one is made — the editor
 * surfaces exactly that.
 */
const REQUIRED_CONFIG: Partial<Record<WallWidgetType, Record<string, unknown>>> = {
  room: { roomId: "kitchen" },
  device: { qualifiedId: "zigbee:0xabc123" },
  temperature: { qualifiedId: "zigbee:0xabc123" },
  scene: { automation: "good-night", label: "Good night" },
  link: { target: "Kitchen" },
  devices: { qualifiedIds: ["zigbee:0xabc123"] },
};

function withRequiredConfig(config: WallProfileConfig): WallProfileConfig {
  let next = config;
  for (const widget of config.widgets) {
    const required = REQUIRED_CONFIG[widget.type];
    if (required) next = updateWidgetConfig(next, widget.id, required);
  }
  return next;
}

describe("addWidget", () => {
  it("adds every supported type with its defaults at a free, in-grid position", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const config = withRequiredConfig(addWidget(emptyWallConfig(), type));
      expect(config.widgets).toHaveLength(1);

      const widget = widgetAt(config, 0);
      const descriptor = getWidgetDescriptor(type);
      expect(widget.type).toBe(type);
      expect(widget.w).toBe(descriptor.defaults.w);
      expect(widget.h).toBe(descriptor.defaults.h);
      expect(widget.x).toBeGreaterThanOrEqual(0);
      expect(widget.y).toBeGreaterThanOrEqual(0);
      expect(widget.x + widget.w).toBeLessThanOrEqual(WALL_GRID_COLUMNS);
      expect(validateProfileDraft("profile", config).ok).toBe(true);
    }
  });

  it("places successive widgets without overlap and with unique ids", () => {
    let config = emptyWallConfig();
    for (const type of WALL_WIDGET_TYPES) config = addWidget(config, type);
    config = withRequiredConfig(config);

    expect(config.widgets).toHaveLength(WALL_WIDGET_TYPES.length);
    const ids = new Set(config.widgets.map((widget) => widget.id));
    expect(ids.size).toBe(config.widgets.length);

    const validation = validateProfileDraft("profile", config);
    expect(validation.ok).toBe(true);
  });

  it("clamps a placement to the row bound on a packed profile", () => {
    const descriptor = getWidgetDescriptor("clock");
    const config: WallProfileConfig = {
      widgets: packedGrid(descriptor.defaults.w, descriptor.defaults.h, WALL_GRID_MAX_ROWS),
    };

    const added = addWidget(config, "clock");
    const widget = widgetAt(added, added.widgets.length - 1);
    expect(widget.y + widget.h).toBeLessThanOrEqual(WALL_GRID_MAX_ROWS);

    const result = validateProfileDraft("packed", withRequiredConfig(added));
    if (!result.ok) {
      expect(result.errors.join(" ")).not.toContain("row grid");
    }
  });
});

describe("updateWidgetPlacement", () => {
  it("clamps a span below the type minimum up to the minimum", () => {
    const config = single("clock");
    const id = widgetAt(config, 0).id;
    const updated = updateWidgetPlacement(config, id, { x: 0, y: 0, w: 1, h: 1 });

    const descriptor = getWidgetDescriptor("clock");
    expect(widgetAt(updated, 0).w).toBe(descriptor.min.w);
    expect(widgetAt(updated, 0).h).toBe(descriptor.min.h);
  });

  it("clamps a span above the type maximum down to the maximum", () => {
    const config = single("clock");
    const id = widgetAt(config, 0).id;
    const updated = updateWidgetPlacement(config, id, { x: 0, y: 0, w: 99, h: 99 });

    const descriptor = getWidgetDescriptor("clock");
    expect(widgetAt(updated, 0).w).toBe(descriptor.max.w);
    expect(widgetAt(updated, 0).h).toBe(descriptor.max.h);
  });

  it("clamps x to the grid bound and y to at least zero", () => {
    let config = single("device");
    const id = widgetAt(config, 0).id;
    config = updateWidgetConfig(config, id, { qualifiedId: "zigbee:0xabc123" });
    const updated = updateWidgetPlacement(config, id, { x: 11, y: -4, w: 6, h: 3 });

    const widget = widgetAt(updated, 0);
    expect(widget.w).toBe(6);
    expect(widget.x).toBe(WALL_GRID_COLUMNS - widget.w);
    expect(widget.y).toBe(0);
    expect(validateProfileDraft("profile", updated).ok).toBe(true);
  });

  it("clamps y so a widget stays within the row bound", () => {
    const config = single("clock");
    const id = widgetAt(config, 0).id;
    const updated = updateWidgetPlacement(config, id, { x: 0, y: 9999, w: 4, h: 2 });

    const widget = widgetAt(updated, 0);
    expect(widget.y).toBe(WALL_GRID_MAX_ROWS - widget.h);
    expect(widget.y + widget.h).toBeLessThanOrEqual(WALL_GRID_MAX_ROWS);
    expect(validateProfileDraft("profile", updated).ok).toBe(true);
  });
});

describe("removeWidget", () => {
  it("removes a widget by id and is a no-op for an unknown id", () => {
    const config = addWidget(addWidget(emptyWallConfig(), "clock"), "scene");
    const removedId = widgetAt(config, 0).id;

    const after = removeWidget(config, removedId);
    expect(after.widgets).toHaveLength(1);
    expect(after.widgets.some((widget) => widget.id === removedId)).toBe(false);

    const unchanged = removeWidget(after, "does-not-exist");
    expect(unchanged.widgets).toHaveLength(1);
  });
});

describe("updateWidgetConfig", () => {
  it("merges a patch into the widget's config, leaving other keys intact", () => {
    const config = single("room");
    const id = widgetAt(config, 0).id;
    const updated = updateWidgetConfig(config, id, { roomId: "kitchen" });
    expect(widgetAt(updated, 0).config).toEqual({ roomId: "kitchen" });

    const withTitle = updateWidgetConfig(updated, id, { title: "Kitchen" });
    expect(widgetAt(withTitle, 0).config).toEqual({ roomId: "kitchen", title: "Kitchen" });
  });
});

describe("validateProfileDraft", () => {
  it("accepts a composed profile and returns the parsed profile", () => {
    let config = emptyWallConfig();
    config = addWidget(config, "clock");
    config = addWidget(config, "weather");
    config = addWidget(config, "scene");

    const clockId = widgetAt(config, 0).id;
    const sceneId = widgetAt(config, 2).id;
    config = updateWidgetPlacement(config, clockId, { x: 0, y: 0, w: 3, h: 2 });
    config = updateWidgetConfig(config, sceneId, { automation: "good-night", label: "Good night" });

    const result = validateProfileDraft("kitchen", config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.name).toBe("kitchen");
      expect(result.profile.config.widgets).toHaveLength(3);
    }
  });

  it("rejects a blank name", () => {
    const result = validateProfileDraft("   ", emptyWallConfig());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects overlapping widgets with a descriptive error", () => {
    const config: WallProfileConfig = {
      widgets: [
        { id: "a", type: "clock", config: {}, x: 0, y: 0, w: 4, h: 2 },
        { id: "b", type: "clock", config: {}, x: 2, y: 1, w: 4, h: 2 },
      ],
    };
    const result = validateProfileDraft("overlap", config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("overlap");
  });

  it("normalises a legacy sub-minimum placement when the widget is edited", () => {
    // A profile authored before a type's minimum was re-derived can still carry a
    // shorter or narrower cell. The wall explains such a cell rather than clipping
    // it (`composesMinimumSpan`), and the editor's own clamp is what brings the
    // widget up to a renderable size on the next edit — deliberate, not
    // accidental: the draft validator surfaces any resulting overlap or overflow.
    const legacy: WallProfileConfig = {
      widgets: [{ id: "fav", type: "favorites", config: {}, x: 0, y: 0, w: 6, h: 3 }],
    };
    const edited = updateWidgetPlacement(legacy, "fav", { x: 1, y: 0, w: 6, h: 3 });

    expect(widgetAt(edited, 0).h).toBe(WALL_WIDGET_REGISTRY.favorites.min.h);
    expect(widgetAt(edited, 0).h).toBeGreaterThan(3);

    // The width axis is normalised the same way, because the guard explains a
    // sub-minimum width too — a narrow cell reflows a card's control or tile row.
    const narrow: WallProfileConfig = {
      widgets: [{ id: "fav", type: "favorites", config: {}, x: 0, y: 0, w: 1, h: 6 }],
    };
    const widened = updateWidgetPlacement(narrow, "fav", { x: 0, y: 0, w: 1, h: 6 });

    expect(widgetAt(widened, 0).w).toBe(WALL_WIDGET_REGISTRY.favorites.min.w);
    expect(WALL_WIDGET_REGISTRY.favorites.min.w).toBeGreaterThan(1);
  });

  it("floors a titled card one row above the type's minimum", () => {
    // A configured title is drawn above the renderer inside the same cell, so the
    // placement control cannot leave a titled card below the box its type's
    // minimum span needs — the same title block the render guard subtracts.
    const descriptor = WALL_WIDGET_REGISTRY.device;
    const config = withRequiredConfig(single("device"));
    const id = widgetAt(config, 0).id;
    const titled = updateWidgetConfig(config, id, { title: "Hallway" });

    const resized = updateWidgetPlacement(titled, id, {
      x: 0,
      y: 0,
      w: descriptor.min.w,
      h: descriptor.min.h,
    });
    const widget = widgetAt(resized, 0);

    expect(widget.h).toBe(descriptor.min.h + WALL_TITLE_ROWS);
    expect(widget.w).toBe(descriptor.min.w);
    expect(validateProfileDraft("titled", resized).ok).toBe(true);

    // The same card without a title keeps the type's own floor, so the clause is
    // the title's, not a blanket raise.
    const untitled = updateWidgetPlacement(config, id, {
      x: 0,
      y: 0,
      w: descriptor.min.w,
      h: descriptor.min.h,
    });
    expect(widgetAt(untitled, 0).h).toBe(descriptor.min.h);
  });

  it("rejects an out-of-grid placement", () => {
    const config: WallProfileConfig = {
      widgets: [{ id: "a", type: "clock", config: {}, x: 10, y: 0, w: 4, h: 2 }],
    };
    const result = validateProfileDraft("out-of-grid", config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("grid");
  });

  it("rejects an unknown widget type", () => {
    const config = {
      widgets: [{ id: "a", type: "mystery", config: {}, x: 0, y: 0, w: 4, h: 2 }],
    } as unknown as WallProfileConfig;
    const result = validateProfileDraft("unknown-type", config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ").toLowerCase()).toContain("invalid");
  });

  it("reports the titled sub-minimum case a resize cannot see", () => {
    // A title set after the widget was placed never passes through the placement
    // clamp, so the validator is what refuses to save it — the wall would have to
    // explain the card instead of rendering it (specs/wall-display "A widget
    // cannot be under-sized").
    const descriptor = WALL_WIDGET_REGISTRY.device;
    const config = withRequiredConfig(single("device"));
    const id = widgetAt(config, 0).id;
    const titled = updateWidgetConfig(config, id, { title: "Hallway" });

    expect(validateProfileDraft("untitled", config).ok).toBe(true);

    const result = validateProfileDraft("titled", titled);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const message = result.errors.join(" ");
      expect(message).toContain(id);
      expect(message).toContain("minimum");
      expect(message).toContain("title");
    }
    expect(descriptor.min.h + WALL_TITLE_ROWS).toBeGreaterThan(descriptor.min.h);
  });

  it("bounds the height field by the floor the clamp enforces", async () => {
    const editor = await readSource(EDITOR);

    // The form cannot offer a height the clamp and the validator both refuse, so
    // the title's extra row is the field's own minimum too.
    expect(editor).toContain("widgetTitle(widget) !== null ? WALL_TITLE_ROWS : 0");
    expect(editor).toContain("min={minHeight}");
    expect(editor).not.toContain("min={descriptor.min.h}");
  });

  it("rejects a widget placed below its type's minimum width", () => {
    // The same rule on the width axis, for a profile written through the API: a
    // sub-minimum width reflows the card's control or tile row.
    const descriptor = WALL_WIDGET_REGISTRY.favorites;
    const config: WallProfileConfig = {
      widgets: [{ id: "fav", type: "favorites", config: {}, x: 0, y: 0, w: 1, h: 6 }],
    };
    const result = validateProfileDraft("narrow", config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("minimum");
    expect(descriptor.min.w).toBeGreaterThan(1);
  });

  it("rejects a widget whose type-specific config is incomplete", () => {
    const config = addWidget(emptyWallConfig(), "room");
    const id = widgetAt(config, 0).id;
    const result = validateProfileDraft("room", config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain(id);
  });

  it("reports an incomplete widget config once, labelled by widget id", () => {
    const config = addWidget(emptyWallConfig(), "room");
    const id = widgetAt(config, 0).id;
    const result = validateProfileDraft("room", config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(id);
    }
  });
});

describe("widget list layout (task 7.1)", () => {
  const EDITOR = join(import.meta.dir, "..", "src/app/wall/editor/WallEditor.tsx");

  /** Removes block and line comments so prose is not mistaken for markup. */
  function stripComments(content: string): string {
    return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  }

  async function editorSource(): Promise<string> {
    return stripComments(await readFile(EDITOR, "utf8"));
  }

  it("lays the widget list out in a responsive grid — two columns wide, one narrow", async () => {
    const source = await editorSource();
    // A profile with many widgets is laid out two-up on a wide viewport; the
    // same grid collapses to a single column below the `md` breakpoint.
    expect(source).toContain("<Grid");
    expect(source).toContain("columns={1} md={2}");
    expect(source).toContain("config.widgets.map((widget) =>");
  });

  it("keeps each widget a self-contained card with its own surface", async () => {
    const source = await editorSource();
    // Every mapped widget renders through WidgetRow, which draws its own Card.
    expect(source).toContain("<WidgetRow");
    expect(source).toContain("<Card>");
  });

  it("does not introduce horizontal scrolling on a narrow viewport", async () => {
    const source = await editorSource();
    // The grid wraps rather than overflowing; the list uses no scroll area,
    // non-wrapping row, or horizontal scroll container.
    expect(source).not.toContain("ScrollArea");
    expect(source).not.toMatch(/overflowX|whiteSpace:\s*"nowrap"|wrap="nowrap"/);
  });
});

describe("submitProfileDraft", () => {
  it("does not call the persist callback when validation fails", async () => {
    const persist = mock(async () => {});
    const result = await submitProfileDraft("", emptyWallConfig(), persist);

    expect(result.ok).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it("calls the persist callback once with the parsed config when validation passes", async () => {
    const persist = mock(async () => {});
    const config = addWidget(emptyWallConfig(), "clock");
    const result = await submitProfileDraft("kitchen", config, persist);

    expect(result.ok).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    const calls = (persist as ReturnType<typeof mock>).mock.calls;
    const passed = calls[0]?.[0] as WallProfileConfig | undefined;
    expect(passed?.widgets).toHaveLength(1);
  });
});

describe("the zone field (task 6.1)", () => {
  const ZONED = "Climate";
  /** A draft with one clock widget, whose id the tests address by. */
  function clockDraft(): { config: WallProfileConfig; id: string } {
    const config = addWidget(emptyWallConfig(), "clock");
    return { config, id: widgetAt(config, 0).id };
  }

  it("sets a widget's zone label, trimmed", () => {
    const { config, id } = clockDraft();
    const zoned = updateWidgetZone(config, id, `  ${ZONED}  `);

    expect(widgetAt(zoned, 0).zone).toBe(ZONED);
    expect(widgetAt(zoned, 0).config).toEqual({});
  });

  it("clears a zone outright, so the widget renders outside every band", () => {
    const { config, id } = clockDraft();
    const zoned = updateWidgetZone(config, id, ZONED);

    for (const blank of ["", "   "]) {
      const cleared = updateWidgetZone(zoned, id, blank);
      expect("zone" in widgetAt(cleared, 0)).toBe(false);
    }
  });

  it("leaves another widget's zone untouched", () => {
    let config = addWidget(emptyWallConfig(), "clock");
    config = addWidget(config, "weather");
    const [first, second] = config.widgets;
    if (!first || !second) throw new Error("expected two widgets");

    const zoned = updateWidgetZone(config, second.id, ZONED);
    expect("zone" in widgetAt(zoned, 0)).toBe(false);
    expect(widgetAt(zoned, 1).zone).toBe(ZONED);
  });

  it("round-trips a zone through save validation", () => {
    const { config, id } = clockDraft();
    const zoned = updateWidgetZone(config, id, ZONED);
    const result = validateProfileDraft("kitchen", zoned);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.config.widgets[0]?.zone).toBe(ZONED);
  });

  it("refuses a zone longer than the shared contract's bound", () => {
    const { config, id } = clockDraft();
    const zoned = updateWidgetZone(config, id, "z".repeat(WALL_ZONE_MAX_LENGTH + 1));

    expect(validateProfileDraft("kitchen", zoned).ok).toBe(false);
  });

  it("bounds the field by the shared contract's limit, not a repeated literal", async () => {
    const fields = await readSource(FIELDS);
    expect(fields).toContain("maxLength={WALL_ZONE_MAX_LENGTH}");
    expect(fields).toContain("WALL_ZONE_MAX_LENGTH,");
  });
});

describe("the link and device-grid fields (task 6.3)", () => {
  it("round-trips a link's target profile through save validation", () => {
    const config = addWidget(emptyWallConfig(), "link");
    const id = widgetAt(config, 0).id;
    const withTarget = setLinkTarget(config, id, "  Kitchen  ");

    expect(widgetAt(withTarget, 0).config.target).toBe("Kitchen");
    expect(validateProfileDraft("kitchen", withTarget).ok).toBe(true);
  });

  it("refuses an emptied link target rather than saving a link to nothing", () => {
    const config = addWidget(emptyWallConfig(), "link");
    const id = widgetAt(config, 0).id;

    expect(validateProfileDraft("kitchen", setLinkTarget(config, id, "   ")).ok).toBe(false);
  });

  it("round-trips a device grid's explicit selection through save validation", () => {
    const config = addWidget(emptyWallConfig(), "devices");
    const id = widgetAt(config, 0).id;
    const one = toggleDeviceSelection(config, id, "zigbee:a");
    const two = toggleDeviceSelection(one, id, "zigbee:b");

    // The authored order is the selection order: the grid renders exactly this
    // set (specs/wall-display "A device grid's devices are selected").
    expect(widgetAt(two, 0).config.qualifiedIds).toEqual(["zigbee:a", "zigbee:b"]);
    expect(validateProfileDraft("kitchen", two).ok).toBe(true);
  });

  it("removes a device from the selection", () => {
    let config = addWidget(emptyWallConfig(), "devices");
    const id = widgetAt(config, 0).id;
    config = toggleDeviceSelection(config, id, "zigbee:a");
    config = toggleDeviceSelection(config, id, "zigbee:b");
    const removed = toggleDeviceSelection(config, id, "zigbee:a");

    expect(widgetAt(removed, 0).config.qualifiedIds).toEqual(["zigbee:b"]);
  });

  it("refuses a selection the author emptied", () => {
    const config = addWidget(emptyWallConfig(), "devices");
    const id = widgetAt(config, 0).id;
    const one = toggleDeviceSelection(config, id, "zigbee:a");
    const none = toggleDeviceSelection(one, id, "zigbee:a");

    expect(widgetAt(none, 0).config.qualifiedIds).toEqual([]);
    expect(validateProfileDraft("kitchen", none).ok).toBe(false);
  });

  it("configures both fields in the widget's own form", async () => {
    const fields = await readSource(FIELDS);
    // A link's target profile and a device grid's explicit device selection.
    expect(fields).toContain('case "link"');
    expect(fields).toContain('text("target")');
    expect(fields).toContain('case "devices"');
    expect(fields).toContain("deviceGridIds(widget.config)");
    expect(fields).toContain('type="multiple"');
  });

  it("normalises a link's target through the model, not a raw config patch", async () => {
    const fields = await readSource(FIELDS);
    const editor = await readSource(EDITOR);

    // The trim rule lives in the model, so the field hands it the target.
    expect(fields).toContain("onChange={onLinkTarget}");
    expect(editor).toContain("setLinkTarget(config, widget.id, target)");
  });
});

describe("the draft preview and its save gate (task 6.2)", () => {
  /** A draft whose composition is taller than the panel at the wall's floors. */
  function unfittableConfig(): WallProfileConfig {
    return {
      widgets: [
        { id: "tall", type: "clock", config: {}, x: 0, y: 0, w: 12, h: WALL_GRID_MAX_ROWS },
      ],
    };
  }

  it("reports the verdict and refuses to persist an unfittable draft", async () => {
    const config = unfittableConfig();
    const fitError = draftFitError(config);
    expect(fitError).toContain("Too large");

    const persist = mock(async () => {});
    const result = await submitProfileDraft("kitchen", config, persist);

    expect(result.ok).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    if (!result.ok) expect(result.errors).toEqual([fitError]);
  });

  it("persists a draft that fits its panel", async () => {
    const persist = mock(async () => {});
    const config = addWidget(emptyWallConfig(), "clock");

    expect(draftFitError(config)).toBeNull();
    expect((await submitProfileDraft("kitchen", config, persist)).ok).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("renders the draft at the panel's ratio, with its verdict and page counts", async () => {
    const source = await readSource(EDITOR);

    expect(source).toContain("resolveDraftPreview(config)");
    expect(source).toContain("aspectRatio:");
    expect(source).toContain("DraftWireframe");
    expect(source).toContain("preview.summary");
    expect(source).toContain("preview.grids.map");
    expect(source).toContain("grid.pages");
  });

  it("blocks the save control while the draft cannot fit", async () => {
    const source = await readSource(EDITOR);

    expect(source).toContain('preview.fit === "tooLarge"');
    expect(source).toContain("disabled={saving || unfittable}");
    expect(source).toContain("Saving is blocked until the draft fits.");
  });

  it("draws a wireframe: no wall widget and no Hearth in the editor", async () => {
    for (const file of [
      EDITOR,
      FIELDS,
      join(EDITOR_DIR, "preview.ts"),
      join(EDITOR_DIR, "model.ts"),
    ]) {
      const source = await readSource(file);
      expect(source).not.toContain("hearth.css");
      expect(source).not.toContain("--hearth-");
      expect(source).not.toContain("<WallGrid");
      expect(source).not.toContain("WidgetFrame");
    }
  });
});
