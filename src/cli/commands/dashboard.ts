import type { DebugClient } from "../client.js";
import { formatLogEntry, formatValue, summarizeTriggers } from "../format.js";

const CLEAR = "\x1b[2J\x1b[H";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

function statusColor(ok: boolean): string {
  return ok ? `${GREEN}connected${RESET}` : `${RED}disconnected${RESET}`;
}

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return "—";
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function separator(title: string, width: number): string {
  const padding = Math.max(0, width - title.length - 5);
  return `${DIM} ── ${RESET}${BOLD}${title}${RESET}${DIM} ${"─".repeat(padding)}${RESET}`;
}

export async function runDashboard(
  client: DebugClient,
  host: string,
  interval: number,
): Promise<void> {
  // Enable raw mode for keypress detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      const key = data.toString();
      // q, Q, Ctrl+C, or Escape
      if (key === "q" || key === "Q" || key === "\x03" || key === "\x1b") {
        cleanup();
        process.exit(0);
      }
    });
  }

  let timer: ReturnType<typeof setInterval> | null = null;

  function cleanup(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    // Show cursor
    process.stdout.write("\x1b[?25h");
  }

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  // Hide cursor
  process.stdout.write("\x1b[?25l");

  async function render(): Promise<void> {
    const width = process.stdout.columns || 80;

    try {
      // Fetch all data in parallel
      const [readiness, automations, state, logs] = await Promise.all([
        client.getReadiness(),
        client.listAutomations().catch(() => ({ automations: [], count: 0 })),
        client.listState().catch(() => ({ state: {}, count: 0 })),
        client.getLogs({ limit: 15 }).catch(() => ({ entries: [], count: 0 })),
      ]);

      const lines: string[] = [];

      // Header
      lines.push(
        `${BOLD} ts-ha dashboard${RESET}${DIM}${" ".repeat(Math.max(0, width - 17 - host.length))}${host}${RESET}`,
      );
      lines.push(`${DIM} ${"─".repeat(width - 2)}${RESET}`);
      lines.push("");

      // Engine status
      const engineStatus = readiness.checks.engine
        ? `${GREEN}running${RESET}`
        : `${RED}stopped${RESET}`;
      const mqttStatus = statusColor(readiness.checks.mqtt);
      const uptime = formatUptime(readiness.startedAt);
      const tz = readiness.tz ?? "system default";

      lines.push(
        ` Engine: ${engineStatus}    MQTT: ${mqttStatus}    Uptime: ${CYAN}${uptime}${RESET}`,
      );
      lines.push(` TZ: ${DIM}${tz}${RESET}`);
      lines.push("");

      // Automations
      lines.push(separator(`Automations (${automations.count})`, width));
      if (automations.count === 0) {
        lines.push(`${DIM} (none)${RESET}`);
      } else {
        for (const auto of automations.automations) {
          const triggers = summarizeTriggers(auto.triggers);
          const name = auto.name.padEnd(30);
          lines.push(` ${CYAN}${name}${RESET} ${DIM}${triggers}${RESET}`);
        }
      }
      lines.push("");

      // State
      lines.push(separator(`State (${state.count})`, width));
      if (state.count === 0) {
        lines.push(`${DIM} (none)${RESET}`);
      } else {
        for (const [key, value] of Object.entries(state.state)) {
          const k = key.padEnd(35);
          const v = formatValue(value);
          lines.push(` ${k} ${YELLOW}${v}${RESET}`);
        }
      }
      lines.push("");

      // Recent logs
      lines.push(separator(`Recent Logs (${logs.count})`, width));
      if (logs.count === 0) {
        lines.push(`${DIM} (none)${RESET}`);
      } else {
        for (const entry of logs.entries) {
          lines.push(` ${formatLogEntry(entry)}`);
        }
      }
      lines.push("");

      // Footer
      lines.push(`${DIM} Press q to quit | Refreshing every ${interval}s${RESET}`);

      // Render
      process.stdout.write(`${CLEAR}${lines.join("\n")}\n`);
    } catch (err) {
      process.stdout.write(CLEAR);
      console.error(`${RED}Failed to fetch data: ${(err as Error).message}${RESET}`);
      console.error(`${DIM}Retrying in ${interval}s...${RESET}`);
    }
  }

  // Initial render
  await render();

  // Periodic refresh
  timer = setInterval(render, interval * 1000);
}
