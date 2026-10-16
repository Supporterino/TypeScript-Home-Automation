import type { DebugClient } from "../client.js";
import { parseCommandValue } from "../command-value.js";
import { formatTable, formatValue } from "../format.js";

export async function listState(client: DebugClient, json: boolean): Promise<void> {
  const result = await client.listState();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.count === 0) {
    console.log("No state entries.");
    return;
  }

  const rows = Object.entries(result.state).map(([key, value]) => [key, formatValue(value)]);
  console.log(formatTable(["KEY", "VALUE"], rows));
  console.log(`\n${result.count} key(s)`);
}

export async function getState(client: DebugClient, key: string, json: boolean): Promise<void> {
  const result = await client.getState(key);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.exists) {
    console.log(`Key "${key}" does not exist.`);
    process.exit(1);
  }

  console.log(formatValue(result.value));
}

export async function setState(
  client: DebugClient,
  key: string,
  rawValue: string,
  json: boolean,
): Promise<void> {
  const value = parseCommandValue(rawValue);

  const result = await client.setState(key, value);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Set ${key} = ${formatValue(result.value)} (was: ${formatValue(result.previous)})`);
}

export async function deleteState(client: DebugClient, key: string, json: boolean): Promise<void> {
  const result = await client.deleteState(key);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.deleted) {
    console.log(`Deleted "${key}"`);
  } else {
    console.log(`Key "${key}" does not exist.`);
  }
}
