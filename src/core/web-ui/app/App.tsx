import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  NavLink,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { AutomationsTab } from "./components/AutomationsTab";
import { LogsTab } from "./components/LogsTab";
import { OverviewTab } from "./components/OverviewTab";
import { StateTab } from "./components/StateTab";
import { useApiPoller } from "./hooks/useApiPoller";
import { useAuth } from "./hooks/useAuth";

// Configuration injected by the server into the <html> element's data attributes
const basePath =
  (document.documentElement as HTMLElement & { dataset: DOMStringMap }).dataset.basePath ??
  "/status";

type TabId = "overview" | "automations" | "state" | "logs";

const NAV_ITEMS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "automations", label: "Automations" },
  { id: "state", label: "State" },
  { id: "logs", label: "Logs" },
];

// ── Color scheme toggle ───────────────────────────────────────────────────

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme("light", { getInitialValueInEffect: true });

  return (
    <Tooltip label={computed === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
      <ActionIcon
        variant="default"
        size="sm"
        onClick={() => setColorScheme(computed === "dark" ? "light" : "dark")}
        aria-label="Toggle color scheme"
      >
        {computed === "dark" ? "☀" : "☾"}
      </ActionIcon>
    </Tooltip>
  );
}

// ── App ───────────────────────────────────────────────────────────────────

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [mobileNavOpen, { toggle: toggleMobileNav }] = useDisclosure(false);

  const { token } = useAuth(basePath);
  const { data, connected, lastRefresh, error, paused, refresh, togglePause } = useApiPoller(
    basePath,
    token,
    5000,
  );

  const lastRefreshStr = lastRefresh ? lastRefresh.toLocaleTimeString() : "—";

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    if (mobileNavOpen) toggleMobileNav();
  }

  // Status indicator label
  const statusLabel = paused
    ? "Paused"
    : connected
      ? `Live · ${lastRefreshStr}`
      : (error ?? "Disconnected");

  const statusColor = paused ? "yellow" : connected ? "green" : "red";

  return (
    <AppShell
      navbar={{
        width: 200,
        breakpoint: "sm",
        collapsed: { mobile: !mobileNavOpen },
      }}
      padding="md"
    >
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Group gap={"xs"} wrap="nowrap" mb="md">
            <Text fw={700} size="sm" c="dimmed" tt="uppercase">
              ts-ha
            </Text>
            {/* Color scheme toggle */}
            <ColorSchemeToggle />
          </Group>
        </AppShell.Section>

        <AppShell.Section grow>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              label={item.label}
              active={activeTab === item.id}
              onClick={() => handleTabChange(item.id)}
              mb={2}
              variant="light"
            />
          ))}
        </AppShell.Section>

        <AppShell.Section>
          <Group gap="xs" align="center" wrap="nowrap">
            {/* Live/paused/offline indicator dot */}
            <Text
              size="xs"
              c={statusColor}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {statusLabel}
            </Text>

            {/* Pause / resume */}
            <Tooltip label={paused ? "Resume" : "Pause"}>
              <ActionIcon
                variant="default"
                size="sm"
                onClick={togglePause}
                aria-label={paused ? "Resume auto-refresh" : "Pause auto-refresh"}
              >
                {paused ? "▶" : "⏸"}
              </ActionIcon>
            </Tooltip>

            {/* Manual refresh */}
            <Tooltip label="Refresh now">
              <ActionIcon variant="default" size="sm" onClick={refresh} aria-label="Refresh">
                ↻
              </ActionIcon>
            </Tooltip>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <AppShell.Main>
        <Burger
          opened={mobileNavOpen}
          onClick={toggleMobileNav}
          hiddenFrom="sm"
          size="sm"
          mb="sm"
        />

        {activeTab === "overview" && <OverviewTab data={data} />}
        {activeTab === "automations" && <AutomationsTab data={data} />}
        {activeTab === "state" && <StateTab data={data} onMutate={refresh} />}
        {activeTab === "logs" && <LogsTab data={data} />}
      </AppShell.Main>
    </AppShell>
  );
}
