/**
 * Device detail — controls derived generically from the device's declared
 * capabilities, with the raw qualified identifier kept visible.
 */
import { Clock, Eye, EyeOff, TriangleAlert, Unplug, UsersRound, Wifi } from "lucide-react";
import { useState } from "react";
import { assignDeviceRoom, unassignDeviceRoom } from "../api.js";
import { CapabilityControl } from "../components/CapabilityControl.js";
import { flattenCapabilities } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";
import { formatAge, isObservationStale } from "../lib/format.js";
import { humanizeDeviceName } from "../lib/humanize-name.js";
import { deviceDetailPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import { useNow } from "../lib/use-now.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Row,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
} from "../ui/index.js";

/** The select value that unassigns the device from every room. */
const UNASSIGNED_VALUE = "__unassigned__";

/** "current_heating_setpoint" → "Current heating setpoint". */
function prettifyPropertyName(property: string): string {
  const spaced = property.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function DeviceDetailView({ qualifiedId }: { qualifiedId: string }) {
  const { devicesByQualifiedId, rooms, refresh, hideDevice, unhideDevice } = useDataStore();
  const { basePath } = useRouter();
  const now = useNow();
  const [roomError, setRoomError] = useState<string | null>(null);
  const device = devicesByQualifiedId.get(qualifiedId);

  if (!device) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} />}
        title="Device not found"
        description="This device is not currently known to any source."
      />
    );
  }

  const currentRoom = rooms.find((r) => r.members.some((m) => m.qualifiedId === qualifiedId));
  const flat = flattenCapabilities(device.capabilities);
  const stale = isObservationStale(
    device.observation.observedAt,
    device.observation.refreshIntervalMs,
    now,
  );
  const isGroup = device.source === "zigbee-group";

  async function handleRoomChange(value: string) {
    setRoomError(null);
    try {
      if (value === UNASSIGNED_VALUE) await unassignDeviceRoom(qualifiedId);
      else await assignDeviceRoom(qualifiedId, value);
      await refresh();
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : "Failed to change the device's room");
    }
  }

  return (
    <Stack gap={4}>
      <Row justify="between" align="start" gap={3} wrap>
        <Row gap={2} align="center" wrap={false} className="min-w-0">
          {isGroup && <UsersRound size={20} aria-hidden className="shrink-0 text-muted" />}
          <Stack gap={0} className="min-w-0">
            <h2 className="truncate font-display text-2xl font-bold text-ink">
              {humanizeDeviceName(device.displayName)}
            </h2>
            {/* The raw identifier stays visible so an operator can see the value
                that addresses the device. */}
            <code className="font-mono text-xs text-muted">{qualifiedId}</code>
          </Stack>
        </Row>

        <Row gap={2} align="center" wrap>
          <Badge tone="neutral">{isGroup ? "group" : device.source}</Badge>
          {device.hidden && (
            <Badge tone="neutral">
              <EyeOff size={12} aria-hidden />
              Hidden
            </Badge>
          )}
          {!device.reachable && (
            <Badge tone="danger">
              <Unplug size={12} aria-hidden />
              Unreachable
            </Badge>
          )}
          {device.observation.mode === "polled" && (
            <Badge tone={stale ? "stale" : "neutral"}>
              <Clock size={12} aria-hidden />
              polled · {formatAge(now - device.observation.observedAt)} ago
            </Badge>
          )}
          {device.observation.mode === "push" && (
            <Badge tone="on">
              <Wifi size={12} aria-hidden />
              live
            </Badge>
          )}
          <Button
            size="sm"
            variant="soft"
            onClick={() =>
              void (device.hidden ? unhideDevice(qualifiedId) : hideDevice(qualifiedId))
            }
          >
            {device.hidden ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
            {device.hidden ? "Unhide" : "Hide"}
          </Button>
        </Row>
      </Row>

      <Stack gap={1} className="max-w-xs">
        <span className="text-xs font-medium text-muted">Room</span>
        <Select
          value={currentRoom?.id ?? ""}
          onValueChange={(value) => void handleRoomChange(value)}
        >
          <SelectTrigger aria-label="Room">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
            {rooms.map((room) => (
              <SelectItem key={room.id} value={room.id}>
                {room.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {roomError && (
          <p role="alert" className="text-sm text-danger">
            {roomError}
          </p>
        )}
      </Stack>

      {isGroup && device.memberQualifiedIds && device.memberQualifiedIds.length > 0 && (
        <Stack gap={2}>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">Members</span>
          <p className="text-xs text-muted">
            Membership is managed in Zigbee2MQTT and read-only here.
          </p>
          <Row gap={2} wrap>
            {device.memberQualifiedIds.map((memberId) => {
              const member = devicesByQualifiedId.get(memberId);
              return (
                <Button key={memberId} size="sm" variant="soft" asChild>
                  <Link to={deviceDetailPath(basePath, memberId)}>
                    {member ? humanizeDeviceName(member.displayName) : memberId}
                    {member?.hidden ? " (hidden)" : ""}
                  </Link>
                </Button>
              );
            })}
          </Row>
        </Stack>
      )}

      <Stack gap={2}>
        {flat.length === 0 && (
          <p className="text-sm text-muted">This device declares no capabilities.</p>
        )}
        {flat.map((capability) => (
          <Card key={capability.property}>
            <Row justify="between" align="center" gap={3} wrap={false}>
              <span className="text-sm font-medium text-ink">
                {prettifyPropertyName(capability.property)}
              </span>
              <div className="min-w-[160px]">
                <CapabilityControl device={device} capability={capability} />
              </div>
            </Row>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
