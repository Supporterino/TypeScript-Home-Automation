import type { DebugClient } from "../client.js";
import {
  formatTable,
  formatTrigger,
  summarizeTriggerContext,
  summarizeTriggers,
} from "../format.js";

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

  const rows = result.automations.map((a) => [
    a.name,
    a.enabled ? "enabled" : "disabled",
    summarizeTriggers(a.triggers),
  ]);
  console.log(formatTable(["NAME", "ENABLED", "TRIGGERS"], rows));
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
  console.log(`Enabled:  ${result.enabled}`);
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

export async function setAutomationEnabled(
  client: DebugClient,
  name: string,
  enabled: boolean,
  json: boolean,
): Promise<void> {
  const result = await client.setAutomationEnabled(name, enabled);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`"${result.name}" is now ${result.enabled ? "enabled" : "disabled"}`);
}

export async function getAutomationSource(
  client: DebugClient,
  name: string,
  json: boolean,
): Promise<void> {
  const result = await client.getAutomationSource(name);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(result.source);
}

/** Show an automation's retained execution records. */
export async function getAutomationHistory(
  client: DebugClient,
  name: string,
  json: boolean,
): Promise<void> {
  const result = await client.getAutomationHistory(name);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.history.length === 0) {
    console.log(`No execution records for "${name}".`);
    return;
  }

  const rows = result.history.map((record) => [
    new Date(record.startedAt).toISOString(),
    summarizeTriggerContext(record.trigger),
    `${record.durationMs}ms`,
    record.outcome,
    record.error ?? "",
  ]);

  console.log(formatTable(["STARTED", "TRIGGER", "DURATION", "OUTCOME", "ERROR"], rows));
  console.log(`\n${result.history.length} record(s)`);
}

/** Show an automation's declared and observed relationships. */
export async function getAutomationRelationships(
  client: DebugClient,
  name: string,
  json: boolean,
): Promise<void> {
  const result = await client.getAutomationRelationships(name);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Name:     ${result.name}`);

  console.log("\nDeclared required services:");
  if (result.declared.requiredServices.length === 0) {
    console.log("  (none)");
  } else {
    for (const service of result.declared.requiredServices) {
      console.log(`  ${service.name.padEnd(16)}${service.registered ? "registered" : "missing"}`);
    }
  }

  console.log("\nDeclared related devices:");
  if (result.declared.relatedDevices.length === 0) {
    console.log("  (none)");
  } else {
    for (const device of result.declared.relatedDevices) {
      console.log(`  ${device}`);
    }
  }

  console.log("\nDeclared watched state keys:");
  if (result.declared.watchedStateKeys.length === 0) {
    console.log("  (none)");
  } else {
    for (const key of result.declared.watchedStateKeys) {
      console.log(`  ${key}`);
    }
  }

  console.log("\nObserved written state keys:");
  if (result.observed.writtenStateKeys.length === 0) {
    console.log("  (none)");
  } else {
    for (const key of result.observed.writtenStateKeys) {
      console.log(`  ${key}`);
    }
    if (result.observed.truncated) console.log("  (truncated)");
  }
}
