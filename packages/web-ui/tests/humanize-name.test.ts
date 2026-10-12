import { describe, expect, it } from "bun:test";
import { humanizeDeviceName } from "../src/app/lib/humanize-name.js";

/**
 * Pure rules for device-name humanisation (task 6.1; design.md D8;
 * specs/web-ui "Device Name Presentation"). No DOM — the helper is
 * dependency-free, so the contract is asserted directly.
 */
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
