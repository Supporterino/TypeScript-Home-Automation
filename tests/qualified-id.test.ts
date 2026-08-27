import { describe, expect, it } from "bun:test";
import {
  formatQualifiedId,
  parseQualifiedId,
  QUALIFIED_ID_DELIMITER,
} from "../src/core/device-sources/qualified-id.js";

describe("qualified-id", () => {
  it("joins a source and device id with the delimiter", () => {
    expect(formatQualifiedId("zigbee", "0x00124b0022a1b2c3")).toBe("zigbee:0x00124b0022a1b2c3");
  });

  it("round-trips a plain Zigbee identifier", () => {
    const qualified = formatQualifiedId("zigbee", "0x00124b0022a1b2c3");
    expect(parseQualifiedId(qualified)).toEqual({
      source: "zigbee",
      deviceId: "0x00124b0022a1b2c3",
    });
  });

  it("round-trips a Shelly identifier", () => {
    const qualified = formatQualifiedId("shelly", "office_plug");
    expect(parseQualifiedId(qualified)).toEqual({ source: "shelly", deviceId: "office_plug" });
  });

  it("round-trips a state key containing the delimiter, preserved intact", () => {
    const qualified = formatQualifiedId("state", "motion-light:lights_on");
    expect(parseQualifiedId(qualified)).toEqual({
      source: "state",
      deviceId: "motion-light:lights_on",
    });
  });

  it("splits on the first occurrence only, not every occurrence", () => {
    const parsed = parseQualifiedId("state:a:b:c");
    expect(parsed).toEqual({ source: "state", deviceId: "a:b:c" });
  });

  it("rejects a source identifier containing the delimiter", () => {
    expect(() => formatQualifiedId("bad:source", "id")).toThrow();
  });

  it("rejects a qualified identifier with no delimiter at all", () => {
    expect(() => parseQualifiedId("no-delimiter-here")).toThrow();
  });

  it("exports the delimiter used", () => {
    expect(QUALIFIED_ID_DELIMITER).toBe(":");
  });
});
