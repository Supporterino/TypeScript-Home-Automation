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
 * freezes the seed each factory constructs — `zigbeeAccessoryUuidSeed()`,
 * `shellyAccessoryUuidSeed()`, `stateToggleUuidSeed()`, `bridgeUuidSeed()` —
 * rather than importing `hap-nodejs` to recompute the final UUID.
 *
 * This also sidesteps a real hazard: several sibling HomeKit test files
 * (`homekit-accessory-factory.test.ts`, `homekit-service.test.ts`,
 * `homekit-shelly-factory.test.ts`, `homekit-state-factory.test.ts`) each
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
import type { ShellyDevice } from "../src/core/services/shelly-service.js";
import type { ZigbeeDevice } from "../src/types/zigbee/bridge.js";

// The three factory modules statically `import { uuid } from "hap-nodejs"` at
// their top, which crashes under Bun (missing chacha20-poly1305 cipher)
// unless the polyfill runs first — but only if this is their *first* load in
// the whole test run. A static import here would let Bun's bundler hoist the
// dependency ahead of the polyfill regardless of source order (this is why
// `HomekitService` itself uses a *dynamic* `await import("hap-nodejs")`, per
// its own comment). Dynamic imports below, applied in the same order,
// preserve the sequencing. Only the pure seed functions are used from each
// module — none of them call into `hap-nodejs`, so this is unaffected by
// whether some other test file already replaced "hap-nodejs" with a mock.
let zigbeeAccessoryUuidSeed: (device: ZigbeeDevice) => string;
let bridgeUuidSeed: (username: string) => string;
let shellyAccessoryUuidSeed: (device: ShellyDevice) => string;
let stateToggleUuidSeed: (stateKey: string) => string;

beforeAll(async () => {
  await import("../src/core/services/homekit-crypto-polyfill.js");
  zigbeeAccessoryUuidSeed = (await import("../src/core/services/homekit-accessory-factory.js"))
    .zigbeeAccessoryUuidSeed;
  bridgeUuidSeed = (await import("../src/core/services/homekit-service.js")).bridgeUuidSeed;
  shellyAccessoryUuidSeed = (await import("../src/core/services/homekit-shelly-factory.js"))
    .shellyAccessoryUuidSeed;
  stateToggleUuidSeed = (await import("../src/core/services/homekit-state-factory.js"))
    .stateToggleUuidSeed;
});

describe("HomeKit accessory UUID derivation (characterisation)", () => {
  it("seeds the bridge UUID from the configured username (MAC address) alone", () => {
    expect(bridgeUuidSeed("CC:22:3D:E3:CE:F8")).toBe("CC:22:3D:E3:CE:F8");
  });

  it("seeds a Zigbee accessory UUID from the device's IEEE address alone", () => {
    const device: ZigbeeDevice = {
      ieee_address: "0x00124b0022a1b2c3",
      friendly_name: "office_lamp",
      type: "Router",
      supported: true,
      disabled: false,
      interview_state: "SUCCESSFUL",
      definition: null,
    };
    expect(zigbeeAccessoryUuidSeed(device)).toBe("0x00124b0022a1b2c3");

    // A rename does not change the seed — the identity is the IEEE address.
    const renamed: ZigbeeDevice = { ...device, friendly_name: "kitchen_lamp" };
    expect(zigbeeAccessoryUuidSeed(renamed)).toBe(zigbeeAccessoryUuidSeed(device));
  });

  it("seeds a Shelly accessory UUID from 'shelly:<registered name>'", () => {
    const device: ShellyDevice = {
      name: "office_plug",
      host: "192.168.1.50",
      type: "switch",
      transport: "http",
    };
    expect(shellyAccessoryUuidSeed(device)).toBe("shelly:office_plug");
  });

  it("seeds a state toggle accessory UUID from 'state:<state key>'", () => {
    expect(stateToggleUuidSeed("night_mode")).toBe("state:night_mode");
  });
});
