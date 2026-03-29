import type { DebugClient } from "../client.js";
import { formatTable, formatTrigger, summarizeTriggers } from "../format.js";

export async function listAutomations(client: DebugClient, json: boolean): Promise<void> {
  const result = await client.listAutomations();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.count === 0) {
    console.log("No automations registered.");
    return;
  }

  const rows = result.automations.map((a) => [a.name, summarizeTriggers(a.triggers)]);
  console.log(formatTable(["NAME", "TRIGGERS"], rows));
  console.log(`\n${result.count} automation(s)`);
}

export async function getAutomation(
  client: DebugClient,
  name: string,
  json: boolean,
): Promise<void> {
  const result = await client.getAutomation(name);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Name:     ${result.name}`);
  console.log("Triggers:");

  if (result.triggers.length === 0) {
    console.log("  (none)");
  } else {
    for (const trigger of result.triggers) {
      console.log(`  ${formatTrigger(trigger)}`);
    }
  }
}
