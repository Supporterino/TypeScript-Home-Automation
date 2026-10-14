import { describe, expect, it } from "bun:test";
import { WALL_GRID_COLUMNS, WALL_WIDGET_TYPES } from "@ts-ha/shared";
import { WALL_WIDGET_CONFIG_SCHEMAS } from "@ts-ha/shared/wall-schema";
import {
  ROW_UNIT_MIN,
  WALL_COMPACT_CARD_HEIGHT_PX,
  WALL_GUTTER_MIN_PX,
} from "../src/app/wall/grid.js";
import { WALL_PAGE_RESERVED_PX } from "../src/app/wall/pages.js";
import {
  getWidgetDescriptor,
  WALL_MIN_CONTROL_GAP,
  WALL_MIN_TOUCH_TARGET,
  WALL_WIDGET_REGISTRY,
} from "../src/app/wall/registry.js";

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
    const control = ["room", "favorites", "device", "scene"] as const;
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

  it("sets a kiosk-class wall touch-target minimum", () => {
    expect(WALL_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(56);
  });

  it("keeps at least an 8px separation between adjacent wall controls", () => {
    expect(WALL_MIN_CONTROL_GAP).toBeGreaterThanOrEqual(8);
    expect(WALL_MIN_CONTROL_GAP).toBeLessThan(WALL_MIN_TOUCH_TARGET);
  });

  it("keeps the paged types' minimum spans tall enough to page", () => {
    // A paged card must hold, at the wall's floors, its frame inset, the chrome it
    // draws above the tiles, one tile row, and the page-control row: otherwise a
    // minimum-span card clips a tile below the wall's touch target
    // (wall-zones-and-fit D5; specs/wall-display "Panel Fit"). `devices` was
    // derived for this first; favorites and room are derived the same way.
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
