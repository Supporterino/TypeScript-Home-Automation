import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBolt,
  IconDatabase,
  IconDevices,
  IconFileText,
  IconLayoutDashboard,
  IconMoon,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconRobot,
  IconSun,
  IconWifi,
  IconWifiOff,
} from "@tabler/icons-react";
import { useState } from "react";
import { AutomationsTab } from "./components/AutomationsTab.js";
import { DevicesTab } from "./components/DevicesTab.js";
import { LogsTab } from "./components/LogsTab.js";
import { OverviewTab } from "./components/OverviewTab.js";
import { StateTab } from "./components/StateTab.js";
import { useApiPoller } from "./hooks/useApiPoller.js";
import { useAuth } from "./hooks/useAuth.js";

// Configuration injected by the server into the <html> element's data attributes
const basePath =
  (document.documentElement as HTMLElement & { dataset: DOMStringMap }).dataset.basePath ??
  "/status";

type TabId = "overview" | "automations" | "devices" | "state" | "logs";

const NAV_ITEMS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <IconLayoutDashboard size={16} /> },
  { id: "automations", label: "Automations", icon: <IconRobot size={16} /> },
  { id: "devices", label: "Devices", icon: <IconDevices size={16} /> },
  { id: "state", label: "State", icon: <IconDatabase size={16} /> },
  { id: "logs", label: "Logs", icon: <IconFileText size={16} /> },
];

const HEADER_HEIGHT = 52;

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
        {computed === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}
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

  const statusLabel = paused
    ? "Paused"
    : connected
      ? `Live · ${lastRefreshStr}`
      : (error ?? "Disconnected");

  const statusColor = paused ? "yellow" : connected ? "green" : "red";

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{
        width: 200,
        breakpoint: "sm",
        collapsed: { mobile: !mobileNavOpen },
      }}
      padding="md"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          {/* Left: burger (mobile) + app title */}
          <Group gap="xs" wrap="nowrap">
            <Burger
              opened={mobileNavOpen}
              onClick={toggleMobileNav}
              hiddenFrom="sm"
              size="sm"
              aria-label="Toggle navigation"
            />
            <Group gap={6} wrap="nowrap" visibleFrom="sm">
              <IconBolt size={18} />
              <Text fw={700} size="sm">
                ts-ha
              </Text>
            </Group>
            <Text fw={700} size="sm" hiddenFrom="sm">
              ts-ha
            </Text>
          </Group>

          {/* Right: status + controls */}
          <Group gap="xs" wrap="nowrap">
            <Group gap={4} wrap="nowrap">
              {connected && !paused ? (
                <IconWifi size={13} color={`var(--mantine-color-${statusColor}-5)`} />
              ) : (
                <IconWifiOff size={13} color={`var(--mantine-color-${statusColor}-5)`} />
              )}
              <Text
                size="xs"
                c={statusColor}
                style={{
                  whiteSpace: "nowrap",
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {statusLabel}
              </Text>
            </Group>

            <Tooltip label={paused ? "Resume" : "Pause"}>
              <ActionIcon
                variant="default"
                size="sm"
                onClick={togglePause}
                aria-label={paused ? "Resume auto-refresh" : "Pause auto-refresh"}
              >
                {paused ? <IconPlayerPlay size={13} /> : <IconPlayerPause size={13} />}
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Refresh now">
              <ActionIcon variant="default" size="sm" onClick={refresh} aria-label="Refresh">
                <IconRefresh size={13} />
              </ActionIcon>
            </Tooltip>

            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <AppShell.Navbar p="sm">
        <AppShell.Section grow component={ScrollArea}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              label={item.label}
              leftSection={item.icon}
              active={activeTab === item.id}
              onClick={() => handleTabChange(item.id)}
              component="button"
              mb={2}
              variant="light"
            />
          ))}
        </AppShell.Section>
      </AppShell.Navbar>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <AppShell.Main>
        {activeTab === "overview" && <OverviewTab data={data} />}
        {activeTab === "automations" && <AutomationsTab data={data} />}
        {activeTab === "devices" && <DevicesTab data={data} />}
        {activeTab === "state" && <StateTab data={data} onMutate={refresh} />}
        {activeTab === "logs" && <LogsTab data={data} />}
      </AppShell.Main>
    </AppShell>
  );
}
