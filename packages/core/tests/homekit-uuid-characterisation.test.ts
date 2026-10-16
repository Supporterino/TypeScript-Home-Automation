/**
 * Characterisation test for HomeKit accessory UUID derivation: freezes the seeds the
 * source-neutral factory and bridge construct, since changing a seed forces re-pairing.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import type { DeviceDescriptor } from "@ts-ha/shared";

// The factory modules statically import `hap-nodejs`, which crashes under Bun unless the
// polyfill runs first; the dynamic imports below preserve that sequencing.
type UuidSeedInput = Pick<DeviceDescriptor, "source" | "id" | "qualifiedId">;

let uuidSeedFor: (descriptor: UuidSeedInput) => string;
let bridgeUuidSeed: (username: string) => string;

beforeAll(async () => {
  await import("../src/services/homekit-crypto-polyfill.js");
  uuidSeedFor = (await import("../src/services/homekit-descriptor-factory.js")).uuidSeedFor;
  bridgeUuidSeed = (await import("../src/services/homekit-service.js")).bridgeUuidSeed;
});

/** A descriptor's identity triple — the only fields the UUID seed may depend on. */
const seedInput = (source: string, id: string): UuidSeedInput => ({
  source,
  id,
  qualifiedId: `${source}:${id}`,
});

describe("HomeKit accessory UUID derivation (characterisation)", () => {
  it("seeds the bridge UUID from the configured username (MAC address) alone", () => {
    expect(bridgeUuidSeed("CC:22:3D:E3:CE:F8")).toBe("CC:22:3D:E3:CE:F8");
  });

  it("seeds a Zigbee accessory UUID from the device's IEEE address alone", () => {
    expect(uuidSeedFor(seedInput("zigbee", "0x00124b0022a1b2c3"))).toBe("0x00124b0022a1b2c3");
  });

  it("seeds a Shelly accessory UUID from 'shelly:<registered name>'", () => {
    expect(uuidSeedFor(seedInput("shelly", "office_plug"))).toBe("shelly:office_plug");
  });

  it("seeds a state toggle accessory UUID from 'state:<state key>'", () => {
    expect(uuidSeedFor(seedInput("state", "night_mode"))).toBe("state:night_mode");
  });

  it("falls back to the qualified id for a source with no prior pairing", () => {
    const nanoleaf: UuidSeedInput = {
      source: "nanoleaf",
      id: "panels",
      qualifiedId: "nanoleaf:panels",
    };
    expect(uuidSeedFor(nanoleaf)).toBe("nanoleaf:panels");
  });
});
