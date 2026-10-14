/**
 * The shared Hearth card vocabulary (design.md D11; specs/wall-display "Widget
 * Catalog", "Touch Operation"). Every wall widget is composed from one card
 * frame — a leading glyph, a title, a primary metric on the wall ramp, and a
 * single action-affordance slot — so the surface reads as one designed whole
 * rather than each widget inventing its own layout.
 *
 * Ambient readouts (clock, weather, energy, status, temperature) use the
 * chrome-less {@link WallCardStat}; control widgets (room, favorites, scene)
 * compose {@link WallCardHead} and the {@link WallCardAffordance} slot. Every
 * token here is Hearth's own (`var(--hearth-*)`) — never a Lumen alias or a
 * literal colour (design.md D1, D2), and the control floors come from the wall
 * registry ({@link wallControlGapPx}) and the wall scale ({@link WallButton})
 * rather than a repeated literal.
 *
 * Wall-chunk only: imported by the widget renderers, so it never reaches first
 * paint. {@link WALL_MIN_CONTROL_GAP} is read inside {@link wallControlGapPx}
 * rather than at module scope because the registry imports every widget
 * renderer, which import this module — a top-level read would be a
 * temporal-dead-zone error on that cycle. The value is a constant, so the
 * deferred read is stable.
 */
import type { CSSProperties, ReactNode } from "react";
import { WALL_MIN_CONTROL_GAP } from "../registry.js";
import { wallTileMetrics } from "../scale.js";
import {
  WALL_BODY_FONT_SIZE,
  WALL_HERO_FONT_SIZE,
  WALL_LABEL_FONT_SIZE,
  WALL_METRIC_FONT_SIZE,
} from "../type-ramp.js";

/** The leading glyph's icon side, in CSS pixels — sized for a distance read. */
export const WALL_CARD_GLYPH_SIZE = 24;

/**
 * The gap the vocabulary keeps between two adjacent controls, in CSS pixels.
 * Read from the wall's single {@link WALL_MIN_CONTROL_GAP} floor
 * (specs/wall-display "Adjacent controls are separated").
 */
export function wallControlGapPx(): number {
  return WALL_MIN_CONTROL_GAP;
}

/** The leading glyph on a card: an icon that names the widget. Never the sole state channel. */
export function WallCardGlyph({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "flex",
        flex: "none",
        alignItems: "center",
        color: color ?? "var(--hearth-text-muted)",
      }}
    >
      {children}
    </span>
  );
}

/** A card's title/label on the wall's label tier. */
export function WallCardLabel({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: color ?? "var(--hearth-text-muted)",
        fontSize: WALL_LABEL_FONT_SIZE,
        fontWeight: "var(--hearth-weight-semibold)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

/** A card's primary metric, on the wall's metric ramp (or the hero tier). */
export function WallCardMetric({
  children,
  color,
  size = "metric",
}: {
  children: ReactNode;
  color?: string;
  size?: "hero" | "metric";
}) {
  return (
    <p
      style={{
        margin: 0,
        color: color ?? "var(--hearth-text)",
        fontFamily: "var(--hearth-font-display)",
        fontSize: size === "hero" ? WALL_HERO_FONT_SIZE : WALL_METRIC_FONT_SIZE,
        fontWeight: "var(--hearth-weight-bold)",
        lineHeight: "var(--hearth-leading-tight)",
      }}
    >
      {children}
    </p>
  );
}

/**
 * An ambient readout: a leading glyph and label over the metric, chrome-less on
 * the panel. The card's metric slot is the widget's own primary value.
 */
export function WallCardStat({
  icon,
  label,
  color,
  metricColor,
  size = "metric",
  children,
}: {
  icon: ReactNode;
  label: ReactNode;
  /** The glyph's colour; defaults to the muted foreground. */
  color?: string;
  /** The metric's colour; defaults to the card foreground. */
  metricColor?: string;
  size?: "hero" | "metric";
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--hearth-space-1)",
        minWidth: 0,
      }}
    >
      <span
        style={{ display: "flex", alignItems: "center", gap: "var(--hearth-space-2)", minWidth: 0 }}
      >
        <WallCardGlyph color={color}>{icon}</WallCardGlyph>
        <WallCardLabel>{label}</WallCardLabel>
      </span>
      <WallCardMetric color={metricColor} size={size}>
        {children}
      </WallCardMetric>
    </div>
  );
}

/** A control card's header: a leading glyph and the title. */
export function WallCardHead({
  icon,
  title,
  color,
}: {
  icon: ReactNode;
  title: ReactNode;
  color?: string;
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "var(--hearth-space-2)", minWidth: 0 }}
    >
      <WallCardGlyph color={color}>{icon}</WallCardGlyph>
      <WallCardLabel>{title}</WallCardLabel>
    </div>
  );
}

/**
 * The single action-affordance slot of a control card — the one place its
 * controls live, spaced by the wall's ≥8 px adjacent-control floor so a touch
 * intended for one cannot plausibly activate its neighbour.
 */
export function WallCardAffordance({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: `${wallControlGapPx()}px`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The touch-sized Hearth affordance a wall card's control or route draws: a pill
 * on the raised surface with a hairline border, at least the wall's minimum touch
 * target in *both* directions (design.md D4; specs/wall-display "Touch
 * Operation"). {@link WallButton} draws it as a button and a route affordance
 * draws it as a link (the link widget, design.md D11), so a control and a route
 * cannot drift apart visually. The minimum side matters for an icon-only
 * affordance, which would otherwise fall under the wall's touch target.
 */
export function wallAffordanceStyle(): CSSProperties {
  const target = wallTileMetrics("wall").control;
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--hearth-space-2)",
    minHeight: target,
    minWidth: target,
    padding: "0 var(--hearth-space-4)",
    borderRadius: "var(--hearth-radius-pill)",
    border: "1px solid var(--hearth-hairline)",
    background: "var(--hearth-surface-raised)",
    color: "var(--hearth-text)",
    fontFamily: "var(--hearth-font-display)",
    fontSize: WALL_BODY_FONT_SIZE,
    fontWeight: "var(--hearth-weight-semibold)",
  };
}

/**
 * A wall control: a touch-sized, Hearth-token button (its minimum side is the
 * wall's {@link wallTileMetrics} target, design.md D4).
 */
export function WallButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...wallAffordanceStyle(),
        cursor: disabled ? "progress" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** A contained explanation inside a widget's own area (unconfigured, empty, or unavailable). */
export function WallCardMessage({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, color: "var(--hearth-text-muted)", fontSize: WALL_BODY_FONT_SIZE }}>
      {children}
    </p>
  );
}
