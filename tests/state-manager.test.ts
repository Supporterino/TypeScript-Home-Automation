import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { unlink } from "node:fs/promises";
import pino from "pino";
import { StateManager } from "../src/core/state-manager.js";

const logger = pino({ level: "silent" });
const TEST_STATE_FILE = "./test-state.json";

describe("StateManager", () => {
  let state: StateManager;

  beforeEach(() => {
    state = new StateManager(logger);
  });

  describe("get / set / delete / has / keys", () => {
    it("returns undefined for missing keys", () => {
      expect(state.get("nonexistent")).toBeUndefined();
    });

    it("returns the default value for missing keys", () => {
      expect(state.get("missing", 42)).toBe(42);
    });

    it("sets and gets a boolean", () => {
      state.set("night_mode", true);
      expect(state.get<boolean>("night_mode")).toBe(true);
    });

    it("sets and gets a number", () => {
      state.set("count", 99);
      expect(state.get<number>("count")).toBe(99);
    });

    it("sets and gets a string", () => {
      state.set("room", "hallway");
      expect(state.get<string>("room")).toBe("hallway");
    });

    it("sets and gets an object", () => {
      const obj = { a: 1, b: "two" };
      state.set("data", obj);
      expect(state.get<typeof obj>("data")).toEqual(obj);
    });

    it("overwrites existing values", () => {
      state.set("key", "first");
      state.set("key", "second");
      expect(state.get<string>("key")).toBe("second");
    });

    it("has returns false for missing keys", () => {
      expect(state.has("nope")).toBe(false);
    });

    it("has returns true for existing keys", () => {
      state.set("exists", true);
      expect(state.has("exists")).toBe(true);
    });

    it("delete removes a key", () => {
      state.set("temp", 1);
      expect(state.delete("temp")).toBe(true);
      expect(state.has("temp")).toBe(false);
    });

    it("delete returns false for missing keys", () => {
      expect(state.delete("nope")).toBe(false);
    });

    it("keys returns all set keys", () => {
      state.set("a", 1);
      state.set("b", 2);
      state.set("c", 3);
      expect(state.keys().sort()).toEqual(["a", "b", "c"]);
    });
  });

  describe("change listeners", () => {
    it("fires onChange when a key is set", () => {
      const handler = mock(() => {});
      state.onChange("key", handler);
      state.set("key", "value");
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("key", "value", undefined);
    });

    it("fires onChange with old and new values", () => {
      state.set("key", "old");
      const handler = mock(() => {});
      state.onChange("key", handler);
      state.set("key", "new");
      expect(handler).toHaveBeenCalledWith("key", "new", "old");
    });

    it("does not fire when value is identical", () => {
      state.set("key", 42);
      const handler = mock(() => {});
      state.onChange("key", handler);
      state.set("key", 42);
      expect(handler).not.toHaveBeenCalled();
    });

    it("does not fire for deep-equal objects", () => {
      state.set("obj", { a: 1 });
      const handler = mock(() => {});
      state.onChange("obj", handler);
      state.set("obj", { a: 1 });
      expect(handler).not.toHaveBeenCalled();
    });

    it("fires for changed objects", () => {
      state.set("obj", { a: 1 });
      const handler = mock(() => {});
      state.onChange("obj", handler);
      state.set("obj", { a: 2 });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("fires onChange when a key is deleted", () => {
      state.set("key", "value");
      const handler = mock(() => {});
      state.onChange("key", handler);
      state.delete("key");
      expect(handler).toHaveBeenCalledWith("key", undefined, "value");
    });

    it("does not fire for unrelated keys", () => {
      const handler = mock(() => {});
      state.onChange("key_a", handler);
      state.set("key_b", "value");
      expect(handler).not.toHaveBeenCalled();
    });

    it("offChange removes a listener", () => {
      const handler = mock(() => {});
      state.onChange("key", handler);
      state.offChange("key", handler);
      state.set("key", "value");
      expect(handler).not.toHaveBeenCalled();
    });

    it("onAnyChange fires for any key", () => {
      const handler = mock(() => {});
      state.onAnyChange(handler);
      state.set("a", 1);
      state.set("b", 2);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("offAnyChange removes a global listener", () => {
      const handler = mock(() => {});
      state.onAnyChange(handler);
      state.offAnyChange(handler);
      state.set("a", 1);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("persistence", () => {
    afterEach(async () => {
      try {
        await unlink(TEST_STATE_FILE);
      } catch {
        // ignore if file doesn't exist
      }
    });

    it("saves and loads state to/from disk", async () => {
      const s1 = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      s1.set("night_mode", true);
      s1.set("count", 42);
      await s1.save();

      const s2 = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      await s2.load();
      expect(s2.get<boolean>("night_mode")).toBe(true);
      expect(s2.get<number>("count")).toBe(42);
    });

    it("does not save when persist is false", async () => {
      const s = new StateManager(logger, { persist: false });
      s.set("key", "value");
      await s.save();
      // No file should be created — load on a new instance should find nothing
      const s2 = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      await s2.load();
      expect(s2.get("key")).toBeUndefined();
    });

    it("handles missing state file gracefully on load", async () => {
      const s = new StateManager(logger, {
        persist: true,
        filePath: "./nonexistent-state.json",
      });
      // Should not throw
      await s.load();
      expect(s.keys()).toEqual([]);
    });
  });
});
