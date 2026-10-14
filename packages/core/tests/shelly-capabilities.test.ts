import { describe, expect, it } from "bun:test";
import { shellyCapabilitiesFor } from "../src/device-sources/shelly-capabilities.js";

describe("shellyCapabilitiesFor", () => {
  it("declares a read-only Wh energy capability for a metered switch", () => {
    const capabilities = shellyCapabilitiesFor("switch", { metered: true });
    const energy = capabilities.find((c) => c.property === "energy");

    expect(energy).toBeDefined();
    expect(energy?.kind).toBe("numeric");
    expect(energy?.valueType).toBe("numeric");
    expect(energy?.unit).toBe("Wh");
    expect(energy?.access).toEqual({ readable: true, writable: false });
  });

  it("omits the energy capability for a switch and an outlet that are not metered", () => {
    for (const type of ["switch", "outlet"] as const) {
      const capabilities = shellyCapabilitiesFor(type);
      expect(capabilities.some((c) => c.property === "energy")).toBe(false);
    }
  });

  it("never declares energy for a cover, even when a reading was observed", () => {
    const capabilities = shellyCapabilitiesFor("cover", { metered: true });
    expect(capabilities.some((c) => c.property === "energy")).toBe(false);
  });

  it("appends energy after the existing metered-switch properties without disturbing them", () => {
    const metered = shellyCapabilitiesFor("outlet", { metered: true }).map((c) => c.property);
    expect(metered).toEqual(["on", "power", "voltage", "current", "energy"]);
  });

  describe("per-channel composition (task 4.1)", () => {
    it("describes two channels of one device independently: only the metered channel declares energy", () => {
      const metered = shellyCapabilitiesFor("switch", { metered: true });
      const nonMetered = shellyCapabilitiesFor("switch", { metered: false });

      expect(metered.some((c) => c.property === "energy")).toBe(true);
      expect(nonMetered.some((c) => c.property === "energy")).toBe(false);
      expect(metered.filter((c) => c.property !== "energy")).toEqual(nonMetered);
    });

    it("yields the outlet kind for a switch channel of an outlet-registered device", () => {
      const capabilities = shellyCapabilitiesFor("outlet", { metered: true });
      const onOff = capabilities.find((c) => c.property === "on");

      expect(onOff?.kind).toBe("outlet");
      expect(capabilities.some((c) => c.property === "position")).toBe(false);
    });

    it("yields the switch kind for a switch channel of a switch-registered device", () => {
      const onOff = shellyCapabilitiesFor("switch", { metered: true }).find(
        (c) => c.property === "on",
      );

      expect(onOff?.kind).toBe("switch");
    });

    it("yields position, transport action and movement state, not on/off, for a cover channel", () => {
      const capabilities = shellyCapabilitiesFor("cover", { metered: true });
      const properties = capabilities.map((c) => c.property);

      expect(properties).toEqual(["position", "action", "state"]);
      expect(properties).not.toContain("on");
      expect(properties).not.toContain("energy");
    });
  });

  describe("cover transport action (design.md D15)", () => {
    it("declares a write-only transport enum naming open, close and stop", () => {
      const action = shellyCapabilitiesFor("cover").find((c) => c.property === "action");

      expect(action).toBeDefined();
      expect(action?.kind).toBe("enum");
      expect(action?.valueType).toBe("enum");
      // A transport is a command, not a reported value: it is writable so a
      // source-neutral consumer can express it, and not readable so no consumer
      // renders a readout for a value `normalize()` never produces (design.md D15).
      expect(action?.access).toEqual({ readable: false, writable: true });
      expect(action?.permittedValues).toEqual(["open", "close", "stop"]);
    });

    it("declares no transport action for a switch or an outlet", () => {
      for (const type of ["switch", "outlet"] as const) {
        const capabilities = shellyCapabilitiesFor(type);
        expect(capabilities.some((c) => c.property === "action")).toBe(false);
      }
    });
  });
});
