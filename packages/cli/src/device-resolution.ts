/**
 * Device addressing: an exact `qualifiedId` (`source:id`) match, else a
 * case-insensitive display-name substring.
 */

import type { DeviceDescriptor } from "@ts-ha/shared";

export type DeviceResolution =
  | { status: "match"; device: DeviceDescriptor }
  | { status: "ambiguous"; candidates: DeviceDescriptor[] }
  | { status: "missing"; query: string };

/** Resolve a command argument against the known device descriptors. */
export function resolveDevice(devices: DeviceDescriptor[], query: string): DeviceResolution {
  if (query.length === 0) return { status: "missing", query };

  const exact = devices.find((device) => device.qualifiedId === query);
  if (exact) return { status: "match", device: exact };

  const needle = query.toLowerCase();
  const matches = devices.filter((device) => device.displayName.toLowerCase().includes(needle));

  if (matches.length === 1) return { status: "match", device: matches[0] };
  if (matches.length > 1) return { status: "ambiguous", candidates: matches };
  return { status: "missing", query };
}
