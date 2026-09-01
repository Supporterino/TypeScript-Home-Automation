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
import type { Capability } from "../../types/capabilities.js";
import type { ShellyDeviceType } from "../../types/shelly.js";

/**
 * Capability description for a Shelly switch or outlet (on/off + read-only
 * telemetry). `kind` is `"outlet"` or `"switch"` — mirroring the same
 * distinction Zigbee2MQTT's own `exposes` makes — so a HAP projection can
 * tell the two apart without any Shelly-specific knowledge (design.md D22).
 */
function switchCapabilities(kind: "switch" | "outlet"): Capability[] {
  return [
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
 */
export function shellyCapabilitiesFor(type: ShellyDeviceType): Capability[] {
  if (type === "cover") return COVER_CAPABILITIES;
  return switchCapabilities(type === "outlet" ? "outlet" : "switch");
}
