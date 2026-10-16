import { describe, expect, it } from "bun:test";
import { WALL_GRID_COLUMNS, WALL_WIDGET_TYPES } from "@ts-ha/shared";
import { WALL_WIDGET_CONFIG_SCHEMAS } from "@ts-ha/shared/wall-schema";
import {
  WALL_DEVICE_CLASS_LABELS,
  WALL_DEVICE_CLASSES,
} from "../src/app/wall/cards/device-class.js";
import {
  ROW_UNIT_MIN,
  WALL_COMPACT_CARD_HEIGHT_PX,
  WALL_GUTTER_MIN_PX,
  WALL_MIN_DEVICE_COLUMNS,
  WALL_MIN_DEVICE_ROWS,
} from "../src/app/wall/grid.js";
import { WALL_PAGE_RESERVED_PX } from "../src/app/wall/pages.js";
import {
  getWidgetDescriptor,
  WALL_MIN_CONTROL_GAP,
  WALL_MIN_TOUCH_TARGET,
  WALL_WIDGET_REGISTRY,
} from "../src/app/wall/registry.js";
import { wallDeviceCard } from "../src/app/wall/widgets/DeviceWidget.js";

describe("WALL_WIDGET_REGISTRY", () => {
  it("covers every declared widget type with a matching descriptor", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const descriptor = WALL_WIDGET_REGISTRY[type];
      expect(descriptor).toBeDefined();
      expect(descriptor.type).toBe(type);
      expect(descriptor.label.length).toBeGreaterThan(0);
    }
  });

  it("resolves a renderer function for every type", () => {
    for (const type of WALL_WIDGET_TYPES) {
      expect(typeof WALL_WIDGET_REGISTRY[type].renderer).toBe("function");
    }
  });

  it("declares finite, grid-bounded dimensions with min ≤ defaults ≤ max", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const { min, defaults, max } = WALL_WIDGET_REGISTRY[type];
      for (const span of [min, defaults, max]) {
        expect(Number.isFinite(span.w)).toBe(true);
        expect(Number.isFinite(span.h)).toBe(true);
        expect(span.w).toBeGreaterThanOrEqual(1);
        expect(span.h).toBeGreaterThanOrEqual(1);
        expect(span.w).toBeLessThanOrEqual(WALL_GRID_COLUMNS);
      }
      expect(min.w).toBeLessThanOrEqual(defaults.w);
      expect(defaults.w).toBeLessThanOrEqual(max.w);
      expect(min.h).toBeLessThanOrEqual(defaults.h);
      expect(defaults.h).toBeLessThanOrEqual(max.h);
    }
  });

  it("places every default inside its type's min and max bounds", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const { min, defaults, max } = WALL_WIDGET_REGISTRY[type];
      expect(defaults.w).toBeGreaterThanOrEqual(min.w);
      expect(defaults.w).toBeLessThanOrEqual(max.w);
      expect(defaults.h).toBeGreaterThanOrEqual(min.h);
      expect(defaults.h).toBeLessThanOrEqual(max.h);
    }
  });

  it("resolves an ambient-or-control grammar for every type", () => {
    for (const type of WALL_WIDGET_TYPES) {
      expect(["ambient", "control"]).toContain(WALL_WIDGET_REGISTRY[type].grammar);
    }
  });

  it("classifies readouts as ambient and touch controls as control", () => {
    const ambient = ["clock", "weather", "energy", "temperature", "status"] as const;
    const control = [
      "room",
      "favorites",
      "scene",
      "light",
      "cover",
      "fan",
      "climate",
      "lock",
      "number",
      "select",
      "entity",
    ] as const;
    for (const type of ambient) expect(WALL_WIDGET_REGISTRY[type].grammar).toBe("ambient");
    for (const type of control) expect(WALL_WIDGET_REGISTRY[type].grammar).toBe("control");
  });

  it("attaches a config schema to every descriptor", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const schema = WALL_WIDGET_REGISTRY[type].configSchema;
      expect(typeof schema.parse).toBe("function");
    }
  });

  it("resolves a descriptor through the accessor", () => {
    expect(getWidgetDescriptor("clock")).toBe(WALL_WIDGET_REGISTRY.clock);
    expect(getWidgetDescriptor("scene")).toBe(WALL_WIDGET_REGISTRY.scene);
  });

  it("sets the wall touch-target minimum to the ported card's control height", () => {
    expect(WALL_MIN_TOUCH_TARGET).toBe(42);
  });

  it("keeps at least an 8px separation between adjacent wall controls", () => {
    expect(WALL_MIN_CONTROL_GAP).toBeGreaterThanOrEqual(8);
    expect(WALL_MIN_CONTROL_GAP).toBeLessThan(WALL_MIN_TOUCH_TARGET);
  });

  it("keeps the paged types' minimum spans tall enough to page", () => {
    // A paged card must hold, at the wall's floors, its frame inset, the chrome it draws
    // above the tiles, one tile row, and the page-control row.
    const floors = (rows: number): number => rows * ROW_UNIT_MIN + (rows - 1) * WALL_GUTTER_MIN_PX;

    for (const [type, headerRows] of [
      ["devices", 0],
      ["favorites", 2],
      ["room", 3],
    ] as const) {
      const { min } = WALL_WIDGET_REGISTRY[type];
      const available = floors(min.h) - WALL_PAGE_RESERVED_PX - headerRows * ROW_UNIT_MIN;
      expect(available, `${type} at its minimum span`).toBeGreaterThanOrEqual(
        WALL_COMPACT_CARD_HEIGHT_PX,
      );
      // The derivation is tight: one row less would not hold the tile row.
      expect(floors(min.h - 1) - WALL_PAGE_RESERVED_PX - headerRows * ROW_UNIT_MIN).toBeLessThan(
        WALL_COMPACT_CARD_HEIGHT_PX,
      );
    }
  });

  it("keeps a room's minimum as tall as a favorites card needs", () => {
    // The room card draws one more chrome row than favorites (its room-wide
    // command row), so its derived minimum is taller.
    expect(WALL_WIDGET_REGISTRY.room.min.h).toBeGreaterThan(WALL_WIDGET_REGISTRY.favorites.min.h);
  });
});

describe("the typed device catalogue", () => {
  it("registers one widget type per device class, with its card", () => {
    // The catalogue: one type per class the capability model can drive, each rendering its
    // own card.
    for (const deviceClass of WALL_DEVICE_CLASSES) {
      const descriptor = WALL_WIDGET_REGISTRY[deviceClass];
      expect(descriptor.type).toBe(deviceClass);
      expect(descriptor.label).toBe(WALL_DEVICE_CLASS_LABELS[deviceClass]);
      expect(descriptor.grammar).toBe("control");
      expect(typeof wallDeviceCard(deviceClass)).toBe("function");
    }
  });

  it("retires the single generic device widget type", () => {
    expect((WALL_WIDGET_TYPES as readonly string[]).includes("device")).toBe(false);
    expect((WALL_WIDGET_REGISTRY as Record<string, unknown>).device).toBeUndefined();
  });

  it("gives every typed device widget the ported card's derived minimum span as its default", () => {
    for (const deviceClass of WALL_DEVICE_CLASSES) {
      const { min, defaults, max, slim } = WALL_WIDGET_REGISTRY[deviceClass];
      // The width is the columns whose cell holds the widest control row a card draws; the
      // height is the rows the row unit is derived to hold a compact card in.
      expect(min).toEqual({ w: WALL_MIN_DEVICE_COLUMNS, h: WALL_MIN_DEVICE_ROWS });
      expect(defaults).toEqual({ w: WALL_MIN_DEVICE_COLUMNS, h: WALL_MIN_DEVICE_ROWS });
      expect(max).toEqual({ w: 6, h: 6 });
      // The one-row rule is device-aware: every typed device is slim exactly when its
      // bound device presents no controls, at a three-column one-row minimum, while the
      // static minimum stays two rows so a control-bearing cell is still explained.
      expect(slim).toEqual({ min: { w: 3, h: 1 }, when: "read-only" });
    }
    expect(WALL_MIN_DEVICE_COLUMNS).toBeGreaterThan(WALL_MIN_DEVICE_ROWS);
  });

  it("binds every typed device widget to the shared typed device config", () => {
    for (const deviceClass of WALL_DEVICE_CLASSES) {
      expect(WALL_WIDGET_REGISTRY[deviceClass].configSchema).toBe(
        WALL_WIDGET_CONFIG_SCHEMAS[deviceClass],
      );
      // The config is the one typed device config, shared by every device type.
      expect(WALL_WIDGET_CONFIG_SCHEMAS[deviceClass].safeParse({ qualifiedId: "a" }).success).toBe(
        true,
      );
      expect(WALL_WIDGET_CONFIG_SCHEMAS[deviceClass].safeParse({}).success).toBe(false);
    }
  });
});

describe("temperature descriptor", () => {
  it("presents temperature as an ambient readout bound to the shared schema", () => {
    const descriptor = WALL_WIDGET_REGISTRY.temperature;
    expect(descriptor.type).toBe("temperature");
    expect(descriptor.label.length).toBeGreaterThan(0);
    expect(descriptor.grammar).toBe("ambient");
    expect(descriptor.configSchema).toBe(WALL_WIDGET_CONFIG_SCHEMAS.temperature);
  });

  it("validates a configured sensor through its descriptor schema", () => {
    const { configSchema } = WALL_WIDGET_REGISTRY.temperature;
    expect(configSchema.safeParse({ qualifiedId: "zigbee:0xabc" }).success).toBe(true);
    expect(configSchema.safeParse({}).success).toBe(false);
  });
});

describe("scene descriptor", () => {
  it("offers a scene at a one-row minimum, so a slim scene is authorable", () => {
    const descriptor = WALL_WIDGET_REGISTRY.scene;
    expect(descriptor.type).toBe("scene");
    expect(descriptor.grammar).toBe("control");
    // Only the minimum changes: a scene may be authored one row tall, but a new one
    // still lands at the two-row default.
    expect(descriptor.min).toEqual({ w: 2, h: 1 });
    expect(descriptor.defaults).toEqual({ w: 2, h: 2 });
    expect(descriptor.configSchema).toBe(WALL_WIDGET_CONFIG_SCHEMAS.scene);
  });

  it("declares its one-row rule once, in the descriptor", () => {
    // The frame's surface decision reads this, so the scene's one-row chrome-less
    // treatment is the catalogue's own declaration, not a per-type branch.
    expect(WALL_WIDGET_REGISTRY.scene.slim).toEqual({
      min: { w: 2, h: 1 },
      when: "always",
    });
  });
});

describe("link descriptor", () => {
  it("offers a link at a one-row minimum, so a slim link is authorable", () => {
    const descriptor = WALL_WIDGET_REGISTRY.link;
    expect(descriptor.type).toBe("link");
    expect(descriptor.grammar).toBe("control");
    // Only the minimum height changes: a link may be authored one row tall, but a new
    // one still lands at the two-row default.
    expect(descriptor.min).toEqual({ w: 2, h: 1 });
    expect(descriptor.defaults).toEqual({ w: 3, h: 2 });
    expect(descriptor.configSchema).toBe(WALL_WIDGET_CONFIG_SCHEMAS.link);
  });

  it("declares its one-row rule once, in the descriptor", () => {
    // The frame's surface decision reads this, so a one-row link is chrome-less by its
    // own declaration rather than a per-type branch.
    expect(WALL_WIDGET_REGISTRY.link.slim).toEqual({
      min: { w: 2, h: 1 },
      when: "always",
    });
  });
});
