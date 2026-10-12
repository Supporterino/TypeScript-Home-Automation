import { useTerminalDimensions } from "@opentui/react";
import { energySummary, weatherSummary } from "../dashboard-model.js";
import { summarizeTriggers } from "../format.js";
import { COLORS, formatUptime, formatValue, levelColor, levelName, valueColor } from "./theme.js";
import type { DashboardData } from "./types.js";

export function OverviewTab({ data }: { data: DashboardData }) {
  const { readiness, automations, state, logs } = data;
  const { width } = useTerminalDimensions();
  const engineOk = readiness.checks.engine;
  const mqttOk = readiness.checks.mqtt;
  const homekitRunning = data.homekit?.running ?? null;
  const keyWidth = Math.max(20, Math.floor(width * 0.35));
  const energy = energySummary(data.energy);
  const weather = weatherSummary(data.weather);

  return (
    <box flexDirection="column" flexGrow={1} width="100%">
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
        {homekitRunning !== null && (
          <text>
            HomeKit:{" "}
            <span fg={homekitRunning ? COLORS.green : COLORS.red}>
              {homekitRunning ? "running" : "stopped"}
            </span>
          </text>
        )}
        <text>
          Uptime: <span fg={COLORS.cyan}>{formatUptime(readiness.startedAt)}</span>
        </text>
        <text>
          TZ: <span fg={COLORS.comment}>{readiness.tz ?? "system default"}</span>
        </text>
      </box>

      {/* Energy (slow-polled; not streamed) */}
      <SectionHeader title="Energy" count={energy?.deviceCount ?? 0} width={width} />
      <box flexDirection="column" paddingLeft={2}>
        {energy === null ? (
          <text fg={COLORS.comment}>(unavailable)</text>
        ) : (
          <text>
            Power: <span fg={COLORS.cyan}>{energy.powerWatts} W</span> Consumption:{" "}
            <span fg={COLORS.cyan}>{energy.energyWh} Wh</span> Devices:{" "}
            <span fg={COLORS.cyan}>{energy.deviceCount}</span>
          </text>
        )}
      </box>

      {/* Weather (slow-polled; not streamed) */}
      <SectionHeader title="Weather" count={weather.forecast.length} width={width} />
      <box flexDirection="column" paddingLeft={2}>
        <text fg={weather.available ? COLORS.fg : COLORS.comment}>{weather.message}</text>
        {weather.current && (
          <text fg={COLORS.comment}>Feels like {weather.current.feelsLike}°C</text>
        )}
        {weather.forecast.map((day) => (
          <box key={day.date} flexDirection="row">
            <text fg={COLORS.comment} width={12}>
              {day.date}
            </text>
            <text fg={COLORS.fg} width={16}>
              {day.tempLow}–{day.tempHigh}°C
            </text>
            <text fg={COLORS.comment}>{day.description}</text>
          </box>
        ))}
      </box>

      {/* Automations summary */}
      <SectionHeader title="Automations" count={automations.count} width={width} />
      <box flexDirection="column" paddingLeft={2}>
        {automations.count === 0 ? (
          <text fg={COLORS.comment}>(none)</text>
        ) : (
          automations.automations.map((a) => (
            <box key={a.name} flexDirection="row">
              <text fg={a.enabled ? COLORS.cyan : COLORS.comment} width={keyWidth}>
                {a.name}
                {a.enabled ? "" : " (disabled)"}
              </text>
              <text fg={COLORS.comment}>{summarizeTriggers(a.triggers)}</text>
            </box>
          ))
        )}
      </box>

      {/* State summary */}
      <SectionHeader title="State" count={state.count} width={width} />
      <box flexDirection="column" paddingLeft={2}>
        {state.count === 0 ? (
          <text fg={COLORS.comment}>(none)</text>
        ) : (
          Object.entries(state.state).map(([key, value]) => (
            <box key={key} flexDirection="row">
              <text width={keyWidth}>{key}</text>
              <text fg={valueColor(value)}>{formatValue(value)}</text>
            </box>
          ))
        )}
      </box>

      {/* Recent logs */}
      <SectionHeader title="Recent Logs" count={logs.count} width={width} />
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

function SectionHeader({ title, count, width }: { title: string; count: number; width: number }) {
  const labelLen = title.length + String(count).length + 7; // "── Title (N) "
  const lineLen = Math.max(10, width - labelLen - 4);
  return (
    <box marginTop={1} paddingLeft={1}>
      <text>
        <span fg={COLORS.comment}>── </span>
        <strong>{title}</strong>
        <span fg={COLORS.comment}>
          {" "}
          ({count}) {"─".repeat(lineLen)}
        </span>
      </text>
    </box>
  );
}
