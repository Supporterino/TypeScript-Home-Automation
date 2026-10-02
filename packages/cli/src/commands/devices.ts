import type { DebugClient } from "../client.js";
import { formatDevice, formatTable } from "../format.js";

const REGISTRY_DISABLED_MSG =
  "Device registry is disabled. Set DEVICE_REGISTRY_ENABLED=true to enable.";

/**
 * List all tracked Zigbee devices in a table.
 */
export async function listDevices(client: DebugClient, json: boolean): Promise<void> {
  let result: Awaited<ReturnType<typeof client.listDevices>>;
  try {
    result = await client.listDevices();
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("Device registry is disabled")) {
      console.error(REGISTRY_DISABLED_MSG);
      process.exit(1);
    }
    throw err;
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.devices.length === 0) {
    console.log("No devices tracked yet.");
    return;
  }

  const rows = result.devices.map((d) => [
    d.nice_name,
    d.type,
    d.interview_state,
    d.state ? String(Object.keys(d.state).length) : "—",
  ]);

  console.log(formatTable(["NICE NAME", "TYPE", "INTERVIEW", "STATE KEYS"], rows));
  console.log(`\n${result.count} device${result.count === 1 ? "" : "s"}`);
}

/**
 * Get a single device by friendly name and show full detail.
 */
export async function getDevice(
  client: DebugClient,
  friendlyName: string,
  json: boolean,
): Promise<void> {
  let device: Awaited<ReturnType<typeof client.getDevice>>;
  try {
    device = await client.getDevice(friendlyName);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("Device registry is disabled")) {
      console.error(REGISTRY_DISABLED_MSG);
      process.exit(1);
    }
    if (msg.includes("Device not found") || msg.includes("404")) {
      console.error(`Device not found: ${friendlyName}`);
      process.exit(1);
    }
    throw err;
  }

  if (json) {
    console.log(JSON.stringify(device, null, 2));
    return;
  }

  console.log(formatDevice(device));
}
