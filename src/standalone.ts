/**
 * Standalone entry point for running the automation engine directly.
 *
 * Used when running this repo as a project (not as a library):
 *   bun run src/standalone.ts
 *   bun run dev
 *   bun run start
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./core/engine.js";

const automationsDir = join(dirname(fileURLToPath(import.meta.url)), "automations");

const engine = createEngine({ automationsDir });

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  engine.logger.info({ signal }, "Shutdown signal received");
  await engine.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start
try {
  await engine.start();
} catch (err) {
  engine.logger.fatal({ err }, "Failed to start Home Automation Engine");
  process.exit(1);
}
