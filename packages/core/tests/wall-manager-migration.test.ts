import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  WALL_PROFILE_VERSION,
  WALL_V1_PROFILE_VERSION,
  type WallProfile,
  type WallProfileConfig,
  type WallV1Profile,
} from "@ts-ha/shared";
import pino from "pino";
import { StateManager } from "../src/state/state-manager.js";
import { WallManager, wallKey } from "../src/wall-manager.js";

const logger = pino({ level: "silent" });

/**
 * A stored version-1 profile: a widget that named a single device, one that
 * named a set of devices, a non-device widget, and an orientation override
 * (design.md D8; specs/wall-display "Wall Profile Version and Migration").
 */
function storedV1Profile(): WallV1Profile {
  return {
    name: "kitchen",
    version: WALL_V1_PROFILE_VERSION,
    config: {
      widgets: [
        {
          id: "lamp",
          type: "device",
          config: { qualifiedId: "light.lamp" },
          x: 0,
          y: 0,
          w: 4,
          h: 3,
          zone: "Evening",
        },
        {
          id: "lights",
          type: "devices",
          config: { qualifiedIds: ["light.a", "light.b"] },
          x: 4,
          y: 0,
          w: 8,
          h: 6,
        },
        { id: "clock", type: "clock", config: {}, x: 0, y: 3, w: 4, h: 2 },
      ],
      orientations: {
        landscape: [
          {
            id: "lamp",
            type: "device",
            config: { qualifiedId: "light.lamp" },
            x: 0,
            y: 0,
            w: 6,
            h: 4,
            zone: "Evening",
          },
        ],
      },
    },
  };
}

describe("WallManager profile migration", () => {
  let state: StateManager;
  let walls: WallManager;

  beforeEach(() => {
    state = new StateManager(logger, { persist: false });
    walls = new WallManager(state, logger);
  });

  describe("loading a stored version-1 profile", () => {
    it("migrates a single-device widget to the typed fallback at its placement and zone", () => {
      state.setInternal(wallKey("kitchen"), storedV1Profile());

      const wall = walls.getWall("kitchen");
      if (!wall) throw new Error("unreachable");

      expect(wall.version).toBe(WALL_PROFILE_VERSION);
      expect(wall.config.widgets[0]).toEqual({
        id: "lamp",
        type: "entity",
        config: { qualifiedId: "light.lamp" },
        x: 0,
        y: 0,
        w: 4,
        h: 3,
        zone: "Evening",
      });
    });

    it("keeps a widget that named a set of devices and its selection", () => {
      state.setInternal(wallKey("kitchen"), storedV1Profile());

      const wall = walls.getWall("kitchen");
      if (!wall) throw new Error("unreachable");

      expect(wall.config.widgets[1]).toEqual({
        id: "lights",
        type: "devices",
        config: { qualifiedIds: ["light.a", "light.b"] },
        x: 4,
        y: 0,
        w: 8,
        h: 6,
      });
    });

    it("carries a non-device widget over unchanged", () => {
      state.setInternal(wallKey("kitchen"), storedV1Profile());

      const wall = walls.getWall("kitchen");
      if (!wall) throw new Error("unreachable");

      expect(wall.config.widgets[2]).toEqual({
        id: "clock",
        type: "clock",
        config: {},
        x: 0,
        y: 3,
        w: 4,
        h: 2,
      });
    });

    it("migrates each orientation override, leaving the absent one out", () => {
      state.setInternal(wallKey("kitchen"), storedV1Profile());

      const wall = walls.getWall("kitchen");
      if (!wall) throw new Error("unreachable");

      expect(wall.config.orientations?.landscape).toEqual([
        {
          id: "lamp",
          type: "entity",
          config: { qualifiedId: "light.lamp" },
          x: 0,
          y: 0,
          w: 6,
          h: 4,
          zone: "Evening",
        },
      ]);
      expect(wall.config.orientations?.portrait).toBeUndefined();
    });

    it("surfaces migrated widgets through listWalls", () => {
      state.setInternal(wallKey("kitchen"), storedV1Profile());

      const listed = walls.listWalls();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.version).toBe(WALL_PROFILE_VERSION);
      expect(listed[0]?.config.widgets.map((widget) => widget.type)).toEqual([
        "entity",
        "devices",
        "clock",
      ]);
    });
  });

  describe("writing a profile", () => {
    it("writes a created profile at the current version", () => {
      const config: WallProfileConfig = {
        widgets: [{ id: "clock", type: "clock", config: {}, x: 0, y: 0, w: 6, h: 2 }],
      };
      expect(walls.createWall("kitchen", config).status).toBe("ok");

      const stored = state.get<WallProfile>(wallKey("kitchen"));
      expect(stored?.version).toBe(WALL_PROFILE_VERSION);
    });

    it("persists a migrated profile at the current version when it is updated", () => {
      state.setInternal(wallKey("kitchen"), storedV1Profile());

      expect(walls.updateWall("kitchen", { name: "hall" }).status).toBe("ok");

      const stored = state.get<WallProfile>(wallKey("hall"));
      expect(stored?.version).toBe(WALL_PROFILE_VERSION);
      expect(stored?.config.widgets[0]?.type).toBe("entity");
      expect(stored?.config.widgets[0]?.config).toEqual({ qualifiedId: "light.lamp" });
    });
  });

  describe("a profile that cannot be migrated", () => {
    it("is reported and leaves the wall's other profiles loadable", () => {
      const error = mock((_fields: unknown, _message?: string) => {});
      const spyLogger = {
        info: mock(() => {}),
        warn: mock(() => {}),
        debug: mock(() => {}),
        error,
      } as unknown as typeof logger;
      const spied = new WallManager(state, spyLogger);

      // A version-1 profile whose device widget has no bound device cannot migrate.
      state.setInternal(wallKey("broken"), {
        name: "broken",
        version: WALL_V1_PROFILE_VERSION,
        config: { widgets: [{ id: "lamp", type: "device", config: {}, x: 0, y: 0, w: 2, h: 2 }] },
      });
      const healthy: WallProfileConfig = {
        widgets: [{ id: "clock", type: "clock", config: {}, x: 0, y: 0, w: 6, h: 2 }],
      };
      expect(spied.createWall("healthy", healthy).status).toBe("ok");

      expect(spied.getWall("broken")).toBeNull();
      expect(spied.listWalls().map((wall) => wall.name)).toEqual(["healthy"]);

      expect(error).toHaveBeenCalled();
      expect(error.mock.calls[0]?.[0]).toMatchObject({
        name: "broken",
        version: WALL_V1_PROFILE_VERSION,
      });
    });
  });
});
