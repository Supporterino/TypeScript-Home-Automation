import { describe, expect, it } from "bun:test";
import {
  WALL_GRID_COLUMNS,
  WALL_GRID_MAX_ROWS,
  WALL_PROFILE_VERSION,
  WALL_WIDGET_TYPES,
  WALL_ZONE_MAX_LENGTH,
  type WallProfile,
} from "../src/index.js";
import { wallProfileSchema, wallWidgetSchema } from "../src/wall-schema.js";

function validProfile(): WallProfile {
  return {
    name: "Kitchen",
    version: WALL_PROFILE_VERSION,
    config: {
      widgets: [
        { id: "clock", type: "clock", config: {}, x: 0, y: 0, w: 6, h: 2 },
        { id: "weather", type: "weather", config: {}, x: 6, y: 0, w: 6, h: 2 },
      ],
    },
  };
}

describe("wall grid constants", () => {
  it("uses the 12-column grid the design fixes", () => {
    expect(WALL_GRID_COLUMNS).toBe(12);
  });

  it("bounds the row count so the always-on grid cannot grow without limit", () => {
    expect(WALL_GRID_MAX_ROWS).toBeGreaterThan(0);
  });

  it("covers the widget catalog the spec requires", () => {
    expect([...WALL_WIDGET_TYPES]).toEqual([
      "clock",
      "weather",
      "energy",
      "room",
      "favorites",
      "device",
      "temperature",
      "status",
      "scene",
      "link",
      "devices",
    ]);
  });
});

describe("wallWidgetSchema", () => {
  it("accepts a widget at the grid's right edge", () => {
    const result = wallWidgetSchema.safeParse({
      id: "energy",
      type: "energy",
      config: {},
      x: 6,
      y: 0,
      w: 6,
      h: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a widget that overflows the column count", () => {
    const result = wallWidgetSchema.safeParse({
      id: "wide",
      type: "clock",
      config: {},
      x: 6,
      y: 0,
      w: 8,
      h: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive span and a negative coordinate", () => {
    expect(
      wallWidgetSchema.safeParse({ id: "a", type: "clock", config: {}, x: 0, y: 0, w: 0, h: 1 })
        .success,
    ).toBe(false);
    expect(
      wallWidgetSchema.safeParse({ id: "a", type: "clock", config: {}, x: -1, y: 0, w: 1, h: 1 })
        .success,
    ).toBe(false);
  });

  it("accepts a widget whose bottom edge is exactly the row bound", () => {
    const result = wallWidgetSchema.safeParse({
      id: "tall",
      type: "clock",
      config: {},
      x: 0,
      y: WALL_GRID_MAX_ROWS - 2,
      w: 4,
      h: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a widget whose bottom edge exceeds the row bound", () => {
    const result = wallWidgetSchema.safeParse({
      id: "tall",
      type: "clock",
      config: {},
      x: 0,
      y: WALL_GRID_MAX_ROWS - 1,
      w: 4,
      h: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a widget missing its placement", () => {
    const result = wallWidgetSchema.safeParse({ id: "a", type: "clock", config: {}, x: 0, y: 0 });
    expect(result.success).toBe(false);
  });
});

describe("wall zone label", () => {
  it("accepts a widget carrying a zone label", () => {
    const result = wallWidgetSchema.safeParse({
      id: "lamp",
      type: "device",
      config: { qualifiedId: "light.lamp" },
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      zone: "Kitchen",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.zone).toBe("Kitchen");
  });

  it("trims surrounding whitespace from a zone label", () => {
    const result = wallWidgetSchema.safeParse({
      id: "lamp",
      type: "device",
      config: { qualifiedId: "light.lamp" },
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      zone: "  Kitchen  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.zone).toBe("Kitchen");
  });

  it("accepts a widget that declares no zone", () => {
    const result = wallWidgetSchema.safeParse({
      id: "clock",
      type: "clock",
      config: {},
      x: 0,
      y: 0,
      w: 6,
      h: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.zone).toBeUndefined();
  });

  it("rejects an empty or whitespace-only zone label", () => {
    for (const zone of ["", "   "]) {
      const result = wallWidgetSchema.safeParse({
        id: "clock",
        type: "clock",
        config: {},
        x: 0,
        y: 0,
        w: 6,
        h: 2,
        zone,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects a zone label that is not a string", () => {
    const result = wallWidgetSchema.safeParse({
      id: "clock",
      type: "clock",
      config: {},
      x: 0,
      y: 0,
      w: 6,
      h: 2,
      zone: 42,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zone label longer than the bound", () => {
    const result = wallWidgetSchema.safeParse({
      id: "clock",
      type: "clock",
      config: {},
      x: 0,
      y: 0,
      w: 6,
      h: 2,
      zone: "z".repeat(WALL_ZONE_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe("wall link and device-grid configs", () => {
  it("accepts a link widget with a target and a label", () => {
    const result = wallWidgetSchema.safeParse({
      id: "to-kitchen",
      type: "link",
      config: { target: "Kitchen", label: "Kitchen" },
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.config).toMatchObject({ target: "Kitchen" });
  });

  it("accepts a link widget carrying only its target", () => {
    const result = wallWidgetSchema.safeParse({
      id: "to-kitchen",
      type: "link",
      config: { target: "Kitchen" },
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a link widget with no target", () => {
    const result = wallWidgetSchema.safeParse({
      id: "to-nowhere",
      type: "link",
      config: { label: "Nowhere" },
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a link widget with an empty target", () => {
    const result = wallWidgetSchema.safeParse({
      id: "to-nowhere",
      type: "link",
      config: { target: "" },
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a device grid with an explicit selection", () => {
    const result = wallWidgetSchema.safeParse({
      id: "lights",
      type: "devices",
      config: { qualifiedIds: ["light.a", "light.b"], title: "Lights" },
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config).toMatchObject({ qualifiedIds: ["light.a", "light.b"] });
    }
  });

  it("rejects a device grid with an empty selection", () => {
    const result = wallWidgetSchema.safeParse({
      id: "lights",
      type: "devices",
      config: { qualifiedIds: [] },
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a device grid whose selection is not a list of device ids", () => {
    const result = wallWidgetSchema.safeParse({
      id: "lights",
      type: "devices",
      config: { qualifiedIds: "light.a" },
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a device grid with a blank device id", () => {
    const result = wallWidgetSchema.safeParse({
      id: "lights",
      type: "devices",
      config: { qualifiedIds: [""] },
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    });
    expect(result.success).toBe(false);
  });
});

describe("wallProfileSchema", () => {
  it("accepts a well-formed profile", () => {
    const result = wallProfileSchema.safeParse(validProfile());
    expect(result.success).toBe(true);
  });

  it("fills an omitted widget config with an empty object", () => {
    const result = wallProfileSchema.safeParse({
      name: "Hall",
      version: WALL_PROFILE_VERSION,
      config: { widgets: [{ id: "clock", type: "clock", x: 0, y: 0, w: 6, h: 2 }] },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.config.widgets[0]?.config).toEqual({});
  });

  it("rejects a widget overflowing the grid", () => {
    const profile = validProfile();
    const result = wallProfileSchema.safeParse({
      ...profile,
      config: {
        widgets: [...profile.config.widgets, { id: "wide", type: "clock", x: 8, y: 2, w: 6, h: 1 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a widget whose config does not match its type", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: { widgets: [{ id: "room", type: "room", config: {}, x: 0, y: 0, w: 6, h: 5 }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown widget type", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: { widgets: [{ id: "x", type: "hologram", x: 0, y: 0, w: 1, h: 1 }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown profile version", () => {
    const result = wallProfileSchema.safeParse({ ...validProfile(), version: 99 });
    expect(result.success).toBe(false);
  });

  it("rejects overlapping widgets", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: {
        widgets: [
          { id: "a", type: "clock", x: 0, y: 0, w: 4, h: 2 },
          { id: "b", type: "weather", x: 3, y: 1, w: 4, h: 2 },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate widget ids", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: {
        widgets: [
          { id: "same", type: "clock", x: 0, y: 0, w: 4, h: 1 },
          { id: "same", type: "weather", x: 4, y: 0, w: 4, h: 1 },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a per-orientation override that replaces the base layout", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: {
        widgets: validProfile().config.widgets,
        orientations: {
          portrait: [{ id: "clock", type: "clock", x: 0, y: 0, w: 12, h: 2 }],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an overlapping placement inside an orientation override", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: {
        widgets: validProfile().config.widgets,
        orientations: {
          landscape: [
            { id: "a", type: "clock", x: 0, y: 0, w: 6, h: 2 },
            { id: "b", type: "weather", x: 0, y: 0, w: 6, h: 2 },
          ],
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("still parses a profile written before zones existed", () => {
    const result = wallProfileSchema.safeParse(validProfile());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config.widgets.every((widget) => widget.zone === undefined)).toBe(true);
    }
  });

  it("accepts a profile whose widgets share a zone label", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: {
        widgets: [
          { id: "a", type: "clock", config: {}, x: 0, y: 0, w: 4, h: 2, zone: "Climate" },
          { id: "b", type: "weather", config: {}, x: 4, y: 0, w: 4, h: 2, zone: "Climate" },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config.widgets.map((widget) => widget.zone)).toEqual([
        "Climate",
        "Climate",
      ]);
    }
  });

  it("rejects a profile whose widget carries an empty zone label", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: {
        widgets: [{ id: "a", type: "clock", config: {}, x: 0, y: 0, w: 4, h: 2, zone: "  " }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a profile containing the link and device-grid widgets", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: {
        widgets: [
          { id: "to-kitchen", type: "link", config: { target: "Kitchen" }, x: 0, y: 0, w: 3, h: 2 },
          {
            id: "lights",
            type: "devices",
            config: { qualifiedIds: ["light.a", "light.b"] },
            x: 3,
            y: 0,
            w: 6,
            h: 4,
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a profile containing an unconfigured link widget", () => {
    const result = wallProfileSchema.safeParse({
      ...validProfile(),
      config: {
        widgets: [{ id: "to-kitchen", type: "link", config: {}, x: 0, y: 0, w: 3, h: 2 }],
      },
    });
    expect(result.success).toBe(false);
  });
});
