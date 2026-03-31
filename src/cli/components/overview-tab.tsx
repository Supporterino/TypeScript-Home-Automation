import { summarizeTriggers } from "../format.js";
import { COLORS, formatUptime, formatValue, levelColor, levelName, valueColor } from "./theme.js";
import type { DashboardData } from "./types.js";

export function OverviewTab({ data }: { data: DashboardData }) {
  const { readiness, automations, state, logs } = data;
  const engineOk = readiness.checks.engine;
  const mqttOk = readiness.checks.mqtt;

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Status row */}
      <box flexDirection="row" gap={4} paddingLeft={1} marginBottom={1}>
        <text>
          Engine:{" "}
          <span fg={engineOk ? COLORS.green : COLORS.red}>{engineOk ? "running" : "stopped"}</span>
        </text>
        <text>
          MQTT:{" "}
          <span fg={mqttOk ? COLORS.green : COLORS.red}>
            {mqttOk ? "connected" : "disconnected"}
          </span>
        </text>
        <text>
          Uptime: <span fg={COLORS.cyan}>{formatUptime(readiness.startedAt)}</span>
        </text>
        <text>
          TZ: <span fg={COLORS.comment}>{readiness.tz ?? "system default"}</span>
        </text>
      </box>

      {/* Automations summary */}
      <SectionHeader title="Automations" count={automations.count} />
      <box flexDirection="column" paddingLeft={2}>
        {automations.count === 0 ? (
          <text fg={COLORS.comment}>(none)</text>
        ) : (
          automations.automations.map((a) => (
            <box key={a.name} flexDirection="row">
              <text fg={COLORS.cyan} width={30}>
                {a.name}
              </text>
              <text fg={COLORS.comment}>{summarizeTriggers(a.triggers)}</text>
            </box>
          ))
        )}
      </box>

      {/* State summary */}
      <SectionHeader title="State" count={state.count} />
      <box flexDirection="column" paddingLeft={2}>
        {state.count === 0 ? (
          <text fg={COLORS.comment}>(none)</text>
        ) : (
          Object.entries(state.state).map(([key, value]) => (
            <box key={key} flexDirection="row">
              <text width={34}>{key}</text>
              <text fg={valueColor(value)}>{formatValue(value)}</text>
            </box>
          ))
        )}
      </box>

      {/* Recent logs */}
      <SectionHeader title="Recent Logs" count={logs.count} />
      <box flexDirection="column" paddingLeft={2}>
        {logs.count === 0 ? (
          <text fg={COLORS.comment}>(none)</text>
        ) : (
          logs.entries.slice(-10).map((entry) => {
            const time = new Date(entry.time).toISOString().slice(11, 23);
            const auto = entry.automation ? ` [${entry.automation}]` : "";
            return (
              <text key={`${entry.time}-${entry.msg}`}>
                <span fg={COLORS.comment}>{time}</span>{" "}
                <span fg={levelColor(entry.level)}>{levelName(entry.level).padEnd(5)}</span>
                <span fg={COLORS.cyan}>{auto}</span> {entry.msg}
              </text>
            );
          })
        )}
      </box>
    </box>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <box marginTop={1} paddingLeft={1}>
      <text>
        <span fg={COLORS.comment}>── </span>
        <strong>{title}</strong>
        <span fg={COLORS.comment}>
          {" "}
          ({count}) {"─".repeat(30)}
        </span>
      </text>
    </box>
  );
}
