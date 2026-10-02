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
});
