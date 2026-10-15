/**
 * The shared device-card anatomy, ported from `piitaya/lovelace-mushroom`
 * (Apache-2.0) into Hearth (design.md D1, D2, D7; specs/wall-display "Wall
 * Device Presentation" — "A card presents the ported anatomy" — and "Touch
 * Operation"). Every typed device card is composed from these four parts, so the
 * catalogue reads as one designed system rather than eight independent tiles:
 *
 * - {@link WallCardIcon} — the leading circular icon affordance: a glyph on a
 *   tinted shape of the device's own colour (Mushroom `src/shared/shape-icon.ts`),
 *   the on/off control where the device has one;
 * - {@link WallCardText} — the device's name over its state or primary reading
 *   (Mushroom `src/shared/state-item.ts`);
 * - {@link WallCardActions} — the single actions row carrying the active control
 *   and the affordances for the device's other controls (Mushroom
 *   `src/utils/card-styles.ts`);
 * - {@link WallCardSlider} — the value control: a bar of a track at the ported
 *   radius with a bar thumb, the fill over a 20 %-alpha field of the control's
 *   own colour (Mushroom `src/shared/slider.ts`).
 *
 * Two parts the typed cards also share sit alongside those four: the icon
 * affordance's sibling {@link WallCardIconButton} — a touch-sized icon control
 * for a device's other controls and a cover's discrete transport — and
 * {@link WallCardObservation}, the quiet non-textual indicator that still
 * distinguishes a push-backed, polled, and unreachable device (specs/wall-display
 * "Observation is a quiet indicator").
 *
 * Every metric comes from {@link WALL_CARD_METRICS} (mirrored by the
 * `--hearth-card-*` tokens in `wall/hearth.css`), and the device colour from
 * {@link improveColorContrast} — never a repeated literal. The interactive
 * controls are sized to the ported control height, which is the wall's touch
 * target (design.md D4); a card's own colour is an accent on the affordance that
 * sets it, never a card or panel surface (specs/wall-display "Wall Visual
 * Language").
 *
 * Wall-chunk only: imported by the typed cards under `wall/cards/`, so it lands
 * in the lazy wall chunk and never in first paint (design.md D10).
 */
import { Clock, Unplug, Wifi, WifiOff } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type {
  DeviceTileObservationIcon,
  DeviceTileObservationState,
} from "../../lib/device-tile-state.js";
import { WALL_BAND_FONT_SIZE } from "../type-ramp.js";
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
 * The fraction of a slider's track that is filled for `value`, clamped to
 * `[0, 1]`. Pure and DOM-free so the drawn fill is reachable by `bun test`; a
 * range whose bounds collapse (`max <= min`) reads as empty rather than dividing
 * by zero.
 */
export function sliderFraction(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * The leading icon affordance: a glyph on a circular, tinted shape of the
 * device's own colour (or the wall's own surface when it reports none). Where
 * the device has an on/off action, `onActivate` makes the whole affordance the
 * control — sized to the ported control height, so its touch target is met even
 * though the visible shape is the smaller icon size (specs/wall-display "Touch
 * Operation"). The glyph's fill as well as its colour carries the on/off state
 * ("Wall Visual Language" — state is never colour alone).
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
   * colour (Mushroom's own on/off treatment): the glyph's colour when the device
   * reports no colour of its own, so an entity card's `on` glyph is still
   * distinguishable from its `off` one by colour as well as by fill.
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
  // The device's own colour is drawn only while the device is on; an off device
  // falls back to the wall's surface, and to its state token where it has one.
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
        // The affordance is the card's own control: a card that also actuates
        // on a whole-surface tap must not fire twice for one press, so the
        // control's press never bubbles to it (the established wall pattern).
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
 * The device's name over its state or primary reading (Mushroom
 * `src/shared/state-item.ts`), on the ported primary/secondary type. The caller
 * shortens the name for a narrow card (specs/wall-display "A name is shortened,
 * not truncated") and supplies the reading, value and unit together.
 *
 * `prominent` is the read-only composition (specs/wall-display "A sensor is
 * read-only"; design.md D2, D3): the reading is the card's dominant content, so
 * the name takes the quiet secondary tier and the reading the wall's own group
 * readout tier ({@link WALL_BAND_FONT_SIZE}) rather than the ported secondary
 * size — the reading, not the name, is what is read at a distance from a
 * device with no control.
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
 * The card's single actions row (Mushroom `src/utils/card-styles.ts`): the
 * active control and the affordances for the device's other controls, spaced by
 * the ported control spacing so a touch intended for one cannot plausibly
 * activate its neighbour (specs/wall-display "Adjacent controls are separated").
 * The top padding is dropped, so the row sits directly under the state item's
 * own padding.
 */
export function WallCardActions({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: `${WALL_CARD_METRICS.controlSpacing}px`,
        padding: `${WALL_CARD_METRICS.controlSpacing}px`,
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
 * A value control embedded in a card's actions row (Mushroom
 * `src/shared/slider.ts`): a track at the ported radius with a bar thumb, filled
 * with the control's own colour over a 20 %-alpha field of it (the wall's accent
 * when the device reports none). A native `<input type="range">` carries the
 * interaction — touch and keyboard alike — and `hearth.css` redraws only its
 * chrome, so the control keeps the ported slider height as its touch target and
 * needs no bespoke pointer implementation.
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
  // The fill ends at the value's fraction of the track — Mushroom's own active
  // track, which runs to the full width rather than stopping short of the thumb.
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
 * A touch-sized icon control (design.md D2; specs/wall-display "Touch
 * Operation"). The light card uses it for the controls that are not currently
 * expanded — its colour-temperature and colour affordances beside the active
 * slider — and the cover card for its discrete transport, so a control that is
 * not a value still meets the ported control height and needs no hover. Its
 * error tint is the card's inline failure surface: a rejected command colours
 * the affordance that issued it rather than opening a tooltip.
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
 * A touch-sized, labelled option control (design.md D2, D6; specs/wall-display
 * "Touch Operation" — "Controls are touch-sized"). An enumerated control — a
 * select's permitted values, a fan's presets, a climate's mode — is drawn as one
 * affordance per permitted value rather than as a value control, each at the
 * ported control height and radius and spaced by the actions row's control
 * spacing so a touch intended for one cannot plausibly activate its neighbour.
 * The current value is marked active; the affordance that issued a rejected
 * command carries the card's inline error tint, exactly as the icon button does.
 *
 * Its label is bounded by {@link WALL_CARD_CONTROL_MAX_WIDTH_PX} (the ported
 * control height) with an ellipsis, and it is drawn at that bound — so an option
 * control is the same touch-sized square an icon control is, and a row of options
 * is bounded exactly as a row of icon controls. It never shrinks below the bound:
 * an enumerated control that declares more values than its row holds is drawn as
 * {@link WallCardEnumControl}'s single affordance instead, so an option is never
 * squeezed below the wall's touch target and an option row can never overflow its
 * card (specs/wall-display "A card's content fits its span", "Touch Operation").
 * The bound is what makes the widest control row a finite number, and so what
 * `wall/grid.ts`'s minimum device column span is derived from.
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
 * An enumerated control's single affordance (design.md D2, D6; specs/wall-display
 * "Touch Operation"): a native `<select>` listing every permitted value. It is
 * drawn in place of {@link WallCardOption}'s segmented row when an enumerated
 * control declares more values than fit the box the card was given, so every
 * value stays reachable without an option shrinking below the wall's touch
 * target. A native select is operable by touch and by keyboard with no hover, and
 * `hearth.css` styles only its Hearth chrome; it is flexible down to the ported
 * control height — the touch target — and never overflows the row.
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
        // Hand the control its permitted value back in its own type — a select's
        // DOM value is always a string, but a device may declare numbers.
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
 * permitted-value set (design.md D2, D3, D6; specs/wall-display "Touch
 * Operation", "A card's content fits its span"). It chooses its own form from the
 * box the card was given — never a render-time measurement: a segmented row of
 * {@link WallCardOption}s while every value fits at the wall's touch target, else
 * {@link WallCardDropdown}'s single control carrying them all. The chosen
 * affordance is placed directly in a {@link WallCardActions} row, so a select
 * card, a climate's mode, and a fan's presets all present the same control and no
 * option is ever squeezed below the touch target.
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

/** Maps a pure observation token to Hearth's own token for the wall (design.md D1, D7). */
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
 * The device's observation as a quiet, non-textual indicator (specs/wall-display
 * "Observation is a quiet indicator"; design.md D5, D9). The glyph's shape and
 * colour still distinguish a push-backed, a polled/stale, and an unreachable
 * device without any colour at all, and the label is retained as the accessible
 * name and tooltip rather than as text competing with the card's control or
 * readout. The encoding itself is the shared pure {@link deviceTileObservation},
 * so the wall cannot drift from the dashboard's own.
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
