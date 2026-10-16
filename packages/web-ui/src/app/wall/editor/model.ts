/**
 * Pure wall-profile editor logic: every mutation the editor performs, plus the save
 * path that validates a draft before it reaches the API.
 */
import {
  type DeviceDescriptor,
  WALL_GRID_COLUMNS,
  WALL_GRID_MAX_ROWS,
  WALL_PROFILE_VERSION,
  type WallProfile,
  type WallProfileConfig,
  type WallWidget,
  type WallWidgetType,
} from "@ts-ha/shared";
import { wallProfileSchema } from "@ts-ha/shared/wall-schema";
import { deviceCanDriveClass, type WallDeviceClass } from "../cards/device-class.js";
import { widgetTitle } from "../frame.js";
import {
  getWidgetDescriptor,
  WALL_WIDGET_REGISTRY,
  type WallWidgetDescriptor,
  type WallWidgetSpan,
} from "../registry.js";
import { boundDeviceReadOnly, resolveEffectiveMin } from "../slim.js";
import { deviceGridIds } from "../widgets/device-grid-model.js";
import { resolveDraftPreview } from "./preview.js";

/** A widget's absolute placement on the grid. */
export interface WallPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The outcome of validating a draft profile: the parsed profile, or its errors. */
export type WallDraftValidation =
  | { ok: true; profile: WallProfile }
  | { ok: false; errors: string[] };

/** A freshly created profile's composition — no widgets. */
export function emptyWallConfig(): WallProfileConfig {
  return { widgets: [] };
}

function overlaps(a: WallPlacement, b: WallPlacement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** A stable, unique-in-layout id for a new widget of `type`. */
function nextWidgetId(widgets: readonly WallWidget[], type: WallWidgetType): string {
  const used = new Set(widgets.map((widget) => widget.id));
  let n = 1;
  while (used.has(`${type}-${n}`)) n += 1;
  return `${type}-${n}`;
}

/**
 * The first top-left cell where a `{w, h}` span overlaps no existing widget, scanning
 * rows top-to-bottom and cells left-to-right.
 */
function findFreePosition(
  widgets: readonly WallWidget[],
  w: number,
  h: number,
): { x: number; y: number } {
  const bottom = widgets.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0);
  const lastRow = Math.max(0, WALL_GRID_MAX_ROWS - h);
  const limit = Math.min(bottom, lastRow);
  for (let y = 0; y <= limit; y += 1) {
    for (let x = 0; x + w <= WALL_GRID_COLUMNS; x += 1) {
      if (!widgets.some((widget) => overlaps({ x, y, w, h }, widget))) return { x, y };
    }
  }
  return { x: 0, y: limit };
}

/**
 * Adds a widget of `type` at the first free position that fits its default span.
 */
export function addWidget(
  config: WallProfileConfig,
  type: WallWidgetType,
  descriptor: WallWidgetDescriptor = getWidgetDescriptor(type),
): WallProfileConfig {
  const { w, h } = descriptor.defaults;
  const position = findFreePosition(config.widgets, w, h);
  const widget: WallWidget = {
    id: nextWidgetId(config.widgets, type),
    type,
    config: {},
    ...position,
    w,
    h,
  };
  return { ...config, widgets: [...config.widgets, widget] };
}

/** Removes a widget by id. Returns the same config when the id is absent. */
export function removeWidget(config: WallProfileConfig, id: string): WallProfileConfig {
  const widgets = config.widgets.filter((widget) => widget.id !== id);
  if (widgets.length === config.widgets.length) return config;
  return { ...config, widgets };
}

/** The devices a resolution pass looks up, keyed by qualified id. */
function devicesById(
  devices: Iterable<DeviceDescriptor> | undefined,
): ReadonlyMap<string, DeviceDescriptor> {
  const entries = devices === undefined ? [] : [...devices];
  return new Map(entries.map((device) => [device.qualifiedId, device]));
}

/** A widget's bound qualified id, or an empty string when its config carries none. */
function boundQualifiedId(widget: WallWidget): string {
  return typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
}

/**
 * Clamps a span to its type's effective minimum and maximum and to the column bound,
 * rounded to whole cells.
 */
function clampSpan(
  span: WallWidgetSpan,
  descriptor: WallWidgetDescriptor,
  titled = false,
  readOnly = false,
): WallWidgetSpan {
  const minimum = resolveEffectiveMin(descriptor, titled, readOnly);
  const minW = Math.max(1, minimum.w);
  const maxW = Math.min(WALL_GRID_COLUMNS, Math.max(minW, descriptor.max.w));
  const minH = Math.max(1, minimum.h);
  const maxH = Math.max(minH, descriptor.max.h);
  return {
    w: Math.min(maxW, Math.max(minW, Math.round(span.w))),
    h: Math.min(maxH, Math.max(minH, Math.round(span.h))),
  };
}

/**
 * Moves and/or resizes a widget, clamping its span and every cell to the grid. The
 * `devices` a widget may be bound to decide its effective minimum, so a control-less
 * typed device may be authored one row; without them the clamp is conservative.
 */
export function updateWidgetPlacement(
  config: WallProfileConfig,
  id: string,
  placement: WallPlacement,
  descriptor?: WallWidgetDescriptor,
  devices?: Iterable<DeviceDescriptor>,
): WallProfileConfig {
  const byId = devicesById(devices);
  const widgets = config.widgets.map((widget) => {
    if (widget.id !== id) return widget;
    const desc = descriptor ?? getWidgetDescriptor(widget.type);
    const titled = widgetTitle(widget) !== null;
    const readOnly = boundDeviceReadOnly(desc, byId.get(boundQualifiedId(widget)));
    const { w, h } = clampSpan({ w: placement.w, h: placement.h }, desc, titled, readOnly);
    const x = Math.min(Math.max(0, Math.round(placement.x)), WALL_GRID_COLUMNS - w);
    const y = Math.min(Math.max(0, Math.round(placement.y)), Math.max(0, WALL_GRID_MAX_ROWS - h));
    return { ...widget, x, y, w, h };
  });
  return { ...config, widgets };
}

/** Merges `patch` into a widget's type-specific config, leaving other keys intact. */
export function updateWidgetConfig(
  config: WallProfileConfig,
  id: string,
  patch: Record<string, unknown>,
): WallProfileConfig {
  const widgets = config.widgets.map((widget) =>
    widget.id === id ? { ...widget, config: { ...widget.config, ...patch } } : widget,
  );
  return { ...config, widgets };
}

/** The widget without its `zone` key — how a cleared zone is stored. */
function withoutZone(widget: WallWidget): WallWidget {
  const { zone: _cleared, ...rest } = widget;
  return rest;
}

/**
 * Sets or clears a widget's zone label. A blank label clears the zone outright.
 */
export function updateWidgetZone(
  config: WallProfileConfig,
  id: string,
  zone: string,
): WallProfileConfig {
  const label = zone.trim();
  const widgets = config.widgets.map((widget) => {
    if (widget.id !== id) return widget;
    return label.length === 0 ? withoutZone(widget) : { ...widget, zone: label };
  });
  return { ...config, widgets };
}

/**
 * Sets a link widget's target profile, trimmed.
 */
export function setLinkTarget(
  config: WallProfileConfig,
  id: string,
  target: string,
): WallProfileConfig {
  return updateWidgetConfig(config, id, { target: target.trim() });
}

/**
 * Adds or removes one device from a device grid's explicit selection, keeping the
 * authored order.
 */
export function toggleDeviceSelection(
  config: WallProfileConfig,
  id: string,
  qualifiedId: string,
): WallProfileConfig {
  const device = qualifiedId.trim();
  if (device.length === 0) return config;
  const widget = config.widgets.find((candidate) => candidate.id === id);
  if (!widget) return config;

  const selected = deviceGridIds(widget.config);
  const next = selected.includes(device)
    ? selected.filter((candidate) => candidate !== device)
    : [...selected, device];
  return updateWidgetConfig(config, id, { qualifiedIds: next });
}

/**
 * The devices the editor offers a typed device widget of `deviceClass`, via the wall's
 * own device-class resolver.
 */
export function offeredDevices(
  deviceClass: WallDeviceClass,
  devices: Iterable<DeviceDescriptor>,
): DeviceDescriptor[] {
  return [...devices].filter((device) => deviceCanDriveClass(device.capabilities, deviceClass));
}

function formatIssue(issue: { path: readonly PropertyKey[]; message: string }): string {
  const path = issue.path.map((segment) => String(segment)).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Whether a profile-schema issue is a widget's raw `config` failure, re-reported
 * id-labelled below.
 */
function isRawWidgetConfigIssue(path: readonly PropertyKey[]): boolean {
  return path[0] === "config" && path.slice(1).includes("config");
}

/** Every widget list a profile may carry: the base layout plus its orientation overrides. */
function everyWidgetList(config: WallProfileConfig): readonly (readonly WallWidget[])[] {
  const lists: (readonly WallWidget[])[] = [config.widgets];
  if (config.orientations?.portrait) lists.push(config.orientations.portrait);
  if (config.orientations?.landscape) lists.push(config.orientations.landscape);
  return lists;
}

/**
 * Validates a draft against the shared profile schema and each widget's own descriptor
 * schema. The `devices` a widget may be bound to decide its effective minimum, so a
 * control-less typed device may be saved one row; without them the minimum is
 * conservative (two rows), leaving existing callers unaffected.
 */
export function validateProfileDraft(
  name: string,
  config: WallProfileConfig,
  devices?: Iterable<DeviceDescriptor>,
): WallDraftValidation {
  const errors: string[] = [];
  const byId = devicesById(devices);

  const result = wallProfileSchema.safeParse({
    name: name.trim(),
    version: WALL_PROFILE_VERSION,
    config,
  });
  const profile = result.success ? result.data : null;
  if (!result.success) {
    for (const issue of result.error.issues) {
      // A widget's config fault is re-reported id-labelled below.
      if (isRawWidgetConfigIssue(issue.path)) continue;
      errors.push(formatIssue(issue));
    }
  }

  const registry = WALL_WIDGET_REGISTRY as Record<string, WallWidgetDescriptor | undefined>;
  for (const widgets of everyWidgetList(config)) {
    for (const widget of widgets) {
      const descriptor = registry[widget.type];
      // An unknown type is already reported by the profile schema's enum.
      if (!descriptor) continue;
      const configResult = descriptor.configSchema.safeParse(widget.config);
      if (!configResult.success) {
        for (const issue of configResult.error.issues) {
          errors.push(`${widget.id}: ${issue.message}`);
        }
      }
      // A placement below the type's effective minimum cannot render the card the wall
      // guarantees — the slim one-row minimum only for a control-less typed device.
      const titled = widgetTitle(widget) !== null;
      const readOnly = boundDeviceReadOnly(descriptor, byId.get(boundQualifiedId(widget)));
      const minimum = resolveEffectiveMin(descriptor, titled, readOnly);
      if (widget.w < minimum.w || widget.h < minimum.h) {
        errors.push(
          `${widget.id}: below its minimum size (${minimum.w}×${minimum.h}${
            titled ? " with a title" : ""
          })`,
        );
      }
    }
  }

  if (errors.length > 0 || profile === null) return { ok: false, errors };
  return { ok: true, profile };
}

/**
 * Why a draft cannot be saved for its panel, or `null` when it fits.
 */
export function draftFitError(config: WallProfileConfig): string | null {
  const preview = resolveDraftPreview(config);
  return preview.fit === "tooLarge" ? preview.summary : null;
}

/**
 * The editor's single save boundary: validate the draft, refuse it when it cannot fit
 * its panel, then call `persist`.
 */
export async function submitProfileDraft(
  name: string,
  config: WallProfileConfig,
  persist: (config: WallProfileConfig) => Promise<void>,
  devices?: Iterable<DeviceDescriptor>,
): Promise<WallDraftValidation> {
  const validation = validateProfileDraft(name, config, devices);
  if (!validation.ok) return validation;

  const fitError = draftFitError(config);
  if (fitError !== null) return { ok: false, errors: [fitError] };

  await persist(validation.profile.config);
  return validation;
}
