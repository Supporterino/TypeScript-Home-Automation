import type {
  Capability,
  DeviceDescriptor,
  TriggerContext,
  WeatherUnavailable,
} from "@ts-ha/shared";
import { flattenCapabilities } from "./device-rows.js";

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
 * Format a device descriptor for the detail view (one-shot CLI).
 */
export function formatDevice(device: DeviceDescriptor): string {
  const lines: string[] = [];

  const label = (l: string) => l.padEnd(16);

  lines.push(`${label("Display Name:")}${device.displayName}`);
  lines.push(`${label("Source:")}${device.source}`);
  lines.push(`${label("Qualified ID:")}${device.qualifiedId}`);
  lines.push(`${label("ID:")}${device.id}`);
  lines.push(`${label("Reachable:")}${device.reachable}`);
  lines.push(`${label("Hidden:")}${device.hidden}`);

  const observedAt = new Date(device.observation.observedAt).toISOString();
  lines.push(`${label("Observed:")}${device.observation.mode} @ ${observedAt}`);

  if (device.memberQualifiedIds && device.memberQualifiedIds.length > 0) {
    lines.push(`${label("Members:")}${device.memberQualifiedIds.join(", ")}`);
  }

  const capabilities = flattenCapabilities(device.capabilities);
  if (capabilities.length > 0) {
    lines.push("");
    lines.push(`Capabilities (${capabilities.length}):`);
    for (const capability of capabilities) {
      lines.push(`  ${formatCapability(capability)}`);
    }
  }

  const stateEntries = Object.entries(device.state);
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
 * Format one flattened capability as a single descriptor line.
 */
function formatCapability(capability: Capability): string {
  const access = `${capability.access.readable ? "r" : "-"}${capability.access.writable ? "w" : "-"}`;
  const property = capability.property ?? capability.kind;

  const constraints: string[] = [];
  if (
    capability.range &&
    (capability.range.min !== undefined || capability.range.max !== undefined)
  ) {
    constraints.push(`range ${capability.range.min ?? "?"}..${capability.range.max ?? "?"}`);
  }
  if (capability.step !== undefined) constraints.push(`step ${capability.step}`);
  if (capability.permittedValues) {
    constraints.push(`[${capability.permittedValues.join(", ")}]`);
  }
  if (capability.unit) constraints.push(capability.unit);
  const suffix = constraints.length > 0 ? `  ${constraints.join(" ")}` : "";

  return `${capability.kind.padEnd(14)}${property.padEnd(20)}${capability.valueType.padEnd(10)}${access}${suffix}`;
}

/**
 * Summarize a trigger context for the compact execution-history view.
 * Unlike {@link formatTrigger}, this handles the runtime `TriggerContext`
 * union (including the device_* triggers).
 */
export function summarizeTriggerContext(trigger: TriggerContext): string {
  switch (trigger.type) {
    case "mqtt":
      return `mqtt ${trigger.topic}`;
    case "cron":
      return `cron ${trigger.expression}`;
    case "state":
      return `state ${trigger.key}`;
    case "webhook":
      return `webhook ${trigger.method} /${trigger.path}`;
    case "device_state":
      return `device_state ${trigger.friendlyName}`;
    case "device_joined":
    case "device_left":
      return `${trigger.type} ${trigger.device.friendly_name}`;
  }
}

/**
 * The CLI's message for an unconfigured weather feature. The engine reports
 * this as an unavailable marker (a 404/400), not an error, so the command
 * reports it plainly rather than failing.
 */
export function weatherUnavailableMessage(reason: WeatherUnavailable["reason"]): string {
  return reason === "service_unregistered"
    ? "Weather unavailable — no weather service is configured."
    : "Weather unavailable — no location is configured.";
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
