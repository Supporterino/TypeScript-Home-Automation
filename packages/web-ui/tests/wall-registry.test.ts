import { describe, expect, it } from "bun:test";
import { WALL_GRID_COLUMNS, WALL_WIDGET_TYPES } from "@ts-ha/shared";
import {
  getWidgetDescriptor,
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
    const ambient = ["clock", "weather", "energy", "status"] as const;
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

  it("sets a wall touch-target minimum larger than the desktop standard", () => {
    expect(WALL_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });
});
