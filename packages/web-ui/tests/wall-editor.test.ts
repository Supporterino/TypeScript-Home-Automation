import { describe, expect, it, mock } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Capability,
  type DeviceDescriptor,
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
  offeredDevices,
  removeWidget,
  setLinkTarget,
  submitProfileDraft,
  toggleDeviceSelection,
  updateWidgetConfig,
  updateWidgetPlacement,
  updateWidgetZone,
  validateProfileDraft,
} from "../src/app/wall/editor/model.js";
import { resolveDraftPreview } from "../src/app/wall/editor/preview.js";
import { ROW_UNIT_MAX, ROW_UNIT_MIN } from "../src/app/wall/grid.js";
import { resolvePagedTiles } from "../src/app/wall/pages.js";
import { getWidgetDescriptor, WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import {
  boundDeviceReadOnly,
  effectiveSpanDescriptor,
  resolveEffectiveMin,
} from "../src/app/wall/slim.js";
import { WALL_TITLE_BLOCK_PX, WALL_TITLE_ROWS } from "../src/app/wall/span.js";

const EDITOR_DIR = join(import.meta.dir, "..", "src/app/wall/editor");
const EDITOR = join(EDITOR_DIR, "WallEditor.tsx");
const FIELDS = join(EDITOR_DIR, "WidgetConfigFields.tsx");
const SLIM = join(import.meta.dir, "..", "src/app/wall/slim.ts");

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
 * The minimum type-specific config a widget needs to validate.
 */
const REQUIRED_CONFIG: Partial<Record<WallWidgetType, Record<string, unknown>>> = {
  room: { roomId: "kitchen" },
  light: { qualifiedId: "zigbee:0xabc123" },
  cover: { qualifiedId: "zigbee:0xabc123" },
  fan: { qualifiedId: "zigbee:0xabc123" },
  climate: { qualifiedId: "zigbee:0xabc123" },
  lock: { qualifiedId: "zigbee:0xabc123" },
  number: { qualifiedId: "zigbee:0xabc123" },
  select: { qualifiedId: "zigbee:0xabc123" },
  entity: { qualifiedId: "zigbee:0xabc123" },
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

  it("keeps a scene at one row, its newly authored minimum", () => {
    // The editor's size rule is the descriptor's own minimum, so a one-row scene is
    // authorable and survives validation.
    const descriptor = getWidgetDescriptor("scene");
    expect(descriptor.min).toEqual({ w: 2, h: 1 });

    const config = withRequiredConfig(single("scene"));
    const id = widgetAt(config, 0).id;
    const updated = updateWidgetPlacement(config, id, { x: 0, y: 0, w: 2, h: 1 });

    expect(widgetAt(updated, 0).h).toBe(1);
    expect(validateProfileDraft("scene", updated).ok).toBe(true);
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
    let config = single("light");
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
    // A profile authored before a type's minimum was re-derived can still carry a shorter
    // cell; the editor's own clamp brings the widget up to a renderable size on the next edit.
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
    // A configured title is drawn above the renderer inside the same cell, so the placement
    // control cannot leave a titled card below the box its type's minimum span needs.
    const descriptor = WALL_WIDGET_REGISTRY.light;
    const config = withRequiredConfig(single("light"));
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
    // A title set after the widget was placed never passes through the placement clamp, so
    // the validator is what refuses to save it.
    const descriptor = WALL_WIDGET_REGISTRY.light;
    const config = withRequiredConfig(single("light"));
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

describe("widget list layout", () => {
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

describe("the zone field", () => {
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

describe("the link and device-grid fields", () => {
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

    // The authored order is the selection order: the grid renders exactly this set.
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

describe("the draft preview and its save gate", () => {
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

describe("the typed device widget configuration", () => {
  const MODEL = join(EDITOR_DIR, "model.ts");

  /** A Zigbee/Nanoleaf light: an on/off switch plus a writable brightness. */
  const LIGHT_CAPS: Capability[] = [
    {
      kind: "switch",
      property: "on",
      access: { readable: true, writable: true },
      valueType: "boolean",
      valueOn: true,
      valueOff: false,
    },
    {
      kind: "numeric",
      property: "brightness",
      access: { readable: true, writable: true },
      valueType: "numeric",
      range: { min: 0, max: 100 },
    },
  ];

  /** A cover: a writable position. */
  const COVER_CAPS: Capability[] = [
    {
      kind: "numeric",
      property: "position",
      access: { readable: true, writable: true },
      valueType: "numeric",
      range: { min: 0, max: 100 },
    },
  ];

  /** A Shelly switch: on/off only — the fallback entity class. */
  const SWITCH_CAPS: Capability[] = [
    {
      kind: "switch",
      property: "on",
      access: { readable: true, writable: true },
      valueType: "boolean",
      valueOn: true,
      valueOff: false,
    },
  ];

  /** A read-only temperature sensor — an entity with no driveable class. */
  const SENSOR_CAPS: Capability[] = [
    {
      kind: "numeric",
      property: "temperature",
      access: { readable: true, writable: false },
      valueType: "numeric",
      unit: "°C",
    },
  ];

  function descriptor(qualifiedId: string, capabilities: Capability[]): DeviceDescriptor {
    return {
      source: "zigbee",
      id: qualifiedId,
      qualifiedId,
      displayName: qualifiedId,
      state: {},
      capabilities,
      reachable: true,
      observation: { mode: "push", observedAt: 0 },
      hidden: false,
    };
  }

  it("offers only the devices whose capabilities can drive the widget's class", () => {
    // The wall's own resolver decides the offer, so a `light` widget offers the lamp and
    // never the blind or the sensor.
    const devices = [
      descriptor("zigbee:lamp", LIGHT_CAPS),
      descriptor("shelly:blind", COVER_CAPS),
      descriptor("zigbee:sensor", SENSOR_CAPS),
      descriptor("shelly:switch", SWITCH_CAPS),
    ];

    expect(offeredDevices("light", devices).map((device) => device.qualifiedId)).toEqual([
      "zigbee:lamp",
    ]);
    expect(offeredDevices("cover", devices).map((device) => device.qualifiedId)).toEqual([
      "shelly:blind",
    ]);
    // `entity` is the typed fallback, so every device can drive it.
    expect(offeredDevices("entity", devices)).toHaveLength(devices.length);
  });

  it("single-sources the offer rule with the wall's own device-class resolver", async () => {
    const model = await readSource(MODEL);
    const fields = await readSource(FIELDS);

    // The rule lives once, over the wall's resolver, and the form consumes it —
    // so the offered set and the runtime explanation cannot drift.
    expect(model).toContain("deviceCanDriveClass(device.capabilities, deviceClass)");
    expect(fields).toContain("offeredDevices(");
    expect(fields).toContain("devicesByQualifiedId.values()");
  });

  it("binds the device the user selected and persists it", () => {
    let config = single("light");
    const id = widgetAt(config, 0).id;
    config = updateWidgetConfig(config, id, { qualifiedId: "zigbee:lamp" });

    const result = validateProfileDraft("profile", config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.config.widgets[0]?.config.qualifiedId).toBe("zigbee:lamp");
    }
  });

  it("round-trips the card's layout and inactive-controls setting through save validation", () => {
    let config = withRequiredConfig(single("light"));
    const id = widgetAt(config, 0).id;
    config = updateWidgetConfig(config, id, { layout: "vertical", collapsible_controls: true });

    const result = validateProfileDraft("profile", config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.config.widgets[0]?.config.layout).toBe("vertical");
      expect(result.profile.config.widgets[0]?.config.collapsible_controls).toBe(true);
    }
  });

  it("rejects a layout the shared contract does not define", () => {
    let config = withRequiredConfig(single("light"));
    const id = widgetAt(config, 0).id;
    config = updateWidgetConfig(config, id, { layout: "diagonal" });

    // The editor validates with the shared per-type schema, so a value outside
    // `WALL_DEVICE_LAYOUTS` is refused rather than persisted.
    expect(validateProfileDraft("profile", config).ok).toBe(false);
  });

  it("renders the device picker, the layout picker, and the inactive-controls switch", async () => {
    const fields = await readSource(FIELDS);

    // Every layout the shared contract defines is offered, built from its list.
    expect(fields).toContain("WALL_DEVICE_LAYOUTS");
    expect(fields).toContain("LAYOUT_OPTIONS");
    // Both options patch the widget's own config.
    expect(fields).toContain("layout: value");
    expect(fields).toContain("collapsible_controls: value");
    expect(fields).toContain("<SwitchField");
    expect(fields).toContain("<Switch");
  });
});

describe("the re-derived editor floors and fit report", () => {
  it("derives its height floor from the ported card's row unit, not the retired scale", async () => {
    // The editor's height floor is `WALL_TITLE_ROWS` — the title block measured in the wall's
    // shortest row, `ROW_UNIT_MIN`.
    expect(ROW_UNIT_MIN).toBe(50);
    expect(ROW_UNIT_MAX).toBe(56);
    expect(WALL_TITLE_ROWS).toBe(Math.ceil(WALL_TITLE_BLOCK_PX / ROW_UNIT_MIN));

    const descriptor = WALL_WIDGET_REGISTRY.light;
    const config = withRequiredConfig(single("light"));
    const id = widgetAt(config, 0).id;
    const titled = updateWidgetConfig(config, id, { title: "Hallway" });
    const resized = updateWidgetPlacement(titled, id, {
      x: 0,
      y: 0,
      w: descriptor.min.w,
      h: descriptor.min.h,
    });

    expect(widgetAt(resized, 0).h).toBe(descriptor.min.h + WALL_TITLE_ROWS);

    const editor = await readSource(EDITOR);
    const slim = await readSource(SLIM);
    expect(editor).toContain("WALL_TITLE_ROWS");
    // The title-row floor is the slim rule's: the editor clamp and the save validator
    // read it from one module.
    expect(slim).toContain("WALL_TITLE_ROWS");
  });

  it("resolves its fit report at the ported card's row unit bounds", () => {
    const preview = resolveDraftPreview(single("clock"));

    expect(preview.rowUnit).toBeGreaterThanOrEqual(ROW_UNIT_MIN);
    expect(preview.rowUnit).toBeLessThanOrEqual(ROW_UNIT_MAX);
  });

  it("refuses to save a draft that cannot fit the panel at the re-derived floors", async () => {
    const config: WallProfileConfig = {
      widgets: [
        {
          id: "tall",
          type: "clock",
          config: {},
          x: 0,
          y: 0,
          w: WALL_GRID_COLUMNS,
          h: WALL_GRID_MAX_ROWS,
        },
      ],
    };

    expect(draftFitError(config)).not.toBeNull();

    const persist = mock(async () => {});
    const result = await submitProfileDraft("kitchen", config, persist);
    expect(result.ok).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it("reports the page count the wall's own pagination resolves", () => {
    const selected = Array.from({ length: 20 }, (_, index) => `light.${index}`);
    const grid: WallWidget = {
      id: "grid",
      type: "devices",
      config: { qualifiedIds: selected },
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    };

    const preview = resolveDraftPreview({ widgets: [grid] });
    // The page count comes from `wall/pages.ts`'s own layer at the panel's row
    // unit, so the editor's report is exactly the page the wall draws.
    const wallPlan = resolvePagedTiles({
      items: selected,
      span: grid,
      rowUnit: preview.rowUnit,
      page: 0,
    });

    expect(wallPlan.pageCount).toBeGreaterThan(1);
    expect(preview.grids).toEqual([
      { widgetId: "grid", devices: selected.length, pages: wallPlan.pageCount },
    ]);
  });
});

/** A minimal device descriptor for the slim rule's device-aware resolution. */
function testDevice(qualifiedId: string, capabilities: Capability[]): DeviceDescriptor {
  return {
    source: "test",
    id: qualifiedId,
    qualifiedId,
    displayName: "Test device",
    state: {},
    capabilities,
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
  };
}

/** The capabilities of a lock reporting a readable state and nothing writable. */
const READ_ONLY_LOCK: Capability[] = [
  {
    kind: "lock",
    property: "state",
    access: { readable: true, writable: false },
    valueType: "enum",
    permittedValues: ["LOCK", "UNLOCK"],
  },
];

/** The capabilities of a lock whose state both reads and writes. */
const WRITABLE_LOCK: Capability[] = [
  {
    kind: "lock",
    property: "state",
    access: { readable: true, writable: true },
    valueType: "enum",
    permittedValues: ["LOCK", "UNLOCK"],
  },
];

describe("resolveEffectiveMin", () => {
  it("reads the slim span for an always-slim type, titled or not", () => {
    const link = WALL_WIDGET_REGISTRY.link;
    expect(resolveEffectiveMin(link, false, false)).toEqual({ w: 2, h: 1 });
    expect(resolveEffectiveMin(link, true, false)).toEqual({ w: 2, h: 1 + WALL_TITLE_ROWS });
    // An `always` rule does not read the device state.
    expect(resolveEffectiveMin(link, false, true)).toEqual({ w: 2, h: 1 });
  });

  it("keeps a read-only type's own minimum while its device presents controls", () => {
    const light = WALL_WIDGET_REGISTRY.light;
    expect(resolveEffectiveMin(light, false, false)).toEqual(light.min);
    expect(resolveEffectiveMin(light, false, false)).toEqual({ w: 3, h: 2 });
  });

  it("reads the slim one-row span for a read-only type whose device presents no controls", () => {
    const light = WALL_WIDGET_REGISTRY.light;
    expect(resolveEffectiveMin(light, false, true)).toEqual({ w: 3, h: 1 });
    // A configured title still costs its rows on top of the slim span.
    expect(resolveEffectiveMin(light, true, true)).toEqual({ w: 3, h: 1 + WALL_TITLE_ROWS });
  });

  it("defaults to the type's own minimum for a type with no slim rule", () => {
    const clock = WALL_WIDGET_REGISTRY.clock;
    expect(resolveEffectiveMin(clock, false, true)).toEqual(clock.min);
  });
});

describe("effectiveSpanDescriptor", () => {
  it("carries the effective minimum beside the type's defaults and maximum", () => {
    const light = WALL_WIDGET_REGISTRY.light;
    const readOnly = effectiveSpanDescriptor(light, true);
    expect(readOnly.min).toEqual({ w: 3, h: 1 });
    expect(readOnly.defaults).toEqual(light.defaults);
    expect(readOnly.max).toEqual(light.max);

    expect(effectiveSpanDescriptor(light, false).min).toEqual(light.min);
  });

  it("omits the title rows the guard accounts for through the renderer's box", () => {
    const light = WALL_WIDGET_REGISTRY.light;
    expect(effectiveSpanDescriptor(light, true).min.h).toBe(1);
  });
});

describe("boundDeviceReadOnly", () => {
  it("is true only for a read-only type whose bound device presents no controls", () => {
    const lock = WALL_WIDGET_REGISTRY.lock;
    expect(boundDeviceReadOnly(lock, testDevice("test:lock", READ_ONLY_LOCK))).toBe(true);
    expect(boundDeviceReadOnly(lock, testDevice("test:lock", WRITABLE_LOCK))).toBe(false);
  });

  it("is conservative for a missing device and for a type with no read-only rule", () => {
    expect(boundDeviceReadOnly(WALL_WIDGET_REGISTRY.lock, undefined)).toBe(false);
    // A link's rule is `always`, so its device state never makes it read-only.
    expect(
      boundDeviceReadOnly(WALL_WIDGET_REGISTRY.link, testDevice("test:lock", READ_ONLY_LOCK)),
    ).toBe(false);
  });
});

describe("the device-aware minimum in validation and the clamp", () => {
  /** A one-row typed lock widget bound to `test:lock`. */
  function oneRowLock(): WallProfileConfig {
    return {
      widgets: [
        {
          id: "lock-1",
          type: "lock",
          config: { qualifiedId: "test:lock" },
          x: 0,
          y: 0,
          w: 3,
          h: 1,
        },
      ],
    };
  }

  it("refuses a one-row cell without devices and admits it for a control-less device", () => {
    const config = oneRowLock();

    // Conservative with no devices: the two-row minimum refuses the one-row cell.
    expect(validateProfileDraft("one-row", config).ok).toBe(false);
    // A control-less device makes the same cell authorable.
    expect(
      validateProfileDraft("one-row", config, [testDevice("test:lock", READ_ONLY_LOCK)]).ok,
    ).toBe(true);
    // A control-bearing device keeps the two-row minimum.
    expect(
      validateProfileDraft("one-row", config, [testDevice("test:lock", WRITABLE_LOCK)]).ok,
    ).toBe(false);
  });

  it("clamps a one-row request by the same device-aware minimum", () => {
    const config: WallProfileConfig = oneRowLock();
    const request = { x: 0, y: 0, w: 3, h: 1 };

    const readOnly = updateWidgetPlacement(config, "lock-1", request, undefined, [
      testDevice("test:lock", READ_ONLY_LOCK),
    ]);
    expect(widgetAt(readOnly, 0).h).toBe(1);

    const controlBearing = updateWidgetPlacement(config, "lock-1", request, undefined, [
      testDevice("test:lock", WRITABLE_LOCK),
    ]);
    expect(widgetAt(controlBearing, 0).h).toBe(2);

    // No devices: conservative, so the clamp keeps the type's own two-row minimum.
    expect(widgetAt(updateWidgetPlacement(config, "lock-1", request), 0).h).toBe(2);
  });

  it("saves a one-row control-less draft and refuses a one-row control-bearing one", async () => {
    const persist = mock(async () => {});
    const config = oneRowLock();

    const saved = await submitProfileDraft("one-row", config, persist, [
      testDevice("test:lock", READ_ONLY_LOCK),
    ]);
    expect(saved.ok).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);

    // The same draft under a control-bearing device is refused, and never persisted.
    const refused = await submitProfileDraft("one-row", config, persist, [
      testDevice("test:lock", WRITABLE_LOCK),
    ]);
    expect(refused.ok).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("wires the store's devices into the editor's clamp and save validation", async () => {
    const editor = await readSource(EDITOR);

    // The editor reads the store and hands the same device set to both the placement
    // clamp and the save validation, so authoring and saving agree.
    expect(editor).toContain("useDataStore()");
    expect(editor).toContain(
      "updateWidgetPlacement(config, widget.id, placement, undefined, devices)",
    );
    expect(editor).toContain("submitProfileDraft(profile.name, config, persist, devices)");
  });
});
