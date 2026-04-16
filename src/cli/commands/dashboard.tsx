import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import type { DebugClient } from "../client.js";
import { AutomationsTab } from "../components/automations-tab.js";
import { DevicesTab } from "../components/devices-tab.js";
import { HelpModal } from "../components/help-modal.js";
import { LogsTab } from "../components/logs-tab.js";
import { OverviewTab } from "../components/overview-tab.js";
import { StateTab } from "../components/state-tab.js";
import { StatusFooter } from "../components/status-footer.js";
import { COLORS } from "../components/theme.js";
import type { DashboardData } from "../components/types.js";

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------

function Dashboard({
  client,
  host,
  interval,
}: {
  client: DebugClient;
  host: string;
  interval: number;
}) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const showHeader = height >= 30;
  const compactTabs = width < 60;

  const [activeTab, setActiveTab] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const [data, setData] = useState<DashboardData>({
    readiness: {
      status: "unknown",
      checks: { mqtt: false, engine: false },
      startedAt: null,
      tz: null,
    },
    automations: { automations: [], count: 0 },
    devices: { devices: [], count: 0, available: true },
    state: { state: {}, count: 0 },
    logs: { entries: [], count: 0 },
    error: null,
    lastRefresh: Date.now(),
  });

  const fetchData = useCallback(async () => {
    try {
      const logLimit = Math.max(10, height - 15);
      const [readiness, automations, devicesResult, state, logs] = await Promise.all([
        client.getReadiness(),
        client.listAutomations().catch(() => ({ automations: [], count: 0 })),
        client
          .listDevices()
          .then((r) => ({ ...r, available: true }))
          .catch((err: unknown) => {
            const msg = (err as Error).message ?? "";
            // 503 means registry is disabled — surface gracefully
            if (msg.includes("Device registry is disabled")) {
              return { devices: [], count: 0, available: false };
            }
            return { devices: [], count: 0, available: true };
          }),
        client.listState().catch(() => ({ state: {}, count: 0 })),
        client.getLogs({ limit: logLimit }).catch(() => ({ entries: [], count: 0 })),
      ]);
      setData({
        readiness,
        automations,
        devices: devicesResult,
        state,
        logs,
        error: null,
        lastRefresh: Date.now(),
      });
    } catch (err) {
      setData((prev) => ({
        ...prev,
        error: (err as Error).message,
      }));
    }
  }, [client, height]);

  // Initial fetch + periodic refresh
  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, interval * 1000);
    return () => clearInterval(timer);
  }, [fetchData, interval]);

  // Global keyboard handler
  useKeyboard((key) => {
    // Help modal toggle
    if (key.name === "?" || (key.shift && key.name === "/")) {
      setShowHelp((s) => !s);
      return;
    }

    // Close help modal
    if (showHelp) {
      if (key.name === "escape") setShowHelp(false);
      return;
    }

    // Quit
    if (key.name === "q") {
      renderer.destroy();
      return;
    }

    // Tab switching via number keys
    if (key.name === "1") setActiveTab(0);
    else if (key.name === "2") setActiveTab(1);
    else if (key.name === "3") setActiveTab(2);
    else if (key.name === "4") setActiveTab(3);
    else if (key.name === "5") setActiveTab(4);

    // Force refresh
    if (key.name === "r") fetchData();
  });

  const tabNames = compactTabs
    ? ["1:Ovw", "2:Auto", "3:Dev", "4:State", "5:Logs"]
    : ["1:Overview", "2:Automations", "3:Devices", "4:State", "5:Logs"];

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      {showHeader && (
        <box paddingLeft={1} marginBottom={1}>
          <ascii-font text="ts-ha" font="tiny" color={COLORS.purple} />
        </box>
      )}

      {/* Tab bar */}
      <box flexDirection="row" justifyContent="space-between" paddingX={1} marginBottom={1}>
        <box flexDirection="row" gap={1}>
          {tabNames.map((name, i) => (
            <text key={name} fg={i === activeTab ? COLORS.purple : COLORS.comment}>
              {i === activeTab ? `[${name}]` : ` ${name} `}
            </text>
          ))}
        </box>
        <text fg={COLORS.comment}>{host}</text>
      </box>

      {/* Separator */}
      <box paddingX={1}>
        <text fg={COLORS.comment}>{"─".repeat(Math.max(10, width - 4))}</text>
      </box>

      {/* Error banner */}
      {data.error && (
        <box border borderColor={COLORS.red} padding={1} marginX={1} marginTop={1}>
          <text fg={COLORS.red}>
            <strong>Connection error: </strong>
            {data.error}
          </text>
        </box>
      )}

      {/* Content area */}
      <box flexGrow={1} overflow="hidden">
        {activeTab === 0 && <OverviewTab data={data} />}
        {activeTab === 1 && (
          <AutomationsTab data={data.automations} client={client} onRefresh={fetchData} />
        )}
        {activeTab === 2 && <DevicesTab data={data.devices} />}
        {activeTab === 3 && <StateTab data={data.state} client={client} onRefresh={fetchData} />}
        {activeTab === 4 && <LogsTab data={data.logs} />}
      </box>

      {/* Footer */}
      <StatusFooter
        connected={data.readiness.checks.mqtt && data.readiness.checks.engine}
        lastRefresh={data.lastRefresh}
        interval={interval}
      />

      {/* Help modal overlay */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </box>
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runDashboard(
  client: DebugClient,
  host: string,
  interval: number,
): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  const root = createRoot(renderer);
  root.render(<Dashboard client={client} host={host} interval={interval} />);
}
