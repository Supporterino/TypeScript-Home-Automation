/**
 * The Overview landing view (design.md D4; specs/web-ui "Overview Landing";
 * task 8.4). A control surface that summarizes the home before listing it:
 * live summary metrics, the user's favorites, and each room as a navigable
 * zone. Every value is derived from the store, so a streamed device event
 * updates the surface without a manual refresh.
 *
 * Hidden devices are shown per the existing default (filtered out) but the
 * overview deliberately offers no filter controls — those belong to the
 * device/room listings, not the consumer surface (MASTER anti-pattern).
 */
import { Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import {
  IconActivity,
  IconAlertTriangle,
  IconClock,
  IconDoorEnter,
  IconPlugOff,
  IconPower,
  IconStar,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { DeviceTile } from "../components/DeviceTile.js";
import { useDataStore } from "../lib/data-store.js";
import { OVERVIEW_ZONE_LIMIT, summarizeDevices } from "../lib/overview.js";
import { roomPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import { useNow } from "../lib/use-now.js";
import type { DeviceDescriptor } from "../types.js";

/** One at-a-glance metric: color is never the only channel — icon and label carry it too. */
function MetricCard({
  icon,
  label,
  value,
  colorVar,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  colorVar: string;
}) {
  return (
    <Paper withBorder p="sm">
      <Group gap={6} wrap="nowrap">
        <span style={{ color: `var(${colorVar})`, display: "flex" }}>{icon}</span>
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          {label}
        </Text>
      </Group>
      <Text size="xl" fw={700} style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </Text>
    </Paper>
  );
}

export function OverviewView() {
  const { status, devices, devicesByQualifiedId, rooms, favorites } = useDataStore();
  const { basePath } = useRouter();
  const now = useNow();

  // Overview presentation filters hidden devices out (the devices/room
  // listings own the reveal control), so metrics and zones agree with what
  // is actually shown.
  const visibleDevices = useMemo(() => devices.filter((d) => !d.hidden), [devices]);
  const summary = useMemo(() => summarizeDevices(visibleDevices, now), [visibleDevices, now]);

  const favoriteDevices = useMemo(
    () =>
      favorites
        .map((qualifiedId) => devicesByQualifiedId.get(qualifiedId))
        .filter((device): device is DeviceDescriptor => device !== undefined && !device.hidden),
    [favorites, devicesByQualifiedId],
  );

  const roomZones = useMemo(
    () =>
      rooms
        .map((room) => ({
          room,
          devices: room.members
            .map((member) => (member.available ? member.device : null))
            .filter((device): device is DeviceDescriptor => device !== null && !device.hidden),
        }))
        .filter(({ devices: zoneDevices }) => zoneDevices.length > 0),
    [rooms],
  );

  const ready = status?.status === "ready";
  // "No devices known" is about the home, not the presentation filter: an
  // all-hidden home must not read as an empty one.
  const emptyHome = devices.length === 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Overview</Title>
        <Badge
          color={ready ? "green" : "red"}
          variant="light"
          size="sm"
          leftSection={ready ? <IconPower size={12} /> : <IconAlertTriangle size={12} />}
        >
          {ready ? "Engine ready" : "Engine not ready"}
        </Badge>
      </Group>

      {emptyHome ? (
        <Text c="dimmed" size="sm">
          No devices yet. Devices appear here once a source (Zigbee, Shelly, Nanoleaf, or a state
          toggle) reports them.
        </Text>
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <MetricCard
              icon={<IconPower size={16} />}
              label="On"
              value={summary.on}
              colorVar="--on"
            />
            <MetricCard
              icon={<IconPlugOff size={16} />}
              label="Unreachable"
              value={summary.unreachable}
              colorVar="--danger"
            />
            <MetricCard
              icon={<IconClock size={16} />}
              label="Stale"
              value={summary.stale}
              colorVar="--stale"
            />
            <MetricCard
              icon={<IconActivity size={16} />}
              label="Motion"
              value={summary.motion}
              colorVar="--info"
            />
          </SimpleGrid>

          {favoriteDevices.length > 0 && (
            <Stack gap="xs">
              <Group gap={6}>
                <IconStar size={14} />
                <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                  Favorites
                </Text>
              </Group>
              <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
                {favoriteDevices.map((device) => (
                  <DeviceTile key={device.qualifiedId} device={device} />
                ))}
              </SimpleGrid>
            </Stack>
          )}

          {roomZones.map(({ room, devices: zoneDevices }) => (
            <Stack key={room.id} gap="xs">
              <Link
                to={roomPath(basePath, room.id)}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Group gap={6}>
                  <IconDoorEnter size={14} />
                  <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                    {room.name}
                  </Text>
                </Group>
              </Link>
              <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
                {zoneDevices.slice(0, OVERVIEW_ZONE_LIMIT).map((device) => (
                  <DeviceTile key={device.qualifiedId} device={device} />
                ))}
              </SimpleGrid>
              {zoneDevices.length > OVERVIEW_ZONE_LIMIT && (
                <Link to={roomPath(basePath, room.id)}>
                  <Text size="xs">View all {zoneDevices.length} devices</Text>
                </Link>
              )}
            </Stack>
          ))}
        </>
      )}
    </Stack>
  );
}
