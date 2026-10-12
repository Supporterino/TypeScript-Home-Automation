/**
 * Resolve a device command argument against the engine's catalog, reporting
 * the absence or ambiguity and exiting, or returning the matched descriptor.
 *
 * Shared by the `devices` and `rooms` command surfaces so addressing is
 * identical everywhere (specs/cli "Device Addressing"; design.md D1).
 */

import type { DeviceDescriptor } from "@ts-ha/shared";
import type { DebugClient } from "../client.js";
import { resolveDevice } from "../device-resolution.js";

export async function resolveDeviceOrExit(
  client: DebugClient,
  query: string,
): Promise<DeviceDescriptor> {
  const catalog = await client.getDeviceCatalog();
  const resolution = resolveDevice(catalog.devices, query);

  if (resolution.status === "missing") {
    console.error(`Device not found: ${query}`);
    process.exit(1);
  }

  if (resolution.status === "ambiguous") {
    console.error(`Device "${query}" is ambiguous. Candidates:`);
    for (const candidate of resolution.candidates) {
      console.error(`  ${candidate.qualifiedId}  (${candidate.displayName})`);
    }
    process.exit(1);
  }

  return resolution.device;
}
