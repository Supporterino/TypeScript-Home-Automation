/**
 * The wall's card anatomy — the one card vocabulary every wall surface composes,
 * ported from `piitaya/lovelace-mushroom` (Apache-2.0) into Hearth.
 */
import { Clock, Unplug, Wifi, WifiOff } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type {
  DeviceTileObservationIcon,
  DeviceTileObservationState,
} from "../../lib/device-tile-state.js";
import { Link } from "../../lib/router-context.js";
import { WALL_BAND_FONT_SIZE, WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import {
  resolveEnumControlForm,
  WALL_CARD_CONTROL_MAX_WIDTH_PX,
  type WallCardBox,
} from "./card-composition.js";
import {
  type Rgb,
  toCssColor,
  toCssColorWithAlpha,
  WALL_CARD_SHAPE_ALPHA,
  WALL_CARD_SLIDER_ALPHA,
} from "./color.js";
import {
  WALL_CARD_ICON_SIZE,
  WALL_CARD_METRICS,
  WALL_CARD_PRIMARY_FONT_SIZE,
  WALL_CARD_SECONDARY_FONT_SIZE,
} from "./metrics.js";

/**
 * The fraction of a slider's track that is filled for `value`, clamped to `[0, 1]`.
 * A range whose bounds collapse reads as empty.
 */
export function sliderFraction(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * The leading icon affordance: a glyph on a circular, tinted shape of the device's
 * own colour, and the on/off control where the device has one.
 */
export function WallCardIcon({
  glyph,
  color,
  active = true,
  tint,
  onActivate,
  pressed,
  disabled,
  label,
}: {
  glyph: ReactNode;
  /** The device's own colour, contrast-improved; the wall's surface is drawn when it is absent. */
  color?: Rgb;
  /** Whether the device is on — an inactive device's shape falls back to the wall's surface. */
  active?: boolean;
  /**
   * A Hearth token for a state the device expresses as on/off rather than as a
   * colour — the glyph's colour when the device reports no colour of its own.
   */
  tint?: string;
  /** The on/off action, present only where the affordance is the device's control. */
  onActivate?: () => void;
  /** The on/off state, for `aria-pressed` on the control. */
  pressed?: boolean;
  /** Whether the device is unreachable — the control is disabled but still touch-sized. */
  disabled?: boolean;
  /** The control's accessible label. */
  label?: string;
}): ReactNode {
  // The device's own colour is drawn only while the device is on.
  const accent = active ? color : undefined;
  const shape: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
    width: WALL_CARD_ICON_SIZE,
    height: WALL_CARD_ICON_SIZE,
    borderRadius: WALL_CARD_METRICS.iconShapeRadius,
    background:
      accent !== undefined
        ? toCssColorWithAlpha(accent, WALL_CARD_SHAPE_ALPHA)
        : "var(--hearth-surface-raised)",
    color: accent !== undefined ? toCssColor(accent) : (tint ?? "var(--hearth-text-muted)"),
  };

  if (onActivate === undefined) {
    return (
      <span aria-hidden style={shape}>
        {glyph}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={(event) => {
        // The control's press must not bubble to a whole-surface tap on the card.
        event.stopPropagation();
        onActivate();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        minWidth: WALL_CARD_METRICS.controlHeight,
        minHeight: WALL_CARD_METRICS.controlHeight,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: disabled ? "progress" : "pointer",
      }}
    >
      <span aria-hidden style={shape}>
        {glyph}
      </span>
    </button>
  );
}

/**
 * The device's name over its state or primary reading, on the ported
 * primary/secondary type. `prominent` is the read-only composition.
 */
export function WallCardText({
  name,
  state,
  stateColor,
  prominent = false,
}: {
  name: ReactNode;
  state: ReactNode;
  /** The reading's colour — the device's own accent, muted when unreachable. */
  stateColor?: string;
  /** Whether the reading is the card's dominant content rather than its secondary line. */
  prominent?: boolean;
}): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 0" }}>
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: prominent ? "var(--hearth-text-muted)" : "var(--hearth-text)",
          fontFamily: "var(--hearth-font-display)",
          fontSize: prominent ? WALL_CARD_SECONDARY_FONT_SIZE : WALL_CARD_PRIMARY_FONT_SIZE,
          fontWeight: prominent
            ? WALL_CARD_METRICS.secondaryWeight
            : WALL_CARD_METRICS.primaryWeight,
          lineHeight: prominent
            ? `${WALL_CARD_METRICS.secondaryLeading}px`
            : `${WALL_CARD_METRICS.primaryLeading}px`,
          letterSpacing: `${WALL_CARD_METRICS.primaryTracking}px`,
        }}
      >
        {name}
      </span>
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: stateColor ?? (prominent ? "var(--hearth-text)" : "var(--hearth-text-muted)"),
          fontFamily: "var(--hearth-font-display)",
          fontSize: prominent ? WALL_BAND_FONT_SIZE : WALL_CARD_SECONDARY_FONT_SIZE,
          fontWeight: prominent ? "var(--hearth-weight-bold)" : WALL_CARD_METRICS.secondaryWeight,
          lineHeight: prominent
            ? "var(--hearth-leading-tight)"
            : `${WALL_CARD_METRICS.secondaryLeading}px`,
          letterSpacing: prominent ? "normal" : `${WALL_CARD_METRICS.secondaryTracking}px`,
        }}
      >
        {state}
      </span>
    </div>
  );
}

/**
 * The card's single actions row: the active control and the affordances for the
 * device's other controls. `inset` is the row's own padding.
 */
export function WallCardActions({
  children,
  inset = true,
}: {
  children: ReactNode;
  /** Whether the row carries its own ported control-spacing inset; a device card does, the page-control row does not. */
  inset?: boolean;
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: `${WALL_CARD_METRICS.controlSpacing}px`,
        padding: inset ? `${WALL_CARD_METRICS.controlSpacing}px` : 0,
        paddingTop: 0,
        boxSizing: "border-box",
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A value control embedded in a card's actions row: a track at the ported radius
 * with a bar thumb, over a native `<input type="range">`.
 */
export function WallCardSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  color,
  disabled,
  label,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** The control's own colour (the device's, contrast-improved); the wall's accent is drawn when it is absent. */
  color?: Rgb;
  disabled?: boolean;
  /** The control's accessible label. */
  label: string;
  onChange: (value: number) => void;
}): ReactNode {
  const fill = color ? toCssColor(color) : "var(--hearth-accent)";
  const track = color
    ? toCssColorWithAlpha(color, WALL_CARD_SLIDER_ALPHA)
    : "var(--hearth-accent-faint)";
  // The fill runs to the value's fraction of the track.
  const percent = `${sliderFraction(value, min, max) * 100}%`;

  return (
    <div
      style={{
        position: "relative",
        flex: "1 1 0",
        minWidth: 0,
        height: WALL_CARD_METRICS.sliderHeight,
        borderRadius: WALL_CARD_METRICS.sliderRadius,
        background: `linear-gradient(to right, ${fill} ${percent}, ${track} ${percent})`,
        overflow: "hidden",
      }}
    >
      <input
        className="hearth-card-slider"
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={{ position: "absolute", inset: 0, cursor: disabled ? "progress" : "pointer" }}
      />
    </div>
  );
}

/**
 * A touch-sized icon control for a device's other controls, with an inline error
 * tint for a rejected command.
 */
export function WallCardIconButton({
  glyph,
  label,
  onClick,
  disabled,
  active = false,
  error = false,
}: {
  glyph: ReactNode;
  /** The control's accessible label. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Whether this control is the card's currently expanded one. */
  active?: boolean;
  /** Whether this control's last command failed. */
  error?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        flex: "none",
        alignItems: "center",
        justifyContent: "center",
        width: WALL_CARD_METRICS.controlHeight,
        height: WALL_CARD_METRICS.controlHeight,
        padding: 0,
        borderRadius: WALL_CARD_METRICS.controlRadius,
        border: `1px solid ${error ? "var(--hearth-danger)" : "var(--hearth-hairline)"}`,
        background: active ? "var(--hearth-surface-sunken)" : "var(--hearth-surface-raised)",
        color: error
          ? "var(--hearth-danger)"
          : active
            ? "var(--hearth-text)"
            : "var(--hearth-text-muted)",
        cursor: disabled ? "progress" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {glyph}
    </button>
  );
}

/**
 * A touch-sized, labelled option control: one affordance per permitted value, its
 * label bounded by {@link WALL_CARD_CONTROL_MAX_WIDTH_PX}.
 */
export function WallCardOption({
  label,
  onClick,
  active = false,
  error = false,
  disabled,
}: {
  /** The option's own value, which is also its accessible name. */
  label: string;
  onClick: () => void;
  /** Whether this option is the device's current value. */
  active?: boolean;
  /** Whether this option's last command failed. */
  error?: boolean;
  disabled?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: WALL_CARD_CONTROL_MAX_WIDTH_PX,
        alignItems: "center",
        justifyContent: "center",
        minWidth: WALL_CARD_CONTROL_MAX_WIDTH_PX,
        maxWidth: WALL_CARD_CONTROL_MAX_WIDTH_PX,
        height: WALL_CARD_METRICS.controlHeight,
        padding: `0 ${WALL_CARD_METRICS.padding}px`,
        boxSizing: "border-box",
        overflow: "hidden",
        textOverflow: "ellipsis",
        borderRadius: WALL_CARD_METRICS.controlRadius,
        border: `1px solid ${error ? "var(--hearth-danger)" : "var(--hearth-hairline)"}`,
        background: active ? "var(--hearth-surface-sunken)" : "var(--hearth-surface-raised)",
        color: error
          ? "var(--hearth-danger)"
          : active
            ? "var(--hearth-text)"
            : "var(--hearth-text-muted)",
        fontFamily: "var(--hearth-font-display)",
        fontSize: WALL_CARD_PRIMARY_FONT_SIZE,
        fontWeight: WALL_CARD_METRICS.primaryWeight,
        whiteSpace: "nowrap",
        cursor: disabled ? "progress" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

/**
 * An enumerated control's single affordance: a native `<select>` listing every
 * permitted value, used when a segmented row would not fit the box.
 */
export function WallCardDropdown({
  label,
  value,
  values,
  onChange,
  disabled,
  error = false,
}: {
  /** The control's accessible label. */
  label: string;
  /** The device's current value, marked selected. */
  value: unknown;
  /** The permitted values, each drawn as one option. */
  values: readonly (string | number)[];
  onChange: (value: string | number) => void;
  disabled?: boolean;
  /** Whether the control's last command failed. */
  error?: boolean;
}): ReactNode {
  return (
    <select
      className="hearth-card-select"
      aria-label={label}
      value={value === undefined || value === null ? "" : String(value)}
      disabled={disabled}
      onChange={(event) => {
        // Hand the control its permitted value back in its own type.
        const selected = values.find(
          (permitted) => String(permitted) === event.currentTarget.value,
        );
        if (selected !== undefined) onChange(selected);
      }}
      style={{
        flex: "1 1 0",
        minWidth: WALL_CARD_METRICS.controlHeight,
        height: WALL_CARD_METRICS.controlHeight,
        boxSizing: "border-box",
        padding: `0 ${WALL_CARD_METRICS.padding}px`,
        borderRadius: WALL_CARD_METRICS.controlRadius,
        border: `1px solid ${error ? "var(--hearth-danger)" : "var(--hearth-hairline)"}`,
        background: "var(--hearth-surface-raised)",
        color: error ? "var(--hearth-danger)" : "var(--hearth-text)",
        fontFamily: "var(--hearth-font-display)",
        fontSize: WALL_CARD_PRIMARY_FONT_SIZE,
        fontWeight: WALL_CARD_METRICS.primaryWeight,
        cursor: disabled ? "progress" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {values.map((permitted) => (
        <option key={String(permitted)} value={String(permitted)}>
          {String(permitted)}
        </option>
      ))}
    </select>
  );
}

/**
 * The one shared enumerated-control affordance every typed card uses for a
 * permitted-value set, choosing its form from the box.
 */
export function WallCardEnumControl({
  box,
  label,
  values,
  current,
  onSelect,
  reservedPx,
  disabled,
  error = false,
}: {
  /** The box the card was given — the form is chosen from it, never measured. */
  box: WallCardBox;
  /** The control's accessible label, used by the single affordance. */
  label: string;
  /** The permitted values, each drawn as one option when segmented. */
  values: readonly (string | number)[];
  /** The device's current value, marked active or selected. */
  current: unknown;
  onSelect: (value: string | number) => void;
  /** The width, in CSS pixels, a sibling control reserves in the row. */
  reservedPx?: number;
  disabled?: boolean;
  /** Whether the control's last command failed — the whole control tints. */
  error?: boolean;
}): ReactNode {
  if (resolveEnumControlForm({ box, values, reservedPx }) === "segmented") {
    return (
      <>
        {values.map((permitted) => (
          <WallCardOption
            key={String(permitted)}
            label={String(permitted)}
            active={permitted === current}
            disabled={disabled}
            error={error}
            onClick={() => onSelect(permitted)}
          />
        ))}
      </>
    );
  }
  return (
    <WallCardDropdown
      label={label}
      value={current}
      values={values}
      onChange={onSelect}
      disabled={disabled}
      error={error}
    />
  );
}

/** Maps a pure observation token to Hearth's own token for the wall. */
const WALL_CARD_OBSERVATION_TOKENS: Record<DeviceTileObservationState["token"], string> = {
  "--danger": "--hearth-danger",
  "--on": "--hearth-on",
  "--stale": "--hearth-stale",
  "--text-muted": "--hearth-text-muted",
};

/** The observational glyph for a pure observation icon, drawn on its Hearth token. */
function ObservationGlyph({
  icon,
  size,
  token,
}: {
  icon: DeviceTileObservationIcon;
  size: number;
  token: string;
}): ReactNode {
  const style = { color: `var(${token})` };
  switch (icon) {
    case "plug-off":
      return <Unplug size={size} style={style} aria-hidden />;
    case "wifi":
      return <Wifi size={size} style={style} aria-hidden />;
    case "wifi-off":
      return <WifiOff size={size} style={style} aria-hidden />;
    case "clock":
      return <Clock size={size} style={style} aria-hidden />;
    default: {
      // A new icon variant must fail the build, not silently render nothing.
      const exhaustive: never = icon;
      return exhaustive;
    }
  }
}

/**
 * The device's observation as a quiet, non-textual indicator: glyph shape and
 * colour distinguish a push-backed, stale, and unreachable device.
 */
export function WallCardObservation({
  observation,
  size = 16,
}: {
  observation: DeviceTileObservationState;
  size?: number;
}): ReactNode {
  const token = WALL_CARD_OBSERVATION_TOKENS[observation.token];
  return (
    <span
      role="img"
      aria-label={observation.label}
      title={observation.label}
      style={{ display: "inline-flex", flex: "none", alignItems: "center" }}
    >
      <ObservationGlyph icon={observation.icon} size={size} token={token} />
    </span>
  );
}

/* ── The widget vocabulary ────────────────────────────────────────────────────
   What the wall draws outside a device card. */

/**
 * A widget's label — the ported primary line. `size` is the wall's own tier where a
 * caller needs one.
 */
export function WallCardLabel({
  children,
  size,
}: {
  children: ReactNode;
  /** The label's size — the ported primary size unless the caller names the wall's own tier. */
  size?: string;
}): ReactNode {
  return (
    <span
      style={{
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: "var(--hearth-text)",
        fontFamily: "var(--hearth-font-display)",
        fontSize: size ?? WALL_CARD_PRIMARY_FONT_SIZE,
        fontWeight: WALL_CARD_METRICS.primaryWeight,
        letterSpacing: `${WALL_CARD_METRICS.primaryTracking}px`,
      }}
    >
      {children}
    </span>
  );
}

/**
 * A widget's reading — the value a readout presents. The size is the caller's, so
 * the readout tiers stay the wall's own.
 */
export function WallCardReading({
  children,
  size = WALL_CARD_SECONDARY_FONT_SIZE,
}: {
  children: ReactNode;
  /** The reading's size — the caller's readout tier; the ported secondary size by default. */
  size?: string;
}): ReactNode {
  return (
    <p
      style={{
        margin: 0,
        minWidth: 0,
        whiteSpace: "nowrap",
        color: "var(--hearth-text)",
        fontFamily: "var(--hearth-font-display)",
        fontSize: size,
        fontWeight: "var(--hearth-weight-bold)",
        lineHeight: "var(--hearth-leading-tight)",
      }}
    >
      {children}
    </p>
  );
}

/**
 * The widget state item: a leading {@link WallCardIcon} beside a
 * {@link WallCardLabel} over a {@link WallCardReading}. Both slots are optional.
 */
export function WallCardStateItem({
  icon,
  label,
  reading,
  readingSize,
  tint,
}: {
  /** The leading affordance's glyph; omitted for a state item that leads with text alone. */
  icon?: ReactNode;
  label: ReactNode;
  /** The reading under the label; omitted for a head. */
  reading?: ReactNode;
  /** The reading's size — the caller's readout tier; the ported secondary size by default. */
  readingSize?: string;
  /** The leading glyph's colour token — the wall's muted foreground unless the caller names a state's own. */
  tint?: string;
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: `${WALL_CARD_METRICS.padding}px`,
        minWidth: 0,
      }}
    >
      {icon !== undefined && <WallCardIcon glyph={icon} tint={tint} />}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 0" }}>
        <WallCardLabel>{label}</WallCardLabel>
        {reading !== undefined && <WallCardReading size={readingSize}>{reading}</WallCardReading>}
      </div>
    </div>
  );
}

/**
 * The wall's ported control treatment: the ported control height and radius on the
 * raised surface, shared by the control and the route.
 */
function wallCardControlStyle(): CSSProperties {
  return {
    display: "inline-flex",
    flex: "none",
    alignItems: "center",
    justifyContent: "center",
    gap: `${WALL_CARD_METRICS.padding}px`,
    minWidth: WALL_CARD_METRICS.controlHeight,
    minHeight: WALL_CARD_METRICS.controlHeight,
    padding: `0 ${WALL_CARD_METRICS.padding}px`,
    boxSizing: "border-box",
    borderRadius: WALL_CARD_METRICS.controlRadius,
    border: "1px solid var(--hearth-hairline)",
    background: "var(--hearth-surface-raised)",
    color: "var(--hearth-text)",
    textDecoration: "none",
  };
}

/**
 * A labelled, touch-sized control — a scene's button, a room's batch command.
 */
export function WallCardControl({
  glyph,
  label,
  onClick,
  disabled,
}: {
  /** The control's glyph, drawn before its label. */
  glyph?: ReactNode;
  /** The control's own label, drawn as the ported primary line. */
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...wallCardControlStyle(),
        cursor: disabled ? "progress" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {glyph}
      <WallCardLabel>{label}</WallCardLabel>
    </button>
  );
}

/**
 * A route affordance — the link widget's target and the wall view's back link — the
 * ported control treatment carried by the router's own link.
 */
export function WallCardRoute({
  to,
  glyph,
  label,
  labelSize,
  style,
}: {
  /** The address the route opens, resolved by the router's own `wallPath`. */
  to: string;
  /** The route's glyph, drawn before its label. */
  glyph?: ReactNode;
  /** The route's own label, drawn as the ported primary line. */
  label: ReactNode;
  /** The label's size — the ported primary size unless the caller names the wall's own tier. */
  labelSize?: string;
  /** Where the route is placed, for a caller that overlays it on the composition. */
  style?: CSSProperties;
}): ReactNode {
  return (
    <Link to={to} style={{ ...wallCardControlStyle(), ...style }}>
      {glyph}
      <WallCardLabel size={labelSize}>{label}</WallCardLabel>
    </Link>
  );
}

/**
 * A contained explanation inside a widget's own area — the wall's one message form
 * for unconfigured, empty, or unavailable states.
 */
export function WallCardMessage({ children }: { children: ReactNode }): ReactNode {
  return (
    <p style={{ margin: 0, color: "var(--hearth-text-muted)", fontSize: WALL_BODY_FONT_SIZE }}>
      {children}
    </p>
  );
}
