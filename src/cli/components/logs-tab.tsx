import { useTerminalDimensions } from "@opentui/react";
import { COLORS, levelColor, levelName } from "./theme.js";
import type { LogsData } from "./types.js";

export function LogsTab({ data }: { data: LogsData }) {
  const { height } = useTerminalDimensions();
  const scrollHeight = Math.max(5, height - 10);

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <scrollbox height={scrollHeight} focused>
        {data.count === 0 ? (
          <text fg={COLORS.comment}>(no log entries)</text>
        ) : (
          data.entries.map((entry) => {
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
      <box marginTop={1} paddingLeft={1}>
        <text fg={COLORS.comment}>↑↓ scroll · Showing {data.count} entries</text>
      </box>
    </box>
  );
}
