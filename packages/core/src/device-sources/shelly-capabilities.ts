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
 * describes agree — with one deliberate exception: a command-only property is
 * declared write-only (`access.writable` without `access.readable`) and has no
 * reported-state counterpart. `ShellyDeviceSource.normalize()` never produces
 * such a property, so declaring it readable would advertise a value the device
 * does not report and let a capability-driven consumer render an inert
 * readout (design.md D15).
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

/**
 * The discrete transport commands a Shelly cover accepts, one per
 * `Cover.Open`/`Cover.Close`/`Cover.Stop` RPC (design.md D15). Declaring them
 * as a writable enum is what lets a source-neutral consumer — the wall's
 * cover transport — command stop without knowing Shelly exists; a Shelly
 * cover that cannot stop would omit `stop` here rather than declare and then
 * refuse it. The transport is a command, not a reported value: it is declared
 * write-only, so no readout is offered for it — the cover's movement is
 * reported by the read-only `state` below.
 */
const COVER_TRANSPORT_VALUES = ["open", "close", "stop"];

/**
 * Capability description for a Shelly cover (go-to position, discrete
 * transport action, and read-only movement state). The transport `action` is a
 * command, so it is declared write-only; the reported `state` records the
 * cover's movement.
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
 * Returns the authored capability description for a single component channel
 * of a Shelly device. `type` is that channel's effective kind — `cover` for a
 * discovered cover component, else the registration's `switch`/`outlet`
 * distinction applied to a discovered switch component — so discovery supplies
 * `switch` vs `cover` while the outlet flag comes from registration (design.md
 * D5). Every Shelly device satisfies the rich descriptor requirement in full —
 * it never renders less capably than a Zigbee device merely because its
 * capabilities are authored rather than discovered.
 *
 * `metered` states whether *this channel* has actually reported a cumulative
 * energy reading. Shelly publishes no metering flag, so the source derives it
 * per channel from that channel's observed reading and passes it in; without
 * it the energy capability is omitted rather than declared for every switch,
 * so channels of one device with mixed metering are described independently.
 */
export function shellyCapabilitiesFor(
  type: ShellyDeviceType,
  options: { metered?: boolean } = {},
): Capability[] {
  if (type === "cover") return COVER_CAPABILITIES;
  return switchCapabilities(type === "outlet" ? "outlet" : "switch", options.metered ?? false);
}
