import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { access, readFile, unlink, writeFile } from "node:fs/promises";
import pino from "pino";
import { isReservedStateKey, StateManager } from "../src/core/state/state-manager.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const logger = pino({ level: "silent" });
const TEST_STATE_FILE = "./test-state.json";

describe("StateManager", () => {
  let state: StateManager;

  beforeEach(() => {
    state = new StateManager(logger, { persist: false });
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
    async function fileExists(path: string): Promise<boolean> {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    }

    afterEach(async () => {
      for (const path of [TEST_STATE_FILE, `${TEST_STATE_FILE}.bak`, `${TEST_STATE_FILE}.tmp`]) {
        try {
          await unlink(path);
        } catch {
          // ignore if file doesn't exist
        }
      }
    });

    it("saves and loads state to/from disk", async () => {
      const s1 = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      s1.set("night_mode", true);
      s1.set("count", 42);
      // flush() (not save()) also cancels the pending coalesced-save timer
      // that set() just scheduled, so it cannot fire again later and race a
      // subsequent test that reuses TEST_STATE_FILE.
      await s1.flush();

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

    it("skips an unserializable value but persists all other keys", async () => {
      const s1 = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      // Circular reference — JSON.stringify would throw on this value.
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      s1.set("good_a", 1);
      s1.set("bad", circular);
      s1.set("good_b", "two");
      await s1.flush();

      const s2 = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      await s2.load();
      expect(s2.get<number>("good_a")).toBe(1);
      expect(s2.get<string>("good_b")).toBe("two");
      expect(s2.has("bad")).toBe(false);
    });

    it("preserves the prior content as a .bak after a successful save", async () => {
      const s = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      s.set("value", "first");
      await s.flush();

      s.set("value", "second");
      await s.flush();

      const backup = JSON.parse(await readFile(`${TEST_STATE_FILE}.bak`, "utf-8"));
      expect(backup.value).toBe("first");
    });

    it("recovers from .bak when the primary file is corrupt", async () => {
      // Valid backup, corrupt primary.
      await writeFile(`${TEST_STATE_FILE}.bak`, JSON.stringify({ recovered: true }), "utf-8");
      await writeFile(TEST_STATE_FILE, "{ this is not valid json", "utf-8");

      const s = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      await s.load();
      expect(s.get<boolean>("recovered")).toBe(true);
    });

    it("starts empty without throwing when primary and backup are both corrupt", async () => {
      await writeFile(TEST_STATE_FILE, "not json", "utf-8");
      await writeFile(`${TEST_STATE_FILE}.bak`, "also not json", "utf-8");

      const s = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      // Should not throw.
      await s.load();
      expect(s.keys()).toEqual([]);
    });

    it("leaves no .tmp file after a successful save", async () => {
      const s = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
      });
      s.set("key", "value");
      await s.flush();

      expect(await fileExists(`${TEST_STATE_FILE}.tmp`)).toBe(false);
    });
  });

  // ── Write-behind persistence (2.1-2.5) ─────────────────────────────────

  describe("write-behind flush scheduling", () => {
    afterEach(async () => {
      for (const path of [TEST_STATE_FILE, `${TEST_STATE_FILE}.bak`, `${TEST_STATE_FILE}.tmp`]) {
        try {
          await unlink(path);
        } catch {
          // ignore if file doesn't exist
        }
      }
    });

    it("coalesces many writes within one interval into exactly one save", async () => {
      let saveCount = 0;
      const s = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
        flushIntervalMs: 30,
      });
      const originalSave = s.save.bind(s);
      s.save = (async () => {
        saveCount++;
        return originalSave();
      }) as typeof s.save;

      for (let i = 0; i < 20; i++) {
        s.set(`key${i}`, i);
      }

      await sleep(80);
      expect(saveCount).toBe(1);
      await s.flush();
    });

    it("flushes a pending save immediately on flush() before the interval elapses", async () => {
      const s = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
        flushIntervalMs: 10_000,
      });
      s.set("urgent", "value");
      await s.flush();

      const onDisk = JSON.parse(await readFile(TEST_STATE_FILE, "utf-8"));
      expect(onDisk.urgent).toBe("value");
    });

    it("flushIntervalMs: 0 saves on every mutation", async () => {
      let saveCount = 0;
      const s = new StateManager(logger, {
        persist: true,
        filePath: TEST_STATE_FILE,
        flushIntervalMs: 0,
      });
      const originalSave = s.save.bind(s);
      s.save = (async () => {
        saveCount++;
        return originalSave();
      }) as typeof s.save;

      s.set("a", 1);
      s.set("b", 2);
      s.set("c", 3);
      // Immediate-mode saves are fired without being awaited by set(); give
      // them a turn to run.
      await sleep(10);

      expect(saveCount).toBe(3);
    });

    it("schedules no save when persist is false", async () => {
      const s = new StateManager(logger, { persist: false, filePath: TEST_STATE_FILE });
      let saveCalled = false;
      const originalSave = s.save.bind(s);
      s.save = (async () => {
        saveCalled = true;
        return originalSave();
      }) as typeof s.save;

      s.set("key", "value");
      await sleep(30);

      expect(saveCalled).toBe(false);
    });

    it("logs a failed scheduled save without preventing the next mutation from persisting", async () => {
      // Force the first save to fail: the file's parent "directory" is
      // actually a plain file, so mkdir(dirname(filePath)) fails with
      // ENOTDIR. Removing the blocker file lets the next save succeed.
      const blockerPath = "./test-state-blocker";
      const nestedFilePath = `${blockerPath}/state.json`;

      const { rm } = await import("node:fs/promises");
      await rm(blockerPath, { recursive: true, force: true });
      await writeFile(blockerPath, "not a directory", "utf-8");

      const s = new StateManager(logger, {
        persist: true,
        filePath: nestedFilePath,
        flushIntervalMs: 10,
      });

      try {
        s.set("first", 1);
        await sleep(30); // first scheduled save fails and is logged, not thrown

        await rm(blockerPath, { recursive: true, force: true });
        s.set("second", 2);
        await s.flush(); // second save must still succeed

        const onDisk = JSON.parse(await readFile(nestedFilePath, "utf-8"));
        expect(onDisk.second).toBe(2);
      } finally {
        await rm(blockerPath, { recursive: true, force: true });
      }
    });
  });

  // ── Reserved internal namespace (2.9-2.13) ─────────────────────────────

  describe("reserved internal namespace", () => {
    it("isReservedStateKey identifies the sigil prefix", () => {
      expect(isReservedStateKey("$internal:rooms")).toBe(true);
      expect(isReservedStateKey("night_mode")).toBe(false);
      expect(isReservedStateKey("motion-light:lights_on")).toBe(false);
    });

    it("an automation named to imitate the prefix cannot fall inside the namespace", () => {
      // Automation-scoped keys are `<automation-name>:<key>`; automation names
      // derive from kebab-case filenames and cannot begin with `$`.
      const impersonating = "internal:rooms"; // no leading "$" — not a valid automation-scoped key match either
      expect(isReservedStateKey(impersonating)).toBe(false);
      expect(isReservedStateKey(`$${impersonating}`)).toBe(true);
    });

    it("set() throws for a reserved key and leaves the store unchanged", () => {
      expect(() => state.set("$internal:rooms", { a: [] })).toThrow();
      expect(state.has("$internal:rooms")).toBe(false);
    });

    it("delete() throws for a reserved key and leaves the store unchanged", () => {
      state.setInternal("$internal:rooms", { a: [] });
      expect(() => state.delete("$internal:rooms")).toThrow();
      expect(state.get("$internal:rooms")).toEqual({ a: [] });
    });

    it("setInternal() writes a reserved key successfully", () => {
      state.setInternal("$internal:automation:foo:enabled", false);
      expect(state.get("$internal:automation:foo:enabled")).toBe(false);
    });

    it("setInternal() throws when given a non-reserved key", () => {
      expect(() => state.setInternal("not-reserved", 1)).toThrow();
    });

    it("deleteInternal() throws when given a non-reserved key", () => {
      expect(() => state.deleteInternal("not-reserved")).toThrow();
    });

    it("deleteInternal() removes a reserved key", () => {
      state.setInternal("$internal:rooms", { a: [] });
      expect(state.deleteInternal("$internal:rooms")).toBe(true);
      expect(state.has("$internal:rooms")).toBe(false);
    });

    it("an internal write survives a restart and reaches a registered listener", async () => {
      const s1 = new StateManager(logger, { persist: true, filePath: TEST_STATE_FILE });
      let observed: unknown;
      s1.onChange("$internal:rooms", (_key, newValue) => {
        observed = newValue;
      });
      s1.setInternal("$internal:rooms", { kitchen: ["lamp"] });
      expect(observed).toEqual({ kitchen: ["lamp"] });
      await s1.flush();

      const s2 = new StateManager(logger, { persist: true, filePath: TEST_STATE_FILE });
      await s2.load();
      expect(s2.get("$internal:rooms")).toEqual({ kitchen: ["lamp"] });

      for (const path of [TEST_STATE_FILE, `${TEST_STATE_FILE}.bak`, `${TEST_STATE_FILE}.tmp`]) {
        try {
          await unlink(path);
        } catch {
          // ignore
        }
      }
    });

    it("keys() excludes reserved keys from enumeration", () => {
      state.set("visible", 1);
      state.setInternal("$internal:rooms", { a: [] });
      expect(state.keys()).toEqual(["visible"]);
    });
  });
});
