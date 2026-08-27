import { describe, expect, it } from "bun:test";
import { mapZ2MExpose, mapZ2MExposes } from "../src/types/capabilities.js";

describe("mapZ2MExposes", () => {
  it("returns an empty array for undefined, null, or non-array input", () => {
    expect(mapZ2MExposes(undefined)).toEqual([]);
    expect(mapZ2MExposes(null)).toEqual([]);
    expect(mapZ2MExposes("not an array")).toEqual([]);
    expect(mapZ2MExposes({})).toEqual([]);
  });

  it("maps a representative z2m payload, preserving properties, constraints, and nesting", () => {
    // A representative dimmable + color-temperature light with a nested
    // composite `features` array, as Zigbee2MQTT actually publishes it.
    const z2mExposes = [
      {
        type: "light",
        features: [
          {
            type: "binary",
            name: "state",
            property: "state",
            access: 7,
            value_on: "ON",
            value_off: "OFF",
          },
          {
            type: "numeric",
            name: "brightness",
            property: "brightness",
            access: 7,
            value_min: 0,
            value_max: 254,
            value_step: 1,
          },
          {
            type: "numeric",
            name: "color_temp",
            property: "color_temp",
            access: 7,
            value_min: 150,
            value_max: 500,
            unit: "mired",
          },
        ],
      },
      {
        type: "enum",
        name: "effect",
        property: "effect",
        access: 2,
        values: ["blink", "breathe", "okay"],
      },
      {
        type: "numeric",
        name: "battery",
        property: "battery",
        access: 1,
        unit: "%",
      },
    ];

    const capabilities = mapZ2MExposes(z2mExposes);

    expect(capabilities).toHaveLength(3);

    // Composite/container: the light, with its nested features preserved.
    const light = capabilities[0];
    expect(light.kind).toBe("light");
    expect(light.valueType).toBe("composite");
    expect(light.features).toHaveLength(3);

    const [state, brightness, colorTemp] = light.features ?? [];
    expect(state.kind).toBe("binary");
    expect(state.property).toBe("state");
    expect(state.valueType).toBe("boolean");
    expect(state.access).toEqual({ readable: true, writable: true });

    expect(brightness.kind).toBe("numeric");
    expect(brightness.property).toBe("brightness");
    expect(brightness.valueType).toBe("numeric");
    expect(brightness.range).toEqual({ min: 0, max: 254 });
    expect(brightness.step).toBe(1);
    expect(brightness.access).toEqual({ readable: true, writable: true });

    expect(colorTemp.range).toEqual({ min: 150, max: 500 });
    expect(colorTemp.unit).toBe("mired");

    // Leaf enum with permitted values, write-only.
    const effect = capabilities[1];
    expect(effect.kind).toBe("enum");
    expect(effect.valueType).toBe("enum");
    expect(effect.permittedValues).toEqual(["blink", "breathe", "okay"]);
    expect(effect.access).toEqual({ readable: false, writable: true });

    // Leaf numeric, read-only, with a unit and no range declared.
    const battery = capabilities[2];
    expect(battery.kind).toBe("numeric");
    expect(battery.unit).toBe("%");
    expect(battery.access).toEqual({ readable: true, writable: false });
    expect(battery.range).toBeUndefined();
  });

  it("preserves an entry of an unrecognised kind rather than discarding it", () => {
    const unknownEntry = {
      type: "some-future-z2m-expose-kind",
      name: "mystery",
      property: "mystery",
      access: 1,
      some_field_this_mapper_has_never_heard_of: 42,
    };

    const [capability] = mapZ2MExposes([unknownEntry]);

    expect(capability.kind).toBe("some-future-z2m-expose-kind");
    expect(capability.valueType).toBe("unknown");
    // The unrecognised entry survives verbatim so a consumer can still
    // present something for it.
    expect(capability.raw).toEqual(unknownEntry);
  });

  it("preserves a non-object entry as an unknown capability rather than throwing", () => {
    const [capability] = mapZ2MExposes([null]);
    expect(capability.kind).toBe("unknown");
    expect(capability.raw).toBeNull();
  });

  it("does not set `raw` on entries of a recognised leaf or container kind", () => {
    const [leaf] = mapZ2MExposes([{ type: "numeric", property: "temperature", access: 1 }]);
    expect(leaf.raw).toBeUndefined();

    const [container] = mapZ2MExposes([{ type: "switch", features: [] }]);
    expect(container.raw).toBeUndefined();
  });

  it("maps a device with no published schema to an empty capability list", () => {
    expect(mapZ2MExposes([])).toEqual([]);
  });

  it("mapZ2MExpose maps a single entry the same way mapZ2MExposes maps an array of one", () => {
    const entry = { type: "binary", name: "contact", property: "contact", access: 1 };
    expect(mapZ2MExpose(entry)).toEqual(mapZ2MExposes([entry])[0]);
  });
});
