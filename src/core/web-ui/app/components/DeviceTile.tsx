/**
 * A device tile: at most one primary action and one primary readout,
 * selected by the curated capability ranking (design.md D12, D16; task
 * 10.6). Degrades to a read-only tile opening the detail view when nothing
 * ranks (design.md "An unrankable device degrades gracefully").
 *
 * Also takes an optional action slot and an optional unavailable mode
 * (design.md D6) — a room places its unassign control in the slot, and
 * renders an unavailable member through the unavailable variant, so every
 * device collection shares one tile shape rather than a room inventing a
 * second one.
 */
import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconPlugOff, IconWifi, IconWifiOff } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { flattenCapabilities, rankDeviceTile } from "../lib/capability-ranking.js";
import { formatAge, isObservationStale } from "../lib/format.js";
import { deviceDetailPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";
import { useNow } from "../lib/use-now.js";
import type { DeviceDescriptor } from "../types.js";
import { CapabilityControl, formatReadoutValue } from "./CapabilityControl.js";

/** Renders `action` in a corner, stopping propagation so it never triggers the tile's own click target. */
function ActionSlot({ action }: { action: ReactNode }) {
  return (
    <div
      style={{ position: "absolute", top: 6, right: 6 }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {action}
    </div>
  );
}

interface AvailableProps {
  device: DeviceDescriptor;
  /** Rendered in a corner of the tile, e.g. a room's unassign control in edit mode (design.md D6, D7). */
  action?: ReactNode;
}

interface UnavailableProps {
  /** Marks this tile as an unavailable room member: no live descriptor exists for it. */
  unavailable: true;
  qualifiedId: string;
  action?: ReactNode;
}

type Props = AvailableProps | UnavailableProps;

/**
 * The unavailable variant: qualified identifier and an unavailable marker,
 * with no control and no state readout — its stale state is never presented
 * as current (design.md D6; specs/web-ui "Unavailable member is visible but
 * distinct").
 */
function UnavailableTile({ qualifiedId, action }: UnavailableProps) {
  return (
    <Paper withBorder p="sm" radius="md" opacity={0.6} style={{ position: "relative" }}>
      <Stack gap={6}>
        <Text size="sm" c="dimmed" ff="monospace" truncate>
          {qualifiedId}
        </Text>
        <Badge color="gray" variant="light" size="sm" style={{ alignSelf: "flex-start" }}>
          Unavailable
        </Badge>
      </Stack>
      {action && <ActionSlot action={action} />}
    </Paper>
  );
}

export function DeviceTile(props: Props) {
  const { navigate, basePath } = useRouter();
  const now = useNow();

  if ("unavailable" in props) {
    return <UnavailableTile {...props} />;
  }

  const { device, action } = props;
  const ranking = rankDeviceTile(device.capabilities);
  const flat = flattenCapabilities(device.capabilities);

  const actionCapability = ranking.action
    ? flat.find((c) => c.property === ranking.action?.capability.property)
    : undefined;
  const readoutCapability = ranking.readout
    ? flat.find((c) => c.property === ranking.readout?.capability.property)
    : undefined;

  const stale = isObservationStale(
    device.observation.observedAt,
    device.observation.refreshIntervalMs,
    now,
  );

  function openDetail() {
    navigate(deviceDetailPath(basePath, device.qualifiedId));
  }

  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{ cursor: "pointer", position: "relative" }}
      onClick={openDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") openDetail();
      }}
    >
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600} truncate>
            {device.displayName}
          </Text>
          {!device.reachable && <IconPlugOff size={14} color="var(--mantine-color-red-6)" />}
        </Group>

        {actionCapability ? (
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <CapabilityControl device={device} capability={actionCapability} compact />
          </div>
        ) : readoutCapability ? (
          <Text size="lg" fw={700}>
            {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            No controls
          </Text>
        )}

        {actionCapability && readoutCapability && (
          <Text size="sm" c="dimmed">
            {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
          </Text>
        )}

        <Group gap={4} wrap="nowrap">
          {!device.reachable ? (
            <Badge size="xs" color="red" variant="light">
              Unreachable
            </Badge>
          ) : device.observation.mode === "push" ? (
            <Group gap={2} wrap="nowrap">
              <IconWifi size={11} color="var(--mantine-color-green-6)" />
              <Text size="xs" c="dimmed">
                live
              </Text>
            </Group>
          ) : (
            <Group gap={2} wrap="nowrap">
              <IconWifiOff
                size={11}
                color={stale ? "var(--mantine-color-yellow-6)" : "var(--mantine-color-dimmed)"}
              />
              <Text size="xs" c={stale ? "yellow" : "dimmed"}>
                polled · {formatAge(now - device.observation.observedAt)}
              </Text>
            </Group>
          )}
        </Group>
      </Stack>

      {action && <ActionSlot action={action} />}
    </Paper>
  );
}
