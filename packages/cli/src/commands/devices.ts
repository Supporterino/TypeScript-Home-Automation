import type { DeviceDescriptor } from "@ts-ha/shared";
import { type DebugClient, httpStatusOf } from "../client.js";
import { parseCommandValue } from "../command-value.js";
import { projectDeviceRows } from "../device-rows.js";
import { formatDevice, formatTable, formatValue } from "../format.js";
import { resolveDeviceOrExit } from "./device-lookup.js";

/**
 * List every device known to the engine's device sources in a table.
 */
export async function listDevices(client: DebugClient, json: boolean): Promise<void> {
  const catalog = await client.getDeviceCatalog();

  if (json) {
    console.log(JSON.stringify(catalog, null, 2));
    return;
  }

  if (catalog.devices.length === 0) {
    console.log("No devices tracked yet.");
    return;
  }

  const rows = projectDeviceRows(catalog.devices).map((row) => [
    row.displayName,
    row.source,
    row.reachable ? "yes" : "no",
    String(row.stateKeyCount),
    String(row.capabilityCount),
  ]);

  console.log(formatTable(["NAME", "SOURCE", "REACHABLE", "STATE KEYS", "CAPABILITIES"], rows));
  console.log(`\n${catalog.count} device${catalog.count === 1 ? "" : "s"}`);
}

/**
 * Get a single device by qualified id or display-name substring and show full detail.
 */
export async function getDevice(client: DebugClient, query: string, json: boolean): Promise<void> {
  const device = await resolveDeviceOrExit(client, query);
  const full = await client.getDevice(device.qualifiedId);

  if (json) {
    console.log(JSON.stringify(full, null, 2));
    return;
  }

  console.log(formatDevice(full));
}

/**
 * Issue a command for one property; a `400`/`503` is a refusal, distinct
 * from an unknown device and from a transport failure.
 */
export async function sendDeviceCommand(
  client: DebugClient,
  query: string,
  property: string,
  rawValue: string,
  json: boolean,
): Promise<void> {
  const device = await resolveDeviceOrExit(client, query);
  const value = parseCommandValue(rawValue);

  try {
    const result = await client.sendDeviceCommand(device.qualifiedId, { [property]: value });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(
      `Commanded "${device.displayName}" (${device.qualifiedId}): ${property} = ${formatValue(value)}`,
    );
  } catch (err) {
    reportDeviceCommandError(err, device, property);
  }
}

/** Hide or unhide a device. */
export async function setDeviceHidden(
  client: DebugClient,
  query: string,
  hidden: boolean,
  json: boolean,
): Promise<void> {
  const device = await resolveDeviceOrExit(client, query);
  const result = await client.setDeviceHidden(device.qualifiedId, hidden);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`"${device.displayName}" is now ${result.hidden ? "hidden" : "visible"}.`);
}

/** Assign a device to a room. */
export async function assignDeviceRoom(
  client: DebugClient,
  query: string,
  roomId: string,
  json: boolean,
): Promise<void> {
  const device = await resolveDeviceOrExit(client, query);
  const result = await client.assignDeviceRoom(device.qualifiedId, roomId);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Assigned "${device.displayName}" to room ${result.roomId}.`);
}

/** Clear a device's room assignment. */
export async function unassignDeviceRoom(
  client: DebugClient,
  query: string,
  json: boolean,
): Promise<void> {
  const device = await resolveDeviceOrExit(client, query);
  const result = await client.unassignDeviceRoom(device.qualifiedId);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Unassigned "${device.displayName}".`);
}

/** Report a device-command failure and exit; never returns. */
function reportDeviceCommandError(err: unknown, device: DeviceDescriptor, property: string): never {
  const status = httpStatusOf(err);
  if (status !== undefined) {
    if (status === 404) {
      console.error(`Device not found: ${device.qualifiedId}`);
    } else if (status === 400 || status === 503) {
      console.error(`Refused "${property}" for ${device.qualifiedId}: ${(err as Error).message}`);
    } else {
      console.error(`Error: ${(err as Error).message}`);
    }
    process.exit(1);
  }
  throw err;
}
