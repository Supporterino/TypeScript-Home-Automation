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
 * Its `size="wall"` presentation is drawn on the wall's own Hearth language
 * (design.md D1, D7): the `readout` archetype is a chrome-less leading glyph +
 * reading + quiet label (D13); the `light` archetype is a touch-sized
 * device-icon on/off affordance, a name and percentage readout, and a
 * full-width brightness bar, with colour-temperature/colour controls offered
 * only when the device declares them (D12); the remaining archetypes
 * (`toggle`, `cover`, `default`) are framed with a Hearth card surface, the wall
 * ramp, and Hearth on/off/observation state tokens; and the unavailable variant
 * is framed and marked the same way — rather than the dashboard's Lumen chrome.
 * Every wall branch draws with `var(--hearth-*)` tokens and the
 * wall ramp directly — it must not import the lazy wall vocabulary
 * (`wall/widgets/card-vocab.tsx`), which reaches the wall registry and the
 * shared wall schema, so importing it here would pull zod into first paint and
 * break the on-demand wall-stylesheet isolation (design.md D5). The dashboard
 * (`size` unset) keeps its Lumen rendering exactly.
 *
 * The pure helpers it consumes (`card-archetype`, `device-tile-state`,
 * `capability-ranking`, `humanize-name`, `wall/scale`) are unchanged apart from
 * the added wall-only colour helpers, and its props and behaviour contracts are
 * preserved.
 */
import {
  Activity,
  BatteryMedium,
  ChevronRight,
  Clock,
  DoorOpen,
  Droplets,
  Eye,
  EyeOff,
  Lightbulb,
  Power,
  Star,
  Sun,
  Thermometer,
  Unplug,
  UsersRound,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  coverStopCommand,
  coverTransportAction,
  type FlatCapability,
  flattenCapabilities,
  type PrimaryReadoutKind,
  rankDeviceTile,
  writableColorCapability,
  writableColorTemperatureCapability,
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
import { Badge, Button, Card, cn, IconButton, Row, Stack, Tooltip } from "../ui/index.js";
import {
  deviceTileObservationText,
  deviceTilePresentation,
  deviceTileText,
  type WallTileSize,
  wallTileMetrics,
} from "../wall/scale.js";
import {
  WALL_BODY_FONT_SIZE,
  WALL_LABEL_FONT_SIZE,
  WALL_METRIC_FONT_SIZE,
  WALL_TITLE_FONT_SIZE,
} from "../wall/type-ramp.js";
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

/**
 * Maps the pure state helper's symbolic token to Hearth's own token for the
 * wall (design.md D1, D7). The dashboard keeps the Lumen token unchanged, so
 * only the wall's presentation moves.
 */
function hearthObservationToken(token: DeviceTileObservationState["token"]): string {
  switch (token) {
    case "--on":
      return "--hearth-on";
    case "--danger":
      return "--hearth-danger";
    case "--stale":
      return "--hearth-stale";
    case "--text-muted":
      return "--hearth-text-muted";
  }
}

/**
 * The leading glyph naming a wall readout's measured quantity (design.md D13;
 * specs/wall-display "Wall Device Presentation" — a readout presents its value
 * with a leading glyph and a quiet label). The glyph is decorative and never
 * the sole state channel — it names the measurement, it does not encode it —
 * so it is drawn in Hearth's muted foreground and hidden from assistive tech.
 */
function ReadoutGlyph({ kind, size }: { kind: PrimaryReadoutKind | undefined; size: number }) {
  const style = { color: "var(--hearth-text-muted)" };
  switch (kind) {
    case "temperature":
    case "setpoint":
      return <Thermometer size={size} style={style} aria-hidden />;
    case "humidity":
    case "water_leak":
      return <Droplets size={size} style={style} aria-hidden />;
    case "illuminance":
    case "brightness":
      return <Sun size={size} style={style} aria-hidden />;
    case "power":
      return <Zap size={size} style={style} aria-hidden />;
    case "battery":
      return <BatteryMedium size={size} style={style} aria-hidden />;
    case "contact":
      return <DoorOpen size={size} style={style} aria-hidden />;
    case "occupancy":
      return <UsersRound size={size} style={style} aria-hidden />;
    default:
      return <Activity size={size} style={style} aria-hidden />;
  }
}

/** The wall's column stack: Hearth's own control rhythm, so an adjacent control keeps the ≥8px floor. */
const WALL_STACK_STYLE = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "var(--hearth-space-3)",
  minWidth: 0,
};

/**
 * A Hearth on/off affordance for the wall `toggle` archetype (design.md D7, D9;
 * specs/wall-display "The whole tile actuates a toggle"). It is the card's
 * accessible control — a touch-sized power button whose glyph fill and label
 * state the value without relying on colour — while the whole-card tap is the
 * pointer-only redundant affordance, so a screen reader still has a real
 * activation. Drawn with Hearth tokens, never the dashboard's Lumen switch.
 */
function WallOnOffAffordance({
  state,
  label,
  control,
  disabled,
  onToggle,
}: {
  state: DeviceTileOnOffState;
  label: string;
  control: number;
  disabled: boolean;
  onToggle: () => void;
}) {
  const token = state.value ? "--hearth-on" : "--hearth-off";
  return (
    <button
      type="button"
      aria-pressed={state.value}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--hearth-space-2)",
        minHeight: control,
        padding: "0 var(--hearth-space-4)",
        borderRadius: "var(--hearth-radius-pill)",
        border: "1px solid var(--hearth-hairline)",
        background: state.value ? "var(--hearth-surface-raised)" : "var(--hearth-surface-sunken)",
        color: `var(${token})`,
        fontFamily: "var(--hearth-font-display)",
        fontSize: WALL_BODY_FONT_SIZE,
        fontWeight: "var(--hearth-weight-semibold)",
        cursor: disabled ? "progress" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <StateGlyph icon={state.icon} size={24} token={token} />
      <span>{state.label}</span>
    </button>
  );
}

/**
 * The wall's non-interactive on/off state affordance (design.md D7, D9;
 * specs/wall-display "Observation is a quiet indicator"). A wall card whose
 * ranked primary is a value — a `default` archetype — may still report a
 * readable on/off; the dashboard shows that state as a read-only `OnOffChip`
 * beside the value control, so the wall keeps it visible here, its glyph shape
 * and label stating it without colour, while the value control remains the
 * card's only interactive affordance. The on/off actuator is never rendered for
 * a value primary, so a boolean is never commanded to a non-boolean property.
 */
function WallOnOffState({ state }: { state: DeviceTileOnOffState }) {
  const token = state.value ? "--hearth-on" : "--hearth-off";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--hearth-space-2)",
        color: `var(${token})`,
        fontFamily: "var(--hearth-font-display)",
        fontSize: WALL_BODY_FONT_SIZE,
        fontWeight: "var(--hearth-weight-semibold)",
      }}
    >
      <StateGlyph icon={state.icon} size={20} token={token} />
      <span>{state.label}</span>
    </span>
  );
}

/**
 * A Hearth value control for the wall's generic (`default`) archetype — the
 * device's embedded value control, drawn with Hearth tokens rather than the
 * dashboard's Lumen control primitive (design.md D7; specs/wall-display "A value
 * device keeps its embedded control"). A ranked primary action is never a
 * boolean or free text (those resolve to a `toggle`/`light`), so a numeric
 * capability is a wall-scale range input and an enum is a Hearth-styled select;
 * both drive the tile's shared optimistic channel and surface a rejected
 * command inline.
 */
function WallValueControl({
  capability,
  value,
  onChange,
  error,
  control,
  disabled,
}: {
  capability: FlatCapability;
  value: unknown;
  onChange: (next: unknown) => void;
  error: string | null;
  control: number;
  disabled: boolean;
}) {
  const cursor = disabled ? "progress" : "pointer";
  const input =
    capability.valueType === "numeric" ? (
      <input
        type="range"
        aria-label={capability.property}
        min={capability.range?.min ?? 0}
        max={capability.range?.max ?? 100}
        step={capability.step ?? 1}
        value={typeof value === "number" ? value : (capability.range?.min ?? 0)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={{ width: "100%", height: control, accentColor: "var(--hearth-accent)", cursor }}
      />
    ) : (
      <select
        aria-label={capability.property}
        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          minHeight: control,
          width: "100%",
          padding: "0 var(--hearth-space-3)",
          borderRadius: "var(--hearth-radius-md)",
          border: "1px solid var(--hearth-hairline)",
          background: "var(--hearth-surface-raised)",
          color: "var(--hearth-text)",
          fontFamily: "var(--hearth-font-display)",
          fontSize: WALL_BODY_FONT_SIZE,
          cursor,
        }}
      >
        {(capability.permittedValues ?? []).map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--hearth-space-1)",
        minWidth: 0,
      }}
    >
      {input}
      {error && (
        <p
          role="alert"
          style={{ margin: 0, color: "var(--hearth-danger)", fontSize: WALL_BODY_FONT_SIZE }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The "Hidden" marker: a Hearth pill on the wall, the Lumen badge on the
 * dashboard (design.md D1, D7). Only the wall's presentation changes, and its
 * eye-off glyph keeps the state readable without colour.
 */
function HiddenMarker({ wall }: { wall: boolean }) {
  if (!wall) return <Badge tone="neutral">Hidden</Badge>;
  return (
    <span
      style={{
        display: "inline-flex",
        flex: "none",
        alignItems: "center",
        gap: "var(--hearth-space-1)",
        padding: "0 var(--hearth-space-2)",
        borderRadius: "var(--hearth-radius-pill)",
        border: "1px solid var(--hearth-hairline)",
        background: "var(--hearth-surface-raised)",
        color: "var(--hearth-text-muted)",
        fontSize: WALL_BODY_FONT_SIZE,
        fontWeight: "var(--hearth-weight-semibold)",
      }}
    >
      <EyeOff size={16} aria-hidden />
      Hidden
    </span>
  );
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
  wall,
}: {
  observation: DeviceTileObservationState;
  size: number;
  fontSize: string;
  showLabel: boolean;
  wall: boolean;
}) {
  // On the wall the indicator draws Hearth's own token for the state; the
  // dashboard keeps the pure helper's Lumen token (design.md D1, D7).
  const token = wall ? hearthObservationToken(observation.token) : observation.token;
  const glyph = <StateGlyph icon={observation.icon} size={size} token={token} />;
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
          style={{ color: `var(${token})` }}
        >
          {glyph}
        </span>
      )}
      {showLabel && (
        <span
          className="truncate"
          style={{ fontSize, color: `var(${token})` }}
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
      <span
        role="img"
        aria-label="Group of devices"
        className={cn("flex", !wall && "text-muted")}
        style={wall ? { color: "var(--hearth-text-muted)" } : undefined}
      >
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
 * The wall's unavailable marker: a Hearth pill, the wall counterpart of the
 * dashboard's Lumen badge (design.md D1, D7). Its text is the accessible
 * "Unavailable" label; the leading unplug glyph beside it is decorative.
 */
function WallUnavailablePill() {
  return (
    <span
      style={{
        display: "inline-flex",
        flex: "none",
        alignItems: "center",
        padding: "0 var(--hearth-space-2)",
        borderRadius: "var(--hearth-radius-pill)",
        border: "1px solid var(--hearth-hairline)",
        background: "var(--hearth-surface-raised)",
        color: "var(--hearth-text-muted)",
        fontSize: WALL_BODY_FONT_SIZE,
        fontWeight: "var(--hearth-weight-semibold)",
      }}
    >
      Unavailable
    </span>
  );
}

/**
 * The unavailable variant: qualified identifier and an unavailable marker,
 * with no control, no state readout, and no detail affordance — no live
 * descriptor exists to open, and its stale state is never presented as current
 * (specs/web-ui "Unavailable member is visible but distinct").
 *
 * Its `size="wall"` presentation (design.md D1, D7) draws the same card surface
 * as the wall's other archetypes and the Hearth text tokens — muted identifier,
 * danger unplug glyph, Hearth pill — rather than the dashboard's Lumen chrome.
 * The dashboard keeps its Lumen `<Card>`, badge, and classes exactly.
 */
function UnavailableTile({ qualifiedId, action, size, contained }: UnavailableProps) {
  const wall = size === "wall";
  const padClass = wall ? "p-4" : "p-3";
  const inner = (
    <>
      <Row justify="between" align="start" gap={2} wrap={false}>
        <span
          className={wall ? "truncate font-mono" : "truncate font-mono text-muted"}
          style={
            wall
              ? {
                  flex: 1,
                  minWidth: 0,
                  fontSize: WALL_BODY_FONT_SIZE,
                  color: "var(--hearth-text-muted)",
                }
              : { flex: 1, minWidth: 0, fontSize: "var(--text-sm)" }
          }
        >
          {qualifiedId}
        </span>
        {action && <ActionSlot action={action} />}
      </Row>
      <Row gap={1} align="center" wrap={false} className="mt-1.5">
        <Unplug
          size={wall ? 16 : 13}
          className={wall ? undefined : "text-danger"}
          style={wall ? { color: "var(--hearth-danger)" } : undefined}
          aria-hidden
        />
        {wall ? <WallUnavailablePill /> : <Badge tone="neutral">Unavailable</Badge>}
      </Row>
    </>
  );

  if (contained) {
    return <div className={cn("opacity-60", padClass)}>{inner}</div>;
  }

  // The wall draws Hearth's own card surface — its background, hairline, and
  // radius — matching the wall's other archetypes, never the Lumen `<Card>`.
  if (wall) {
    return (
      <div
        className={cn("opacity-60", padClass)}
        style={{
          background: "var(--hearth-surface)",
          border: "1px solid var(--hearth-hairline)",
          borderRadius: "var(--hearth-radius-md)",
        }}
      >
        {inner}
      </div>
    );
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
  // The light card's colour controls are offered only when the device declares
  // the capability (design.md D12; specs/wall-display "Colour controls appear
  // only when supported"), so an undeclared control is never rendered inert.
  const colorTemperatureCapability =
    archetype === "light" ? writableColorTemperatureCapability(device.capabilities) : undefined;
  const colorCapability =
    archetype === "light" ? writableColorCapability(device.capabilities) : undefined;
  // The stop command is progressive: a cover card shows Stop only when the pure
  // detector finds a writable transport property that can express it. Computed
  // only for the cover archetype, so no other card pays for it.
  const stopCommand = archetype === "cover" ? coverStopCommand(device.capabilities) : null;
  // The declared transport a cover accepts, resolved once here so the tile owns
  // a single optimistic channel for it and Open, Close, and Stop share that
  // channel rather than two hooks contending on one property (design.md D15).
  const transportAction = archetype === "cover" ? coverTransportAction(device.capabilities) : null;

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
  // The declared transport's optimistic channel, owned here so Open, Close, and
  // (when it shares the property) Stop all command through one channel rather
  // than two hooks contending on the same qualifiedId+property. Called
  // unconditionally with an absent property when the device declares no
  // transport, so hook order is stable across renders.
  const transportControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    transportAction?.property ?? "",
    transportAction ? device.state[transportAction.property] : undefined,
    device.observation,
  );
  // Stop is a command on the transport property (the common case — a declared
  // transport names its own stop) or, when it targets a distinct property, its
  // own channel. Exactly one channel is live per property: a shared stop passes
  // an absent property here and reuses `transportControl`.
  const stopSharesTransport =
    stopCommand !== null && stopCommand.property === transportAction?.property;
  const stopControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    stopCommand && !stopSharesTransport ? stopCommand.property : "",
    stopCommand && !stopSharesTransport ? device.state[stopCommand.property] : undefined,
    device.observation,
  );
  // The light card's colour-temperature and colour controls are two further
  // independent optimistic channels, each called unconditionally with an absent
  // property when the device declares none, so hook order is stable across
  // renders. A device with no such capability pays only for the two no-op
  // subscriptions.
  const colorTemperatureControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    colorTemperatureCapability?.property ?? "",
    colorTemperatureCapability ? device.state[colorTemperatureCapability.property] : undefined,
    device.observation,
  );
  const colorControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    colorCapability?.property ?? "",
    colorCapability ? device.state[colorCapability.property] : undefined,
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
      wall={wall}
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

  // The embedded control set. The wall light and readout archetypes are built
  // inside `inner` below, so this chain serves the dashboard and the wall's
  // remaining archetypes: a wall cover, toggle, and `default` draw Hearth
  // controls, while the dashboard keeps its Lumen control primitive.
  let controls: ReactNode;
  if (archetype === "cover" && actionCapability) {
    // A cover positions or transports, and the wall presents discrete,
    // touch-sized transport instead of a generic slider (specs/wall-display
    // "Cover Transport Controls"; design.md D15). CoverTransport resolves the
    // device's declared transport action itself and owns that optimistic
    // channel; Open/Close fall back to the position extremes when none is
    // declared. Stop is gated on the pure `coverStopCommand`.
    controls = (
      <CoverTransport
        device={device}
        position={actionCapability}
        value={actionControl.value}
        onChange={actionControl.setValue}
        error={actionControl.error}
        transport={transportAction}
        transportChannel={{
          setValue: transportControl.setValue,
          error: transportControl.error,
        }}
        stop={stopCommand}
        stopChannel={
          stopCommand !== null && !stopSharesTransport
            ? { setValue: stopControl.setValue, error: stopControl.error }
            : { setValue: transportControl.setValue, error: transportControl.error }
        }
        control={metrics?.control ?? 32}
        readoutSize={bodyFontSize}
      />
    );
  } else if (actionCapability && wall) {
    // The wall's control follows the ranked primary action, never `onOff`
    // alone (design.md D7, D9, D16; specs/wall-display "Wall Device
    // Presentation"). A `toggle`'s primary is the on/off itself, so it draws
    // the Hearth on/off affordance — the whole card is the pointer-only
    // redundant target and this is the accessible control. A `default` primary
    // is a value (setpoint/enum/numeric) that may still report a readable
    // on/off; deriving the control from `onOff` would wire the on/off actuator
    // to a non-boolean property — a command validation rejects — and drop the
    // value control entirely, so the value branch keeps that state as a
    // non-interactive affordance, the wall's counterpart of the dashboard's
    // `OnOffChip`.
    controls =
      ranking.action?.kind === "on_off" && onOff ? (
        <WallOnOffAffordance
          state={onOff}
          label={`Turn ${onOff.value ? "off" : "on"} ${deviceLabel}`}
          control={metrics?.control ?? 56}
          disabled={!device.reachable}
          onToggle={togglePrimary}
        />
      ) : (
        <>
          {onOff && <WallOnOffState state={onOff} />}
          <WallValueControl
            capability={actionCapability}
            value={actionControl.value}
            onChange={actionControl.setValue}
            error={actionControl.error}
            control={metrics?.control ?? 56}
            disabled={!device.reachable}
          />
        </>
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
    controls = wall ? (
      <span style={{ color: "var(--hearth-text-muted)", fontSize: bodyFontSize }}>No controls</span>
    ) : (
      <span className="text-muted" style={{ fontSize: bodyFontSize }}>
        No controls
      </span>
    );
  }

  const readoutLine =
    actionCapability && readoutCapability && !lightCard && archetype !== "cover" ? (
      <span
        className={wall ? undefined : "text-muted"}
        style={
          wall
            ? { color: "var(--hearth-text-muted)", fontSize: bodyFontSize }
            : { fontSize: bodyFontSize }
        }
      >
        {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
      </span>
    ) : null;

  const footer = (
    <Row justify="between" align="center" gap={2} wrap={false}>
      <Row gap={1} align="center" wrap={false} className="min-w-0">
        {device.hidden && <HiddenMarker wall={wall} />}
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

  // The wall readout card (design.md D13; specs/wall-display "A sensor is
  // read-only", "Observation is a quiet indicator"): a leading glyph, the
  // reading on the wall's metric ramp, and a quiet label — chrome-less, with no
  // control or navigation affordance. It carries the group marker and the
  // hidden marker for parity with the other archetypes, and keeps only the
  // non-textual observation indicator.
  let inner: ReactNode;
  if (wall && archetype === "readout") {
    inner = (
      <div style={WALL_STACK_STYLE}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--hearth-space-2)",
            minWidth: 0,
          }}
        >
          <ReadoutGlyph kind={ranking.readout?.kind} size={24} />
          {isGroup && <GroupMarker wall={wall} />}
          <span
            className="truncate"
            title={deviceLabel}
            style={{
              minWidth: 0,
              color: "var(--hearth-text-muted)",
              fontSize: WALL_LABEL_FONT_SIZE,
              fontWeight: "var(--hearth-weight-semibold)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {deviceLabel}
          </span>
        </div>
        {readoutCapability ? (
          <span
            style={{
              color: device.reachable ? "var(--hearth-text)" : "var(--hearth-text-muted)",
              fontFamily: "var(--hearth-font-display)",
              fontSize: WALL_METRIC_FONT_SIZE,
              fontWeight: "var(--hearth-weight-bold)",
              lineHeight: "var(--hearth-leading-tight)",
            }}
          >
            {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
          </span>
        ) : (
          <span style={{ color: "var(--hearth-text-muted)", fontSize: WALL_BODY_FONT_SIZE }}>
            No reading
          </span>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--hearth-space-2)",
            minWidth: 0,
          }}
        >
          {device.hidden && <HiddenMarker wall={wall} />}
          {observation}
        </div>
      </div>
    );
  } else if (lightCard && actionCapability && brightnessCapability) {
    // The wall light card (design.md D7, D12; specs/wall-display "A light card
    // presents both a toggle and a value control", "A light card can be turned
    // on from its affordances", "Colour controls appear only when supported").
    // A touch-sized device-icon on/off affordance; the name and a percentage
    // readout beside it; a full-width brightness bar below whose off state
    // turns the light on when activated; and colour controls offered only for a
    // capability the device declares. Every token is Hearth's own, and the
    // ≥8 px adjacent-control floor is the wall stack's `--hearth-space-3` gap.
    const lightOn = onOff?.value ?? false;
    const brightnessMin = brightnessCapability.range?.min ?? 0;
    const brightnessValue =
      typeof brightnessControl.value === "number" ? brightnessControl.value : brightnessMin;
    const controlHeight = metrics?.control ?? 56;
    const controlCursor = device.reachable ? "pointer" : "progress";
    const controlError =
      actionControl.error ??
      brightnessControl.error ??
      colorTemperatureControl.error ??
      colorControl.error;
    inner = (
      <div style={WALL_STACK_STYLE}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--hearth-space-3)",
            minWidth: 0,
          }}
        >
          <button
            type="button"
            aria-pressed={lightOn}
            aria-label={`Turn ${lightOn ? "off" : "on"} ${deviceLabel}`}
            disabled={!device.reachable}
            onClick={(event) => {
              event.stopPropagation();
              togglePrimary();
            }}
            style={{
              display: "inline-flex",
              flex: "none",
              alignItems: "center",
              justifyContent: "center",
              width: controlHeight,
              height: controlHeight,
              borderRadius: "var(--hearth-radius-pill)",
              border: "1px solid var(--hearth-hairline)",
              background: lightOn ? "var(--hearth-surface-raised)" : "var(--hearth-surface-sunken)",
              color: lightOn ? "var(--hearth-on)" : "var(--hearth-off)",
              cursor: controlCursor,
            }}
          >
            {lightOn ? (
              <Lightbulb size={30} fill="currentColor" aria-hidden />
            ) : (
              <Lightbulb size={30} aria-hidden />
            )}
          </button>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--hearth-space-1)",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--hearth-space-2)",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--hearth-space-2)",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {isGroup && <GroupMarker wall={wall} />}
                <span
                  className="truncate font-semibold"
                  title={deviceLabel}
                  style={{
                    minWidth: 0,
                    color: "var(--hearth-text)",
                    fontSize: WALL_TITLE_FONT_SIZE,
                  }}
                >
                  {deviceLabel}
                </span>
              </div>
              {action && <ActionSlot action={action} />}
            </div>
            <span
              style={{
                color: lightOn ? "var(--hearth-text)" : "var(--hearth-text-muted)",
                fontFamily: "var(--hearth-font-display)",
                fontSize: WALL_METRIC_FONT_SIZE,
                fontWeight: "var(--hearth-weight-bold)",
                lineHeight: "var(--hearth-leading-tight)",
              }}
            >
              {lightOn
                ? formatBrightnessPercent(brightnessControl.value, brightnessCapability.range)
                : "Off"}
            </span>
          </div>
        </div>

        <input
          type="range"
          aria-label={brightnessCapability.property}
          min={brightnessMin}
          max={brightnessCapability.range?.max ?? 100}
          step={brightnessCapability.step ?? 1}
          value={lightOn ? brightnessValue : brightnessMin}
          disabled={!device.reachable}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            // Off-state visual: activating the bar turns the light on and sets
            // the level, both through the optimistic channels.
            if (!lightOn) {
              actionControl.setValue(deviceTileToggledValue(actionCapability, actionControl.value));
            }
            brightnessControl.setValue(next);
          }}
          style={{
            width: "100%",
            height: controlHeight,
            accentColor: lightOn ? "var(--hearth-accent)" : "var(--hearth-off)",
            cursor: controlCursor,
          }}
        />

        {colorTemperatureCapability && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--hearth-space-1)",
              minWidth: 0,
            }}
          >
            <span
              aria-hidden
              style={{
                height: 6,
                borderRadius: "var(--hearth-radius-pill)",
                background: "linear-gradient(90deg, var(--hearth-info), var(--hearth-accent))",
              }}
            />
            <input
              type="range"
              aria-label={colorTemperatureCapability.property}
              min={colorTemperatureCapability.range?.min ?? 0}
              max={colorTemperatureCapability.range?.max ?? 100}
              step={colorTemperatureCapability.step ?? 1}
              value={
                typeof colorTemperatureControl.value === "number"
                  ? colorTemperatureControl.value
                  : (colorTemperatureCapability.range?.min ?? 0)
              }
              disabled={!device.reachable}
              onChange={(event) =>
                colorTemperatureControl.setValue(Number(event.currentTarget.value))
              }
              style={{
                width: "100%",
                height: controlHeight,
                accentColor: "var(--hearth-accent)",
                cursor: controlCursor,
              }}
            />
          </div>
        )}

        {colorCapability && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--hearth-space-1)",
              minWidth: 0,
            }}
          >
            <span
              aria-hidden
              style={{
                height: 6,
                borderRadius: "var(--hearth-radius-pill)",
                background:
                  "linear-gradient(90deg, var(--hearth-danger), var(--hearth-stale), var(--hearth-on), var(--hearth-info), var(--hearth-accent))",
              }}
            />
            <input
              type="range"
              aria-label={colorCapability.property}
              min={colorCapability.range?.min ?? 0}
              max={colorCapability.range?.max ?? 360}
              step={colorCapability.step ?? 1}
              value={
                typeof colorControl.value === "number"
                  ? colorControl.value
                  : (colorCapability.range?.min ?? 0)
              }
              disabled={!device.reachable}
              onChange={(event) => colorControl.setValue(Number(event.currentTarget.value))}
              style={{
                width: "100%",
                height: controlHeight,
                accentColor: "var(--hearth-info)",
                cursor: controlCursor,
              }}
            />
          </div>
        )}

        {controlError && (
          <p
            role="alert"
            style={{ margin: 0, color: "var(--hearth-danger)", fontSize: WALL_BODY_FONT_SIZE }}
          >
            {controlError}
          </p>
        )}

        {footer}
      </div>
    );
  } else if (wall) {
    // The wall's remaining archetypes — `toggle`, `cover`, and the generic
    // `default` — are framed with Hearth chrome (design.md D1, D7;
    // specs/wall-display "Wall Visual Language"): a Hearth card surface, the
    // wall ramp, and Hearth on/off and observation state tokens, with a Hearth
    // hidden marker. The dashboard never takes this branch, so its Lumen
    // rendering is unchanged.
    inner = (
      <div style={WALL_STACK_STYLE}>
        {header}
        {controls}
        {readoutLine}
        {footer}
      </div>
    );
  } else {
    inner = (
      <Stack gap={2}>
        {header}
        {controls}
        {readoutLine}
        {footer}
      </Stack>
    );
  }

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

  // The wall card surface is Hearth's own — its background, hairline, and radius
  // — never the dashboard's Lumen `<Card>` (design.md D1, D7). Only a
  // non-surface-less wall card reaches here; a chrome-less readout and a
  // contained tile already returned above.
  if (wall) {
    return (
      <div
        className={cn(
          "relative",
          padClass,
          device.hidden && "opacity-70",
          cardAction && "cursor-pointer",
        )}
        style={{
          background: "var(--hearth-surface)",
          border: `1px ${device.hidden ? "dashed" : "solid"} var(--hearth-hairline)`,
          borderRadius: "var(--hearth-radius-md)",
        }}
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
