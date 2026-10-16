import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import { deviceColorRgb } from "../src/app/wall/cards/device-color.js";
import {
  defaultLightControlKind,
  lightCardControls,
  lightCardReading,
  lightTurnOnCommand,
} from "../src/app/wall/cards/LightCard.js";

/**
 * The wall light card: the pure control selection, and the render asserted
 * structurally against its source.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const CARD = join(APP_DIR, "wall/cards/LightCard.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function onOff(property = "on"): Capability {
  return {
    kind: "switch",
    property,
    access: rw,
    valueType: "boolean",
    valueOn: true,
    valueOff: false,
  };
}

function zigbeeOnOff(): Capability {
  return {
    kind: "switch",
    property: "state",
    access: rw,
    valueType: "boolean",
    valueOn: "ON",
    valueOff: "OFF",
  };
}

function numeric(property: string, access = rw, extra: Partial<Capability> = {}): Capability {
  return { kind: "numeric", property, access, valueType: "numeric", ...extra };
}

function light(features: Capability[]): Capability {
  return { kind: "light", access: rw, valueType: "composite", features };
}

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function cardSource(): Promise<string> {
  return stripComments(await readFile(CARD, "utf8"));
}

describe("lightCardControls", () => {
  it("offers a brightness control only when the device declares it", () => {
    const only = lightCardControls([light([zigbeeOnOff(), numeric("brightness")])]);
    expect(only.map((control) => control.kind)).toEqual(["brightness"]);
    expect(only[0]?.capability.property).toBe("brightness");

    const none = lightCardControls([light([zigbeeOnOff()])]);
    expect(none).toEqual([]);
  });

  it("offers each declared control, in the card's own order", () => {
    const all = lightCardControls([
      light([
        zigbeeOnOff(),
        numeric("brightness"),
        numeric("color_temp", rw, { range: { min: 153, max: 500 } }),
        numeric("hue", rw, { range: { min: 0, max: 360 } }),
      ]),
    ]);
    expect(all.map((control) => control.kind)).toEqual(["brightness", "color_temp", "color"]);
    expect(all.map((control) => control.capability.property)).toEqual([
      "brightness",
      "color_temp",
      "hue",
    ]);
  });

  it("never offers a control the capability cannot drive", () => {
    // A read-only colour temperature, and a composite colour no single control
    // can set, are both omitted rather than rendered inert.
    const controls = lightCardControls([
      light([
        zigbeeOnOff(),
        numeric("brightness"),
        numeric("color_temp", ro),
        { kind: "composite", property: "color", access: rw, valueType: "composite" },
      ]),
    ]);
    expect(controls.map((control) => control.kind)).toEqual(["brightness"]);
  });
});

describe("defaultLightControlKind", () => {
  it("expands the brightness first, then colour temperature, then colour", () => {
    const controls = (properties: string[]) =>
      lightCardControls([light([zigbeeOnOff(), ...properties.map((p) => numeric(p))])]);

    expect(defaultLightControlKind(controls(["brightness", "color_temp", "hue"]))).toBe(
      "brightness",
    );
    expect(defaultLightControlKind(controls(["color_temp", "hue"]))).toBe("color_temp");
    expect(defaultLightControlKind(controls(["hue"]))).toBe("color");
    expect(defaultLightControlKind(controls([]))).toBeUndefined();
  });
});

describe("lightTurnOnCommand", () => {
  it("turns an off light on through its declared on/off encoding", () => {
    expect(
      lightTurnOnCommand({
        isOn: false,
        onOffCapability: zigbeeOnOff(),
        resolvedOnOffValue: "OFF",
      }),
    ).toBe("ON");
    expect(
      lightTurnOnCommand({ isOn: false, onOffCapability: onOff(), resolvedOnOffValue: false }),
    ).toBe(true);
  });

  it("issues no command when the light is already on, or has no on/off capability", () => {
    expect(
      lightTurnOnCommand({ isOn: true, onOffCapability: zigbeeOnOff(), resolvedOnOffValue: "ON" }),
    ).toBeUndefined();
    expect(
      lightTurnOnCommand({ isOn: false, onOffCapability: null, resolvedOnOffValue: undefined }),
    ).toBeUndefined();
  });
});

describe("lightCardReading", () => {
  it("reads the brightness as a percentage of its own range while on", () => {
    expect(
      lightCardReading({ isOn: true, brightnessValue: 180, range: { min: 0, max: 254 } }),
    ).toBe("71%");
    expect(lightCardReading({ isOn: true, brightnessValue: 40, range: { min: 0, max: 100 } })).toBe(
      "40%",
    );
  });

  it("reads the plain on state for a light with no brightness, and Off when off", () => {
    expect(lightCardReading({ isOn: true })).toBe("On");
    expect(
      lightCardReading({ isOn: false, brightnessValue: 180, range: { min: 0, max: 254 } }),
    ).toBe("Off");
  });
});

describe("deviceColorRgb", () => {
  it("derives a colour from a reported hue", () => {
    expect(deviceColorRgb({ hue: 120 })).toEqual([0, 255, 0]);
  });

  it("reads a hue and saturation beneath the colour composite", () => {
    expect(deviceColorRgb({ color: { hue: 120, saturation: 100 } })).toEqual([0, 255, 0]);
  });

  it("derives a colour from a colour temperature alone", () => {
    const warmed = deviceColorRgb({ color_temp: 500 });
    const cooled = deviceColorRgb({ color_temp: 153 });
    expect(warmed).toBeDefined();
    expect(cooled).toBeDefined();
    // A warm white is redder than it is blue; a cool white is nearly neutral.
    expect((warmed?.[0] ?? 0) - (warmed?.[2] ?? 0)).toBeGreaterThan(50);
    expect((cooled?.[0] ?? 0) - (cooled?.[2] ?? 0)).toBeLessThan(20);
  });

  it("reports no colour for a device that reports neither", () => {
    expect(deviceColorRgb({})).toBeUndefined();
    expect(deviceColorRgb({ brightness: 180 })).toBeUndefined();
  });
});

describe("wall light card source", () => {
  it("makes the icon affordance the light's on/off control, its glyph stating on by fill and colour", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardIcon");
    expect(source).toContain("onActivate=");
    expect(source).toContain("pressed={isOn}");
    // The on glyph is filled; the off one is outline — the non-colour channel.
    expect(source).toContain('fill="currentColor"');
    expect(source).toContain("deviceTileToggledValue(onOffCapability, onOffControl.value)");
  });

  it("carries the light's own colour on the icon and the slider, through the ported improvement", async () => {
    const source = await cardSource();
    expect(source).toContain("deviceColorRgb(device.state)");
    expect(source).toContain("color={accent}");
  });

  it("keeps its reading while off and turns the light on from a value control", async () => {
    const source = await cardSource();
    expect(source).toContain("lightCardReading(");
    expect(source).toContain("lightTurnOnCommand(");
  });

  it("presents the active control as a slider with the other declared controls beside it", async () => {
    const source = await cardSource();
    // The row carries a flexible slider, so the mounted row is the flexible one: the
    // slider keeps its grow and the trailing icon controls are not stretched.
    expect(source).toContain('<WallCardActions distribution="flexible">');
    expect(source).toContain("<WallCardSlider");
    expect(source).toContain("<WallCardIconButton");
    // Only a declared control is rendered: the buttons are the declared controls
    // other than the active one.
    expect(source).toContain(".filter((control) => control.kind !== activeKind)");
  });

  it("disables every control while the device is unreachable", async () => {
    const source = await cardSource();
    expect(source).toContain("const disabled = !device.reachable");
    expect(source).toContain("disabled={disabled}");
  });

  it("reuses the shared observation encoding as a non-textual indicator", async () => {
    const source = await cardSource();
    expect(source).toContain("deviceTileObservation(device, now)");
    expect(source).toContain("<WallCardObservation");
  });

  it("presents no device-management affordance", async () => {
    const source = await cardSource();
    for (const affordance of [
      "isFavorite",
      "toggleFavorite",
      "hideDevice",
      "unhideDevice",
      "deviceDetailPath",
      "HiddenMarker",
      "FavoriteToggle",
    ]) {
      expect(source).not.toContain(affordance);
    }
  });
});
