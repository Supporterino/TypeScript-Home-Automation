/**
 * Ambient Glass design-system primitives.
 *
 * The runtime stylesheet (`./styles/tokens.css`) is the shipped source of the
 * color tokens; this module holds the values the Mantine theme and the
 * build-time tests need in a directly importable form (design.md D1).
 *
 * Keep the palette in sync with `design-system/ts-ha/MASTER.md` — the theme
 * test asserts the two agree where they overlap.
 */

/** Self-hosted display face — headings and numeric readouts. */
export const DISPLAY_FONT_FAMILY =
  '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, sans-serif';

/** Body/UI text — system stack, no download cost. */
export const BODY_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Identifiers, state keys, execution source — never prose. */
export const MONO_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

/** Mantine's stock primary blue — the anti-pattern token tests guard against. */
export const MANTINE_DEFAULT_PRIMARY = "#228be6";

/**
 * Sky scale for the Ambient Glass interactive accent. Index 4 is the dark
 * scheme accent (`#38BDF8`) and index 6 the light scheme accent (`#0284C7`),
 * matching `--info` in each scheme in MASTER.md.
 */
export const AMBIENT_COLORS = [
  "#F0F9FF",
  "#E0F2FE",
  "#BAE6FD",
  "#7DD3FC",
  "#38BDF8",
  "#0EA5E9",
  "#0284C7",
  "#0369A1",
  "#075985",
  "#0C4A6E",
] as const;

/** Corner radii: tiles 14px, pills 999px, inputs 10px. */
export const AMBIENT_RADII = {
  xs: "4px",
  sm: "8px",
  md: "10px",
  lg: "14px",
  xl: "24px",
} as const;

/** Three soft elevation levels (MASTER.md). */
export const AMBIENT_ELEVATION = {
  e0: "none",
  e1: "0 1px 2px rgba(0,0,0,.24)",
  e2: "0 8px 24px rgba(0,0,0,.32)",
} as const;

/** Motion timings; all non-essential motion is suppressed under reduced motion. */
export const AMBIENT_MOTION = {
  enterMs: 180,
  enterTranslatePx: 8,
  staggerMs: 40,
  toggleMs: 120,
  easing: "cubic-bezier(.2,.8,.2,1)",
} as const;

/** Room accent palette — assigned by stable hash of room id (header rail only). */
export const ROOM_ACCENTS = {
  coral: "#FB7185",
  amber: "#FBBF24",
  teal: "#2DD4BF",
  violet: "#A78BFA",
  lime: "#A3E635",
  sky: "#38BDF8",
} as const;

export type RoomAccent = keyof typeof ROOM_ACCENTS;
