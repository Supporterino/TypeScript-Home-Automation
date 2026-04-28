import { createInterface } from "node:readline/promises";

const DEFAULT_PORT = 16021;

/**
 * Normalize a host string by stripping scheme, trailing slashes, and default port.
 */
function normalizeHost(host: string): string {
  let normalized = host.trim();
  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/\/+$/, "");
  normalized = normalized.replace(/:16021$/, "");
  return normalized;
}

/**
 * Nanoleaf pairing command.
 *
 * Guides the user through generating an auth token by pressing the
 * physical power button on the Nanoleaf device.
 *
 * Usage: ts-ha nanoleaf pair <host>
 */
export async function pairNanoleaf(hostArg: string): Promise<void> {
  const host = normalizeHost(hostArg);
  const url = `http://${host}:${DEFAULT_PORT}/api/v1/new`;

  console.log("\nNanoleaf Pairing");
  console.log("─".repeat(40));
  console.log(`Device: ${host}:${DEFAULT_PORT}`);
  console.log("");
  console.log("Hold the power button on the device for 5-7 seconds");
  console.log("until the LED starts flashing.");
  console.log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question("Press Enter when ready...");
  } finally {
    rl.close();
  }

  console.log("\nRequesting auth token...");

  // Retry a few times — the device might not be ready immediately
  const maxRetries = 5;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { method: "POST" });

      if (response.ok) {
        const data = (await response.json()) as { auth_token: string };
        console.log(`\n✓ Auth token: ${data.auth_token}`);
        console.log("\nUse this token when registering the device:");
        console.log(`  import type { NanoleafService } from "ts-home-automation";`);
        console.log(`  const nanoleaf = engine.services.getOrThrow<NanoleafService>("nanoleaf");`);
        console.log(`  nanoleaf.register("my-panels", {`);
        console.log(`    host: "${host}",`);
        console.log(`    token: "${data.auth_token}",`);
        console.log("  });");
        return;
      }

      if (response.status === 403) {
        if (attempt < maxRetries) {
          console.log(
            `  Device not in pairing mode (attempt ${attempt}/${maxRetries}), retrying in ${retryDelay / 1000}s...`,
          );
          await new Promise((r) => setTimeout(r, retryDelay));
          continue;
        }
        console.error("\n✗ Device not in pairing mode.");
        console.error("Make sure the LED is flashing before running this command.");
        process.exit(1);
      }

      console.error(`\n✗ Unexpected response: HTTP ${response.status}`);
      process.exit(1);
    } catch (err) {
      if (attempt < maxRetries) {
        console.log(
          `  Connection failed (attempt ${attempt}/${maxRetries}), retrying in ${retryDelay / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, retryDelay));
        continue;
      }
      console.error(`\n✗ Failed to connect to ${host}:${DEFAULT_PORT}`);
      console.error(`  ${(err as Error).message}`);
      process.exit(1);
    }
  }
}
