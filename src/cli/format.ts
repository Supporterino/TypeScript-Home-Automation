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
  switch (trigger.type) {
    case "mqtt": {
      const suffix = trigger.hasFilter ? "  (filtered)" : "";
      return `mqtt     ${trigger.topic}${suffix}`;
    }
    case "cron":
      return `cron     ${trigger.expression}`;
    case "state": {
      const suffix = trigger.hasFilter ? "  (filtered)" : "";
      return `state    ${trigger.key}${suffix}`;
    }
    case "webhook": {
      const methods = (trigger.methods as string[]) ?? ["POST"];
      return `webhook  /${trigger.path}  [${methods.join(", ")}]`;
    }
    default:
      return `${trigger.type}`;
  }
}
