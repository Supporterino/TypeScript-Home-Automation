/**
 * Pure selection for the wall favorites widget: the favorited devices still known
 * to a source, in the favorites list's order.
 */
import type { DeviceDescriptor } from "../../types.js";

/**
 * Resolves the favorited devices for display, preserving the favorites list's
 * order and dropping any identifier with no live descriptor.
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
