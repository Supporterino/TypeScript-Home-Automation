/** Automation trigger context contract, delivered through the wire. */

import type { ZigbeeDevice } from "./types/zigbee/bridge.js";

/** Context passed to an automation's execute method. */
export type TriggerContext =
  | {
      type: "mqtt";
      topic: string;
      payload: Record<string, unknown>;
    }
  | {
      type: "cron";
      expression: string;
      firedAt: Date;
    }
  | {
      type: "state";
      key: string;
      newValue: unknown;
      oldValue: unknown;
    }
  | {
      type: "webhook";
      /** The webhook path that was called. */
      path: string;
      /** The HTTP method used. */
      method: string;
      /** Request headers. */
      headers: Record<string, string>;
      /** URL query parameters. */
      query: Record<string, string>;
      /** Parsed request body (JSON object, or raw string). */
      body: unknown;
    }
  | {
      type: "device_state";
      /** The friendly name of the device whose state changed. */
      friendlyName: string;
      /** Full merged device state at the time the trigger fired. */
      state: Record<string, unknown>;
      /** The ZigbeeDevice metadata from the registry. */
      device: ZigbeeDevice;
    }
  | {
      type: "device_joined";
      /** The device that joined the network. */
      device: ZigbeeDevice;
    }
  | {
      type: "device_left";
      /** The device that left the network. */
      device: ZigbeeDevice;
    };
