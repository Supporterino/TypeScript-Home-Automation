/**
 * Format a table with aligned columns for terminal output.
 */
export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));

  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join("  ");
  const separator = widths.map((w) => "─".repeat(w)).join("──");
  const bodyLines = rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join("  "));

  return [headerLine, separator, ...bodyLines].join("\n");
}

/**
 * Format a JSON value for display.
 * Short values are shown inline, complex values are pretty-printed.
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);

  const json = JSON.stringify(value);
  if (json.length <= 60) return json;
  return JSON.stringify(value, null, 2);
}

/**
 * Summarize triggers for a compact list view.
 */
export function summarizeTriggers(triggers: { type: string; [key: string]: unknown }[]): string {
  const counts: Record<string, number> = {};
  for (const t of triggers) {
    counts[t.type] = (counts[t.type] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([type, count]) => `${type}(${count})`)
    .join(", ");
}

/**
 * Format trigger details for the automation detail view.
 */
export function formatTrigger(trigger: { type: string; [key: string]: unknown }): string {
  let line: string;

  switch (trigger.type) {
    case "mqtt":
      line = `mqtt     ${trigger.topic}`;
      break;
    case "cron":
      line = `cron     ${trigger.expression}`;
      break;
    case "state":
      line = `state    ${trigger.key}`;
      break;
    case "webhook": {
      const methods = (trigger.methods as string[]) ?? ["POST"];
      line = `webhook  /${trigger.path}  [${methods.join(", ")}]`;
      break;
    }
    case "device_state":
      line = `device_state   ${trigger.friendlyName}`;
      break;
    case "device_joined":
      line = `device_joined  ${trigger.friendlyName}`;
      break;
    case "device_left":
      line = `device_left    ${trigger.friendlyName}`;
      break;
    default:
      return `${trigger.type}`;
  }

  // Append filter source on a new indented line if present
  if (trigger.filterSource) {
    line += `\n           filter: ${trigger.filterSource}`;
  }

  return line;
}

/**
 * Format a device for the detail view (one-shot CLI).
 */
export function formatDevice(device: {
  friendly_name: string;
  nice_name: string;
  ieee_address: string;
  type: string;
  supported: boolean;
  interview_state: string;
  power_source?: string | null;
  state: Record<string, unknown> | null;
  definition: { model: string; vendor: string; description: string } | null;
}): string {
  const lines: string[] = [];

  const label = (l: string) => l.padEnd(16);

  lines.push(`${label("Nice Name:")}${device.nice_name}`);
  if (device.nice_name !== device.friendly_name) {
    lines.push(`${label("Friendly:")}${device.friendly_name}`);
  }
  lines.push(`${label("IEEE:")}${device.ieee_address}`);
  lines.push(`${label("Type:")}${device.type}`);
  lines.push(`${label("Supported:")}${device.supported}`);
  lines.push(`${label("Interview:")}${device.interview_state}`);

  if (device.power_source) {
    lines.push(`${label("Power:")}${device.power_source}`);
  }

  if (device.definition) {
    const { model, vendor, description } = device.definition;
    lines.push(`${label("Model:")}${model}  (${vendor}, ${description})`);
  }

  const stateEntries = device.state ? Object.entries(device.state) : [];
  if (stateEntries.length > 0) {
    lines.push("");
    lines.push(`State (${stateEntries.length} ${stateEntries.length === 1 ? "key" : "keys"}):`);
    for (const [key, value] of stateEntries) {
      lines.push(`  ${key.padEnd(22)}${formatValue(value)}`);
    }
  } else {
    lines.push(`${label("State:")}(no state received yet)`);
  }

  return lines.join("\n");
}

/**
 * Format a log entry for terminal display.
 */
export function formatLogEntry(entry: {
  level: number;
  time: number;
  msg: string;
  [key: string]: unknown;
}): string {
  const time = new Date(entry.time).toISOString().slice(11, 23);
  const level = levelToName(entry.level).padEnd(5);
  const automation = entry.automation ? ` [${entry.automation}]` : "";
  const service = entry.service ? ` (${entry.service})` : "";
  return `${time} ${level}${automation}${service} ${entry.msg}`;
}

/**
 * Map pino numeric level to name.
 */
function levelToName(level: number): string {
  if (level <= 10) return "TRACE";
  if (level <= 20) return "DEBUG";
  if (level <= 30) return "INFO";
  if (level <= 40) return "WARN";
  if (level <= 50) return "ERROR";
  return "FATAL";
}
