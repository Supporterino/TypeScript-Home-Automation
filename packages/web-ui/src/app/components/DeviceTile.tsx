/**
 * A device tile: one dominant primary action or readout, selected by the
 * curated capability ranking (design.md D12, D16; task 10.6), plus an
 * explicit affordance that opens the device's detail view. Degrades to a
 * read-only tile — fully activatable as a whole — when nothing ranks
 * (design.md "An unrankable device degrades gracefully").
 *
 * State is never color-only (MASTER "State Encoding Rule"; task 9.2): every
 * on/off and reachability condition carries a distinct icon shape and label
 * alongside its token, produced by the pure {@link deviceTileState} helper.
 *
 * Also takes an optional action slot and an optional unavailable mode
 * (design.md D6) — a room places its unassign control in the slot, and
 * renders an unavailable member through the unavailable variant, so every
 * device collection shares one tile shape rather than a room inventing a
 * second one.
 */
import { ActionIcon, Badge, Button, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import {
  IconChevronRight,
  IconClock,
  IconEye,
  IconEyeOff,
  IconPlugOff,
  IconPower,
  IconStar,
  IconStarFilled,
  IconUsersGroup,
  IconWifi,
  IconWifiOff,
} from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { flattenCapabilities, rankDeviceTile } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";
import {
  type DeviceTileObservationIcon,
  type DeviceTileOnOffIcon,
  type DeviceTileOnOffState,
  deviceTileOnOffFromCapabilityValue,
  deviceTileState,
} from "../lib/device-tile-state.js";
import { deviceDetailPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";
import { useNow } from "../lib/use-now.js";
import { useOptimisticDeviceProperty } from "../lib/use-optimistic-property.js";
import type { DeviceDescriptor } from "../types.js";
import { CapabilityControl, formatReadoutValue } from "./CapabilityControl.js";

/**
 * Renders a state glyph from the symbolic icon name the pure state helper
 * produces, colored by a design token rather than a literal hex (task 9.2).
 * The on/off pair differs in fill as well as color, so it is distinguishable
 * with color removed.
 */
function StateGlyph({
  icon,
  size,
  token,
}: {
  icon: DeviceTileOnOffIcon | DeviceTileObservationIcon;
  size: number;
  token: string;
}) {
  const color = `var(${token})`;
  switch (icon) {
    case "power-filled":
      return <IconPower size={size} color={color} fill={color} aria-hidden />;
    case "power-outline":
      return <IconPower size={size} color={color} aria-hidden />;
    case "plug-off":
      return <IconPlugOff size={size} color={color} aria-hidden />;
    case "wifi":
      return <IconWifi size={size} color={color} aria-hidden />;
    case "wifi-off":
      return <IconWifiOff size={size} color={color} aria-hidden />;
    case "clock":
      return <IconClock size={size} color={color} aria-hidden />;
  }
}

/** The on/off label + filled/outline power glyph — the non-color on/off channel (task 9.2). */
function OnOffChip({ state }: { state: DeviceTileOnOffState }) {
  return (
    <Group gap={4} wrap="nowrap" align="center">
      <StateGlyph icon={state.icon} size={15} token={state.token} />
      <Text size="xs" fw={600} style={{ color: `var(${state.token})` }}>
        {state.label}
      </Text>
    </Group>
  );
}

/**
 * The tile's corner action slot: favorite, visibility, and any caller-supplied
 * action. In normal flow at the end of the header row rather than absolutely
 * positioned, so it never overlays the name and a long name truncates before
 * reaching it (MASTER "never over the name"; task 9.4).
 */
function ActionSlot({ action }: { action: ReactNode }) {
  return (
    <Group
      gap={2}
      wrap="nowrap"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {action}
    </Group>
  );
}

/**
 * A favorite star toggle, never requiring the caller to know a device's
 * qualified identifier (specs/web-ui "Favorites"; task 9.4). Uses the store's
 * optimistic write and stream reconciliation, so a change is reflected across
 * clients.
 */
function FavoriteToggle({ device }: { device: DeviceDescriptor }) {
  const { isFavorite, toggleFavorite } = useDataStore();
  const favorite = isFavorite(device.qualifiedId);
  const [error, setError] = useState<string | null>(null);

  const button = (
    <ActionIcon
      variant="subtle"
      color={error ? "red" : favorite ? "yellow" : "gray"}
      size="sm"
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorite}
      onClick={async () => {
        setError(null);
        try {
          await toggleFavorite(device.qualifiedId);
        } catch {
          setError("Could not update favorites");
        }
      }}
    >
      {favorite ? <IconStarFilled size={14} /> : <IconStar size={14} />}
    </ActionIcon>
  );

  return error ? (
    <Tooltip label={error} color="red" withArrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
}

/**
 * A hide/unhide toggle, never requiring the caller to know a device's
 * qualified identifier — it reads it off the descriptor itself (specs/web-ui
 * "Hiding And Unhiding From The Interface"). Composed alongside any
 * caller-supplied `action` in the tile's corner slot, so a room's own
 * unassign control and this toggle can coexist.
 */
function VisibilityToggle({ device }: { device: DeviceDescriptor }) {
  const { hideDevice, unhideDevice } = useDataStore();
  return (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="sm"
      aria-label={device.hidden ? "Unhide device" : "Hide device"}
      onClick={() => {
        void (device.hidden ? unhideDevice(device.qualifiedId) : hideDevice(device.qualifiedId));
      }}
    >
      {device.hidden ? <IconEye size={14} /> : <IconEyeOff size={14} />}
    </ActionIcon>
  );
}

interface AvailableProps {
  device: DeviceDescriptor;
  /** Rendered in the tile's corner slot, e.g. a room's unassign control in edit mode (design.md D6, D7). */
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
 * with no control, no state readout, and no detail affordance — no live
 * descriptor exists to open, and its stale state is never presented as
 * current (design.md D6; specs/web-ui "Unavailable member is visible but
 * distinct"; task 9.3).
 */
function UnavailableTile({ qualifiedId, action }: UnavailableProps) {
  return (
    <Paper
      className="ambient-e1"
      withBorder
      p="sm"
      radius="lg"
      opacity={0.6}
      style={{ borderStyle: "dashed" }}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
        <Text size="sm" c="dimmed" ff="monospace" truncate style={{ flex: 1, minWidth: 0 }}>
          {qualifiedId}
        </Text>
        {action && <ActionSlot action={action} />}
      </Group>
      <Group gap={4} wrap="nowrap" mt={6}>
        <IconPlugOff size={13} color="var(--danger)" aria-hidden />
        <Badge color="gray" variant="light" size="sm">
          Unavailable
        </Badge>
      </Group>
    </Paper>
  );
}

export function DeviceTile(props: Props) {
  if ("unavailable" in props) {
    return <UnavailableTile {...props} />;
  }

  return <AvailableTile {...props} />;
}

function AvailableTile({ device, action }: AvailableProps) {
  const { navigate, basePath } = useRouter();
  const now = useNow();
  const isGroup = device.source === "zigbee-group";
  const ranking = rankDeviceTile(device.capabilities);
  const flat = flattenCapabilities(device.capabilities);

  const actionCapability = ranking.action
    ? flat.find((c) => c.property === ranking.action?.capability.property)
    : undefined;
  const readoutCapability = ranking.readout
    ? flat.find((c) => c.property === ranking.readout?.capability.property)
    : undefined;

  // A tile with no ranked action is read-only: the whole tile activates the
  // detail view (specs/web-ui "A read-only tile still opens detail"). A tile
  // with a control opens detail only through its explicit affordance, so the
  // embedded control is never mistaken for it (task 9.1).
  const readOnly = !actionCapability;
  const state = deviceTileState(device, now);

  // One optimistic resolution for the tile's primary action, shared by the
  // embedded control and the on/off chip. The chip and control must agree
  // while a command is in flight; deriving the chip from confirmed state alone
  // would let them contradict until the round trip (design.md D12; specs/web-ui
  // "Device Tile Presentation"). The hook resolves a store-level override
  // (room command) ahead of this component's local override, so the tile still
  // reflects room-wide commands.
  const actionControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    actionCapability?.property ?? "",
    actionCapability ? device.state[actionCapability.property] : undefined,
    device.observation,
  );
  const onOff =
    actionCapability && ranking.action?.kind === "on_off"
      ? deviceTileOnOffFromCapabilityValue(actionCapability, actionControl.value)
      : state.onOff;

  function openDetail() {
    navigate(deviceDetailPath(basePath, device.qualifiedId));
  }

  return (
    <Paper
      className="ambient-e1"
      withBorder
      p="sm"
      radius="lg"
      opacity={device.hidden ? 0.7 : 1}
      style={{
        cursor: readOnly ? "pointer" : "default",
        position: "relative",
        borderStyle: device.hidden ? "dashed" : undefined,
      }}
      onClick={readOnly ? openDetail : undefined}
      role={readOnly ? "button" : undefined}
      tabIndex={readOnly ? 0 : undefined}
      onKeyDown={
        readOnly
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") openDetail();
            }
          : undefined
      }
    >
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            {isGroup && (
              <Tooltip label="Group of devices">
                <span
                  role="img"
                  aria-label="Group of devices"
                  style={{ display: "flex", color: "var(--text-muted)" }}
                >
                  <IconUsersGroup size={14} aria-hidden />
                </span>
              </Tooltip>
            )}
            <Text size="sm" fw={600} truncate title={device.displayName}>
              {device.displayName}
            </Text>
          </Group>
          <ActionSlot
            action={
              <>
                {action}
                <FavoriteToggle device={device} />
                <VisibilityToggle device={device} />
              </>
            }
          />
        </Group>

        {actionCapability ? (
          <Group gap="xs" wrap="nowrap" align="center">
            <div
              style={{ flex: 1, minWidth: 0 }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <CapabilityControl
                device={device}
                capability={actionCapability}
                compact
                value={actionControl.value}
                onChange={actionControl.setValue}
                error={actionControl.error}
              />
            </div>
            {onOff && <OnOffChip state={onOff} />}
          </Group>
        ) : readoutCapability ? (
          <Text size="xl" fw={700} style={{ fontFamily: "var(--font-display)" }}>
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

        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
            {device.hidden && (
              <Badge size="xs" color="gray" variant="outline">
                Hidden
              </Badge>
            )}
            <Group gap={3} wrap="nowrap">
              <StateGlyph icon={state.observation.icon} size={11} token={state.observation.token} />
              <Text
                size="xs"
                style={{ color: `var(${state.observation.token})` }}
                truncate
                title={state.observation.label}
              >
                {state.observation.label}
              </Text>
            </Group>
          </Group>

          <Button
            variant="subtle"
            size="compact-xs"
            rightSection={<IconChevronRight size={12} />}
            aria-label={`Open ${device.displayName} details`}
            onClick={(e) => {
              e.stopPropagation();
              openDetail();
            }}
          >
            Details
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
