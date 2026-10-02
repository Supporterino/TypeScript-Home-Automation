/**
 * Nanoleaf local HTTP API types.
 *
 * Covers the Nanoleaf OpenAPI for Light Panels, Canvas, and Shapes.
 * Base URL: http://<host>:16021/api/v1/<auth_token>/
 *
 * Supported devices:
 * - Nanoleaf Light Panels (Aurora)
 * - Nanoleaf Canvas
 * - Nanoleaf Shapes (Hexagons, Triangles, Mini Triangles)
 * - Nanoleaf Elements
 * - Nanoleaf Lines
 *
 * API reference: https://forum.nanoleaf.me/docs
 */

// ---------------------------------------------------------------------------
// State value wrappers (Nanoleaf API format)
// ---------------------------------------------------------------------------

/** A simple boolean value wrapper. */
export interface NanoleafBoolValue {
  value: boolean;
}

/** A numeric value with min/max range (returned by GET). */
export interface NanoleafRangeValue {
  value: number;
  max: number;
  min: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Color mode reported by the device. */
export type NanoleafColorMode = "ct" | "hs" | "effect";

/**
 * Full state response from GET /.
 */
export interface NanoleafState {
  on: NanoleafBoolValue;
  brightness: NanoleafRangeValue;
  hue: NanoleafRangeValue;
  sat: NanoleafRangeValue;
  ct: NanoleafRangeValue;
  colorMode: NanoleafColorMode;
}

/**
 * State set command (PUT /state).
 * All fields optional — set only what you want to change.
 * Multiple properties can be set in a single request.
 */
export interface NanoleafStateSet {
  on?: { value: boolean };
  brightness?: { value: number; duration?: number } | { increment: number };
  hue?: { value: number } | { increment: number };
  sat?: { value: number } | { increment: number };
  ct?: { value: number } | { increment: number };
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** HSB color used in effect palettes. */
export interface NanoleafPaletteColor {
  hue: number;
  saturation: number;
  brightness: number;
}

/** Range with min/max for effect timing parameters. */
export interface NanoleafRange {
  minValue: number;
  maxValue: number;
}

/** Animation type for custom effects. */
export type NanoleafAnimType =
  | "random"
  | "flow"
  | "wheel"
  | "fade"
  | "highlight"
  | "custom"
  | "extControl";

/**
 * Custom effect definition for PUT /effects { write: ... }.
 */
export interface NanoleafEffect {
  command: "display" | "request";
  animName?: string;
  animType: NanoleafAnimType;
  colorType?: "HSB";
  animData?: string | null;
  palette?: NanoleafPaletteColor[];
  brightnessRange?: NanoleafRange;
  transTime?: NanoleafRange;
  delayTime?: NanoleafRange;
  loop?: boolean;
  extControlVersion?: "v2";
}

// ---------------------------------------------------------------------------
// Panel layout
// ---------------------------------------------------------------------------

/**
 * Shape types for panel identification.
 * 0 = triangle (Light Panels), 2 = square (Canvas),
 * 7 = hexagon (Shapes), 8 = triangle (Shapes),
 * 9 = mini triangle (Shapes), 12 = lines connector.
 */
export type NanoleafShapeType = 0 | 1 | 2 | 3 | 7 | 8 | 9 | 12;

/** Position data for a single panel. */
export interface NanoleafPanelPosition {
  panelId: number;
  x: number;
  y: number;
  /** Orientation in degrees. */
  o: number;
  shapeType: NanoleafShapeType;
}

/** Full panel layout response from GET /panelLayout/layout. */
export interface NanoleafPanelLayout {
  numPanels: number;
  sideLength: number;
  positionData: NanoleafPanelPosition[];
}

// ---------------------------------------------------------------------------
// Device info
// ---------------------------------------------------------------------------

/**
 * Full device info response from GET /.
 */
export interface NanoleafDeviceInfo {
  name: string;
  serialNo: string;
  manufacturer: string;
  firmwareVersion: string;
  hardwareVersion: string;
  model: string;
  state: NanoleafState;
  effects: {
    select: string;
    effectsList: string[];
  };
  panelLayout: {
    layout: NanoleafPanelLayout;
    globalOrientation: NanoleafRangeValue;
  };
  rhythm?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Response from POST /api/v1/new (auth token generation). */
export interface NanoleafAuthResponse {
  auth_token: string;
}
