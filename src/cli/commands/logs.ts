import type { DebugClient } from "../client.js";
import { formatLogEntry } from "../format.js";

export interface LogsOptions {
  automation?: string;
  level?: string;
  limit?: number;
  follow?: boolean;
  interval?: number;
}

export async function getLogs(
  client: DebugClient,
  options: LogsOptions,
  json: boolean,
): Promise<void> {
  if (options.follow) {
    await followLogs(client, options, json);
    return;
  }

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

/**
 * Continuously poll for new log entries and print them as they arrive.
 * Deduplicates by tracking the timestamp + message of the last seen entry.
 */
async function followLogs(client: DebugClient, options: LogsOptions, json: boolean): Promise<void> {
  const pollInterval = (options.interval ?? 2) * 1000;
  let lastSeenTime = 0;
  let lastSeenMsg = "";

  // Print initial batch
  try {
    const initial = await client.getLogs({
      automation: options.automation,
      level: options.level,
      limit: options.limit ?? 20,
    });

    for (const entry of initial.entries) {
      printEntry(entry, json);
    }

    // Track the last entry to avoid re-printing
    if (initial.entries.length > 0) {
      const last = initial.entries[initial.entries.length - 1];
      lastSeenTime = last.time;
      lastSeenMsg = last.msg;
    }
  } catch (err) {
    console.error(`Failed to connect: ${(err as Error).message}`);
    process.exit(1);
  }

  console.error(
    `\n--- Following logs (Ctrl+C to stop, polling every ${pollInterval / 1000}s) ---\n`,
  );

  // Poll loop
  const timer = setInterval(async () => {
    try {
      const result = await client.getLogs({
        automation: options.automation,
        level: options.level,
        limit: 50,
      });

      // Find entries newer than the last seen
      let foundLast = false;
      for (const entry of result.entries) {
        if (!foundLast) {
          if (entry.time === lastSeenTime && entry.msg === lastSeenMsg) {
            foundLast = true;
          }
          continue;
        }
        printEntry(entry, json);
      }

      // If we didn't find the last entry (buffer wrapped), print all
      if (!foundLast && result.entries.length > 0) {
        const first = result.entries[0];
        if (first.time > lastSeenTime) {
          for (const entry of result.entries) {
            printEntry(entry, json);
          }
        }
      }

      // Update last seen
      if (result.entries.length > 0) {
        const last = result.entries[result.entries.length - 1];
        lastSeenTime = last.time;
        lastSeenMsg = last.msg;
      }
    } catch {
      // Silently retry on connection errors
    }
  }, pollInterval);

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    clearInterval(timer);
    console.error("\nStopped following logs.");
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}

function printEntry(
  entry: { level: number; time: number; msg: string; [key: string]: unknown },
  json: boolean,
): void {
  if (json) {
    console.log(JSON.stringify(entry));
  } else {
    console.log(formatLogEntry(entry));
  }
}
