import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useMemo, useState } from "react";
import { COLORS, levelColor, levelName } from "./theme.js";
import type { LogsData } from "./types.js";

const LEVEL_FILTERS = [
  { name: "ALL", value: 0 },
  { name: "TRACE", value: 10 },
  { name: "DEBUG", value: 20 },
  { name: "INFO", value: 30 },
  { name: "WARN", value: 40 },
  { name: "ERROR", value: 50 },
] as const;

export function LogsTab({ data }: { data: LogsData }) {
  const { height } = useTerminalDimensions();
  const scrollHeight = Math.max(5, height - 12);

  const [automationFilter, setAutomationFilter] = useState("");
  const [levelFilterIdx, setLevelFilterIdx] = useState(0);
  const [editingFilter, setEditingFilter] = useState(false);

  const minLevel = LEVEL_FILTERS[levelFilterIdx].value;

  // Extract unique automation names for display
  const automationNames = useMemo(() => {
    const names = new Set<string>();
    for (const entry of data.entries) {
      if (entry.automation) names.add(entry.automation);
    }
    return [...names].sort();
  }, [data.entries]);

  // Apply filters client-side
  const filtered = useMemo(() => {
    return data.entries.filter((entry) => {
      if (minLevel > 0 && entry.level < minLevel) return false;
      if (automationFilter && entry.automation !== automationFilter) return false;
      return true;
    });
  }, [data.entries, minLevel, automationFilter]);

  useKeyboard((key) => {
    if (editingFilter) {
      if (key.name === "escape") {
        setEditingFilter(false);
      } else if (key.name === "backspace") {
        setAutomationFilter((f) => f.slice(0, -1));
      } else if (key.name === "enter" || key.name === "return") {
        setEditingFilter(false);
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setAutomationFilter((f) => f + key.sequence);
      }
      return;
    }

    // Cycle log level filter
    if (key.name === "l") {
      setLevelFilterIdx((i) => (i + 1) % LEVEL_FILTERS.length);
    }
    // Toggle automation filter input
    if (key.name === "f") {
      setEditingFilter(true);
    }
    // Clear all filters
    if (key.name === "c") {
      setAutomationFilter("");
      setLevelFilterIdx(0);
    }
    // Cycle through known automation names
    if (key.name === "a" && automationNames.length > 0) {
      const currentIdx = automationNames.indexOf(automationFilter);
      if (currentIdx === automationNames.length - 1 || currentIdx === -1) {
        // After last or no filter → clear
        if (automationFilter && currentIdx === automationNames.length - 1) {
          setAutomationFilter("");
        } else {
          setAutomationFilter(automationNames[0]);
        }
      } else {
        setAutomationFilter(automationNames[currentIdx + 1]);
      }
    }
  });

  const activeFilters: string[] = [];
  if (minLevel > 0) activeFilters.push(`>=${LEVEL_FILTERS[levelFilterIdx].name}`);
  if (automationFilter) activeFilters.push(`auto:${automationFilter}`);
  const filterLabel = activeFilters.length > 0 ? activeFilters.join(" ") : "none";

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1} width="100%">
      {/* Filter bar */}
      <box flexDirection="row" marginBottom={1} gap={2}>
        <text>
          <span fg={COLORS.comment}>Filters: </span>
          <span fg={activeFilters.length > 0 ? COLORS.yellow : COLORS.comment}>{filterLabel}</span>
        </text>
        {editingFilter && (
          <text>
            <span fg={COLORS.purple}>automation: </span>
            <span fg={COLORS.cyan}>
              {automationFilter}
              <span fg={COLORS.green}>▌</span>
            </span>
          </text>
        )}
      </box>

      {/* Log entries */}
      <scrollbox height={scrollHeight} focused={!editingFilter}>
        {filtered.length === 0 ? (
          <text fg={COLORS.comment}>
            {data.count === 0 ? "(no log entries)" : "(no entries match filters)"}
          </text>
        ) : (
          filtered.map((entry) => {
            const time = new Date(entry.time).toISOString().slice(11, 23);
            const lvl = levelName(entry.level).padEnd(5);
            const auto = entry.automation ? ` [${entry.automation}]` : "";
            const svc = entry.service && !entry.automation ? ` (${entry.service})` : "";
            return (
              <text key={`${entry.time}-${entry.msg}`}>
                <span fg={COLORS.comment}>{time}</span>{" "}
                <span fg={levelColor(entry.level)}>{lvl}</span>
                <span fg={COLORS.cyan}>{auto}</span>
                <span fg={COLORS.comment}>{svc}</span> {entry.msg}
              </text>
            );
          })
        )}
      </scrollbox>

      {/* Footer with hints */}
      <box marginTop={1} paddingLeft={1}>
        <text fg={COLORS.comment}>
          ↑↓ scroll · l level · a cycle automation · f filter text · c clear · {filtered.length}/
          {data.count} entries
        </text>
      </box>
    </box>
  );
}
