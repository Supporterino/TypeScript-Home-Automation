import type { EnergyData } from "@ts-ha/shared";
import type { DebugClient } from "../client.js";
import { formatTable } from "../format.js";

/** Render the home's energy snapshot as text. */
export function formatEnergy(energy: EnergyData): string {
  const lines: string[] = [
    `Power:        ${energy.powerWatts} W`,
    `Consumption:  ${energy.energyWh} Wh`,
  ];

  if (energy.breakdown.length === 0) {
    lines.push("");
    lines.push("(no metering devices)");
    return lines.join("\n");
  }

  const rows = energy.breakdown.map((device) => [
    device.displayName,
    device.qualifiedId,
    device.powerWatts !== undefined ? `${device.powerWatts} W` : "—",
    device.energyWh !== undefined ? `${device.energyWh} Wh` : "—",
    device.available ? "yes" : "no",
  ]);

  lines.push("");
  lines.push(formatTable(["DEVICE", "QUALIFIED ID", "POWER", "ENERGY", "AVAILABLE"], rows));
  return lines.join("\n");
}

/** Show the home's instantaneous power, cumulative consumption, and breakdown. */
export async function showEnergy(client: DebugClient, json: boolean): Promise<void> {
  const energy = await client.getEnergy();

  if (json) {
    console.log(JSON.stringify(energy, null, 2));
    return;
  }

  console.log(formatEnergy(energy));
}
