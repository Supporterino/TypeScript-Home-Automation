/**
 * Authored capability descriptions for Shelly devices. Shelly publishes no schema to
 * derive one from, so each device type's description is hand-authored here, using the
 * same property names `ShellyDeviceSource` emits in a device's `state`.
 */
import type { Capability } from "@ts-ha/shared";
import type { ShellyDeviceType } from "@ts-ha/shared/types/shelly";

/**
 * Read-only cumulative active energy in watt-hours. Only metering devices declare
 * it; a non-metering device omits it rather than declaring a zero.
 */
const ENERGY_CAPABILITY: Capability = {
  kind: "numeric",
  property: "energy",
  access: { readable: true, writable: false },
  valueType: "numeric",
  unit: "Wh",
};

/**
 * Capability description for a Shelly switch or outlet (on/off plus read-only
 * telemetry); `kind` is `"switch"` or `"outlet"`.
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

/**
 * The discrete transport commands a Shelly cover accepts, one per
 * `Cover.Open`/`Cover.Close`/`Cover.Stop` RPC, declared as a write-only enum.
 */
const COVER_TRANSPORT_VALUES = ["open", "close", "stop"];

/**
 * Capability description for a Shelly cover: go-to position, a write-only transport
 * action, and a read-only movement state.
 */
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
    property: "action",
    access: { readable: false, writable: true },
    valueType: "enum",
    permittedValues: COVER_TRANSPORT_VALUES,
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
 * Return the authored capability description for a single component channel of a
 * Shelly device. `metered` states whether this channel has reported a cumulative
 * reading; when false the energy capability is omitted.
 */
export function shellyCapabilitiesFor(
  type: ShellyDeviceType,
  options: { metered?: boolean } = {},
): Capability[] {
  if (type === "cover") return COVER_CAPABILITIES;
  return switchCapabilities(type === "outlet" ? "outlet" : "switch", options.metered ?? false);
}
