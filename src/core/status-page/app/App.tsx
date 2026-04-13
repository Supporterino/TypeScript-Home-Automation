import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  Indicator,
  NavLink,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { AutomationsTab } from "./components/AutomationsTab";
import { LogsTab } from "./components/LogsTab";
import { OverviewTab } from "./components/OverviewTab";
import { StateTab } from "./components/StateTab";
import { useApiPoller } from "./hooks/useApiPoller";
import { useAuth } from "./hooks/useAuth";

// Read configuration injected by the server into the <html> element's data attributes
const basePath =
  (document.documentElement as HTMLElement & { dataset: DOMStringMap }).dataset.basePath ??
  "/status";

type TabId = "overview" | "automations" | "state" | "logs";

const NAV_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "⬡" },
  { id: "automations", label: "Automations", icon: "⚡" },
  { id: "state", label: "State", icon: "◈" },
  { id: "logs", label: "Logs", icon: "≡" },
];

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [mobileNavOpen, { toggle: toggleMobileNav }] = useDisclosure(false);

  const { token } = useAuth(basePath);
  const { data, connected, lastRefresh, error, refresh } = useApiPoller(basePath, token, 5000);

  const lastRefreshStr = lastRefresh ? lastRefresh.toLocaleTimeString() : "—";

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    // Close mobile nav after selection
    if (mobileNavOpen) toggleMobileNav();
  }

  return (
    <AppShell
      navbar={{
        width: 180,
        breakpoint: "sm",
        collapsed: { mobile: !mobileNavOpen },
      }}
      padding="md"
    >
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <AppShell.Navbar p="sm">
        <AppShell.Section>
          <Text fw={700} size="sm" c="dimmed" tt="uppercase" mb="md" px="xs">
            ts-ha
          </Text>
        </AppShell.Section>

        <AppShell.Section grow>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              label={item.label}
              leftSection={<span style={{ fontSize: 14 }}>{item.icon}</span>}
              active={activeTab === item.id}
              onClick={() => handleTabChange(item.id)}
              mb={2}
            />
          ))}
        </AppShell.Section>

        <AppShell.Section>
          <Group px="xs" gap="xs" align="center">
            <Indicator color={connected ? "green" : "red"} size={8} processing={connected}>
              <Tooltip
                label={connected ? `Last refresh: ${lastRefreshStr}` : (error ?? "Disconnected")}
              >
                <Text size="xs" c="dimmed">
                  {connected ? lastRefreshStr : "offline"}
                </Text>
              </Tooltip>
            </Indicator>
            <Tooltip label="Refresh now">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={refresh}
                style={{ marginLeft: "auto" }}
                aria-label="Refresh"
              >
                ↻
              </ActionIcon>
            </Tooltip>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <AppShell.Main>
        {/* Mobile burger — only visible on small screens */}
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
