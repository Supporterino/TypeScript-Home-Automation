/**
 * The harness's document-to-document contract: the typed messages the panel and stage
 * exchange across their same-origin boundary.
 */
import type { WallProfileConfig, WallWidget } from "@ts-ha/shared";
import { wallProfileConfigSchema, wallWidgetSchema } from "@ts-ha/shared/wall-schema";
import { WALL_DEVICE_CLASSES, type WallDeviceClass } from "../cards/device-class.js";
import type { WallCardForm, WallWidgetTier } from "../span.js";

/** The panel the stage is laid out for. */
export type HarnessPanel = "landscape" | "portrait";

/** Which surface the stage document shows. */
export type HarnessMode = "stage" | "bench";

/** Which Hearth scheme the wall renders in. */
export type HarnessTheme = "dark" | "light";

export const HARNESS_MODES: readonly HarnessMode[] = ["stage", "bench"];
export const HARNESS_THEMES: readonly HarnessTheme[] = ["dark", "light"];
export const HARNESS_TIERS: readonly WallWidgetTier[] = ["compact", "regular", "roomy"];
export const HARNESS_CARD_FORMS: readonly WallCardForm[] = ["compact", "full"];

/**
 * Each panel's real layout size, in CSS pixels — the stage `<iframe>`'s own layout size.
 */
export const HARNESS_PANEL_SIZES: Readonly<
  Record<HarnessPanel, { readonly width: number; readonly height: number }>
> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
};

/**
 * The fixture devices the panel can select, by device class — the roster the fixture set
 * carries one of per class.
 */
export const HARNESS_DEVICE_KEYS: readonly WallDeviceClass[] = WALL_DEVICE_CLASSES;

/**
 * The fixture controls the panel exposes. Every field is a plain value so it survives
 * structured cloning.
 */
export interface HarnessFixtureControls {
  /** Which device-class device the controls below apply to. */
  device: WallDeviceClass;
  /** Whether that device is in the store's map at all; `false` is the missing-device path. */
  devicePresent: boolean;
  /** Whether the selected device reports its on/off as on, where it declares one. */
  on: boolean;
  /** The selected device's brightness, as a percentage of its declared range. */
  brightnessPercent: number;
  /** The selected device's colour temperature, as a percentage of its declared range. */
  colorTempPercent: number;
  /** The selected device's temperature reading, in degrees Celsius. */
  temperature: number;
  /** Whether the weather reading is supplied to the store; `false` is the widget's own fetch. */
  weather: boolean;
  /** Whether the energy reading is supplied to the store; `false` is the widget's own fetch. */
  energy: boolean;
}

/**
 * The controls the harness opens with: the full light selected and present, every
 * reading supplied.
 */
export const DEFAULT_FIXTURE_CONTROLS: HarnessFixtureControls = {
  device: "light",
  devicePresent: true,
  on: true,
  brightnessPercent: 70,
  colorTempPercent: 50,
  temperature: 21.5,
  weather: true,
  energy: true,
};

/** The message type tag the panel sends the stage. */
export const HARNESS_UPDATE = "harness:update";

/** The message type tag the stage sends the panel once it is mounted. */
export const HARNESS_READY = "harness:ready";

/**
 * The bench's hand-set inputs, exactly the props `WidgetFrame` would resolve and pass
 * to the renderer.
 */
export interface HarnessBenchControls {
  /**
   * The widget the bench renders directly, or `null` when the draft has no widget to
   * bench.
   */
  widget: WallWidget | null;
  /** What the wall would pass as `contained` for this type — `wallFrameDrawsSurface`. */
  contained: boolean;
  tier: WallWidgetTier;
  cardForm: WallCardForm;
  /** The renderer's own box height, hand-set. */
  rendererHeightPx: number;
  /** The panel's resolved row unit — `wallGridMetrics(panelHeight, widgets).rowUnit`. */
  rowUnit: number;
}

/** A panel-to-stage update: what the stage shows and every input behind it. */
export interface HarnessUpdate {
  type: typeof HARNESS_UPDATE;
  mode: HarnessMode;
  theme: HarnessTheme;
  /**
   * The draft composition the stage renders, or `null` when the panel's draft is not
   * a profile the shared schema accepts.
   */
  config: WallProfileConfig | null;
  fixtures: HarnessFixtureControls;
  bench: HarnessBenchControls;
}

/** The stage's announcement that it is mounted, so the panel can send what it already holds. */
export interface HarnessReady {
  type: typeof HARNESS_READY;
}

const MESSAGE_ORIGIN = () => window.location.origin;

/** Clamps a control percentage into its range, or `null` when it is not a usable number. */
function parsePercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

/** Reads a finite number, or `null` when the value is not one. */
function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads one of `allowed`, or `null` when the value is not a member. */
function parseMember<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : null;
}

/** Reads the fixture controls out of an arriving message, or `null` when any field is unusable. */
function parseFixtureControls(value: unknown): HarnessFixtureControls | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const device = candidate.device as WallDeviceClass;
  if (!HARNESS_DEVICE_KEYS.includes(device)) return null;
  for (const flag of ["devicePresent", "on", "weather", "energy"] as const) {
    if (typeof candidate[flag] !== "boolean") return null;
  }
  const brightnessPercent = parsePercent(candidate.brightnessPercent);
  const colorTempPercent = parsePercent(candidate.colorTempPercent);
  const temperature = candidate.temperature;
  if (brightnessPercent === null || colorTempPercent === null) return null;
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) return null;

  return {
    device,
    devicePresent: candidate.devicePresent as boolean,
    on: candidate.on as boolean,
    brightnessPercent,
    colorTempPercent,
    temperature,
    weather: candidate.weather as boolean,
    energy: candidate.energy as boolean,
  };
}

/**
 * Parses a stage update, returning `null` for anything else. A `config` the shared
 * profile schema refuses is returned as `config: null`.
 */
export function parseHarnessUpdate(data: unknown): HarnessUpdate | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as {
    type?: unknown;
    mode?: unknown;
    theme?: unknown;
    config?: unknown;
    fixtures?: unknown;
    bench?: unknown;
  };
  if (candidate.type !== HARNESS_UPDATE) return null;

  const mode = parseMember(candidate.mode, HARNESS_MODES);
  const theme = parseMember(candidate.theme, HARNESS_THEMES);
  if (mode === null || theme === null) return null;

  const config = wallProfileConfigSchema.safeParse(candidate.config);

  const fixtures = parseFixtureControls(candidate.fixtures);
  if (fixtures === null) return null;

  const bench = parseBenchControls(candidate.bench);
  if (bench === null) return null;

  return {
    type: HARNESS_UPDATE,
    mode,
    theme,
    config: config.success ? config.data : null,
    fixtures,
    bench,
  };
}

/** Reads the bench's hand-set inputs, or `null` when any of them is unusable. */
function parseBenchControls(value: unknown): HarnessBenchControls | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;

  // The bench renders exactly this widget, validated by the shared widget schema.
  const widget = candidate.widget === null ? null : wallWidgetSchema.safeParse(candidate.widget);
  if (widget !== null && !widget.success) return null;

  const tier = parseMember(candidate.tier, HARNESS_TIERS);
  const cardForm = parseMember(candidate.cardForm, HARNESS_CARD_FORMS);
  const rendererHeightPx = parseNumber(candidate.rendererHeightPx);
  const rowUnit = parseNumber(candidate.rowUnit);
  if (tier === null || cardForm === null) return null;
  if (rendererHeightPx === null || rowUnit === null) return null;
  if (typeof candidate.contained !== "boolean") return null;

  return {
    widget: widget === null ? null : widget.data,
    contained: candidate.contained,
    tier,
    cardForm,
    rendererHeightPx,
    rowUnit,
  };
}

/** Whether an arriving message is the stage's readiness announcement. */
export function isHarnessReady(data: unknown): data is HarnessReady {
  return (
    typeof data === "object" && data !== null && (data as { type?: unknown }).type === HARNESS_READY
  );
}

/** Sends the current draft and fixture controls to the stage document. */
export function sendHarnessUpdate(target: Window | null | undefined, update: HarnessUpdate): void {
  // Addressed to this origin only: the stage is same-origin by construction.
  target?.postMessage(update, MESSAGE_ORIGIN());
}

/** Announces to the panel that the stage document is mounted. */
export function sendHarnessReady(): void {
  if (window.parent === window) return;
  window.parent.postMessage({ type: HARNESS_READY }, MESSAGE_ORIGIN());
}

/**
 * A stable identity for one set of fixture controls, so the stage remounts the provider
 * when it changes.
 */
export function fixtureControlsKey(controls: HarnessFixtureControls): string {
  return JSON.stringify(controls);
}

/** What the stage document is showing: the last update, and the last accepted composition. */
export interface StageState {
  readonly update: HarnessUpdate | null;
  /** The composition the stage renders, or `null` before one has been accepted. */
  readonly config: WallProfileConfig | null;
}

/** The stage's state before the panel has sent anything. */
export const EMPTY_STAGE_STATE: StageState = { update: null, config: null };

/**
 * Folds one accepted update into the stage's state. Every field applies while the
 * composition only moves when the schema accepted one.
 */
export function applyHarnessUpdate(current: StageState, next: HarnessUpdate): StageState {
  return { update: next, config: next.config ?? current.config };
}
