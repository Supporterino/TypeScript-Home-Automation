/**
 * Device addressing (specs/cli "Device Addressing"; design.md D1).
 *
 * A command argument is a `qualifiedId` (`source:id`) when it matches one
 * exactly. Otherwise it is resolved as a case-insensitive substring of a
 * device's display name — acting only when exactly one device matches, and
 * reporting the ambiguity or absence rather than silently choosing.
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
