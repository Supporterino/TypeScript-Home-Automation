import { describe, expect, it } from "bun:test";
import {
  humanizeDeviceName,
  SHORT_DEVICE_NAME_MAX_LENGTH,
  shortDeviceName,
} from "../src/app/lib/humanize-name.js";

/** Pure rules for device-name humanisation and the wall's shortened name form. */
describe("humanizeDeviceName", () => {
  it("splits an underscore identifier on separators and title-cases each word", () => {
    expect(humanizeDeviceName("livingroom_couch")).toBe("Livingroom Couch");
  });

  it("splits a hyphenated identifier on separators and title-cases each word", () => {
    expect(humanizeDeviceName("living-room")).toBe("Living Room");
  });

  it("leaves an already-human, already-spaced name unchanged", () => {
    expect(humanizeDeviceName("Living Room Lamp")).toBe("Living Room Lamp");
  });

  it("returns an empty string unchanged", () => {
    expect(humanizeDeviceName("")).toBe("");
  });

  it("collapses repeated separators and surrounding whitespace", () => {
    expect(humanizeDeviceName("kitchen__ceiling  light")).toBe("Kitchen Ceiling Light");
  });

  it("preserves existing capitalisation after the first letter", () => {
    expect(humanizeDeviceName("livingRoom_couch")).toBe("LivingRoom Couch");
  });
});

describe("shortDeviceName", () => {
  it("returns a name that already fits its card unchanged", () => {
    expect(shortDeviceName("Hallway")).toBe("Hallway");
    expect(shortDeviceName("Kitchen Light")).toBe("Kitchen Light");
    expect(shortDeviceName("Hallway")).toBe(humanizeDeviceName("Hallway"));
  });

  it("humanizes a raw identifier before shortening it", () => {
    expect(shortDeviceName("kitchen_ceiling_light")).toBe("Ceiling Light");
  });

  it("keeps two long names that share a prefix distinguishable", () => {
    const light = shortDeviceName("Kitchen Ceiling Light");
    const lamp = shortDeviceName("Kitchen Ceiling Lamp");

    expect(light).toBe("Ceiling Light");
    expect(lamp).toBe("Ceiling Lamp");
    expect(light).not.toBe(lamp);
    // Where an ellipsis would render the same shared prefix twice.
    expect(light.length).toBeLessThanOrEqual(SHORT_DEVICE_NAME_MAX_LENGTH);
    expect(lamp.length).toBeLessThanOrEqual(SHORT_DEVICE_NAME_MAX_LENGTH);
  });

  it("keeps the whole name inside a caller's budget", () => {
    expect(shortDeviceName("Kitchen Ceiling Light", 32)).toBe("Kitchen Ceiling Light");
  });

  it("keeps as many trailing words as fit and never cuts mid-word", () => {
    expect(shortDeviceName("Living Room Left Lamp")).toBe("Room Left Lamp");
    expect(shortDeviceName("VeryLongDeviceName")).toBe("VeryLongDeviceName");
  });

  it("never shortens a name to nothing", () => {
    expect(shortDeviceName("A")).toBe("A");
    expect(shortDeviceName("Hallway Ceiling Light", 1)).toBe("Light");
  });
});
