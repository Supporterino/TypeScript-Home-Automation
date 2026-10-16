import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DebugClient } from "../client.js";
import { AutomationsTab } from "../components/automations-tab.js";
import { DevicesTab } from "../components/devices-tab.js";
import { HelpModal } from "../components/help-modal.js";
import { HomekitTab } from "../components/homekit-tab.js";
import { LogsTab } from "../components/logs-tab.js";
import { OverviewTab } from "../components/overview-tab.js";
import { RoomsTab } from "../components/rooms-tab.js";
import { StateTab } from "../components/state-tab.js";
import { StatusFooter } from "../components/status-footer.js";
import { COLORS } from "../components/theme.js";
import type { DashboardData } from "../components/types.js";
import { applyStreamEvent, createDeltaGate } from "../dashboard-model.js";
import { shouldHandleGlobalShortcut } from "../keyboard.js";

/**
 * HomeKit, energy, and weather are not carried by the event stream, so they
 * refresh on a slower poll: this multiple of the configured interval.
 */
const SLOW_POLL_FACTOR = 3;

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
  // Set by a tab capturing free text; the global handler then stands down.
  const [inputActive, setInputActive] = useState(false);

  const [data, setData] = useState<DashboardData>({
    readiness: {
      status: "unknown",
      checks: { mqtt: false, engine: false },
      startedAt: null,
      tz: null,
    },
    automations: { automations: [], count: 0 },
    devices: { devices: [], count: 0, sources: [] },
    rooms: { rooms: [], count: 0 },
    state: { state: {}, count: 0 },
    logs: { entries: [], count: 0 },
    homekit: null,
    energy: null,
    weather: null,
    error: null,
    lastRefresh: Date.now(),
  });

  // A ref, so a terminal resize does not tear down and reopen the stream.
  const heightRef = useRef(height);
  heightRef.current = height;

  // Deltas buffer here while a snapshot is in flight, then replay (see `runSnapshot`).
  const gateRef = useRef(createDeltaGate());
  const snapshotBusyRef = useRef(false);
  const snapshotPendingRef = useRef(false);

  /**
   * Full snapshot of every domain — first stream open, reconnect, `fell_behind`,
   * and manual refresh — with buffered deltas replayed once it resolves.
   */
  const runSnapshot = useCallback(async () => {
    if (snapshotBusyRef.current) {
      // A snapshot is already in flight; run one more after it so no trigger is dropped.
      snapshotPendingRef.current = true;
      return;
    }
    snapshotBusyRef.current = true;

    try {
      do {
        snapshotPendingRef.current = false;
        const gate = gateRef.current;
        gate.close();

        const logLimit = Math.max(10, heightRef.current - 15);
        try {
          const [readiness, automations, devices, rooms, state, logs, homekit, energy, weather] =
            await Promise.all([
              client.getReadiness(),
              client.listAutomations().catch(() => ({ automations: [], count: 0 })),
              client.getDeviceCatalog().catch(() => ({ devices: [], count: 0, sources: [] })),
              client.getRooms().catch(() => ({ rooms: [], count: 0 })),
              client.listState().catch(() => ({ state: {}, count: 0 })),
              client.getLogs({ limit: logLimit }).catch(() => ({ entries: [], count: 0 })),
              client.getHomekitStatus(),
              client.getEnergy().catch(() => null),
              client.getWeather().catch(() => null),
            ]);
          setData({
            readiness,
            automations,
            devices,
            rooms,
            state,
            logs,
            homekit,
            energy,
            weather,
            error: null,
            lastRefresh: Date.now(),
          });
        } catch (err) {
          setData((prev) => ({ ...prev, error: (err as Error).message }));
        }

        // Replay anything buffered during the read before live application resumes.
        const replay = gate.open();
        if (replay.length > 0) {
          setData((prev) => replay.reduce(applyStreamEvent, prev));
        }
      } while (snapshotPendingRef.current);
    } finally {
      snapshotBusyRef.current = false;
    }
  }, [client]);

  /** Slow poll for the domains the stream does not carry. */
  const fetchSlow = useCallback(async () => {
    const [homekit, energy, weather] = await Promise.all([
      client.getHomekitStatus(),
      client.getEnergy().catch(() => null),
      client.getWeather().catch(() => null),
    ]);
    setData((prev) => ({ ...prev, homekit, energy, weather, lastRefresh: Date.now() }));
  }, [client]);

  // Stream + slow poll: the stream is subscribed first and the snapshot is
  // taken on open, so a buffered delta closes any gap without overwrite.
  useEffect(() => {
    const slowTimer = setInterval(() => void fetchSlow(), interval * SLOW_POLL_FACTOR * 1000);

    const controller = new AbortController();
    let openedBefore = false;
    let fallbackStarted = false;

    client
      .streamEvents({
        signal: controller.signal,
        onEvent: (event) => {
          if (event.category === "fell_behind") {
            // The stream discarded unseen events — recover with a full re-snapshot.
            void runSnapshot();
            return;
          }
          const immediate = gateRef.current.accept(event);
          if (immediate.length > 0) {
            setData((prev) => immediate.reduce(applyStreamEvent, prev));
          }
        },
        onOpen: () => {
          // First open: snapshot now the subscription exists, closing the ordering
          // gap. Reconnect: re-snapshot, since events may have been missed.
          openedBefore = true;
          void runSnapshot();
          setData((prev) => (prev.error ? { ...prev, error: null } : prev));
        },
        onError: (err) => {
          // If the stream never opened, still snapshot so the dashboard stays usable.
          if (!openedBefore && !fallbackStarted) {
            fallbackStarted = true;
            void runSnapshot();
          }
          setData((prev) => ({ ...prev, error: err.message }));
        },
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setData((prev) => ({ ...prev, error: (err as Error).message }));
        }
      });

    return () => {
      controller.abort();
      clearInterval(slowTimer);
    };
  }, [client, runSnapshot, fetchSlow, interval]);

  // Global keyboard handler
  useKeyboard((key) => {
    // A tab is capturing free text — leave keystrokes meant for its input alone.
    if (!shouldHandleGlobalShortcut(inputActive)) return;

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
    else if (key.name === "6") setActiveTab(5);
    else if (key.name === "7") setActiveTab(6);

    // Force refresh
    if (key.name === "r") void runSnapshot();
  });

  const tabNames = compactTabs
    ? ["1:Ovw", "2:Auto", "3:Dev", "4:Rooms", "5:State", "6:Logs", "7:HK"]
    : ["1:Overview", "2:Automations", "3:Devices", "4:Rooms", "5:State", "6:Logs", "7:HomeKit"];

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
          <AutomationsTab data={data.automations} client={client} onRefresh={runSnapshot} />
        )}
        {activeTab === 2 && (
          <DevicesTab
            data={data.devices}
            client={client}
            onRefresh={runSnapshot}
            onInputActiveChange={setInputActive}
          />
        )}
        {activeTab === 3 && (
          <RoomsTab
            data={data.rooms}
            client={client}
            onRefresh={runSnapshot}
            onInputActiveChange={setInputActive}
          />
        )}
        {activeTab === 4 && <StateTab data={data.state} client={client} onRefresh={runSnapshot} />}
        {activeTab === 5 && <LogsTab data={data.logs} />}
        {activeTab === 6 && <HomekitTab data={data.homekit} />}
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
