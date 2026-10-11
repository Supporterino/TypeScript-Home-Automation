/**
 * Pure selection for the wall favorites widget (design.md D7; specs/wall-display
 * "Widget Catalog").
 *
 * The widget derives its displayed set from the store's `favorites` list and
 * live device map on every render rather than caching a snapshot, so a
 * favorite change streamed from another client reconciles without any local
 * toggle. This module is that derivation, kept DOM-free so it is testable.
 */
import type { DeviceDescriptor } from "../../types.js";

/**
 * Resolves the favorited devices for display, preserving the favorites list's
 * order. An identifier with no live descriptor is dropped — a favorited device
 * that is no longer known to any source is not a device to show.
 */
export function favoriteDevices(
  favorites: readonly string[],
  devicesByQualifiedId: ReadonlyMap<string, DeviceDescriptor>,
): DeviceDescriptor[] {
  const devices: DeviceDescriptor[] = [];
  for (const qualifiedId of favorites) {
    const device = devicesByQualifiedId.get(qualifiedId);
    if (device) devices.push(device);
  }
  return devices;
}
