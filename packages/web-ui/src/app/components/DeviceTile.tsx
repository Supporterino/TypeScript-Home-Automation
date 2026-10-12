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
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Slider,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
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
import {
  coverStopCommand,
  flattenCapabilities,
  rankDeviceTile,
} from "../lib/capability-ranking.js";
import {
  archetypeWholeCardActuation,
  type CardArchetype,
  cardArchetype,
  cardDrawsNoSurface,
  formatBrightnessPercent,
  writableBrightnessCapability,
} from "../lib/card-archetype.js";
import { useDataStore } from "../lib/data-store.js";
import {
  type DeviceTileObservationIcon,
  type DeviceTileObservationState,
  type DeviceTileOnOffIcon,
  type DeviceTileOnOffState,
  deviceTileOnOffFromCapabilityValue,
  deviceTileState,
  deviceTileToggledValue,
} from "../lib/device-tile-state.js";
import { humanizeDeviceName } from "../lib/humanize-name.js";
import { deviceDetailPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";
import { useNow } from "../lib/use-now.js";
import { useOptimisticDeviceProperty } from "../lib/use-optimistic-property.js";
import type { DeviceDescriptor } from "../types.js";
import {
  deviceTileObservationText,
  deviceTilePresentation,
  deviceTileText,
  type WallTileSize,
  wallTileMetrics,
} from "../wall/scale.js";
import { WALL_BODY_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "../wall/type-ramp.js";
import { CapabilityControl, formatReadoutValue } from "./CapabilityControl.js";
import { CoverTransport } from "./CoverTransport.js";

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
function OnOffChip({ state, textSize }: { state: DeviceTileOnOffState; textSize: string }) {
  return (
    <Group gap={4} wrap="nowrap" align="center">
      <StateGlyph icon={state.icon} size={15} token={state.token} />
      <Text size={textSize} fw={600} style={{ color: `var(${state.token})` }}>
        {state.label}
      </Text>
    </Group>
  );
}

/**
 * The observation state (design.md D5; specs/wall-display "Observation is a
 * quiet indicator"). The wall renders it as a non-textual indicator — glyph
 * shape + token still distinguish push, polled/stale, and unreachable without
 * color, and the state label is retained as the accessible name and tooltip
 * rather than text competing with the card's control. The dashboard keeps the
 * visible label (with the polled age) the unmodified web-ui capability requires.
 */
function ObservationIndicator({
  observation,
  size,
  textSize,
  showLabel,
}: {
  observation: DeviceTileObservationState;
  size: number;
  textSize: string;
  showLabel: boolean;
}) {
  const glyph = <StateGlyph icon={observation.icon} size={size} token={observation.token} />;
  return (
    <Group gap={3} wrap="nowrap">
      {showLabel ? (
        glyph
      ) : (
        <span
          role="img"
          aria-label={observation.label}
          title={observation.label}
          style={{ display: "flex", color: `var(${observation.token})` }}
        >
          {glyph}
        </span>
      )}
      {showLabel && (
        <Text
          size={textSize}
          style={{ color: `var(${observation.token})` }}
          truncate
          title={observation.label}
        >
          {observation.label}
        </Text>
      )}
    </Group>
  );
}

/**
 * The group-of-devices marker: a non-color users-group glyph with an
 * accessible name, shown on any card whose device is a Zigbee group. Extracted
 * so the header and the chrome-less wall readout carry the identical marker.
 */
function GroupMarker({ wall }: { wall: boolean }) {
  return (
    <Tooltip label="Group of devices">
      <span
        role="img"
        aria-label="Group of devices"
        style={{ display: "flex", color: "var(--text-muted)" }}
      >
        <IconUsersGroup size={wall ? 18 : 14} aria-hidden />
      </span>
    </Tooltip>
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
function FavoriteToggle({ device, wall }: { device: DeviceDescriptor; wall?: boolean }) {
  const { isFavorite, toggleFavorite } = useDataStore();
  const favorite = isFavorite(device.qualifiedId);
  const [error, setError] = useState<string | null>(null);
  const iconSize = wall ? 20 : 14;

  const button = (
    <ActionIcon
      variant="subtle"
      color={error ? "red" : favorite ? "yellow" : "gray"}
      size={wall ? 48 : "sm"}
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
      {favorite ? <IconStarFilled size={iconSize} /> : <IconStar size={iconSize} />}
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
function VisibilityToggle({ device, wall }: { device: DeviceDescriptor; wall?: boolean }) {
  const { hideDevice, unhideDevice } = useDataStore();
  const iconSize = wall ? 20 : 14;
  return (
    <ActionIcon
      variant="subtle"
      color="gray"
      size={wall ? 48 : "sm"}
      aria-label={device.hidden ? "Unhide device" : "Hide device"}
      onClick={() => {
        void (device.hidden ? unhideDevice(device.qualifiedId) : hideDevice(device.qualifiedId));
      }}
    >
      {device.hidden ? <IconEye size={iconSize} /> : <IconEyeOff size={iconSize} />}
    </ActionIcon>
  );
}

interface AvailableProps {
  device: DeviceDescriptor;
  /** Rendered in the tile's corner slot, e.g. a room's unassign control in edit mode (design.md D6, D7). */
  action?: ReactNode;
  /**
   * Size token. `"wall"` enlarges padding and interactive controls to the
   * wall's minimum touch target while preserving the default rendering
   * exactly (design.md D7; specs/wall-display "Touch Operation").
   */
  size?: WallTileSize;
  /**
   * When set, the tile draws no `Paper` of its own and inherits the
   * surrounding frame's surface, so a card is a single surface rather than a
   * tile nested inside one (design.md D2; specs/wall-display "A card is a
   * single surface"). Unset reproduces the tile's ordinary paper rendering.
   */
  contained?: boolean;
}

interface UnavailableProps {
  /** Marks this tile as an unavailable room member: no live descriptor exists for it. */
  unavailable: true;
  qualifiedId: string;
  action?: ReactNode;
  /** See {@link AvailableProps.size}. */
  size?: WallTileSize;
  /** See {@link AvailableProps.contained}. */
  contained?: boolean;
}

type Props = AvailableProps | UnavailableProps;

/**
 * The unavailable variant: qualified identifier and an unavailable marker,
 * with no control, no state readout, and no detail affordance — no live
 * descriptor exists to open, and its stale state is never presented as
 * current (design.md D6; specs/web-ui "Unavailable member is visible but
 * distinct"; task 9.3).
 */
function UnavailableTile({ qualifiedId, action, size, contained }: UnavailableProps) {
  const wall = size === "wall";
  const metrics = wall ? wallTileMetrics("wall") : null;
  const inner = (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
        <Text
          size={wall ? "md" : "sm"}
          c="dimmed"
          ff="monospace"
          truncate
          style={{ flex: 1, minWidth: 0 }}
        >
          {qualifiedId}
        </Text>
        {action && <ActionSlot action={action} />}
      </Group>
      <Group gap={4} wrap="nowrap" mt={6}>
        <IconPlugOff size={wall ? 16 : 13} color="var(--danger)" aria-hidden />
        <Badge color="gray" variant="light" size="sm">
          Unavailable
        </Badge>
      </Group>
    </>
  );

  if (contained) {
    return (
      <Box p={metrics?.padding ?? "sm"} opacity={0.6}>
        {inner}
      </Box>
    );
  }

  return (
    <Paper
      className="ambient-e1"
      withBorder
      p={metrics?.padding ?? "sm"}
      radius="lg"
      opacity={0.6}
      style={{ borderStyle: "dashed" }}
    >
      {inner}
    </Paper>
  );
}

export function DeviceTile(props: Props) {
  if ("unavailable" in props) {
    return <UnavailableTile {...props} />;
  }

  return <AvailableTile {...props} />;
}

function AvailableTile({ device, action, size, contained }: AvailableProps) {
  const { navigate, basePath } = useRouter();
  const now = useNow();
  const wall = size === "wall";
  const metrics = wall ? wallTileMetrics("wall") : null;
  const presentation = deviceTilePresentation(size);
  const tileText = deviceTileText(size);
  const showObservationLabel = deviceTileObservationText(size);
  const isGroup = device.source === "zigbee-group";
  // Presentation only: the humanised label is shown, while `device.qualifiedId`
  // remains the value that addresses and commands the device (design.md D8).
  const deviceLabel = humanizeDeviceName(device.displayName);
  const ranking = rankDeviceTile(device.capabilities);
  const flat = flattenCapabilities(device.capabilities);

  const actionCapability = ranking.action
    ? flat.find((c) => c.property === ranking.action?.capability.property)
    : undefined;
  const readoutCapability = ranking.readout
    ? flat.find((c) => c.property === ranking.readout?.capability.property)
    : undefined;

  // The card archetype is a wall presentation (design.md D1 Non-Goals: the
  // dashboard keeps the shared single template), so the dashboard stays
  // `default` and its rendering is unchanged.
  const archetype: CardArchetype = wall ? cardArchetype(ranking, device.capabilities) : "default";
  const brightnessCapability =
    archetype === "light" ? writableBrightnessCapability(device.capabilities) : undefined;
  // The stop command is progressive (design.md D6): a cover card shows Stop only
  // when the pure detector finds a writable transport property that can express
  // it. Computed only for the cover archetype, so no other card pays for it.
  const stopCommand = archetype === "cover" ? coverStopCommand(device.capabilities) : null;

  // A tile with no ranked action is read-only. On the dashboard the whole tile
  // then activates the detail view (specs/web-ui "A read-only tile still opens
  // detail"). On the wall a read-only device is a readout with no navigation
  // (specs/wall-display "A sensor is read-only"). A tile with a control opens
  // detail only through its explicit affordance, so the embedded control is
  // never mistaken for it (task 9.1).
  const readOnly = !actionCapability;
  const wholeCardToggle =
    presentation.wholeCardActuation &&
    actionCapability !== undefined &&
    ranking.action?.kind === "on_off" &&
    archetypeWholeCardActuation(archetype);
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
  // The light card's brightness is a second, independent optimistic channel
  // (design.md D3). The hook is called unconditionally — with no property when
  // the device is not a light — so hook order is stable across renders.
  const brightnessControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    brightnessCapability?.property ?? "",
    brightnessCapability ? device.state[brightnessCapability.property] : undefined,
    device.observation,
  );
  // The cover's Stop is a third independent optimistic channel, on its detected
  // transport property (design.md D6). Called unconditionally with an absent
  // property when the device is not a stop-capable cover, so hook order is
  // stable across renders; Open/Close reuse the primary `actionControl` above.
  const stopControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    stopCommand?.property ?? "",
    stopCommand ? device.state[stopCommand.property] : undefined,
    device.observation,
  );
  const onOff =
    actionCapability && ranking.action?.kind === "on_off"
      ? deviceTileOnOffFromCapabilityValue(actionCapability, actionControl.value)
      : state.onOff;

  const lightCard = archetype === "light" && brightnessCapability !== undefined;
  // A readout card is deliberately chrome-less on the wall (design.md D4); a
  // contained tile inherits the surrounding frame's surface (design.md D2).
  // Either way the tile draws no `Paper` of its own, so a card is one surface.
  const surfaceLess = cardDrawsNoSurface(archetype, wall, contained === true);

  function openDetail() {
    navigate(deviceDetailPath(basePath, device.qualifiedId));
  }

  // The whole-card action: on the wall an operable on/off device toggles from a
  // tap anywhere outside its embedded control, which stopPropagation keeps from
  // double-firing; on the dashboard a read-only tile opens detail. The tap
  // target is the only presentation difference — the command still flows
  // through the same optimistic hook the embedded control uses.
  function togglePrimary() {
    if (!actionCapability) return;
    actionControl.setValue(deviceTileToggledValue(actionCapability, actionControl.value));
  }

  const cardAction = wholeCardToggle
    ? togglePrimary
    : presentation.readOnlyNavigation && readOnly
      ? openDetail
      : null;

  // Accessibility: the wall whole-card toggle is a pointer-only redundant
  // affordance. Its embedded control is a focusable Mantine Switch carrying the
  // correct role and state, so it is the single accessible activation — the
  // card must not also take role="button"/a tab stop, which ARIA forbids around
  // an interactive descendant. The dashboard read-only card keeps its
  // role="button" because it contains no interactive descendant.
  const cardKeyboardAction = wholeCardToggle ? null : cardAction;

  const observation = (
    <ObservationIndicator
      observation={state.observation}
      size={wall ? 16 : 11}
      textSize={tileText.chip}
      showLabel={showObservationLabel}
    />
  );

  const header = (
    <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
      <Group gap={4} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
        {isGroup && <GroupMarker wall={wall} />}
        <Text size={wall ? "md" : "sm"} fw={600} truncate title={deviceLabel}>
          {deviceLabel}
        </Text>
      </Group>
      {(action != null || presentation.favorite || presentation.visibility) && (
        <ActionSlot
          action={
            <>
              {action}
              {presentation.favorite && <FavoriteToggle device={device} wall={wall} />}
              {presentation.visibility && <VisibilityToggle device={device} wall={wall} />}
            </>
          }
        />
      )}
    </Group>
  );

  const controlWrapperStyle = { flex: 1, minWidth: 0, minHeight: metrics?.control };
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  // The light archetype renders two independent controls — an on/off toggle and
  // a brightness slider with a persistent `%` readout (design.md D3; specs/wall-
  // display "A light card presents both a toggle and a value control").
  let controls: ReactNode;
  if (lightCard && actionCapability && brightnessCapability) {
    controls = (
      <>
        <Group gap="xs" wrap="nowrap" align="center">
          <div style={controlWrapperStyle} onClick={stop} onKeyDown={stop}>
            <CapabilityControl
              device={device}
              capability={actionCapability}
              compact
              size={metrics?.controlSize}
              value={actionControl.value}
              onChange={actionControl.setValue}
              error={actionControl.error}
            />
          </div>
          {onOff && <OnOffChip state={onOff} textSize={tileText.chip} />}
        </Group>
        <Group gap="xs" wrap="nowrap" align="center">
          <div style={controlWrapperStyle} onClick={stop} onKeyDown={stop}>
            <Slider
              size={metrics?.controlSize}
              min={brightnessCapability.range?.min ?? 0}
              max={brightnessCapability.range?.max ?? 100}
              step={brightnessCapability.step ?? 1}
              value={
                typeof brightnessControl.value === "number"
                  ? brightnessControl.value
                  : (brightnessCapability.range?.min ?? 0)
              }
              disabled={!device.reachable}
              label={(value) => formatBrightnessPercent(value, brightnessCapability.range)}
              onChange={(value) => brightnessControl.setValue(value)}
              aria-label={brightnessCapability.property}
            />
          </div>
          <Text size={tileText.body} fw={600} style={{ minWidth: 44, textAlign: "right" }}>
            {formatBrightnessPercent(brightnessControl.value, brightnessCapability.range)}
          </Text>
        </Group>
      </>
    );
  } else if (archetype === "cover" && actionCapability) {
    // A cover's primary action is a position, but the wall presents discrete,
    // touch-sized transport instead of the generic slider (design.md D6;
    // specs/wall-display "Cover Transport Controls"). Open/Close reuse the
    // primary `actionControl` hook above, so reflection/reconciliation/revert is
    // identical to the generic path; Stop is a separate optimistic channel.
    controls = (
      <CoverTransport
        device={device}
        position={actionCapability}
        value={actionControl.value}
        onChange={actionControl.setValue}
        error={actionControl.error}
        stop={stopCommand}
        onStop={stopControl.setValue}
        stopError={stopControl.error}
        control={metrics?.control ?? 32}
        readoutSize={tileText.body}
      />
    );
  } else if (actionCapability) {
    controls = (
      <Group gap="xs" wrap="nowrap" align="center">
        <div style={controlWrapperStyle} onClick={stop} onKeyDown={stop}>
          <CapabilityControl
            device={device}
            capability={actionCapability}
            compact
            size={metrics?.controlSize}
            value={actionControl.value}
            onChange={actionControl.setValue}
            error={actionControl.error}
          />
        </div>
        {onOff && <OnOffChip state={onOff} textSize={tileText.chip} />}
      </Group>
    );
  } else if (readoutCapability) {
    controls = (
      <Text size="xl" fw={700} style={{ fontFamily: "var(--font-display)" }}>
        {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
      </Text>
    );
  } else {
    controls = (
      <Text size={tileText.body} c="dimmed">
        No controls
      </Text>
    );
  }

  const readoutLine =
    actionCapability && readoutCapability && !lightCard && archetype !== "cover" ? (
      <Text size={tileText.body} c="dimmed">
        {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
      </Text>
    ) : null;

  const footer = (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
        {device.hidden && (
          <Badge size="xs" color="gray" variant="outline">
            Hidden
          </Badge>
        )}
        {observation}
      </Group>

      {presentation.detail && (
        <Button
          variant="subtle"
          size={wall ? "md" : "compact-xs"}
          rightSection={<IconChevronRight size={wall ? 18 : 12} />}
          aria-label={`Open ${deviceLabel} details`}
          onClick={(e) => {
            e.stopPropagation();
            openDetail();
          }}
        >
          Details
        </Button>
      )}
    </Group>
  );

  // A wall readout card is a chrome-less dominant value with a quiet label
  // (design.md D4; specs/wall-display "A readout card MUST present its value as
  // the card's dominant content without a control surface"). It carries the
  // group marker and the Hidden badge for parity with the other archetypes, and
  // keeps only the non-textual observation indicator — never a control or
  // navigation affordance.
  const inner =
    wall && archetype === "readout" ? (
      <Stack gap={wall ? "sm" : 6}>
        {readoutCapability ? (
          <Text
            fz={WALL_METRIC_FONT_SIZE}
            fw={700}
            style={{ fontFamily: "var(--font-display)" }}
            c={device.reachable ? undefined : "dimmed"}
          >
            {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
          </Text>
        ) : (
          <Text fz={WALL_BODY_FONT_SIZE} c="dimmed">
            No reading
          </Text>
        )}
        <Group justify="space-between" wrap="nowrap" gap="xs" align="center">
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            {isGroup && <GroupMarker wall={wall} />}
            <Text
              fz={WALL_BODY_FONT_SIZE}
              c="dimmed"
              truncate
              title={deviceLabel}
              style={{ minWidth: 0 }}
            >
              {deviceLabel}
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap" align="center">
            {device.hidden && (
              <Badge size="xs" color="gray" variant="outline">
                Hidden
              </Badge>
            )}
            {observation}
          </Group>
        </Group>
      </Stack>
    ) : (
      <Stack gap={wall ? "sm" : 6}>
        {header}
        {controls}
        {readoutLine}
        {footer}
      </Stack>
    );

  if (surfaceLess) {
    return (
      <Box
        p={metrics?.padding ?? "sm"}
        opacity={device.hidden ? 0.7 : 1}
        style={{ cursor: cardAction ? "pointer" : "default", position: "relative" }}
        onClick={cardAction ?? undefined}
        role={cardKeyboardAction ? "button" : undefined}
        tabIndex={cardKeyboardAction ? 0 : undefined}
        onKeyDown={
          cardKeyboardAction
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") cardKeyboardAction();
              }
            : undefined
        }
      >
        {inner}
      </Box>
    );
  }

  return (
    <Paper
      className="ambient-e1"
      withBorder
      p={metrics?.padding ?? "sm"}
      radius="lg"
      opacity={device.hidden ? 0.7 : 1}
      style={{
        cursor: cardAction ? "pointer" : "default",
        position: "relative",
        borderStyle: device.hidden ? "dashed" : undefined,
      }}
      onClick={cardAction ?? undefined}
      role={cardKeyboardAction ? "button" : undefined}
      tabIndex={cardKeyboardAction ? 0 : undefined}
      onKeyDown={
        cardKeyboardAction
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") cardKeyboardAction();
            }
          : undefined
      }
    >
      {inner}
    </Paper>
  );
}
