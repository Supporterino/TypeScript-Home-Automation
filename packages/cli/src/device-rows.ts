/**
 * Pure projection of a source-neutral device descriptor into the summary row
 * both the `devices` command table and the dashboard's Devices tab render
 * (specs/cli "Command Surface" — `ts-ha devices`).
 *
 * Kept DOM/JSX-free so the projection is unit-testable without a render
 * harness, mirroring the web UI's `device-tile-state.ts` approach.
 */

import type { Capability, DeviceDescriptor } from "@ts-ha/shared";

export interface DeviceRow {
  qualifiedId: string;
  displayName: string;
  source: string;
  reachable: boolean;
  stateKeyCount: number;
  capabilityCount: number;
}

/** Flatten a capability tree, including the leaf features of container capabilities. */
export function flattenCapabilities(capabilities: Capability[]): Capability[] {
  const flat: Capability[] = [];
  for (const capability of capabilities) {
    flat.push(capability);
    if (capability.features) flat.push(...flattenCapabilities(capability.features));
  }
  return flat;
}

/** Project one device descriptor into the catalog summary row. */
function projectDeviceRow(device: DeviceDescriptor): DeviceRow {
  return {
    qualifiedId: device.qualifiedId,
    displayName: device.displayName,
    source: device.source,
    reachable: device.reachable,
    stateKeyCount: Object.keys(device.state).length,
    capabilityCount: flattenCapabilities(device.capabilities).length,
  };
}

/** Project every device descriptor into a catalog summary row. */
export function projectDeviceRows(devices: DeviceDescriptor[]): DeviceRow[] {
  return devices.map(projectDeviceRow);
}
