import type { Capability } from "../capabilities.js";

// ---------------------------------------------------------------------------
// Bridge state
// ---------------------------------------------------------------------------

/** Zigbee2MQTT bridge state published on `zigbee2mqtt/bridge/state`. */
export interface BridgeState {
  state: "online" | "offline";
}

// ---------------------------------------------------------------------------
// Bridge devices
// ---------------------------------------------------------------------------

/** Device type as reported by Zigbee2MQTT. */
export type ZigbeeDeviceType = "Coordinator" | "Router" | "EndDevice";

/** Interview state as reported by Zigbee2MQTT. */
export type ZigbeeInterviewState = "PENDING" | "IN_PROGRESS" | "SUCCESSFUL" | "FAILED";

/**
 * Device definition from Zigbee2MQTT — present when `supported` is `true`.
 *
 * `exposes` is the bridge's published capability description mapped into the
 * source-neutral capability vocabulary by the device registry — it is no
 * longer Zigbee2MQTT's raw `exposes` shape (design.md D22).
 */
export interface ZigbeeDeviceDefinition {
  model: string;
  vendor: string;
  description: string;
  source: "native" | "generated" | "external";
  exposes: Capability[];
  options: unknown[];
}

/**
 * A Zigbee device as reported on `zigbee2mqtt/bridge/devices`.
 *
 * The `definition` field is `null` when `supported` is `false` (unrecognised device).
 */
export interface ZigbeeDevice {
  ieee_address: string;
  friendly_name: string;
  type: ZigbeeDeviceType;
  supported: boolean;
  disabled: boolean;
  description?: string;
  power_source?: string | null;
  interview_state: ZigbeeInterviewState;
  definition: ZigbeeDeviceDefinition | null;
}

// ---------------------------------------------------------------------------
// Bridge groups
// ---------------------------------------------------------------------------

/** One member of a Zigbee2MQTT group, as published on `bridge/groups`. */
export interface ZigbeeGroupMember {
  ieee_address: string;
  endpoint: number;
}

/**
 * A Zigbee2MQTT group as reported on `zigbee2mqtt/bridge/groups`.
 *
 * Identity is `id`, the numeric identifier the bridge assigns — not
 * `friendly_name`, which can be renamed without affecting identity
 * (design.md D2).
 */
export interface ZigbeeGroup {
  id: number;
  friendly_name: string;
  members: ZigbeeGroupMember[];
}

// ---------------------------------------------------------------------------
// Bridge events
// ---------------------------------------------------------------------------

/** Event types published on `zigbee2mqtt/bridge/event`. */
export type BridgeEventType =
  | "device_joined"
  | "device_leave"
  | "device_interview"
  | "device_announce";

/** Payload published on `zigbee2mqtt/bridge/event`. */
export interface BridgeEventPayload {
  type: BridgeEventType;
  data: {
    friendly_name: string;
    ieee_address: string;
    [key: string]: unknown;
  };
}
