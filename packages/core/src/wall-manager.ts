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

/**
 * Reserved-namespace prefix under which each wall profile is stored, keyed by
 * the profile's name (design.md D2, D9).
 */
export const WALL_PREFIX = `${INTERNAL_STATE_PREFIX}wall:`;

/** Returns the reserved state key storing the profile named `name`. */
export function wallKey(name: string): string {
  return `${WALL_PREFIX}${name}`;
}

/**
 * The widget type a retired version-1 `device` widget migrates to (design.md
 * D3, D8; specs/wall-display "Wall Profile Version and Migration").
 *
 * Migration reads a persisted profile, not a device inventory, so it cannot
 * resolve a bound device's capabilities to its class. The typed `entity` card
 * is the catalogue's fallback for a device of no class and binds the same
 * single device, so it is the faithful target: the migrated widget keeps its
 * placement and zone and references the same `qualifiedId`.
 */
const MIGRATED_DEVICE_WIDGET_TYPE = "entity" as const;

/**
 * Migrates one stored version-1 widget to its version-2 form, preserving its
 * id, placement, and zone label (design.md D8).
 *
 * A widget that named a single device (`device`) becomes the typed fallback
 * bound to that device; every other version-1 type still exists in version 2,
 * so a widget that named a set of devices (`devices`) keeps its selection
 * unchanged.
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

  // The version-1 schema has already validated the config, so its bound device
  // is present; re-bind it on the typed fallback. A version-1 `device` widget's
  // optional `title` is intentionally NOT carried: the version-2 typed config
  // (`WallTypedDeviceWidgetConfig`) has no title field, and a card always draws
  // its device's own name (design.md D6), so the drop is inherent to the contract
  // rather than a bug — the placement, zone, and bound device are what the typed
  // form preserves.
  return {
    ...placement,
    type: MIGRATED_DEVICE_WIDGET_TYPE,
    config: { qualifiedId: widget.config.qualifiedId },
  };
}

/** Migrates each stored version-1 orientation override (design.md D8). */
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
 * Migrates a stored version-1 profile to the current version (design.md D8;
 * specs/wall-display "Wall Profile Version and Migration"), preserving every
 * widget's placement, size, and zone label and the devices it references.
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
 * Named wall profiles for the full-bleed wall surface (design.md D2, D10;
 * specs/wall-display "Named Wall Profiles", "Wall Configuration Editor").
 *
 * A profile is addressed by its name, which is also its stable identifier —
 * there is no separate id. Definitions live under {@link WALL_PREFIX} inside
 * the reserved internal state namespace (design.md D20), written through
 * `setInternal()`/`deleteInternal()` so they are not writable or enumerable
 * through the public state API, mirroring `RoomManager`. The profile config
 * is validated against the shared `wallProfileSchema` on every write, so a
 * malformed composition is rejected before it can be persisted (design.md D10).
 *
 * A stored profile of an older version is migrated on load rather than rejected
 * (design.md D8; specs/wall-display "Wall Profile Version and Migration"), so a
 * wall that has been authored and saved survives a change to the contract, and
 * every write persists the current version.
 */
export class WallManager {
  constructor(
    private readonly stateManager: StateManager,
    private readonly logger: Logger,
  ) {}

  /**
   * Create a profile with the given name and widget composition.
   *
   * @returns `{ status: "duplicate_name" }` if a profile with that name
   * already exists, or `{ status: "invalid_config" }` if the composition
   * fails validation — nothing is written in either case.
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
   * Every wall profile, in insertion order, each surfaced at the current
   * version.
   *
   * A stored profile that cannot be loaded is reported and skipped, so one
   * unreadable profile never prevents the wall's other profiles from loading
   * (specs/wall-display "Wall Profile Version and Migration").
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
   * Update a profile's config and/or rename it (specs/wall-display "Wall
   * Configuration Editor"). An omitted field keeps its existing value.
   *
   * @returns `{ status: "not_found" }` for an unknown name,
   * `{ status: "duplicate_name" }` if a new name is already in use by another
   * profile, or `{ status: "invalid_config" }` if the resulting composition
   * fails validation — nothing is written in the latter two cases.
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
   * Reads the profile stored under `name` and surfaces it at the current
   * version (design.md D8; specs/wall-display "Wall Profile Version and
   * Migration").
   *
   * A stored version-1 profile is migrated in memory: its widgets keep their
   * placement and zone, a widget that named a set of devices keeps its
   * selection, and a widget that named a single device becomes the typed
   * fallback bound to that device. The migrated profile is not written back on
   * read; the next create or update persists the current version.
   *
   * A stored value that neither the current schema nor the version-1 schema
   * accepts cannot be surfaced. It is reported here and treated as unknown — the
   * value is left in the store rather than deleted — so it never prevents the
   * wall's other profiles from loading.
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
