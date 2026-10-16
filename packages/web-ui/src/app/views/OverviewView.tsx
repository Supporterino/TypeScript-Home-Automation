/**
 * The Overview landing view: live summary metrics, the user's favorites, and
 * each room as a navigable zone.
 */
import {
  Activity,
  Clock,
  DoorOpen,
  PlugZap,
  Power,
  Star,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { DeviceTile } from "../components/DeviceTile.js";
import { useDataStore } from "../lib/data-store.js";
import { OVERVIEW_ZONE_LIMIT, summarizeDevices } from "../lib/overview.js";
import { roomPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import { useNow } from "../lib/use-now.js";
import type { DeviceDescriptor } from "../types.js";
import { Badge, Card, EmptyState, Grid, Row, Stack, Stat } from "../ui/index.js";

/**
 * A quiet uppercase section label, optionally a link into the section.
 */
function SectionHeading({ icon, label, to }: { icon: ReactNode; label: ReactNode; to?: string }) {
  const heading = (
    <Row gap={1} align="center" wrap={false} className="text-muted">
      <span aria-hidden className="flex">
        {icon}
      </span>
      <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
    </Row>
  );

  if (to === undefined) return heading;

  return (
    <Link
      to={to}
      className="inline-flex rounded-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {heading}
    </Link>
  );
}

export function OverviewView() {
  const { status, devices, devicesByQualifiedId, rooms, favorites } = useDataStore();
  const { basePath } = useRouter();
  const now = useNow();

  // Hidden devices are filtered out here; the devices/room listings own the
  // reveal control.
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
  // About the home, not the presentation filter: an all-hidden home is not empty.
  const emptyHome = devices.length === 0;

  return (
    <Stack gap={6}>
      <Row justify="between" align="center" gap={3} wrap>
        <h2 className="font-display text-2xl font-bold text-ink">Overview</h2>
        <Badge tone={ready ? "on" : "danger"}>
          {ready ? <Power size={12} aria-hidden /> : <TriangleAlert size={12} aria-hidden />}
          {ready ? "Engine ready" : "Engine not ready"}
        </Badge>
      </Row>

      {emptyHome ? (
        <EmptyState
          icon={<PlugZap size={28} />}
          title="No devices yet"
          description="Devices appear here once a source (Zigbee, Shelly, Nanoleaf, or a state toggle) reports them."
        />
      ) : (
        <>
          <Grid columns={2} md={4} gap={3}>
            <Card>
              <Stat icon={<Power size={14} />} label="On" value={summary.on} tone="on" />
            </Card>
            <Card>
              <Stat
                icon={<Unplug size={14} />}
                label="Unreachable"
                value={summary.unreachable}
                tone="danger"
              />
            </Card>
            <Card>
              <Stat icon={<Clock size={14} />} label="Stale" value={summary.stale} tone="stale" />
            </Card>
            <Card>
              <Stat
                icon={<Activity size={14} />}
                label="Motion"
                value={summary.motion}
                tone="info"
              />
            </Card>
          </Grid>

          {favoriteDevices.length > 0 && (
            <Stack gap={3}>
              <SectionHeading icon={<Star size={14} className="text-stale" />} label="Favorites" />
              <Grid columns={2} md={3} lg={5} gap={3}>
                {favoriteDevices.map((device) => (
                  <DeviceTile key={device.qualifiedId} device={device} />
                ))}
              </Grid>
            </Stack>
          )}

          {roomZones.map(({ room, devices: zoneDevices }) => (
            <Stack key={room.id} gap={3}>
              <SectionHeading
                icon={<DoorOpen size={14} />}
                label={room.name}
                to={roomPath(basePath, room.id)}
              />
              <Grid columns={2} md={3} lg={5} gap={3}>
                {zoneDevices.slice(0, OVERVIEW_ZONE_LIMIT).map((device) => (
                  <DeviceTile key={device.qualifiedId} device={device} />
                ))}
              </Grid>
              {zoneDevices.length > OVERVIEW_ZONE_LIMIT && (
                <Link
                  to={roomPath(basePath, room.id)}
                  className="inline-flex w-fit rounded-input text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  View all {zoneDevices.length} devices
                </Link>
              )}
            </Stack>
          ))}
        </>
      )}
    </Stack>
  );
}
