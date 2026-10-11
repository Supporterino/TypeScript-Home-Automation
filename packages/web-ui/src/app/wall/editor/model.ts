/**
 * Pure wall-profile editor logic (design.md D5, D10; specs/wall-display "Wall
 * Configuration Editor", "Widget Grid Layout"). Every mutation the editor
 * performs — adding, removing, moving, resizing, and reconfiguring a widget,
 * and validating a draft before it is saved — lives here as a pure function so
 * it is reachable by `bun test` without a DOM. The save path funnels through
 * {@link submitProfileDraft}, which validates first and only then calls the
 * persist callback, so an invalid config can never reach the API.
 *
 * Loaded only inside the lazy `wall` chunk (the editor is its only consumer).
 */
import {
  WALL_GRID_COLUMNS,
  WALL_GRID_MAX_ROWS,
  WALL_PROFILE_VERSION,
  type WallProfile,
  type WallProfileConfig,
  type WallWidget,
  type WallWidgetType,
} from "@ts-ha/shared";
import { wallProfileSchema } from "@ts-ha/shared/wall-schema";
import {
  getWidgetDescriptor,
  WALL_WIDGET_REGISTRY,
  type WallWidgetDescriptor,
  type WallWidgetSpan,
} from "../registry.js";

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

/** A freshly created profile's composition — no widgets (task 6.1). */
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
 * The first top-left cell where a `{w, h}` span overlaps no existing widget,
 * scanning rows top-to-bottom and cells left-to-right. Bounded by the bottom
 * edge of the existing layout — at which every column is free — and by the
 * row bound, so it always terminates and never returns a row that would push
 * the span past {@link WALL_GRID_MAX_ROWS}. When the layout leaves no in-bound
 * free cell (a packed profile), the last in-bound row is returned and the
 * draft validator surfaces the resulting overlap rather than a row-bound
 * error the user did not cause.
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
 * Adds a widget of `type` at the first free position that fits its default
 * span (design.md D6). The base layout is edited; a per-orientation override is
 * preserved untouched.
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

/**
 * Clamps a span to its type's minimum and maximum, and to the column bound
 * (specs/wall-display "A widget cannot be under-sized"). Values are rounded to
 * whole cells because the grid places by cell, not by flow.
 */
export function clampSpan(span: WallWidgetSpan, descriptor: WallWidgetDescriptor): WallWidgetSpan {
  const minW = Math.max(1, descriptor.min.w);
  const maxW = Math.min(WALL_GRID_COLUMNS, Math.max(minW, descriptor.max.w));
  const minH = Math.max(1, descriptor.min.h);
  const maxH = Math.max(minH, descriptor.max.h);
  return {
    w: Math.min(maxW, Math.max(minW, Math.round(span.w))),
    h: Math.min(maxH, Math.max(minH, Math.round(span.h))),
  };
}

/**
 * Moves and/or resizes a widget, clamping its span to the type's min/max and
 * every cell to the grid: `x` is confined to `[0, columns - w]` and `y` to
 * `[0, rows - h]`. A widget left overlapping another is a valid edit — the
 * draft validator surfaces that rather than the control silently refusing it.
 */
export function updateWidgetPlacement(
  config: WallProfileConfig,
  id: string,
  placement: WallPlacement,
  descriptor?: WallWidgetDescriptor,
): WallProfileConfig {
  const widgets = config.widgets.map((widget) => {
    if (widget.id !== id) return widget;
    const desc = descriptor ?? getWidgetDescriptor(widget.type);
    const { w, h } = clampSpan({ w: placement.w, h: placement.h }, desc);
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

function formatIssue(issue: { path: readonly PropertyKey[]; message: string }): string {
  const path = issue.path.map((segment) => String(segment)).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Whether a profile-schema issue is a widget's raw `config` failure. The
 * profile schema already validates each widget's config (via its
 * `superRefine`), but the loop below re-reports that fault id-labelled — the
 * form the editor renders. Dropping the schema-path copy keeps one message per
 * fault (task 6.2). Top-level `config` issues (path `["config"]` or
 * `["config","widgets"]`) have no second `config` segment and are kept.
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
 * Validates a draft against the shared profile schema and each widget's own
 * descriptor schema (design.md D10 — the same pins the server enforces).
 * Returns the parsed profile on success, or the descriptive errors the editor
 * renders inline. The editor never persists a draft this rejects.
 */
export function validateProfileDraft(name: string, config: WallProfileConfig): WallDraftValidation {
  const errors: string[] = [];

  const result = wallProfileSchema.safeParse({
    name: name.trim(),
    version: WALL_PROFILE_VERSION,
    config,
  });
  const profile = result.success ? result.data : null;
  if (!result.success) {
    for (const issue of result.error.issues) {
      // A widget's config fault is re-reported id-labelled below; skip its
      // redundant raw schema-path copy so each fault appears once.
      if (isRawWidgetConfigIssue(issue.path)) continue;
      errors.push(formatIssue(issue));
    }
  }

  const registry = WALL_WIDGET_REGISTRY as Record<string, WallWidgetDescriptor | undefined>;
  for (const widgets of everyWidgetList(config)) {
    for (const widget of widgets) {
      const descriptor = registry[widget.type];
      // An unknown type is already reported by the profile schema's enum; a
      // descriptor-less type could not be rendered either way.
      if (!descriptor) continue;
      const configResult = descriptor.configSchema.safeParse(widget.config);
      if (!configResult.success) {
        for (const issue of configResult.error.issues) {
          errors.push(`${widget.id}: ${issue.message}`);
        }
      }
    }
  }

  if (errors.length > 0 || profile === null) return { ok: false, errors };
  return { ok: true, profile };
}

/**
 * The editor's single save boundary: validate the draft first, and only call
 * `persist` with the parsed config when it is valid. Structuring the handler
 * around this guarantees an invalid draft never reaches the API (task 6.4;
 * specs/wall-display "An invalid profile is rejected"). The `persist` callback
 * is expected to call `updateWall`/`createWall`.
 */
export async function submitProfileDraft(
  name: string,
  config: WallProfileConfig,
  persist: (config: WallProfileConfig) => Promise<void>,
): Promise<WallDraftValidation> {
  const validation = validateProfileDraft(name, config);
  if (!validation.ok) return validation;
  await persist(validation.profile.config);
  return validation;
}
