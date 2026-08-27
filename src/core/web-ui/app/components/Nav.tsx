/**
 * Audience-split navigation, rendered through two components sharing one
 * information architecture (design.md D13; specs/web-ui "Navigation and
 * Information Architecture", "Responsive Navigation"; task 10.3, 10.4).
 *
 * A control group (rooms, unassigned, all devices) and an operator group
 * (automations, state, logs, HomeKit). The desktop sidebar shows both,
 * each collapsible. The mobile bottom bar shows only the control group's
 * fixed three slots — home, rooms, devices — so the phone's most-used
 * surface is never behind a disclosure; every operator view stays
 * reachable by URL, just not promoted into this bar (task 10.4).
 */
import { Badge, Group, NavLink, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconDatabase,
  IconDeviceUnknown,
  IconDoorEnter,
  IconFileText,
  IconHome,
  IconLayoutDashboard,
  IconListDetails,
  IconRobot,
} from "@tabler/icons-react";
import { useState } from "react";
import { useDataStore } from "../lib/data-store.js";
import {
  automationsPath,
  dashboardPath,
  devicesPath,
  homekitPath,
  logsPath,
  roomPath,
  roomsPath,
  statePath,
  unassignedDevicesPath,
} from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";

function isActive(pathname: string, target: string): boolean {
  return pathname === target;
}

export function DesktopSidebar() {
  const { rooms } = useDataStore();
  const { basePath, pathname } = useRouter();
  const [homeOpen, setHomeOpen] = useState(true);
  const [engineOpen, setEngineOpen] = useState(true);

  return (
    <ScrollArea h="100%">
      <Stack gap={4} p="xs">
        <GroupHeader label="Home" open={homeOpen} onToggle={() => setHomeOpen((o) => !o)} />
        {homeOpen && (
          <Stack gap={2}>
            <Link to={dashboardPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="Dashboard"
                leftSection={<IconLayoutDashboard size={16} />}
                active={isActive(pathname, dashboardPath(basePath))}
                component="div"
              />
            </Link>
            {rooms.map((room) => {
              const path = roomPath(basePath, room.id);
              const count = room.members.filter((m) => m.available).length;
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
                    active={isActive(pathname, path)}
                    component="div"
                  />
                </Link>
              );
            })}
            <Link to={unassignedDevicesPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="Unassigned"
                leftSection={<IconDeviceUnknown size={16} />}
                active={isActive(pathname, unassignedDevicesPath(basePath))}
                component="div"
              />
            </Link>
            <Link to={devicesPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="All devices"
                leftSection={<IconListDetails size={16} />}
                active={isActive(pathname, devicesPath(basePath))}
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
                active={isActive(pathname, automationsPath(basePath))}
                component="div"
              />
            </Link>
            <Link to={statePath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="State"
                leftSection={<IconDatabase size={16} />}
                active={isActive(pathname, statePath(basePath))}
                component="div"
              />
            </Link>
            <Link to={logsPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="Logs"
                leftSection={<IconFileText size={16} />}
                active={isActive(pathname, logsPath(basePath))}
                component="div"
              />
            </Link>
            <Link to={homekitPath(basePath)} style={{ textDecoration: "none" }}>
              <NavLink
                label="HomeKit"
                leftSection={<IconHome size={16} />}
                active={isActive(pathname, homekitPath(basePath))}
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

/**
 * Three fixed slots, control-group only — the phone is a control surface,
 * not a debugger (design.md D13). Operator views remain reachable by URL.
 */
export function MobileBottomBar() {
  const { basePath, pathname } = useRouter();

  const items = [
    { label: "Home", icon: <IconLayoutDashboard size={20} />, path: dashboardPath(basePath) },
    { label: "Rooms", icon: <IconDoorEnter size={20} />, path: roomsPath(basePath) },
    { label: "Devices", icon: <IconListDetails size={20} />, path: devicesPath(basePath) },
  ];

  return (
    <Group h="100%" grow gap={0}>
      {items.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          style={{
            textDecoration: "none",
            color: isActive(pathname, item.path)
              ? "var(--mantine-color-blue-6)"
              : "var(--mantine-color-dimmed)",
          }}
        >
          <Stack align="center" gap={2} py={6}>
            {item.icon}
            <Text size="xs">{item.label}</Text>
          </Stack>
        </Link>
      ))}
    </Group>
  );
}
