/**
 * Pure non-color state encoding for a device tile (MASTER.md "State Encoding
 * Rule"; specs/web-ui "Device Tile Presentation"; task 9.2).
 *
 * Every state the tile can present is described by a label and an icon
 * *shape* in addition to a color token, so color is never the only channel.
 * Icons are named symbolically here and mapped to Tabler components by the
 * renderer — this module stays DOM-free so the encoding itself is unit
 * testable (design.md D23).
 */

import type { Capability } from "@ts-ha/shared";
import { readBooleanCapabilityValue } from "@ts-ha/shared";
import type { DeviceDescriptor } from "../types.js";
import { flattenCapabilities, pickOnOffCapability } from "./capability-ranking.js";
import { formatAge, isObservationStale } from "./format.js";

/** The filled/outline power glyph distinguishes on from off without color. */
export type DeviceTileOnOffIcon = "power-filled" | "power-outline";

export interface DeviceTileOnOffState {
  value: boolean;
  label: "on" | "off";
  icon: DeviceTileOnOffIcon;
  /** CSS custom-property name for the state's color; never a literal hex. */
  token: "--on" | "--text-muted";
}

export type DeviceTileObservationIcon = "plug-off" | "wifi" | "wifi-off" | "clock";

export interface DeviceTileObservationState {
  kind: "unreachable" | "live" | "polled" | "stale";
  /** Always non-empty: the label is the non-color channel alongside the icon. */
  label: string;
  icon: DeviceTileObservationIcon;
  /** CSS custom-property name for the state's color; never a literal hex. */
  token: "--danger" | "--on" | "--stale" | "--text-muted";
}

export interface DeviceTileState {
  /** The ranked boolean on/off encoding when the device declares one; else `null`. */
  onOff: DeviceTileOnOffState | null;
  /** How the device's observation is presented — push, polled (with age), stale, or unreachable. */
  observation: DeviceTileObservationState;
}

/**
 * Encodes a device's observation as a distinct icon + label + token (MASTER
 * "never color alone"). Unreachable wins over observation mode; a polled
 * device older than its own refresh interval is stale, otherwise polled with
 * the age of its last reading.
 */
export function deviceTileObservation(
  device: DeviceDescriptor,
  now: number,
): DeviceTileObservationState {
  if (!device.reachable) {
    return { kind: "unreachable", label: "Unreachable", icon: "plug-off", token: "--danger" };
  }

  if (device.observation.mode === "push") {
    return { kind: "live", label: "live", icon: "wifi", token: "--on" };
  }

  const age = formatAge(now - device.observation.observedAt);
  const stale = isObservationStale(
    device.observation.observedAt,
    device.observation.refreshIntervalMs,
    now,
  );
  if (stale) {
    return { kind: "stale", label: `stale · ${age}`, icon: "clock", token: "--stale" };
  }
  return { kind: "polled", label: `polled · ${age}`, icon: "wifi-off", token: "--text-muted" };
}

/** Encodes a resolved boolean on/off value as the tile's non-color state. */
export function deviceTileOnOffFromValue(value: boolean): DeviceTileOnOffState {
  return {
    value,
    label: value ? "on" : "off",
    icon: value ? "power-filled" : "power-outline",
    token: value ? "--on" : "--text-muted",
  };
}

/**
 * Encodes an arbitrary resolved raw property value against a boolean
 * capability's declared on/off encoding as the tile's non-color state. The
 * tile feeds the same resolved (possibly optimistic) value here that its
 * embedded control renders, so the chip and the control cannot contradict
 * while a command is in flight (specs/web-ui "Device Tile Presentation").
 */
export function deviceTileOnOffFromCapabilityValue(
  capability: Pick<Capability, "valueOn">,
  value: unknown,
): DeviceTileOnOffState {
  return deviceTileOnOffFromValue(readBooleanCapabilityValue(capability, value));
}

/** Encodes a device's primary boolean on/off state, when it declares one. */
export function deviceTileOnOffState(device: DeviceDescriptor): DeviceTileOnOffState | null {
  const capability = pickOnOffCapability(flattenCapabilities(device.capabilities), "readable");
  if (!capability) return null;

  return deviceTileOnOffFromCapabilityValue(capability, device.state[capability.property]);
}

/** The tile's complete non-color state encoding — consumed by the tile renderer. */
export function deviceTileState(device: DeviceDescriptor, now: number): DeviceTileState {
  return {
    onOff: deviceTileOnOffState(device),
    observation: deviceTileObservation(device, now),
  };
}
