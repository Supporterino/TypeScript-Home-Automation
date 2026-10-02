/**
 * Audience-split navigation, rendered through two components sharing one
 * information architecture (design.md D10, D13; specs/web-ui "Navigation and
 * Information Architecture", "Responsive Navigation"; tasks 8.2, 8.7).
 *
 * A control group (favorites, overview, rooms, unassigned, all devices) and
 * an operator group (automations, state, logs, HomeKit, energy, weather). The
 * desktop sidebar shows both, each collapsible; the Favorites sub-list only
 * appears when the user has favorites, and is labelled distinctly from the
 * rooms. The mobile bottom bar shows only the control group's fixed three
 * slots — home, rooms, devices — so the phone's most-used surface is never
 * behind a disclosure; every operator view stays reachable by URL, just not
 * promoted into this bar (design.md D10, D13).
 *
 * Active-state matching follows a detail route back to its collection entry
 * (`isUnder`), while a sibling static route such as `/devices/unassigned` is
 * excluded from activating "All devices".
 */
import { Badge, Group, NavLink, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import {
  IconBolt,
  IconChevronDown,
  IconChevronRight,
  IconCloud,
  IconDatabase,
  IconDeviceUnknown,
  IconDoorEnter,
  IconFileText,
  IconHome,
  IconLayoutDashboard,
  IconListDetails,
  IconRobot,
  IconStar,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useDataStore } from "../lib/data-store.js";
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
  roomsPath,
  statePath,
  unassignedDevicesPath,
  weatherPath,
} from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";

export function DesktopSidebar() {
  const { rooms, favorites, devicesByQualifiedId } = useDataStore();
  const { basePath, pathname } = useRouter();
  const [homeOpen, setHomeOpen] = useState(true);
  const [engineOpen, setEngineOpen] = useState(true);

  const favoriteDevices = favorites
    .map((qualifiedId) => devicesByQualifiedId.get(qualifiedId))
    .filter((device): device is NonNullable<typeof device> => device !== undefined);

  return (
    <ScrollArea h="100%">
      <Stack gap={4} p="xs">
        <GroupHeader label="Home" open={homeOpen} onToggle={() => setHomeOpen((o) => !o)} />
        {homeOpen && (
          <Stack gap={2}>
            {favoriteDevices.length > 0 && (
              // A separate label keeps the favorites list distinct from the
              // rooms beneath it (specs/web-ui "Favorites are a navigable
              // group").
              <Stack gap={2} mb={4}>
                <Group gap={6} px={6} py={2}>
                  <IconStar size={12} />
                  <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                    Favorites
                  </Text>
                </Group>
                {favoriteDevices.map((device) => {
                  const path = deviceDetailPath(basePath, device.qualifiedId);
                  return (
                    <Link key={device.qualifiedId} to={path} style={{ textDecoration: "none" }}>
                      <NavLink
                        label={device.displayName}
                        leftSection={<IconStar size={16} />}
                        active={isUnder(pathname, path)}
                        component="div"
                      />
                    </Link>
                  );
                })}
              </Stack>
            )}

            <Link to={overviewPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="Overview"
                leftSection={<IconLayoutDashboard size={16} />}
                active={isOverviewView(pathname, basePath)}
                component="div"
              />
            </Link>
            {rooms.map((room) => {
              const path = roomPath(basePath, room.id);
              // Counts what a user sees on the room's own default listing
              // (reveal off) — a count that includes hidden members would
              // disagree with the list beneath it (specs/web-ui "Hidden
              // Devices Are Filtered By Default And Revealable").
              const count = room.members.filter((m) => m.available && !m.device?.hidden).length;
              return (
                <Link key={room.id} to={path} style={{ textDecoration: "none" }}>
                  <NavLink
                    label={room.name}
                    leftSection={<IconDoorEnter size={16} />}
                    rightSection={
                      <Badge size="xs" variant="light" circle>
                        {count}
                      </Badge>
                    }
                    active={isUnder(pathname, path)}
                    component="div"
                  />
                </Link>
              );
            })}
            <Link to={unassignedDevicesPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="Unassigned"
                leftSection={<IconDeviceUnknown size={16} />}
                active={isUnder(pathname, unassignedDevicesPath(basePath))}
                component="div"
              />
            </Link>
            <Link to={devicesPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="All devices"
                leftSection={<IconListDetails size={16} />}
                // `/devices/unassigned` has its own entry and must not light
                // this one up; a device detail route keeps it active.
                active={
                  isUnder(pathname, devicesPath(basePath)) &&
                  !isUnder(pathname, unassignedDevicesPath(basePath))
                }
                component="div"
              />
            </Link>
          </Stack>
        )}

        <GroupHeader label="Engine" open={engineOpen} onToggle={() => setEngineOpen((o) => !o)} />
        {engineOpen && (
          <Stack gap={2}>
            <Link to={automationsPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="Automations"
                leftSection={<IconRobot size={16} />}
                active={isUnder(pathname, automationsPath(basePath))}
                component="div"
              />
            </Link>
            <Link to={statePath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="State"
                leftSection={<IconDatabase size={16} />}
                active={isUnder(pathname, statePath(basePath))}
                component="div"
              />
            </Link>
            <Link to={logsPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="Logs"
                leftSection={<IconFileText size={16} />}
                active={isUnder(pathname, logsPath(basePath))}
                component="div"
              />
            </Link>
            <Link to={homekitPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="HomeKit"
                leftSection={<IconHome size={16} />}
                active={isUnder(pathname, homekitPath(basePath))}
                component="div"
              />
            </Link>
            <Link to={energyPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="Energy"
                leftSection={<IconBolt size={16} />}
                active={isUnder(pathname, energyPath(basePath))}
                component="div"
              />
            </Link>
            <Link to={weatherPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="Weather"
                leftSection={<IconCloud size={16} />}
                active={isUnder(pathname, weatherPath(basePath))}
                component="div"
              />
            </Link>
          </Stack>
        )}
      </Stack>
    </ScrollArea>
  );
}

function GroupHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <UnstyledButton onClick={onToggle} px={6} py={4}>
      <Group gap={6}>
        {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {label}
        </Text>
      </Group>
    </UnstyledButton>
  );
}

const MOBILE_ICONS: Record<ControlView, ReactNode> = {
  overview: <IconLayoutDashboard size={20} />,
  rooms: <IconDoorEnter size={20} />,
  devices: <IconListDetails size={20} />,
};

/**
 * Three fixed slots, control-group only (design.md D10, D13) — the items are
 * pure data in `router.ts` (`MOBILE_NAV_ITEMS`) so a test can assert no
 * operator view is ever promoted here. Operator views remain reachable by URL.
 */
export function MobileBottomBar() {
  const { basePath, pathname } = useRouter();

  return (
    <Group h="100%" grow gap={0}>
      {MOBILE_NAV_ITEMS.map((item) => {
        const path = item.buildPath(basePath);
        // The overview is active on both its base path and the `/overview`
        // alias; rooms/devices keep their detail routes highlighted.
        const active =
          item.view === "overview" ? isOverviewView(pathname, basePath) : isUnder(pathname, path);
        return (
          <Link
            key={item.view}
            to={path}
            style={{
              textDecoration: "none",
              color: active ? "var(--mantine-primary-color-filled)" : "var(--mantine-color-dimmed)",
            }}
          >
            <Stack align="center" gap={2} py={6}>
              {MOBILE_ICONS[item.view]}
              <Text size="xs">{item.label}</Text>
            </Stack>
          </Link>
        );
      })}
    </Group>
  );
}
