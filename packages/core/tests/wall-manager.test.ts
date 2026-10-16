import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WALL_PROFILE_VERSION, type WallProfileConfig } from "@ts-ha/shared";
import pino from "pino";
import { StateManager } from "../src/state/state-manager.js";
import { WALL_PREFIX, WallManager, wallKey } from "../src/wall-manager.js";

const logger = pino({ level: "silent" });

function validConfig(): WallProfileConfig {
  return {
    widgets: [
      { id: "clock", type: "clock", config: {}, x: 0, y: 0, w: 6, h: 2 },
      { id: "weather", type: "weather", config: {}, x: 6, y: 0, w: 6, h: 2 },
    ],
  };
}

/** A config whose sole widget overflows the 12-column grid. */
function invalidConfig(): WallProfileConfig {
  return {
    widgets: [{ id: "wide", type: "clock", config: {}, x: 6, y: 0, w: 8, h: 1 }],
  };
}

/** A config whose sole room widget is missing its required `roomId`. */
function invalidWidgetConfig(): WallProfileConfig {
  return {
    widgets: [{ id: "room", type: "room", config: {}, x: 0, y: 0, w: 6, h: 5 }],
  };
}

describe("WallManager", () => {
  let state: StateManager;
  let walls: WallManager;

  beforeEach(() => {
    state = new StateManager(logger, { persist: false });
    walls = new WallManager(state, logger);
  });

  describe("wall definitions", () => {
    it("creates a profile addressed by its name", () => {
      const result = walls.createWall("kitchen", validConfig());
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.wall.name).toBe("kitchen");
      expect(result.wall.version).toBe(WALL_PROFILE_VERSION);
      expect(result.wall.config.widgets).toHaveLength(2);

      expect(walls.listWalls()).toHaveLength(1);
      expect(walls.getWall("kitchen")?.name).toBe("kitchen");
    });

    it("stores the profile under the reserved wall namespace", () => {
      walls.createWall("kitchen", validConfig());
      expect(state.keysInternal(WALL_PREFIX)).toEqual([wallKey("kitchen")]);
      // The reserved key is never enumerable through the public API.
      expect(state.keys()).toEqual([]);
    });

    it("returns null for an unknown profile", () => {
      expect(walls.getWall("nope")).toBeNull();
    });

    it("rejects a duplicate name and creates nothing", () => {
      walls.createWall("kitchen", validConfig());
      const result = walls.createWall("kitchen", validConfig());
      expect(result.status).toBe("duplicate_name");
      if (result.status === "duplicate_name") expect(result.message).toContain("kitchen");
      expect(walls.listWalls()).toHaveLength(1);
    });

    it("rejects an invalid config without persisting it", () => {
      const result = walls.createWall("broken", invalidConfig());
      expect(result.status).toBe("invalid_config");
      expect(walls.getWall("broken")).toBeNull();
      expect(walls.listWalls()).toHaveLength(0);
    });

    it("rejects a widget whose type-specific config is invalid without persisting it", () => {
      const result = walls.createWall("broken", invalidWidgetConfig());
      expect(result.status).toBe("invalid_config");
      expect(walls.getWall("broken")).toBeNull();
      expect(walls.listWalls()).toHaveLength(0);
    });
  });

  describe("updating a profile", () => {
    it("updates a profile's config in place", () => {
      walls.createWall("kitchen", validConfig());
      const next: WallProfileConfig = {
        widgets: [{ id: "clock", type: "clock", config: {}, x: 0, y: 0, w: 12, h: 2 }],
      };

      const result = walls.updateWall("kitchen", { config: next });
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.wall.name).toBe("kitchen");
      expect(walls.getWall("kitchen")?.config.widgets).toHaveLength(1);
    });

    it("renames a profile and leaves the old name unknown", () => {
      walls.createWall("kitchen", validConfig());
      const result = walls.updateWall("kitchen", { name: "hall" });
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.wall.name).toBe("hall");
      expect(walls.getWall("hall")?.name).toBe("hall");
      expect(walls.getWall("kitchen")).toBeNull();
      expect(walls.listWalls()).toHaveLength(1);
    });

    it("rejects renaming to a name already in use, leaving both profiles unchanged", () => {
      walls.createWall("kitchen", validConfig());
      walls.createWall("hall", validConfig());

      const result = walls.updateWall("kitchen", { name: "hall" });
      expect(result.status).toBe("duplicate_name");
      expect(walls.getWall("kitchen")?.name).toBe("kitchen");
      expect(walls.getWall("hall")?.name).toBe("hall");
    });

    it("renaming a profile to its own name is not a duplicate", () => {
      walls.createWall("kitchen", validConfig());
      const result = walls.updateWall("kitchen", { name: "kitchen" });
      expect(result.status).toBe("ok");
    });

    it("returns not_found for an unknown profile", () => {
      expect(walls.updateWall("nope", { name: "x" }).status).toBe("not_found");
    });

    it("rejects an invalid config without changing the stored profile", () => {
      const original = validConfig();
      walls.createWall("kitchen", original);

      const result = walls.updateWall("kitchen", { config: invalidConfig() });
      expect(result.status).toBe("invalid_config");
      expect(walls.getWall("kitchen")?.config.widgets).toHaveLength(2);
    });

    it("rejects an update whose widget config is semantically invalid", () => {
      walls.createWall("kitchen", validConfig());

      const result = walls.updateWall("kitchen", { config: invalidWidgetConfig() });
      expect(result.status).toBe("invalid_config");
      expect(walls.getWall("kitchen")?.config.widgets).toHaveLength(2);
    });
  });

  describe("deleting a profile", () => {
    it("deletes a profile without affecting any other", () => {
      walls.createWall("kitchen", validConfig());
      walls.createWall("hall", validConfig());

      expect(walls.deleteWall("kitchen")).toBe("ok");
      expect(walls.getWall("kitchen")).toBeNull();
      expect(walls.getWall("hall")).not.toBeNull();
      expect(walls.listWalls()).toHaveLength(1);
    });

    it("returns not_found for an unknown profile", () => {
      expect(walls.deleteWall("nope")).toBe("not_found");
    });
  });

  describe("durability", () => {
    let tmpDir: string;
    let filePath: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "ts-ha-walls-"));
      filePath = join(tmpDir, "state.json");
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("restores a profile across a graceful restart", async () => {
      const s1 = new StateManager(logger, { persist: true, filePath });
      const w1 = new WallManager(s1, logger);
      w1.createWall("kitchen", validConfig());
      // flush() (not save()) mirrors the engine's graceful-shutdown path.
      await s1.flush();

      const s2 = new StateManager(logger, { persist: true, filePath });
      await s2.load();
      const w2 = new WallManager(s2, logger);

      const listed = w2.listWalls();
      expect(listed).toHaveLength(1);
      expect(listed[0].name).toBe("kitchen");
      expect(listed[0].config.widgets).toHaveLength(2);
      expect(w2.getWall("kitchen")?.version).toBe(WALL_PROFILE_VERSION);
    });
  });
});
