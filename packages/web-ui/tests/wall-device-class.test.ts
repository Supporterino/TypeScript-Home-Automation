import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import { WALL_WIDGET_TYPES } from "@ts-ha/shared";
import {
  deviceCanDriveClass,
  resolveDeviceClass,
  WALL_DEVICE_CLASSES,
} from "../src/app/wall/cards/device-class.js";

/**
 * The device-class resolver: keyed by the source-neutral capability profile and
 * returning exactly one class, with `entity` for a device of no class.
 */

/** A Zigbee2MQTT light: a `light` container carrying on/off and brightness. */
const ZIGBEE_LIGHT: Capability[] = [
  {
    kind: "light",
    access: { readable: true, writable: true },
    valueType: "composite",
    features: [
      {
        kind: "light",
        property: "state",
        access: { readable: true, writable: true },
        valueType: "boolean",
        valueOn: "ON",
        valueOff: "OFF",
      },
      {
        kind: "light",
        property: "brightness",
        access: { readable: true, writable: true },
        valueType: "numeric",
        range: { min: 0, max: 254 },
      },
    ],
  },
];

/** A Nanoleaf light: no `light` kind — a writable brightness is what makes it one. */
const NANOLEAF_LIGHT: Capability[] = [
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

/** A Shelly cover: a writable position plus a declared transport action. */
const SHELLY_COVER: Capability[] = [
  {
    kind: "numeric",
    property: "position",
    access: { readable: true, writable: true },
    valueType: "numeric",
    range: { min: 0, max: 100 },
  },
  {
    kind: "enum",
    property: "action",
    access: { readable: false, writable: true },
    valueType: "enum",
    permittedValues: ["open", "close", "stop"],
  },
];

/** A cover expressed only as a writable transport enum — no position, no cover kind. */
const TRANSPORT_ONLY_COVER: Capability[] = [
  {
    kind: "enum",
    property: "action",
    access: { readable: false, writable: true },
    valueType: "enum",
    permittedValues: ["OPEN", "CLOSE"],
  },
];

/** A Zigbee2MQTT fan container. */
const ZIGBEE_FAN: Capability[] = [
  {
    kind: "fan",
    access: { readable: true, writable: true },
    valueType: "composite",
    features: [
      {
        kind: "fan",
        property: "state",
        access: { readable: true, writable: true },
        valueType: "boolean",
      },
    ],
  },
];

/** A Zigbee2MQTT climate container. */
const ZIGBEE_CLIMATE: Capability[] = [
  {
    kind: "climate",
    access: { readable: true, writable: true },
    valueType: "composite",
    features: [
      {
        kind: "climate",
        property: "occupied_heating_setpoint",
        access: { readable: true, writable: true },
        valueType: "numeric",
        range: { min: 5, max: 35 },
      },
    ],
  },
];

/** A climate expressed only as a writable setpoint — no climate kind. */
const SETPOINT_ONLY_CLIMATE: Capability[] = [
  {
    kind: "numeric",
    property: "target_temperature",
    access: { readable: true, writable: true },
    valueType: "numeric",
    range: { min: 5, max: 35 },
  },
];

/** A Zigbee2MQTT lock container. */
const ZIGBEE_LOCK: Capability[] = [
  {
    kind: "lock",
    access: { readable: true, writable: true },
    valueType: "composite",
    features: [
      {
        kind: "lock",
        property: "state",
        access: { readable: true, writable: true },
        valueType: "enum",
        permittedValues: ["LOCK", "UNLOCK"],
      },
    ],
  },
];

/** A bounded numeric control: a writable numeric with a declared range. */
const BOUNDED_NUMERIC: Capability[] = [
  {
    kind: "numeric",
    property: "level",
    access: { readable: true, writable: true },
    valueType: "numeric",
    range: { min: 0, max: 100 },
  },
];

/** An enumerated control: a writable enum with permitted values. */
const ENUMERATED_CONTROL: Capability[] = [
  {
    kind: "enum",
    property: "mode",
    access: { readable: true, writable: true },
    valueType: "enum",
    permittedValues: ["day", "night"],
  },
];

/** A Shelly switch: on/off only — the fallback entity class. */
const SHELLY_SWITCH: Capability[] = [
  {
    kind: "switch",
    property: "on",
    access: { readable: true, writable: true },
    valueType: "boolean",
    valueOn: true,
    valueOff: false,
  },
];

/** A read-only temperature sensor — an entity with no action. */
const TEMPERATURE_SENSOR: Capability[] = [
  {
    kind: "numeric",
    property: "temperature",
    access: { readable: true, writable: false },
    valueType: "numeric",
    unit: "°C",
  },
];

/** A writable numeric with no declared range — not a `number`. */
const UNBOUNDED_NUMERIC: Capability[] = [
  {
    kind: "numeric",
    property: "level",
    access: { readable: true, writable: true },
    valueType: "numeric",
  },
];

/** A writable enum with no permitted values — not a `select`. */
const UNENUMERATED_CONTROL: Capability[] = [
  {
    kind: "enum",
    property: "mode",
    access: { readable: true, writable: true },
    valueType: "enum",
  },
];

describe("resolveDeviceClass", () => {
  it("selects each class the capability model can drive", () => {
    expect(resolveDeviceClass(ZIGBEE_LIGHT)).toBe("light");
    expect(resolveDeviceClass(NANOLEAF_LIGHT)).toBe("light");
    expect(resolveDeviceClass(SHELLY_COVER)).toBe("cover");
    expect(resolveDeviceClass(TRANSPORT_ONLY_COVER)).toBe("cover");
    expect(resolveDeviceClass(ZIGBEE_FAN)).toBe("fan");
    expect(resolveDeviceClass(ZIGBEE_CLIMATE)).toBe("climate");
    expect(resolveDeviceClass(SETPOINT_ONLY_CLIMATE)).toBe("climate");
    expect(resolveDeviceClass(ZIGBEE_LOCK)).toBe("lock");
    expect(resolveDeviceClass(BOUNDED_NUMERIC)).toBe("number");
    expect(resolveDeviceClass(ENUMERATED_CONTROL)).toBe("select");
  });

  it("falls back to the entity class for a device of no class", () => {
    expect(resolveDeviceClass(SHELLY_SWITCH)).toBe("entity");
    expect(resolveDeviceClass(TEMPERATURE_SENSOR)).toBe("entity");
    expect(resolveDeviceClass(UNBOUNDED_NUMERIC)).toBe("entity");
    expect(resolveDeviceClass(UNENUMERATED_CONTROL)).toBe("entity");
    expect(resolveDeviceClass([])).toBe("entity");
  });

  it("maps a profile to exactly one class, always a known one", () => {
    const profiles = [
      ZIGBEE_LIGHT,
      NANOLEAF_LIGHT,
      SHELLY_COVER,
      TRANSPORT_ONLY_COVER,
      ZIGBEE_FAN,
      ZIGBEE_CLIMATE,
      SETPOINT_ONLY_CLIMATE,
      ZIGBEE_LOCK,
      BOUNDED_NUMERIC,
      ENUMERATED_CONTROL,
      SHELLY_SWITCH,
      TEMPERATURE_SENSOR,
      UNBOUNDED_NUMERIC,
      UNENUMERATED_CONTROL,
      [],
    ];

    for (const profile of profiles) {
      const resolved = resolveDeviceClass(profile);
      expect(WALL_DEVICE_CLASSES).toContain(resolved);
    }
  });

  it("prefers the more specific class when a profile offers several", () => {
    // A cover positions (a bounded numeric) and transports; it is a cover, not a number.
    expect(resolveDeviceClass(SHELLY_COVER)).toBe("cover");
    // A light is driven by a bounded numeric brightness; it is a light, not a number.
    expect(resolveDeviceClass(NANOLEAF_LIGHT)).toBe("light");
    // A lock's writable enum would otherwise read as a select.
    expect(resolveDeviceClass(ZIGBEE_LOCK)).toBe("lock");
    // A climate's writable bounded setpoint would otherwise read as a number.
    expect(resolveDeviceClass(SETPOINT_ONLY_CLIMATE)).toBe("climate");
  });
});

describe("the device-class catalogue", () => {
  it("names only widget types the shared catalogue offers", () => {
    for (const deviceClass of WALL_DEVICE_CLASSES) {
      expect(WALL_WIDGET_TYPES).toContain(deviceClass);
    }
  });
});

describe("deviceCanDriveClass", () => {
  it("lets a device drive the widget type of its own class", () => {
    expect(deviceCanDriveClass(ZIGBEE_LIGHT, "light")).toBe(true);
    expect(deviceCanDriveClass(SHELLY_COVER, "cover")).toBe(true);
    expect(deviceCanDriveClass(ZIGBEE_FAN, "fan")).toBe(true);
    expect(deviceCanDriveClass(ZIGBEE_CLIMATE, "climate")).toBe(true);
    expect(deviceCanDriveClass(ZIGBEE_LOCK, "lock")).toBe(true);
    expect(deviceCanDriveClass(BOUNDED_NUMERIC, "number")).toBe(true);
    expect(deviceCanDriveClass(ENUMERATED_CONTROL, "select")).toBe(true);
  });

  it("refuses a class the device's capabilities cannot drive", () => {
    // The gap is made visible rather than drawn inert.
    expect(deviceCanDriveClass(ZIGBEE_LIGHT, "cover")).toBe(false);
    expect(deviceCanDriveClass(SHELLY_COVER, "light")).toBe(false);
    expect(deviceCanDriveClass(BOUNDED_NUMERIC, "light")).toBe(false);
  });

  it("lets every device drive the typed entity fallback", () => {
    // `entity` is the typed fallback: a switch, a read-only sensor, and a device
    // with no capability at all all present through it.
    for (const profile of [SHELLY_SWITCH, TEMPERATURE_SENSOR, UNBOUNDED_NUMERIC, []]) {
      expect(resolveDeviceClass(profile)).toBe("entity");
      expect(deviceCanDriveClass(profile, "entity")).toBe(true);
    }
  });

  it("explains, in the widget, a device whose capabilities drive no class", async () => {
    // A read-only sensor drives no specialised class, so a `light` widget bound to
    // one reports the gap inside its own area rather than drawing an inert card.
    expect(deviceCanDriveClass(TEMPERATURE_SENSOR, "light")).toBe(false);

    const widget = (
      await readFile(
        join(import.meta.dirname, "..", "src/app/wall/widgets/DeviceWidget.tsx"),
        "utf8",
      )
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(widget).toContain("deviceCanDriveClass(device.capabilities, deviceClass)");
    expect(widget).toContain("ContainedExplanation");
  });
});
