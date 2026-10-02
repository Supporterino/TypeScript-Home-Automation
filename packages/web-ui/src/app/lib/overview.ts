/**
 * Overview summary derivation (design.md D4; specs/web-ui "Overview
 * Landing").
 *
 * Recomputed from the live device descriptors the store already holds, in
 * the client, so a streamed `device_state`/`device_reachability` event
 * updates the summary without a manual refresh. Pure and DOM-free, so it is
 * reachable by `bun test`.
 */

import { readBooleanCapabilityValue } from "@ts-ha/shared";
import type { DeviceDescriptor } from "../types.js";
import { flattenCapabilities } from "./capability-ranking.js";
import { isObservationStale } from "./format.js";

/** How many of a room's devices the overview shows before linking into the room. */
export const OVERVIEW_ZONE_LIMIT = 6;

export interface OverviewSummary {
  total: number;
  on: number;
  unreachable: number;
  stale: number;
  /** Devices reporting active occupancy/motion (derivable boolean state). */
  motion: number;
}

const ON_PROPERTIES = new Set(["on", "state"]);
const MOTION_PROPERTIES = new Set(["occupancy", "motion"]);

/** Whether a device's primary on/off boolean reads as "on", honoring its declared encoding. */
export function isDeviceOn(device: DeviceDescriptor): boolean {
  for (const capability of flattenCapabilities(device.capabilities)) {
    if (!ON_PROPERTIES.has(capability.property)) continue;
    if (capability.valueType !== "boolean") continue;
    if (readBooleanCapabilityValue(capability, device.state[capability.property])) return true;
  }
  return false;
}

/** Whether a device reports active motion/occupancy through a boolean capability. */
export function isMotionActive(device: DeviceDescriptor): boolean {
  for (const capability of flattenCapabilities(device.capabilities)) {
    if (!MOTION_PROPERTIES.has(capability.property)) continue;
    if (readBooleanCapabilityValue(capability, device.state[capability.property])) return true;
  }
  return false;
}

/** Counts the summary metrics over the provided descriptors at `now`. */
export function summarizeDevices(devices: DeviceDescriptor[], now: number): OverviewSummary {
  let on = 0;
  let unreachable = 0;
  let stale = 0;
  let motion = 0;
  for (const device of devices) {
    if (!device.reachable) unreachable++;
    if (
      isObservationStale(device.observation.observedAt, device.observation.refreshIntervalMs, now)
    ) {
      stale++;
    }
    if (isDeviceOn(device)) on++;
    if (isMotionActive(device)) motion++;
  }
  return { total: devices.length, on, unreachable, stale, motion };
}
