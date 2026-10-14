import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Capability, WALL_WIDGET_TYPES } from "@ts-ha/shared";
import { WALL_WIDGET_CONFIG_SCHEMAS } from "@ts-ha/shared/wall-schema";
import type { DeviceDescriptor } from "../src/app/types.js";
import {
  addWidget,
  emptyWallConfig,
  updateWidgetConfig,
  validateProfileDraft,
} from "../src/app/wall/editor/model.js";
import { getWidgetDescriptor, WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import {
  temperatureCapability,
  temperatureWidgetState,
} from "../src/app/wall/widgets/temperature-model.js";

/**
 * The temperature widget (task 2.7; design.md D11, D13; specs/wall-display
 * "Widget Catalog" — "A temperature widget shows its sensor's reading", "An
 * unknown temperature device is contained"). There is no DOM harness here, so
 * the reading and its containment are covered through the pure model, and the
 * renderer's wiring is asserted structurally — the same style as the other
 * wall widget tests.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const RENDERER = join(APP_DIR, "wall/widgets/TemperatureWidget.tsx");
const CONFIG_FIELDS = join(APP_DIR, "wall/editor/WidgetConfigFields.tsx");

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

function sensorCapability(): Capability {
  return {
    kind: "sensor",
    property: "temperature",
    access: { readable: true, writable: false },
    valueType: "numeric",
    unit: "°C",
  };
}

function sensor(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    source: "zigbee",
    id: "0xabc",
    qualifiedId: "zigbee:0xabc",
    displayName: "Hall sensor",
    state: { temperature: 21.5 },
    capabilities: [sensorCapability()],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
    ...overrides,
  };
}

function firstWidgetId(config: ReturnType<typeof emptyWallConfig>): string {
  const widget = config.widgets[0];
  if (!widget) throw new Error("expected a widget");
  return widget.id;
}

describe("temperature descriptor", () => {
  it("is a declared widget type presented as an ambient readout", () => {
    expect(WALL_WIDGET_TYPES).toContain("temperature");
    const descriptor = WALL_WIDGET_REGISTRY.temperature;
    expect(descriptor.type).toBe("temperature");
    expect(descriptor.label.length).toBeGreaterThan(0);
    expect(descriptor.grammar).toBe("ambient");
  });

  it("reuses the shared temperature config schema and the widget renderer", () => {
    const descriptor = getWidgetDescriptor("temperature");
    expect(descriptor.configSchema).toBe(WALL_WIDGET_CONFIG_SCHEMAS.temperature);
    expect(typeof descriptor.renderer).toBe("function");
  });
});

describe("temperature widget config", () => {
  it("accepts a configured sensor device and an optional title", () => {
    const schema = getWidgetDescriptor("temperature").configSchema;
    expect(schema.safeParse({ qualifiedId: "zigbee:0xabc" }).success).toBe(true);
    expect(schema.safeParse({ qualifiedId: "zigbee:0xabc", title: "Hall" }).success).toBe(true);
  });

  it("rejects a config with no sensor device", () => {
    const schema = getWidgetDescriptor("temperature").configSchema;
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("is rejected by the editor until a sensor is chosen, then validates by id", () => {
    const unconfigured = addWidget(emptyWallConfig(), "temperature");
    const id = firstWidgetId(unconfigured);

    const rejected = validateProfileDraft("hall", unconfigured);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.errors.join(" ")).toContain(id);

    const configured = updateWidgetConfig(unconfigured, id, { qualifiedId: "zigbee:0xabc" });
    expect(validateProfileDraft("hall", configured).ok).toBe(true);
  });
});

describe("temperatureCapability", () => {
  it("finds the readable temperature leaf through the shared capability plumbing", () => {
    const capabilities: Capability[] = [
      {
        kind: "battery",
        property: "battery",
        access: { readable: true, writable: false },
        valueType: "numeric",
      },
      sensorCapability(),
    ];
    expect(temperatureCapability(capabilities)?.property).toBe("temperature");
  });

  it("ignores a temperature capability that is not readable", () => {
    const capabilities: Capability[] = [
      {
        kind: "sensor",
        property: "temperature",
        access: { readable: false, writable: true },
        valueType: "numeric",
      },
    ];
    expect(temperatureCapability(capabilities)).toBeUndefined();
  });
});

describe("temperatureWidgetState", () => {
  it("reads the configured sensor's temperature and its unit", () => {
    expect(temperatureWidgetState(sensor(), "zigbee:0xabc")).toEqual({
      status: "reading",
      value: 21.5,
      unit: "°C",
    });
  });

  it("reads through a nested capability tree via the shared flattener", () => {
    const device = sensor({
      capabilities: [
        {
          kind: "sensor",
          access: { readable: true, writable: false },
          valueType: "composite",
          features: [sensorCapability()],
        },
      ],
    });
    expect(temperatureWidgetState(device, "zigbee:0xabc")).toMatchObject({
      status: "reading",
      value: 21.5,
    });
  });

  it("contains an unknown device as unavailable, naming the identifier", () => {
    const state = temperatureWidgetState(null, "zigbee:missing");
    expect(state.status).toBe("unavailable");
    if (state.status === "unavailable") expect(state.message).toContain("zigbee:missing");
  });

  it("reports no sensor configured when none is set", () => {
    expect(temperatureWidgetState(null, "")).toEqual({
      status: "unavailable",
      message: "No sensor configured.",
    });
  });

  it("contains a device that reports no numeric temperature, never throwing", () => {
    const noReading = sensor({ state: {} });
    const state = temperatureWidgetState(noReading, "zigbee:0xabc");
    expect(state.status).toBe("unavailable");

    const nonNumeric = sensor({ state: { temperature: "unknown" } });
    expect(temperatureWidgetState(nonNumeric, "zigbee:0xabc").status).toBe("unavailable");
  });
});

describe("TemperatureWidget renderer", () => {
  it("resolves the configured device from the store and contains an unavailable one", async () => {
    const renderer = await source(RENDERER);
    expect(renderer).toContain("devicesByQualifiedId.get(qualifiedId)");
    expect(renderer).toContain("temperatureWidgetState(device, qualifiedId)");
    expect(renderer).toContain('state.status === "unavailable"');
    expect(renderer).toContain("state.message");
    expect(renderer).not.toContain("throw");
  });

  it("presents the reading on the wall metric ramp with a leading glyph and label", async () => {
    const renderer = await source(RENDERER);
    expect(renderer).toContain("WALL_METRIC_FONT_SIZE");
    expect(renderer).toContain("WALL_LABEL_FONT_SIZE");
    expect(renderer).toContain("WALL_BODY_FONT_SIZE");
    expect(renderer).toContain("Thermometer");
    expect(renderer).toContain("formatReadoutValue");
  });

  it("is selectable in the editor with its own config field", async () => {
    const fields = await source(CONFIG_FIELDS);
    expect(fields).toContain('case "temperature"');
    expect(fields).toContain("qualifiedId");
  });
});
