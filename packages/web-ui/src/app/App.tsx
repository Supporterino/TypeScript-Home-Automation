import {
  ActionIcon,
  AppShell,
  Group,
  Loader,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconBolt,
  IconMoon,
  IconRefresh,
  IconSun,
  IconWifi,
  IconWifiOff,
} from "@tabler/icons-react";
import { lazy, Suspense, useEffect } from "react";
import { initApi } from "./api.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { DesktopSidebar, MobileBottomBar } from "./components/Nav.js";
import { useAuth } from "./hooks/useAuth.js";
import { DataStoreProvider, useDataStore } from "./lib/data-store.js";
import { RouterProvider, useRouter } from "./lib/router-context.js";
import { DashboardView } from "./views/DashboardView.js";
import { NotFoundView } from "./views/NotFoundView.js";

const RoomsView = lazy(() =>
  import("./views/RoomsView.js").then((m) => ({ default: m.RoomsView })),
);
const RoomViewLazy = lazy(() =>
  import("./views/RoomView.js").then((m) => ({ default: m.RoomView })),
);
const DevicesView = lazy(() =>
  import("./views/DevicesView.js").then((m) => ({ default: m.DevicesView })),
);
const DeviceDetailViewLazy = lazy(() =>
  import("./views/DeviceDetailView.js").then((m) => ({ default: m.DeviceDetailView })),
);
const AutomationsView = lazy(() =>
  import("./views/AutomationsView.js").then((m) => ({ default: m.AutomationsView })),
);
const AutomationDetailViewLazy = lazy(() =>
  import("./views/AutomationDetailView.js").then((m) => ({ default: m.AutomationDetailView })),
);
const StateView = lazy(() =>
  import("./views/StateView.js").then((m) => ({ default: m.StateView })),
);
const LogsView = lazy(() => import("./views/LogsView.js").then((m) => ({ default: m.LogsView })));
const HomekitView = lazy(() =>
  import("./views/HomekitView.js").then((m) => ({ default: m.HomekitView })),
);

// Configuration injected by the server into the <html> element's data attributes
const basePath =
  (document.documentElement as HTMLElement & { dataset: DOMStringMap }).dataset.basePath ??
  "/status";

const HEADER_HEIGHT = 52;
const FOOTER_HEIGHT = 56;

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

function TransportIndicator() {
  const { transport, refresh } = useDataStore();
  const live = transport === "live";
  const label = transport === "connecting" ? "Connecting…" : live ? "Live" : "Degraded — polling";
  const color = transport === "connecting" ? "yellow" : live ? "green" : "red";

  return (
    <Group gap={4} wrap="nowrap">
      {live ? (
        <IconWifi size={13} color={`var(--mantine-color-${color}-5)`} />
      ) : (
        <IconWifiOff size={13} color={`var(--mantine-color-${color}-5)`} />
      )}
      <Text size="xs" c={color} visibleFrom="xs">
        {label}
      </Text>
      <Tooltip label="Refresh now">
        <ActionIcon variant="default" size="sm" onClick={() => void refresh()} aria-label="Refresh">
          <IconRefresh size={13} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function RouteOutlet() {
  const { route } = useRouter();

  switch (route.view) {
    case "dashboard":
      return <DashboardView />;
    case "rooms":
      return <RoomsView />;
    case "room":
      return <RoomViewLazy roomId={route.params.id ?? ""} />;
    case "devices":
      return <DevicesView />;
    case "unassigned-devices":
      return <DevicesView onlyUnassigned />;
    case "device-detail":
      return <DeviceDetailViewLazy qualifiedId={route.params.qualifiedId ?? ""} />;
    case "automations":
      return <AutomationsView />;
    case "automation-detail":
      return <AutomationDetailViewLazy name={route.params.name ?? ""} />;
    case "state":
      return <StateView />;
    case "logs":
      return <LogsView />;
    case "homekit":
      return <HomekitView />;
    default:
      return <NotFoundView />;
  }
}

function Shell() {
  const { pathname } = useRouter();

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: 220, breakpoint: "sm" }}
      footer={{ height: FOOTER_HEIGHT }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <IconBolt size={18} />
            <Text fw={700} size="sm">
              ts-ha
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <TransportIndicator />
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar visibleFrom="sm">
        <DesktopSidebar />
      </AppShell.Navbar>

      <AppShell.Footer hiddenFrom="sm">
        <MobileBottomBar />
      </AppShell.Footer>

      <AppShell.Main>
        {/*
          Keyed by pathname: navigating to another view and back remounts
          the boundary, which is how a caught render failure recovers
          (design.md R16). The single structural point where routed view
          content is swapped.
        */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<Loader size="sm" mt="xl" />}>
            <RouteOutlet />
          </Suspense>
        </ErrorBoundary>
      </AppShell.Main>
    </AppShell>
  );
}

export function App() {
  const { token } = useAuth(basePath);

  useEffect(() => {
    initApi(basePath, token);
  }, [token]);

  return (
    <RouterProvider basePath={basePath}>
      <DataStoreProvider>
        <Shell />
      </DataStoreProvider>
    </RouterProvider>
  );
}
