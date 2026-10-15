/**
 * Characterisation test for HomeKit accessory UUID derivation (task 6.15).
 *
 * A HomeKit pairing is keyed by these UUIDs — the bridge's own UUID and each
 * accessory's UUID — and changing any of them forces every paired Home app
 * to re-pair. `hap-nodejs`'s `uuid.generate()` is a stable, deterministic
 * third-party function of its seed string; what a refactor of this
 * repository's own code can actually break is *which seed* it feeds in
 * (accidentally swapping in a friendly/display name, dropping a source
 * prefix, etc.), not the third-party hashing itself. This test therefore
 * freezes the seed the source-neutral factory constructs — `uuidSeedFor()`
 * for Zigbee / Shelly / state toggles — and `bridgeUuidSeed()` for the
 * bridge, rather than importing `hap-nodejs` to recompute the final UUID.
 *
 * This also sidesteps a real hazard: several sibling HomeKit test files
 * (`homekit-accessory-factory.test.ts`, `homekit-service.test.ts`) each
 * install their own `mock.module("hap-nodejs", ...)`. Because Bun evaluates
 * all test files in one process and a module is only evaluated (and its
 * internal `import { uuid } from "hap-nodejs"` bound) once, whichever mock
 * happened to be installed first when a factory module first loads sticks
 * for the rest of the run — so a test that imports the real `hap-nodejs` to
 * recompute a factory's actual UUID is order-dependent and was observed to
 * fail intermittently depending on file load order. The seed strings below
 * are computed in application code with no `hap-nodejs` import at all, so
 * this test is immune to that.
 *
 * For reference, feeding these exact seeds through the real
 * `hap-nodejs` `uuid.generate()` (verified once, out of band) yields:
 *   - bridge:  "CC:22:3D:E3:CE:F8"        → 910dcd1f-d861-423c-887e-a212c30817c4
 *   - zigbee:  "0x00124b0022a1b2c3"       → a8dd7147-c3e5-4cc1-a94e-2aca7463aac9
 *   - shelly:  "shelly:office_plug"       → 5f4b7c41-2a52-44d2-8f91-877352b668a2
 *   - state:   "state:night_mode"         → 11ca471a-6bd4-4b94-9b17-626542a4fc13
 *
 * Run this test — and see it pass — before any refactor of the HomeKit
 * accessory-source layer (task 6.16) begins.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import type { DeviceDescriptor } from "@ts-ha/shared";

// The factory modules statically `import { uuid } from "hap-nodejs"` at their
// top, which crashes under Bun (missing chacha20-poly1305 cipher) unless the
// polyfill runs first — but only if this is their *first* load in the whole
// test run. A static import here would let Bun's bundler hoist the dependency
// ahead of the polyfill regardless of source order (this is why `HomekitService`
// itself uses a *dynamic* `await import("hap-nodejs")`, per its own comment).
// Dynamic imports below, applied in the same order, preserve the sequencing.
// Only the pure seed functions are used from each module — none of them call
// into `hap-nodejs`, so this is unaffected by whether some other test file
// already replaced "hap-nodejs" with a mock.
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
