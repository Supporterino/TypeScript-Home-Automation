/**
 * A device tile: one dominant primary action or readout, selected by the
 * curated capability ranking (design.md D5, D12; specs/web-ui "Device Tile
 * Presentation"), plus an explicit affordance that opens the device's detail
 * view. Degrades to a read-only tile — fully activatable as a whole — when
 * nothing ranks.
 *
 * State is never colour-only (design.md D9): every on/off and reachability
 * condition carries a distinct icon shape and label alongside its token,
 * produced by the pure {@link deviceTileState} helper.
 *
 * Also takes an optional action slot and an optional unavailable mode — a room
 * places its unassign control in the slot, and renders an unavailable member
 * through the unavailable variant, so every device collection shares one tile
 * shape rather than a room inventing a second one.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react` (task 4.1);
 * the pure helpers it consumes (`card-archetype`, `device-tile-state`,
 * `capability-ranking`, `humanize-name`, `wall/scale`) are unchanged, and its
 * props and behaviour contracts are preserved.
 */
import {
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Power,
  Star,
  Unplug,
  UsersRound,
  Wifi,
  WifiOff,
} from "lucide-react";
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
import { Badge, Button, Card, cn, IconButton, Row, Slider, Stack, Tooltip } from "../ui/index.js";
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
 * Maps a pure size token to a CSS font size against the Lumen type scale
 * (design.md D3). The wall's token is already a `clamp(...)` expression and is
 * passed through unchanged.
 */
function tileFontSize(token: string): string {
  switch (token) {
    case "xs":
      return "var(--text-xs)";
    case "sm":
      return "var(--text-sm)";
    case "md":
      return "var(--text-base)";
    case "lg":
      return "var(--text-lg)";
    default:
      return token;
  }
}

/**
 * Renders a state glyph from the symbolic icon name the pure state helper
 * produces, coloured by a design token rather than a literal hex (design.md
 * D9). The on/off pair differs in fill as well as colour, so it is
 * distinguishable with colour removed.
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
  const style = { color: `var(${token})` };
  switch (icon) {
    case "power-filled":
      return <Power size={size} fill="currentColor" style={style} aria-hidden />;
    case "power-outline":
      return <Power size={size} style={style} aria-hidden />;
    case "plug-off":
      return <Unplug size={size} style={style} aria-hidden />;
    case "wifi":
      return <Wifi size={size} style={style} aria-hidden />;
    case "wifi-off":
      return <WifiOff size={size} style={style} aria-hidden />;
    case "clock":
      return <Clock size={size} style={style} aria-hidden />;
  }
}

/** The on/off label + filled/outline power glyph — the non-colour on/off channel (design.md D9). */
function OnOffChip({ state, fontSize }: { state: DeviceTileOnOffState; fontSize: string }) {
  return (
    <Row gap={1} align="center" wrap={false}>
      <StateGlyph icon={state.icon} size={15} token={state.token} />
      <span className="font-semibold" style={{ fontSize, color: `var(${state.token})` }}>
        {state.label}
      </span>
    </Row>
  );
}

/**
 * The observation state (design.md D5, D9; specs/wall-display "Observation is a
 * quiet indicator"). The wall renders it as a non-textual indicator — glyph
 * shape + token still distinguish push, polled/stale, and unreachable without
 * colour, and the state label is retained as the accessible name and tooltip
 * rather than text competing with the card's control. The dashboard keeps the
 * visible label (with the polled age) the unmodified web-ui capability requires.
 */
function ObservationIndicator({
  observation,
  size,
  fontSize,
  showLabel,
}: {
  observation: DeviceTileObservationState;
  size: number;
  fontSize: string;
  showLabel: boolean;
}) {
  const glyph = <StateGlyph icon={observation.icon} size={size} token={observation.token} />;
  return (
    <Row gap={1} align="center" wrap={false}>
      {showLabel ? (
        glyph
      ) : (
        <span
          role="img"
          aria-label={observation.label}
          title={observation.label}
          className="flex"
          style={{ color: `var(${observation.token})` }}
        >
          {glyph}
        </span>
      )}
      {showLabel && (
        <span
          className="truncate"
          style={{ fontSize, color: `var(${observation.token})` }}
          title={observation.label}
        >
          {observation.label}
        </span>
      )}
    </Row>
  );
}

/**
 * The group-of-devices marker: a non-colour users-group glyph with an
 * accessible name, shown on any card whose device is a Zigbee group. Extracted
 * so the header and the chrome-less wall readout carry the identical marker.
 */
function GroupMarker({ wall }: { wall: boolean }) {
  return (
    <Tooltip label="Group of devices">
      <span role="img" aria-label="Group of devices" className="flex text-muted">
        <UsersRound size={wall ? 18 : 14} aria-hidden />
      </span>
    </Tooltip>
  );
}

/**
 * The tile's corner action slot: favorite, visibility, and any caller-supplied
 * action. In normal flow at the end of the header row rather than absolutely
 * positioned, so it never overlays the name and a long name truncates before
 * reaching it.
 */
function ActionSlot({ action }: { action: ReactNode }) {
  return (
    <Row
      gap={1}
      wrap={false}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {action}
    </Row>
  );
}

/**
 * A favorite star toggle, never requiring the caller to know a device's
 * qualified identifier (specs/web-ui "Favorites"). Uses the store's optimistic
 * write and stream reconciliation, so a change is reflected across clients.
 */
function FavoriteToggle({ device, wall }: { device: DeviceDescriptor; wall?: boolean }) {
  const { isFavorite, toggleFavorite } = useDataStore();
  const favorite = isFavorite(device.qualifiedId);
  const [error, setError] = useState<string | null>(null);
  const iconSize = wall ? 20 : 14;

  const button = (
    <IconButton
      size={wall ? "lg" : "sm"}
      label={favorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorite}
      className={cn(error ? "text-danger" : favorite ? "text-stale" : "text-muted")}
      onClick={async () => {
        setError(null);
        try {
          await toggleFavorite(device.qualifiedId);
        } catch {
          setError("Could not update favorites");
        }
      }}
    >
      {favorite ? <Star size={iconSize} fill="currentColor" /> : <Star size={iconSize} />}
    </IconButton>
  );

  return error ? <Tooltip label={error}>{button}</Tooltip> : button;
}

/**
 * A hide/unhide toggle, never requiring the caller to know a device's
 * qualified identifier — it reads it off the descriptor itself (specs/web-ui
 * "Hiding And Unhiding From The Interface"). Composed alongside any
 * caller-supplied `action` in the tile's corner slot, so a room's own unassign
 * control and this toggle can coexist.
 */
function VisibilityToggle({ device, wall }: { device: DeviceDescriptor; wall?: boolean }) {
  const { hideDevice, unhideDevice } = useDataStore();
  const iconSize = wall ? 20 : 14;
  return (
    <IconButton
      size={wall ? "lg" : "sm"}
      label={device.hidden ? "Unhide device" : "Hide device"}
      className="text-muted"
      onClick={() => {
        void (device.hidden ? unhideDevice(device.qualifiedId) : hideDevice(device.qualifiedId));
      }}
    >
      {device.hidden ? <Eye size={iconSize} /> : <EyeOff size={iconSize} />}
    </IconButton>
  );
}

interface AvailableProps {
  device: DeviceDescriptor;
  /** Rendered in the tile's corner slot, e.g. a room's unassign control in edit mode. */
  action?: ReactNode;
  /**
   * Size token. `"wall"` enlarges padding and interactive controls to the
   * wall's minimum touch target while preserving the default rendering exactly
   * (design.md D13; specs/wall-display "Touch Operation").
   */
  size?: WallTileSize;
  /**
   * When set, the tile draws no surface of its own and inherits the surrounding
   * frame's, so a card is a single surface rather than a tile nested inside one
   * (specs/wall-display "A card is a single surface"). Unset reproduces the
   * tile's ordinary surface rendering.
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
 * descriptor exists to open, and its stale state is never presented as current
 * (specs/web-ui "Unavailable member is visible but distinct").
 */
function UnavailableTile({ qualifiedId, action, size, contained }: UnavailableProps) {
  const wall = size === "wall";
  const padClass = wall ? "p-4" : "p-3";
  const inner = (
    <>
      <Row justify="between" align="start" gap={2} wrap={false}>
        <span
          className="truncate font-mono text-muted"
          style={{ flex: 1, minWidth: 0, fontSize: wall ? WALL_BODY_FONT_SIZE : "var(--text-sm)" }}
        >
          {qualifiedId}
        </span>
        {action && <ActionSlot action={action} />}
      </Row>
      <Row gap={1} align="center" wrap={false} className="mt-1.5">
        <Unplug size={wall ? 16 : 13} className="text-danger" aria-hidden />
        <Badge tone="neutral">Unavailable</Badge>
      </Row>
    </>
  );

  if (contained) {
    return <div className={cn("opacity-60", padClass)}>{inner}</div>;
  }

  return (
    <Card padding={false} elevation="flat" className={cn(padClass, "border-dashed opacity-60")}>
      {inner}
    </Card>
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
  // remains the value that addresses and commands the device.
  const deviceLabel = humanizeDeviceName(device.displayName);
  const ranking = rankDeviceTile(device.capabilities);
  const flat = flattenCapabilities(device.capabilities);

  const actionCapability = ranking.action
    ? flat.find((c) => c.property === ranking.action?.capability.property)
    : undefined;
  const readoutCapability = ranking.readout
    ? flat.find((c) => c.property === ranking.readout?.capability.property)
    : undefined;

  // The card archetype is a wall presentation (the dashboard keeps the shared
  // single template), so the dashboard stays `default` and its rendering is
  // unchanged.
  const archetype: CardArchetype = wall ? cardArchetype(ranking, device.capabilities) : "default";
  const brightnessCapability =
    archetype === "light" ? writableBrightnessCapability(device.capabilities) : undefined;
  // The stop command is progressive: a cover card shows Stop only when the pure
  // detector finds a writable transport property that can express it. Computed
  // only for the cover archetype, so no other card pays for it.
  const stopCommand = archetype === "cover" ? coverStopCommand(device.capabilities) : null;

  // A tile with no ranked action is read-only. On the dashboard the whole tile
  // then activates the detail view (specs/web-ui "A read-only tile still opens
  // detail"). On the wall a read-only device is a readout with no navigation.
  // A tile with a control opens detail only through its explicit affordance, so
  // the embedded control is never mistaken for it.
  const readOnly = !actionCapability;
  const wholeCardToggle =
    presentation.wholeCardActuation &&
    actionCapability !== undefined &&
    ranking.action?.kind === "on_off" &&
    archetypeWholeCardActuation(archetype);
  const state = deviceTileState(device, now);

  // One optimistic resolution for the tile's primary action, shared by the
  // embedded control and the on/off chip. The chip and control must agree while
  // a command is in flight; deriving the chip from confirmed state alone would
  // let them contradict until the round trip (design.md D12; specs/web-ui
  // "Device Tile Presentation"). The hook resolves a store-level override (room
  // command) ahead of this component's local override, so the tile still
  // reflects room-wide commands.
  const actionControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    actionCapability?.property ?? "",
    actionCapability ? device.state[actionCapability.property] : undefined,
    device.observation,
  );
  // The light card's brightness is a second, independent optimistic channel.
  // The hook is called unconditionally — with no property when the device is
  // not a light — so hook order is stable across renders.
  const brightnessControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    brightnessCapability?.property ?? "",
    brightnessCapability ? device.state[brightnessCapability.property] : undefined,
    device.observation,
  );
  // The cover's Stop is a third independent optimistic channel, on its detected
  // transport property. Called unconditionally with an absent property when the
  // device is not a stop-capable cover, so hook order is stable across renders;
  // Open/Close reuse the primary `actionControl` above.
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
  // A readout card is deliberately chrome-less on the wall; a contained tile
  // inherits the surrounding frame's surface. Either way the tile draws no
  // surface of its own, so a card is one surface.
  const surfaceLess = cardDrawsNoSurface(archetype, wall, contained === true);

  const chipFontSize = tileFontSize(tileText.chip);
  const bodyFontSize = tileFontSize(tileText.body);
  const padClass = metrics?.padding === "md" ? "p-4" : "p-3";

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
  // affordance. Its embedded control carries the correct role and state, so it
  // is the single accessible activation — the card must not also take
  // role="button"/a tab stop, which ARIA forbids around an interactive
  // descendant. The dashboard read-only card keeps its role="button" because it
  // contains no embedded control.
  const cardKeyboardAction = wholeCardToggle ? null : cardAction;

  const observation = (
    <ObservationIndicator
      observation={state.observation}
      size={wall ? 16 : 11}
      fontSize={chipFontSize}
      showLabel={showObservationLabel}
    />
  );

  const header = (
    <Row justify="between" align="start" gap={2} wrap={false}>
      <Row gap={1} align="center" wrap={false} className="min-w-0 flex-1">
        {isGroup && <GroupMarker wall={wall} />}
        <span
          className="truncate font-semibold"
          title={deviceLabel}
          style={{ fontSize: wall ? WALL_BODY_FONT_SIZE : "var(--text-sm)" }}
        >
          {deviceLabel}
        </span>
      </Row>
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
    </Row>
  );

  const controlWrapperStyle = { flex: 1, minWidth: 0, minHeight: metrics?.control };
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

  // The light archetype renders two independent controls — an on/off toggle and
  // a brightness slider with a persistent `%` readout (specs/wall-display "A
  // light card presents both a toggle and a value control").
  let controls: ReactNode;
  if (lightCard && actionCapability && brightnessCapability) {
    const brightnessMin = brightnessCapability.range?.min ?? 0;
    // The light's brightness as a percentage of its declared range (design.md D3).
    const brightnessPercent = (value: unknown): string =>
      formatBrightnessPercent(value, brightnessCapability.range);
    controls = (
      <>
        <Row gap={2} align="center" wrap={false}>
          <div
            className="flex items-center"
            style={controlWrapperStyle}
            onClick={stop}
            onKeyDown={stop}
          >
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
          {onOff && <OnOffChip state={onOff} fontSize={chipFontSize} />}
        </Row>
        <Row gap={2} align="center" wrap={false}>
          <div
            className="flex items-center"
            style={controlWrapperStyle}
            onClick={stop}
            onKeyDown={stop}
            title={brightnessPercent(brightnessControl.value)}
          >
            <Slider
              min={brightnessMin}
              max={brightnessCapability.range?.max ?? 100}
              step={brightnessCapability.step ?? 1}
              value={[
                typeof brightnessControl.value === "number"
                  ? brightnessControl.value
                  : brightnessMin,
              ]}
              disabled={!device.reachable}
              onValueChange={([value]) => brightnessControl.setValue(value)}
              aria-label={brightnessCapability.property}
            />
          </div>
          <span
            className="font-semibold"
            style={{ minWidth: 44, textAlign: "right", fontSize: bodyFontSize }}
          >
            {formatBrightnessPercent(brightnessControl.value, brightnessCapability.range)}
          </span>
        </Row>
      </>
    );
  } else if (archetype === "cover" && actionCapability) {
    // A cover's primary action is a position, but the wall presents discrete,
    // touch-sized transport instead of the generic slider (specs/wall-display
    // "Cover Transport Controls"). Open/Close reuse the primary `actionControl`
    // hook above, so reflection/reconciliation/revert is identical to the
    // generic path; Stop is a separate optimistic channel.
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
        readoutSize={bodyFontSize}
      />
    );
  } else if (actionCapability) {
    controls = (
      <Row gap={2} align="center" wrap={false}>
        <div
          className="flex items-center"
          style={controlWrapperStyle}
          onClick={stop}
          onKeyDown={stop}
        >
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
        {onOff && <OnOffChip state={onOff} fontSize={chipFontSize} />}
      </Row>
    );
  } else if (readoutCapability) {
    controls = (
      <span
        className="font-bold"
        style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
      >
        {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
      </span>
    );
  } else {
    controls = (
      <span className="text-muted" style={{ fontSize: bodyFontSize }}>
        No controls
      </span>
    );
  }

  const readoutLine =
    actionCapability && readoutCapability && !lightCard && archetype !== "cover" ? (
      <span className="text-muted" style={{ fontSize: bodyFontSize }}>
        {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
      </span>
    ) : null;

  const footer = (
    <Row justify="between" align="center" gap={2} wrap={false}>
      <Row gap={1} align="center" wrap={false} className="min-w-0">
        {device.hidden && <Badge tone="neutral">Hidden</Badge>}
        {observation}
      </Row>

      {presentation.detail && (
        <Button
          variant="soft"
          size={wall ? "md" : "sm"}
          aria-label={`Open ${deviceLabel} details`}
          onClick={(event) => {
            event.stopPropagation();
            openDetail();
          }}
        >
          Details
          <ChevronRight size={wall ? 18 : 12} aria-hidden />
        </Button>
      )}
    </Row>
  );

  // A wall readout card is a chrome-less dominant value with a quiet label
  // (specs/wall-display "A readout card MUST present its value as the card's
  // dominant content without a control surface"). It carries the group marker
  // and the Hidden badge for parity with the other archetypes, and keeps only
  // the non-textual observation indicator — never a control or navigation
  // affordance.
  const inner =
    wall && archetype === "readout" ? (
      <Stack gap={3}>
        {readoutCapability ? (
          <span
            className={device.reachable ? "font-bold" : "font-bold text-muted"}
            style={{ fontFamily: "var(--font-display)", fontSize: WALL_METRIC_FONT_SIZE }}
          >
            {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
          </span>
        ) : (
          <span className="text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
            No reading
          </span>
        )}
        <Row justify="between" align="center" gap={2} wrap={false}>
          <Row gap={1} align="center" wrap={false} className="min-w-0 flex-1">
            {isGroup && <GroupMarker wall={wall} />}
            <span
              className="truncate text-muted"
              title={deviceLabel}
              style={{ minWidth: 0, fontSize: WALL_BODY_FONT_SIZE }}
            >
              {deviceLabel}
            </span>
          </Row>
          <Row gap={1} align="center" wrap={false}>
            {device.hidden && <Badge tone="neutral">Hidden</Badge>}
            {observation}
          </Row>
        </Row>
      </Stack>
    ) : (
      <Stack gap={wall ? 3 : 2}>
        {header}
        {controls}
        {readoutLine}
        {footer}
      </Stack>
    );

  if (surfaceLess) {
    return (
      <div
        className={cn(
          "relative",
          padClass,
          device.hidden && "opacity-70",
          cardAction && "cursor-pointer",
        )}
        onClick={cardAction ?? undefined}
        role={cardKeyboardAction ? "button" : undefined}
        tabIndex={cardKeyboardAction ? 0 : undefined}
        onKeyDown={
          cardKeyboardAction
            ? (event) => {
                if (event.key === " ") event.preventDefault();
                if (event.key === "Enter" || event.key === " ") cardKeyboardAction();
              }
            : undefined
        }
      >
        {inner}
      </div>
    );
  }

  return (
    <Card
      padding={false}
      elevation="raised"
      className={cn(
        padClass,
        "relative",
        device.hidden && "border-dashed opacity-70",
        cardAction && "cursor-pointer",
      )}
      onClick={cardAction ?? undefined}
      role={cardKeyboardAction ? "button" : undefined}
      tabIndex={cardKeyboardAction ? 0 : undefined}
      onKeyDown={
        cardKeyboardAction
          ? (event) => {
              if (event.key === " ") event.preventDefault();
              if (event.key === "Enter" || event.key === " ") cardKeyboardAction();
            }
          : undefined
      }
    >
      {inner}
    </Card>
  );
}
