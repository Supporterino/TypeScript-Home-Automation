import { describe, expect, it, mock } from "bun:test";
import {
  WALL_GRID_COLUMNS,
  WALL_GRID_MAX_ROWS,
  WALL_WIDGET_TYPES,
  type WallProfileConfig,
  type WallWidget,
  type WallWidgetType,
} from "@ts-ha/shared";
import {
  addWidget,
  emptyWallConfig,
  removeWidget,
  submitProfileDraft,
  updateWidgetConfig,
  updateWidgetPlacement,
  validateProfileDraft,
} from "../src/app/wall/editor/model.js";
import { getWidgetDescriptor } from "../src/app/wall/registry.js";

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
 * or scene widget cannot be meaningful without a selection, so the profile
 * validator rejects it until one is made — the editor surfaces exactly that.
 */
const REQUIRED_CONFIG: Partial<Record<WallWidgetType, Record<string, unknown>>> = {
  room: { roomId: "kitchen" },
  device: { qualifiedId: "zigbee:0xabc123" },
  scene: { automation: "good-night", label: "Good night" },
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
