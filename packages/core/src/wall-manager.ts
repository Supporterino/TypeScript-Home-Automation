import { WALL_PROFILE_VERSION, type WallProfile, type WallProfileConfig } from "@ts-ha/shared";
import { wallProfileSchema } from "@ts-ha/shared/wall-schema";
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

  /** Every wall profile, in insertion order. */
  listWalls(): WallProfile[] {
    const walls: WallProfile[] = [];
    for (const key of this.stateManager.keysInternal(WALL_PREFIX)) {
      const wall = this.stateManager.get<WallProfile>(key);
      if (wall) walls.push(wall);
    }
    return walls;
  }

  /** A single profile by name, or `null` if unknown. */
  getWall(name: string): WallProfile | null {
    return this.stateManager.get<WallProfile>(wallKey(name)) ?? null;
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
