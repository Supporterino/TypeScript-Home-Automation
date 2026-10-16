/**
 * The application shell: a sticky app bar, a wide-viewport rail and a
 * narrow-viewport bottom bar, with no chrome on the full-bleed wall.
 */
import { LoaderCircle, Monitor, Moon, RefreshCw, Sun, Wifi, WifiOff, Zap } from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect } from "react";
import { initApi } from "./api.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { DesktopSidebar, MobileBottomBar } from "./components/Nav.js";
import { useAuth } from "./hooks/useAuth.js";
import { DataStoreProvider, useDataStore } from "./lib/data-store.js";
import { isFullBleedView } from "./lib/router.js";
import { RouterProvider, useRouter } from "./lib/router-context.js";
import { type ThemePreference, useTheme } from "./lib/theme.js";
import type { TransportState } from "./types.js";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  IconButton,
  Row,
  Spinner,
  TooltipProvider,
} from "./ui/index.js";
import { NotFoundView } from "./views/NotFoundView.js";
import { OverviewView } from "./views/OverviewView.js";

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
const EnergyView = lazy(() =>
  import("./views/EnergyView.js").then((m) => ({ default: m.EnergyView })),
);
const WeatherView = lazy(() =>
  import("./views/WeatherView.js").then((m) => ({ default: m.WeatherView })),
);
const WallViewLazy = lazy(() =>
  import("./views/WallView.js").then((m) => ({ default: m.WallView })),
);
const WallsView = lazy(() =>
  import("./views/WallsView.js").then((m) => ({ default: m.WallsView })),
);

// Configuration injected by the server into the <html> element's data attributes
const basePath =
  (document.documentElement as HTMLElement & { dataset: DOMStringMap }).dataset.basePath ??
  "/status";

/**
 * The header copy for a transport state; the distinct label per state is the
 * non-colour channel alongside the icon and its token.
 */
function transportPresentation(transport: TransportState): {
  label: string;
  detail: string;
  icon: ReactNode;
  className: string;
} {
  switch (transport) {
    case "live":
      return {
        label: "Live",
        detail: "Realtime updates are streaming",
        icon: <Wifi size={14} aria-hidden />,
        className: "text-on",
      };
    case "connecting":
      return {
        label: "Connecting…",
        detail: "Opening the event stream",
        icon: <LoaderCircle size={14} aria-hidden />,
        className: "text-stale",
      };
    case "degraded":
      return {
        label: "Polled",
        detail: "Event stream unavailable — polling for updates",
        icon: <WifiOff size={14} aria-hidden />,
        className: "text-danger",
      };
  }
}

function TransportIndicator() {
  const { transport, refresh } = useDataStore();
  const presentation = transportPresentation(transport);

  return (
    <Row gap={1} align="center" wrap={false}>
      <span
        role="status"
        aria-live="polite"
        title={presentation.detail}
        className={cn("flex items-center gap-1 text-xs font-medium", presentation.className)}
      >
        {presentation.icon}
        <span>{presentation.label}</span>
      </span>
      <IconButton label="Refresh now" size="sm" onClick={() => void refresh()}>
        <RefreshCw size={14} />
      </IconButton>
    </Row>
  );
}

/** Whether a string from Radix's radio group is one of the theme preferences. */
function isThemePreference(value: string): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/** The light/dark/system theme control. */
function ThemeControl() {
  const { preference, resolvedTheme, setTheme } = useTheme();
  const Icon = preference === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`Color theme: ${preference}`} size="sm">
          <Icon size={14} aria-hidden />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(next) => {
            if (isThemePreference(next)) setTheme(next);
          }}
        >
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RouteOutlet() {
  const { route } = useRouter();

  switch (route.view) {
    case "overview":
      return <OverviewView />;
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
    case "energy":
      return <EnergyView />;
    case "weather":
      return <WeatherView />;
    case "walls":
      return <WallsView />;
    default:
      return <NotFoundView />;
  }
}

/** The sticky app bar: title, transport indicator, and theme control. */
function AppBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <Row className="h-14 gap-2 px-3 md:px-4" justify="between" align="center" wrap={false}>
        <Row gap={1} align="center" wrap={false}>
          <span aria-hidden className="text-accent">
            <Zap size={18} />
          </span>
          <span className="font-display text-base font-bold text-ink">ts-ha</span>
        </Row>
        <Row gap={1} align="center" wrap={false}>
          <TransportIndicator />
          <ThemeControl />
        </Row>
      </Row>
    </header>
  );
}

function Shell() {
  const { pathname, route } = useRouter();

  // The wall renders full-bleed, with no app bar, rail, or tab bar, so its
  // widgets use the whole panel. Every other view takes the shell path below.
  if (isFullBleedView(route.view)) {
    return (
      <ErrorBoundary key={pathname}>
        <Suspense
          fallback={
            <div className="grid min-h-dvh place-items-center">
              <Spinner />
            </div>
          }
        >
          <WallViewLazy name={route.params.name ?? ""} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <AppBar />

      <div className="flex">
        <DesktopSidebar />
        <div className="min-w-0 flex-1 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          {/*
            Keyed by pathname: navigating away and back remounts the boundary,
            which is how a caught render failure recovers.
          */}
          <main className="px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-8">
            <ErrorBoundary key={pathname}>
              <div className="motion-enter">
                <Suspense fallback={<Spinner className="mt-6" />}>
                  <RouteOutlet />
                </Suspense>
              </div>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <MobileBottomBar />
    </div>
  );
}

export function App() {
  const { token } = useAuth(basePath);

  useEffect(() => {
    initApi(basePath, token);
  }, [token]);

  return (
    <RouterProvider basePath={basePath}>
      {/* Radix tooltips need one provider above every trigger. */}
      <TooltipProvider>
        <DataStoreProvider>
          <Shell />
        </DataStoreProvider>
      </TooltipProvider>
    </RouterProvider>
  );
}
