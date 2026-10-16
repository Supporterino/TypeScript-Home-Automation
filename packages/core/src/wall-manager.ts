import {
  WALL_ORIENTATIONS,
  WALL_PROFILE_VERSION,
  WALL_V1_PROFILE_VERSION,
  type WallOrientation,
  type WallProfile,
  type WallProfileConfig,
  type WallV1Profile,
  type WallV1Widget,
  type WallWidget,
} from "@ts-ha/shared";
import { wallProfileSchema, wallV1ProfileSchema } from "@ts-ha/shared/wall-schema";
import type { Logger } from "pino";
import type { ZodError } from "zod";
import { INTERNAL_STATE_PREFIX, type StateManager } from "./state/state-manager.js";

export type { WallProfile, WallProfileConfig, WallWidget } from "@ts-ha/shared";

/** Reserved-namespace prefix under which each wall profile is stored, keyed by name. */
export const WALL_PREFIX = `${INTERNAL_STATE_PREFIX}wall:`;

/** Returns the reserved state key storing the profile named `name`. */
export function wallKey(name: string): string {
  return `${WALL_PREFIX}${name}`;
}

/**
 * The widget type a retired version-1 `device` widget migrates to: the typed
 * `entity` card, which binds the same device without needing capabilities.
 */
const MIGRATED_DEVICE_WIDGET_TYPE = "entity" as const;

/**
 * Migrate one stored version-1 widget to its version-2 form, preserving its id,
 * placement, and zone label. A version-1 `device` widget becomes the typed fallback.
 */
function migrateV1Widget(widget: WallV1Widget): WallWidget {
  const placement = {
    id: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    ...(widget.zone !== undefined ? { zone: widget.zone } : {}),
  };

  if (widget.type !== "device") {
    return { ...placement, type: widget.type, config: widget.config };
  }

  // Re-bind the device on the typed fallback. The optional `title` is not carried:
  // the version-2 typed config has no title field.
  return {
    ...placement,
    type: MIGRATED_DEVICE_WIDGET_TYPE,
    config: { qualifiedId: widget.config.qualifiedId },
  };
}

/** Migrate each stored version-1 orientation override. */
function migrateOrientations(
  orientations: Partial<Record<WallOrientation, readonly WallV1Widget[]>>,
): Partial<Record<WallOrientation, readonly WallWidget[]>> {
  const migrated: Partial<Record<WallOrientation, readonly WallWidget[]>> = {};
  for (const orientation of WALL_ORIENTATIONS) {
    const widgets = orientations[orientation];
    if (widgets) {
      migrated[orientation] = widgets.map((widget) => migrateV1Widget(widget));
    }
  }
  return migrated;
}

/**
 * Migrate a stored version-1 profile to the current version, preserving every
 * widget's placement, size, and zone label.
 */
function migrateV1Profile(profile: WallV1Profile): WallProfile {
  const { config } = profile;
  const orientations = config.orientations ? migrateOrientations(config.orientations) : undefined;
  return {
    name: profile.name,
    version: WALL_PROFILE_VERSION,
    config: {
      widgets: config.widgets.map((widget) => migrateV1Widget(widget)),
      ...(orientations ? { orientations } : {}),
    },
  };
}

/** Reads a stored value's declared profile version, or `undefined` when it is not an object. */
function storedProfileVersion(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return undefined;
  return (raw as Record<string, unknown>).version;
}

export type CreateWallResult =
  | { status: "ok"; wall: WallProfile }
  | { status: "duplicate_name"; message: string }
  | { status: "invalid_config"; message: string };

export type UpdateWallResult =
  | { status: "ok"; wall: WallProfile }
  | { status: "not_found" }
  | { status: "duplicate_name"; message: string }
  | { status: "invalid_config"; message: string };

export type DeleteWallResult = "ok" | "not_found";

/**
 * Named wall profiles for the full-bleed wall surface. A profile is addressed by
 * its name and validated against `wallProfileSchema` on every write.
 */
export class WallManager {
  constructor(
    private readonly stateManager: StateManager,
    private readonly logger: Logger,
  ) {}

  /**
   * Create a profile with the given name and widget composition; returns a
   * `duplicate_name` or `invalid_config` status, writing nothing in either case.
   */
  createWall(name: string, config: WallProfileConfig): CreateWallResult {
    if (this.getWall(name)) {
      return { status: "duplicate_name", message: `A wall named "${name}" already exists` };
    }
    const profile: WallProfile = { name, version: WALL_PROFILE_VERSION, config };
    const parsed = wallProfileSchema.safeParse(profile);
    if (!parsed.success) {
      return { status: "invalid_config", message: this.describeIssues(parsed.error) };
    }
    this.stateManager.setInternal(wallKey(name), parsed.data);
    this.logger.info({ name }, "Wall created");
    return { status: "ok", wall: parsed.data };
  }

  /**
   * Every wall profile, in insertion order, each surfaced at the current version;
   * an unreadable stored profile is reported and skipped.
   */
  listWalls(): WallProfile[] {
    const walls: WallProfile[] = [];
    for (const key of this.stateManager.keysInternal(WALL_PREFIX)) {
      const wall = this.loadWall(key.slice(WALL_PREFIX.length));
      if (wall) walls.push(wall);
    }
    return walls;
  }

  /** A single profile by name at the current version, or `null` if unknown. */
  getWall(name: string): WallProfile | null {
    return this.loadWall(name);
  }

  /**
   * Update a profile's config and/or rename it; an omitted field keeps its value.
   * Returns `not_found`, `duplicate_name`, or `invalid_config` (nothing is written
   * for the latter two).
   */
  updateWall(name: string, input: { name?: string; config?: WallProfileConfig }): UpdateWallResult {
    const existing = this.getWall(name);
    if (!existing) return { status: "not_found" };

    const nextName = input.name ?? existing.name;
    if (nextName !== name && this.getWall(nextName)) {
      return { status: "duplicate_name", message: `A wall named "${nextName}" already exists` };
    }

    const profile: WallProfile = {
      name: nextName,
      version: WALL_PROFILE_VERSION,
      config: input.config ?? existing.config,
    };
    const parsed = wallProfileSchema.safeParse(profile);
    if (!parsed.success) {
      return { status: "invalid_config", message: this.describeIssues(parsed.error) };
    }

    this.stateManager.setInternal(wallKey(nextName), parsed.data);
    if (nextName !== name) {
      this.stateManager.deleteInternal(wallKey(name));
    }
    this.logger.info({ name: nextName, previousName: name }, "Wall updated");
    return { status: "ok", wall: parsed.data };
  }

  /** Delete a profile. Deleting an unknown profile is reported, not thrown. */
  deleteWall(name: string): DeleteWallResult {
    if (!this.getWall(name)) return "not_found";
    this.stateManager.deleteInternal(wallKey(name));
    this.logger.info({ name }, "Wall deleted");
    return "ok";
  }

  /**
   * Read the profile stored under `name`, surfaced at the current version; a stored
   * version-1 profile is migrated in memory and not written back. A value neither
   * schema accepts is reported and treated as unknown, left in the store.
   */
  private loadWall(name: string): WallProfile | null {
    const raw = this.stateManager.get<unknown>(wallKey(name));
    if (raw === undefined) return null;

    const current = wallProfileSchema.safeParse(raw);
    if (current.success) return current.data;

    const legacy = wallV1ProfileSchema.safeParse(raw);
    if (legacy.success) return migrateV1Profile(legacy.data);

    const version = storedProfileVersion(raw);

    // Report the issues from the schema matching the stored version, so a corrupt
    // current-version profile is not mislabelled with the migration schema's
    // complaints (e.g. a bogus `version: expected 1`).
    const error = version === WALL_PROFILE_VERSION ? current.error : legacy.error;
    this.logger.error(
      { name, version, issues: this.describeIssues(error) },
      version === WALL_V1_PROFILE_VERSION
        ? "Wall profile cannot be migrated and was skipped"
        : "Wall profile cannot be loaded and was skipped",
    );
    return null;
  }

  /** Render a schema failure as a single descriptive, human-readable string. */
  private describeIssues(error: ZodError): string {
    return error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
  }
}
