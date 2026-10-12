/**
 * Wall tile scaling (design.md D7; specs/wall-display "Touch Operation").
 *
 * A wall presents exactly the device tile every other collection uses — there
 * is no second device presentation — only larger, so its interactive controls
 * meet the wall's minimum touch target. This module owns the pure size-token →
 * metrics mapping, keeping the interactive-control dimension a single,
 * testable value rather than a literal scattered across the tile.
 *
 * Deliberately dependency-free: the shared {@link DeviceTile} imports this on
 * first paint, so it must never reach the lazy wall registry or widgets. Its
 * only import is {@link ./type-ramp.js}, itself pure constants.
 */
import { WALL_BODY_FONT_SIZE } from "./type-ramp.js";

/** A wall tile's size token. The default preserves the tile's ordinary rendering exactly. */
export type WallTileSize = "default" | "wall";

export interface WallTileMetrics {
  /** Minimum interactive-control side, in CSS pixels. */
  control: number;
  /** Mantine size token for the tile's embedded form controls. */
  controlSize: "sm" | "md" | "lg";
  /** Mantine padding token for the tile's paper. */
  padding: "sm" | "md";
}

/**
 * Interactive-control metrics for a size token. The `wall` token enlarges the
 * control to meet {@link WALL_MIN_TOUCH_TARGET}; the default reproduces the
 * tile's existing desktop scale.
 */
export function wallTileMetrics(size: WallTileSize = "default"): WallTileMetrics {
  if (size === "wall") {
    return { control: 48, controlSize: "lg", padding: "md" };
  }
  return { control: 32, controlSize: "sm", padding: "sm" };
}

/**
 * Which affordances a device tile presents, keyed by size token (design.md D4,
 * D7; specs/wall-display "Wall Device Presentation"; specs/web-ui "Device Tile
 * Presentation"). Only affordance visibility and the tap target differ between
 * the presentations — the capability ranking, optimistic override, state
 * encoding, and actuation semantics are the single shared implementation in
 * {@link DeviceTile}, never forked per presentation.
 */
export interface DeviceTilePresentation {
  /** The favorite star toggle — a device-management affordance. */
  favorite: boolean;
  /** The hide/unhide toggle — a device-management affordance. */
  visibility: boolean;
  /** The explicit "Details" affordance that opens the device detail view. */
  detail: boolean;
  /** Whether a read-only tile navigates to detail when the whole card is activated. */
  readOnlyNavigation: boolean;
  /** Whether the whole card is the actuation target for an actuatable device. */
  wholeCardActuation: boolean;
}

/**
 * The tile presentation for a size token. The dashboard token presents the
 * favorite toggle, the hide/unhide toggle, and the explicit detail affordance,
 * and a read-only tile navigates on whole-card activation. The wall token is a
 * kiosk presentation: no management or detail affordances, no read-only
 * navigation, and the whole card actuates an operable device (design.md D4).
 */
export function deviceTilePresentation(size: WallTileSize = "default"): DeviceTilePresentation {
  if (size === "wall") {
    return {
      favorite: false,
      visibility: false,
      detail: false,
      readOnlyNavigation: false,
      wholeCardActuation: true,
    };
  }
  return {
    favorite: true,
    visibility: true,
    detail: true,
    readOnlyNavigation: true,
    wholeCardActuation: false,
  };
}

/**
 * A device tile's text sizes, keyed by size token (design-system/ts-ha/pages/
 * wall.md "Type ramp"). The wall token meets the distance-readable 16px floor;
 * the dashboard token reproduces the tile's existing sizes exactly.
 */
export interface DeviceTileText {
  /** The on/off and observation chip label size. */
  chip: string;
  /** Secondary/body text size (readouts, empty-state copy). */
  body: string;
}

/**
 * Resolves the tile's text sizes. The dashboard token returns the existing
 * Mantine sizes unchanged (`xs` chip, `sm` body); the wall token returns the
 * ramp's 16px body floor, so no wall tile text falls below it.
 */
export function deviceTileText(size: WallTileSize = "default"): DeviceTileText {
  if (size === "wall") {
    return { chip: WALL_BODY_FONT_SIZE, body: WALL_BODY_FONT_SIZE };
  }
  return { chip: "xs", body: "sm" };
}

/**
 * Whether a device tile renders its observation as a visible label (with the
 * polled age), keyed by size token. The wall demotes the observation to a
 * non-textual indicator — glyph only, label retained as `title`/`aria-label`
 * (design.md D5; specs/wall-display "Observation is a quiet indicator"). The
 * dashboard keeps the visible label, including a polled device's age, as the
 * unmodified web-ui capability requires (specs/web-ui "A tile MUST indicate ...
 * the age of the observation when polled"). Unlike {@link deviceTilePresentation}
 * this only changes the label's visibility, never the state encoding.
 */
export function deviceTileObservationText(size: WallTileSize = "default"): boolean {
  return size !== "wall";
}
