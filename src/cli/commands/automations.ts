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

export async function triggerAutomation(
  client: DebugClient,
  name: string,
  contextJson: string,
  json: boolean,
): Promise<void> {
  let context: { type: string; [key: string]: unknown };
  try {
    context = JSON.parse(contextJson) as { type: string; [key: string]: unknown };
  } catch {
    console.error("Invalid JSON context. Examples:");
    console.error('  --mqtt \'{"topic": "zigbee2mqtt/sensor", "payload": {"occupancy": true}}\'');
    console.error("  --cron");
    console.error('  --state \'{"key": "night_mode", "newValue": true}\'');
    process.exit(1);
  }

  const result = await client.triggerAutomation(name, context);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Triggered "${result.automation}" with ${result.type} context`);
}
