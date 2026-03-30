import type { DebugClient } from "../client.js";
import { formatLogEntry } from "../format.js";

export interface LogsOptions {
  automation?: string;
  level?: string;
  limit?: number;
}

export async function getLogs(
  client: DebugClient,
  options: LogsOptions,
  json: boolean,
): Promise<void> {
  const result = await client.getLogs({
    automation: options.automation,
    level: options.level,
    limit: options.limit ?? 50,
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.count === 0) {
    console.log("No log entries found.");
    return;
  }

  for (const entry of result.entries) {
    console.log(formatLogEntry(entry));
  }

  console.log(`\n${result.count} entries`);
}
