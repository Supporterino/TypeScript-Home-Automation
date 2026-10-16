import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Capability, WALL_WIDGET_TYPES } from "@ts-ha/shared";
import { WALL_WIDGET_CONFIG_SCHEMAS } from "@ts-ha/shared/wall-schema";
import { shortDeviceName } from "../src/app/lib/humanize-name.js";
import type { DeviceDescriptor, RoomWithMembers } from "../src/app/types.js";
import {
  addWidget,
  emptyWallConfig,
  updateWidgetConfig,
  validateProfileDraft,
} from "../src/app/wall/editor/model.js";
import { getWidgetDescriptor, WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import { wallReadoutFontSize } from "../src/app/wall/scale.js";
import { WALL_BAND_FONT_SIZE } from "../src/app/wall/type-ramp.js";
import {
  humidityCapability,
  temperatureCapability,
  temperatureSensorLabel,
  temperatureWidgetState,
} from "../src/app/wall/widgets/temperature-model.js";

/**
 * The temperature widget: the readings and their containment through the pure model;
 * the renderer's wiring asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const RENDERER = join(APP_DIR, "wall/widgets/TemperatureWidget.tsx");
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");
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

function humiditySensorCapability(): Capability {
  return {
    kind: "sensor",
    property: "humidity",
    access: { readable: true, writable: false },
    valueType: "numeric",
    unit: "%",
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

/**
 * The sensor this home runs: a humidity declared on the same device as its temperature.
 */
function humiditySensor(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return sensor({
    state: { temperature: 21.5, humidity: 48 },
    capabilities: [sensorCapability(), humiditySensorCapability()],
    ...overrides,
  });
}

/** A room whose membership is the given device ids, in the store's own room shape. */
function room(name: string, memberIds: readonly string[]): RoomWithMembers {
  return {
    id: `room:${name}`,
    name,
    members: memberIds.map((qualifiedId) => ({ qualifiedId, available: true, device: null })),
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

describe("humidityCapability", () => {
  it("finds the readable humidity leaf through the same plumbing", () => {
    // The device's humidity is resolved exactly as its temperature is — the same flattener,
    // the same readable-leaf rule.
    const capabilities: Capability[] = [sensorCapability(), humiditySensorCapability()];

    expect(humidityCapability(capabilities)?.property).toBe("humidity");
    expect(humidityCapability(capabilities)?.unit).toBe("%");
    expect(humidityCapability([sensorCapability()])).toBeUndefined();
  });

  it("ignores a humidity capability that is not readable", () => {
    const capabilities: Capability[] = [
      { ...humiditySensorCapability(), access: { readable: false, writable: true } },
    ];
    expect(humidityCapability(capabilities)).toBeUndefined();
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

describe("the sensor's humidity reading", () => {
  it("presents the sensor's humidity beside its temperature, each with its own unit", () => {
    expect(temperatureWidgetState(humiditySensor(), "zigbee:0xabc")).toEqual({
      status: "reading",
      value: 21.5,
      unit: "°C",
      humidity: { value: 48, unit: "%" },
    });
  });

  it("resolves the humidity through a nested capability tree too", () => {
    const device = humiditySensor({
      capabilities: [
        {
          kind: "sensor",
          access: { readable: true, writable: false },
          valueType: "composite",
          features: [sensorCapability(), humiditySensorCapability()],
        },
      ],
    });

    expect(temperatureWidgetState(device, "zigbee:0xabc")).toMatchObject({
      status: "reading",
      humidity: { value: 48, unit: "%" },
    });
  });

  it("presents no humidity for a sensor that declares none, never a placeholder", () => {
    const state = temperatureWidgetState(sensor(), "zigbee:0xabc");
    if (state.status !== "reading") throw new Error(`the sensor reads as ${state.status}`);

    // The absent reading is *absent*: not an empty line, not an em dash, and not a
    // zero-filled second reading.
    expect(state.humidity).toBeUndefined();
  });

  it("withholds a humidity the device reports but does not declare as numeric", () => {
    const nonNumeric = humiditySensor({ state: { temperature: 21.5, humidity: "unknown" } });
    const undeclared = sensor({ state: { temperature: 21.5, humidity: 48 } });

    // A reading is the device's *declared* capability, resolved from the state — a
    // non-numeric value yields none, and a value with no capability behind it is not one.
    expect(temperatureWidgetState(nonNumeric, "zigbee:0xabc")).toEqual({
      status: "reading",
      value: 21.5,
      unit: "°C",
    });
    expect(temperatureWidgetState(undeclared, "zigbee:0xabc")).toEqual({
      status: "reading",
      value: 21.5,
      unit: "°C",
    });
  });

  it("keeps the containment for a device with neither reading", () => {
    const noHumidity = humiditySensor({ state: {} });
    expect(temperatureWidgetState(noHumidity, "zigbee:0xabc")).toEqual({
      status: "unavailable",
      message: "No temperature reading.",
    });
  });
});

describe("temperatureSensorLabel", () => {
  it("identifies a room-assigned sensor by its room name", () => {
    const device = sensor();

    expect(temperatureSensorLabel(device, [room("Hallway", [device.qualifiedId])])).toBe("Hallway");
  });

  it("identifies an unassigned sensor by its shortened name", () => {
    const device = sensor({ displayName: "Living room temperature sensor" });
    // A room the device is not a member of leaves it unassigned, so the identifier is the
    // device's own name shortened to its distinguishing trailing words.
    const other = room("Hallway", ["zigbee:other"]);

    expect(temperatureSensorLabel(device, [other])).toBe(shortDeviceName(device.displayName));
    expect(temperatureSensorLabel(device, [other])).toBe("sensor");
    expect(temperatureSensorLabel(device, [other])).not.toBe(device.displayName);
    expect(temperatureSensorLabel(device, [])).toBe("sensor");
  });

  it("distinguishes same-named sensors in different rooms by their rooms", () => {
    const kitchen = sensor({ id: "0x1", qualifiedId: "zigbee:0x1", displayName: "Sensor" });
    const bedroom = sensor({ id: "0x2", qualifiedId: "zigbee:0x2", displayName: "Sensor" });
    const rooms = [room("Kitchen", [kitchen.qualifiedId]), room("Bedroom", [bedroom.qualifiedId])];

    // Their names alone are the same label; only the rooms tell the two apart.
    expect(shortDeviceName(kitchen.displayName)).toBe(shortDeviceName(bedroom.displayName));
    expect(temperatureSensorLabel(kitchen, rooms)).toBe("Kitchen");
    expect(temperatureSensorLabel(bedroom, rooms)).toBe("Bedroom");
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

  it("presents the reading on the ported state item, with the ported glyph and label", async () => {
    const renderer = await source(RENDERER);
    // The widget composes the wall's single card vocabulary: the ported circular
    // affordance, the ported primary label, and the reading.
    expect(renderer).toContain("WallCardStateItem");
    expect(renderer).toContain("WALL_CARD_GLYPH_SIZE");
    expect(renderer).toContain("Thermometer");
    expect(renderer).toContain("formatReadoutValue");
    // The contained explanation is the wall's own message form, never a paragraph
    // of the renderer's.
    expect(renderer).toContain("WallCardMessage");
    expect(renderer).not.toContain("fontSize");
  });

  it("chooses the reading's tier by the span it was placed at", async () => {
    const renderer = await source(RENDERER);
    // A grouped readout — the climate band's temperature, or any readout at its minimum
    // span — stays on the band tier so it does not compete with a hero.
    expect(renderer).toContain("wallReadoutFontSize(tier)");
    expect(renderer).not.toContain("WALL_METRIC_FONT_SIZE");
    expect(wallReadoutFontSize("compact")).toBe(WALL_BAND_FONT_SIZE);
  });

  it("hands the reading and its unit to the vocabulary as one run", async () => {
    const renderer = await source(RENDERER);
    // The value and its unit are resolved together by the shared formatter and drawn as
    // the state item's reading, which keeps them on one line.
    expect(renderer).toContain("reading={formatReadoutValue(state.value, state.unit)}");
    expect(renderer).not.toContain("whiteSpace");
  });

  it("draws the declared humidity as the widget's secondary reading", async () => {
    const renderer = await source(RENDERER);
    const anatomy = await source(ANATOMY);

    // The humidity is the widget's secondary reading: one value with its own unit, handed
    // to the vocabulary's reading part as one run.
    expect(renderer).toContain("state.humidity");
    expect(renderer).toContain(
      "<WallCardReading>{formatReadoutValue(humidity.value, humidity.unit)}</WallCardReading>",
    );
    // Its type is the ported secondary size, declared by the part the widget composes.
    expect(anatomy).toContain("size = WALL_CARD_SECONDARY_FONT_SIZE");
    expect(renderer).not.toContain("fontSize");
  });

  it("draws no humidity line for a sensor that declares none", async () => {
    const renderer = await source(RENDERER);

    // A reading the sensor does not declare is absent rather than an empty line or a
    // placeholder, and the line is guarded by the reading's own presence.
    expect(renderer).toContain("humidity !== undefined &&");
    expect(renderer).not.toContain("—");
  });

  it("labels the sensor with the model's identifier and keeps the full name for the tooltip", async () => {
    const renderer = await source(RENDERER);

    // The identifier — the sensor's room, else its shortened name — is resolved by the
    // model, from the store's memoised rooms; the renderer only draws it, with the
    // sensor's full name behind the tooltip.
    expect(renderer).toContain("rooms } = useDataStore()");
    expect(renderer).toContain("temperatureSensorLabel(device, rooms)");
    expect(renderer).toContain("humanizeDeviceName(device.displayName)");
    expect(renderer).toContain("title={fullName}");
    expect(renderer).not.toContain("shortDeviceName");
  });

  it("is selectable in the editor with its own config field", async () => {
    const fields = await source(CONFIG_FIELDS);
    expect(fields).toContain('case "temperature"');
    expect(fields).toContain("qualifiedId");
  });
});
