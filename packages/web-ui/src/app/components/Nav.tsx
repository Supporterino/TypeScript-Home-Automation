/**
 * Audience-split navigation: a control group and an operator group, rendered as
 * a wide-viewport rail and a narrow-viewport bottom bar.
 */
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CircleQuestionMark,
  Cloud,
  Database,
  DoorOpen,
  Ellipsis,
  FileText,
  House,
  LayoutDashboard,
  LayoutList,
  Monitor,
  Star,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useDataStore } from "../lib/data-store.js";
import { humanizeDeviceName } from "../lib/humanize-name.js";
import {
  automationsPath,
  type ControlView,
  deviceDetailPath,
  devicesPath,
  energyPath,
  homekitPath,
  isOverviewView,
  isUnder,
  logsPath,
  MOBILE_NAV_ITEMS,
  overviewPath,
  roomPath,
  statePath,
  unassignedDevicesPath,
  wallsPath,
  weatherPath,
} from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";
import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
  NavItem,
} from "../ui/index.js";

/**
 * A `ui/NavItem` wired to the History API: a plain left click is intercepted,
 * every other click keeps its native behaviour.
 */
function NavLink({
  to,
  active,
  icon,
  label,
  trailing,
  depth = 0,
  className,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  depth?: 0 | 1 | 2 | 3;
  className?: string;
}) {
  const { navigate } = useRouter();
  return (
    <NavItem
      href={to}
      active={active}
      depth={depth}
      icon={icon}
      label={label}
      trailing={trailing}
      className={className}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}

/** A collapsible navigation group header (Radix Collapsible carries `aria-expanded`). */
function NavGroup({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="touch-target flex w-full items-center gap-1.5 rounded-input px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 pt-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DesktopSidebar() {
  const { rooms, favorites, devicesByQualifiedId } = useDataStore();
  const { basePath, pathname } = useRouter();
  const [homeOpen, setHomeOpen] = useState(true);
  const [engineOpen, setEngineOpen] = useState(true);

  const favoriteDevices = favorites
    .map((qualifiedId) => devicesByQualifiedId.get(qualifiedId))
    .filter((device): device is NonNullable<typeof device> => device !== undefined);

  return (
    <nav
      aria-label="Main"
      className="hidden border-r border-hairline bg-surface md:sticky md:top-[calc(3.5rem+env(safe-area-inset-top))] md:block md:max-h-[calc(100dvh-3.5rem)] md:w-60 md:shrink-0 md:overflow-y-auto"
    >
      <div className="flex flex-col gap-1 p-3">
        <NavGroup label="Home" open={homeOpen} onOpenChange={setHomeOpen}>
          {favoriteDevices.length > 0 && (
            // A separate label keeps the favorites list distinct from the rooms.
            <div className="flex flex-col gap-0.5 pb-1">
              <div className="flex items-center gap-1.5 px-2.5 pt-1">
                <Star size={12} aria-hidden className="text-stale" />
                <span className="text-xs font-bold uppercase tracking-wide text-muted">
                  Favorites
                </span>
              </div>
              {favoriteDevices.map((device) => {
                const path = deviceDetailPath(basePath, device.qualifiedId);
                return (
                  <NavLink
                    key={device.qualifiedId}
                    to={path}
                    depth={1}
                    icon={<Star size={16} aria-hidden />}
                    label={humanizeDeviceName(device.displayName)}
                    active={isUnder(pathname, path)}
                  />
                );
              })}
            </div>
          )}

          <NavLink
            to={overviewPath(basePath)}
            icon={<LayoutDashboard size={16} aria-hidden />}
            label="Overview"
            active={isOverviewView(pathname, basePath)}
          />
          {rooms.map((room) => {
            const path = roomPath(basePath, room.id);
            // Counts what the room's default listing shows; hidden members are
            // excluded so the count agrees with the list beneath it.
            const count = room.members.filter((m) => m.available && !m.device?.hidden).length;
            return (
              <NavLink
                key={room.id}
                to={path}
                depth={1}
                icon={<DoorOpen size={16} aria-hidden />}
                label={room.name}
                trailing={<Badge tone="neutral">{count}</Badge>}
                active={isUnder(pathname, path)}
              />
            );
          })}
          <NavLink
            to={unassignedDevicesPath(basePath)}
            icon={<CircleQuestionMark size={16} aria-hidden />}
            label="Unassigned"
            active={isUnder(pathname, unassignedDevicesPath(basePath))}
          />
          <NavLink
            to={devicesPath(basePath)}
            icon={<LayoutList size={16} aria-hidden />}
            label="All devices"
            // `/devices/unassigned` has its own entry and must not light this up.
            active={
              isUnder(pathname, devicesPath(basePath)) &&
              !isUnder(pathname, unassignedDevicesPath(basePath))
            }
          />
        </NavGroup>

        <NavGroup label="Engine" open={engineOpen} onOpenChange={setEngineOpen}>
          <NavLink
            to={automationsPath(basePath)}
            icon={<Bot size={16} aria-hidden />}
            label="Automations"
            active={isUnder(pathname, automationsPath(basePath))}
          />
          <NavLink
            to={statePath(basePath)}
            icon={<Database size={16} aria-hidden />}
            label="State"
            active={isUnder(pathname, statePath(basePath))}
          />
          <NavLink
            to={logsPath(basePath)}
            icon={<FileText size={16} aria-hidden />}
            label="Logs"
            active={isUnder(pathname, logsPath(basePath))}
          />
          <NavLink
            to={homekitPath(basePath)}
            icon={<House size={16} aria-hidden />}
            label="HomeKit"
            active={isUnder(pathname, homekitPath(basePath))}
          />
          <NavLink
            to={energyPath(basePath)}
            icon={<Zap size={16} aria-hidden />}
            label="Energy"
            active={isUnder(pathname, energyPath(basePath))}
          />
          <NavLink
            to={weatherPath(basePath)}
            icon={<Cloud size={16} aria-hidden />}
            label="Weather"
            active={isUnder(pathname, weatherPath(basePath))}
          />
          <NavLink
            to={wallsPath(basePath)}
            icon={<Monitor size={16} aria-hidden />}
            label="Walls"
            // The `/wall/:name` surface is not a navigation destination; only
            // `/walls` lights this entry.
            active={isUnder(pathname, wallsPath(basePath))}
          />
        </NavGroup>
      </div>
    </nav>
  );
}

const MOBILE_ICONS: Record<ControlView, ReactNode> = {
  overview: <LayoutDashboard size={20} aria-hidden />,
  rooms: <DoorOpen size={20} aria-hidden />,
  devices: <LayoutList size={20} aria-hidden />,
};

/** The stacked-tab overrides that turn `NavItem`'s row layout into a bar tab. */
const TAB_ITEM_CLASS =
  "flex-col items-center gap-0.5 text-xs [&>span]:w-full [&>span]:flex-none [&>span]:text-center";

/**
 * The narrow-viewport control bar: the control group's primary destinations
 * plus an overflow affordance for the remaining entries.
 */
export function MobileBottomBar() {
  const { basePath, pathname, navigate } = useRouter();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden"
    >
      <div className="grid grid-cols-4">
        {MOBILE_NAV_ITEMS.map((item) => {
          const path = item.buildPath(basePath);
          // Like the sidebar, the devices tab excludes `/devices/unassigned`,
          // which has its own control-group entry.
          const active =
            item.view === "overview"
              ? isOverviewView(pathname, basePath)
              : item.view === "devices"
                ? isUnder(pathname, path) && !isUnder(pathname, unassignedDevicesPath(basePath))
                : isUnder(pathname, path);
          return (
            <NavLink
              key={item.view}
              to={path}
              icon={MOBILE_ICONS[item.view]}
              label={item.label}
              active={active}
              className={TAB_ITEM_CLASS}
            />
          );
        })}

        <DropdownMenu>
          <div className="flex flex-col items-center justify-center gap-0.5 py-2">
            <DropdownMenuTrigger asChild>
              <IconButton label="More destinations" size="sm" className="text-muted">
                <Ellipsis size={20} />
              </IconButton>
            </DropdownMenuTrigger>
            <span aria-hidden className="text-xs font-medium text-muted">
              More
            </span>
          </div>
          <DropdownMenuContent side="top" align="end" className="w-56">
            <DropdownMenuLabel>Devices</DropdownMenuLabel>
            {/*
              Navigation runs on the item's `onSelect`: a child link that prevents
              the default would suppress Radix's focus restore.
            */}
            <DropdownMenuItem onSelect={() => navigate(unassignedDevicesPath(basePath))}>
              <CircleQuestionMark size={16} aria-hidden />
              Unassigned
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(devicesPath(basePath))}>
              <LayoutList size={16} aria-hidden />
              All devices
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
