/**
 * Authored capability descriptions for Shelly devices (design.md D22; task
 * 6.7b).
 *
 * Shelly publishes no capability schema for a source to derive one from, so
 * each device type's capability description is hand-authored here — once,
 * source-neutral — rather than left to per-family handling in whatever
 * consumes it. The normalised property names declared here (`on`, `power`,
 * `position`, …) are also the property names `ShellyDeviceSource` uses when
 * it builds a device's `state`, so the capability schema and the state it
 * describes always agree.
 */
import type { Capability } from "@ts-ha/shared";
import type { ShellyDeviceType } from "@ts-ha/shared/types/shelly";

/**
 * Read-only cumulative active energy, declared in the canonical watt-hour
 * unit (design.md D7). Only metering devices — those that actually report a
 * cumulative reading — declare it; a non-metering device omits the capability
 * entirely rather than declaring it with a zero, so "not metered" stays
 * distinguishable from "metered, consumed nothing" (specs/device-sources,
 * "Cumulative Energy Telemetry").
 */
const ENERGY_CAPABILITY: Capability = {
  kind: "numeric",
  property: "energy",
  access: { readable: true, writable: false },
  valueType: "numeric",
  unit: "Wh",
};

/**
 * Capability description for a Shelly switch or outlet (on/off + read-only
 * telemetry). `kind` is `"outlet"` or `"switch"` — mirroring the same
 * distinction Zigbee2MQTT's own `exposes` makes — so a HAP projection can
 * tell the two apart without any Shelly-specific knowledge (design.md D22).
 */
function switchCapabilities(kind: "switch" | "outlet", metered: boolean): Capability[] {
  const capabilities: Capability[] = [
    {
      kind,
      property: "on",
      access: { readable: true, writable: true },
      valueType: "boolean",
      valueOn: true,
      valueOff: false,
    },
    {
      kind: "numeric",
      property: "power",
      access: { readable: true, writable: false },
      valueType: "numeric",
      unit: "W",
    },
    {
      kind: "numeric",
      property: "voltage",
      access: { readable: true, writable: false },
      valueType: "numeric",
      unit: "V",
    },
    {
      kind: "numeric",
      property: "current",
      access: { readable: true, writable: false },
      valueType: "numeric",
      unit: "A",
    },
  ];

  if (metered) {
    capabilities.push(ENERGY_CAPABILITY);
  }

  return capabilities;
}

/** Possible cover states, mirroring `ShellyCoverState`. */
const COVER_STATE_VALUES = ["open", "closed", "opening", "closing", "stopped", "calibrating"];

/** Capability description for a Shelly cover (position + read-only movement state). */
const COVER_CAPABILITIES: Capability[] = [
  {
    kind: "numeric",
    property: "position",
    access: { readable: true, writable: true },
    valueType: "numeric",
    range: { min: 0, max: 100 },
  },
  {
    kind: "enum",
    property: "state",
    access: { readable: true, writable: false },
    valueType: "enum",
    permittedValues: COVER_STATE_VALUES,
  },
];

/**
 * Returns the authored capability description for a Shelly device type.
 * Every Shelly device satisfies the rich descriptor requirement in full —
 * it never renders less capably than a Zigbee device merely because its
 * capabilities are authored rather than discovered.
 *
 * `metered` states whether the device has actually reported a cumulative
 * energy reading. Shelly publishes no metering flag on a device, so the
 * source derives it from the observed reading and passes it in; without it
 * the energy capability is omitted rather than declared for every switch.
 */
export function shellyCapabilitiesFor(
  type: ShellyDeviceType,
  options: { metered?: boolean } = {},
): Capability[] {
  if (type === "cover") return COVER_CAPABILITIES;
  return switchCapabilities(type === "outlet" ? "outlet" : "switch", options.metered ?? false);
}
