import { afterEach, describe, expect, it } from "bun:test";
import { readFile, unlink } from "node:fs/promises";
import type { DeviceObservation } from "@ts-ha/shared";
import pino from "pino";
import { DeviceStateStore } from "../src/device-sources/device-state-store.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const logger = pino({ level: "silent" });
const TEST_FILE = "./test-device-state.json";
const ZIGBEE_ID = "zigbee:0x00158d0001234567";
const SHELLY_ID = "shelly:living_room_plug";

const RECORDED_AT = 1_700_000_000_000;
const OBSERVATION: DeviceObservation = { mode: "push", observedAt: RECORDED_AT };

async function removeTestFiles(): Promise<void> {
  for (const path of [TEST_FILE, `${TEST_FILE}.bak`, `${TEST_FILE}.tmp`]) {
    try {
      await unlink(path);
    } catch {
      // ignore if file doesn't exist
    }
  }
}

describe("DeviceStateStore", () => {
  describe("record / get / prune", () => {
    it("returns undefined for an unknown device", () => {
      const store = new DeviceStateStore(logger, { persist: false });
      expect(store.get(ZIGBEE_ID)).toBeUndefined();
    });

    it("records and retrieves a device's state and observation", () => {
      const store = new DeviceStateStore(logger, { persist: false });
      store.record(ZIGBEE_ID, { state: "ON", brightness: 128 }, OBSERVATION);

      const record = store.get(ZIGBEE_ID);
      expect(record?.state).toEqual({ state: "ON", brightness: 128 });
      expect(record?.observation).toEqual(OBSERVATION);
    });

    it("overwrites the previous record for the same device", () => {
      const store = new DeviceStateStore(logger, { persist: false });
      store.record(ZIGBEE_ID, { state: "OFF" }, OBSERVATION);

      const newer: DeviceObservation = { mode: "polled", observedAt: RECORDED_AT + 1_000 };
      store.record(ZIGBEE_ID, { state: "ON" }, newer);

      expect(store.size).toBe(1);
      expect(store.get(ZIGBEE_ID)?.state).toEqual({ state: "ON" });
      expect(store.get(ZIGBEE_ID)?.observation).toEqual(newer);
    });

    it("prunes a record and reports whether it existed", () => {
      const store = new DeviceStateStore(logger, { persist: false });
      store.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);

      expect(store.prune(ZIGBEE_ID)).toBe(true);
      expect(store.get(ZIGBEE_ID)).toBeUndefined();
      expect(store.prune(ZIGBEE_ID)).toBe(false);
    });

    it("tracks size across records", () => {
      const store = new DeviceStateStore(logger, { persist: false });
      expect(store.size).toBe(0);
      store.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);
      store.record(SHELLY_ID, { output: true }, { mode: "polled", observedAt: RECORDED_AT });
      expect(store.size).toBe(2);
    });
  });

  describe("persistence", () => {
    afterEach(removeTestFiles);

    it("starts empty without throwing when no file exists", async () => {
      await removeTestFiles();
      const store = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      await store.load();
      expect(store.size).toBe(0);
    });

    it("persists records keyed by qualified id with state and observation", async () => {
      const store = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      store.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);
      await store.flush();

      const onDisk = JSON.parse(await readFile(TEST_FILE, "utf-8"));
      expect(onDisk[ZIGBEE_ID]).toEqual({ state: { state: "ON" }, observation: OBSERVATION });
    });

    it("restores a record with its original observation, not the read time", async () => {
      const saved = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      saved.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);
      await saved.flush();

      const restored = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      await restored.load();

      const record = restored.get(ZIGBEE_ID);
      expect(record?.state).toEqual({ state: "ON" });
      // The observation is restored verbatim — observedAt is when it was
      // recorded, never the read time (design.md D4).
      expect(record?.observation.observedAt).toBe(RECORDED_AT);
      expect(record?.observation.mode).toBe("push");
    });

    it("lets a fresh record supersede a restored seed", async () => {
      const saved = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      saved.record(ZIGBEE_ID, { state: "OFF" }, OBSERVATION);
      await saved.flush();

      const restored = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      await restored.load();
      const fresher: DeviceObservation = { mode: "push", observedAt: RECORDED_AT + 5_000 };
      restored.record(ZIGBEE_ID, { state: "ON" }, fresher);

      expect(restored.get(ZIGBEE_ID)?.state).toEqual({ state: "ON" });
      expect(restored.get(ZIGBEE_ID)?.observation).toEqual(fresher);
    });

    it("persists a prune so the device is not restored", async () => {
      const saved = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      saved.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);
      saved.record(SHELLY_ID, { output: true }, { mode: "polled", observedAt: RECORDED_AT });
      await saved.flush();

      saved.prune(ZIGBEE_ID);
      await saved.flush();

      const restored = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      await restored.load();
      expect(restored.get(ZIGBEE_ID)).toBeUndefined();
      expect(restored.get(SHELLY_ID)?.state).toEqual({ output: true });
    });

    it("starts empty without throwing when the file is corrupt", async () => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(TEST_FILE, "{ not valid json", "utf-8");
      const store = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      await store.load();
      expect(store.size).toBe(0);
    });

    it("recovers from a valid backup when the primary file is corrupt", async () => {
      const { writeFile } = await import("node:fs/promises");
      const saved = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      saved.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);
      await saved.flush();
      // A second save leaves the previous good file as the `.bak` backup.
      saved.record(SHELLY_ID, { output: true }, { mode: "polled", observedAt: RECORDED_AT });
      await saved.flush();

      // Corrupt the primary; the backup still holds the previous good save.
      await writeFile(TEST_FILE, "{ not valid json", "utf-8");

      const restored = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      await restored.load();

      expect(restored.get(ZIGBEE_ID)?.state).toEqual({ state: "ON" });
    });

    it("leaves no .tmp file after a successful save", async () => {
      const store = new DeviceStateStore(logger, { persist: true, filePath: TEST_FILE });
      store.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);
      await store.flush();

      const { access } = await import("node:fs/promises");
      await expect(access(`${TEST_FILE}.tmp`)).rejects.toThrow();
    });
  });

  describe("write-behind flush scheduling", () => {
    afterEach(removeTestFiles);

    it("coalesces many records within one interval into exactly one save", async () => {
      let saveCount = 0;
      const store = new DeviceStateStore(logger, {
        persist: true,
        filePath: TEST_FILE,
        flushIntervalMs: 30,
      });
      const originalSave = store.save.bind(store);
      store.save = (async () => {
        saveCount++;
        return originalSave();
      }) as typeof store.save;

      for (let i = 0; i < 20; i++) {
        store.record(`state:key${i}`, { value: i }, OBSERVATION);
      }

      await sleep(80);
      expect(saveCount).toBe(1);
      await store.flush();
    });

    it("flushes a pending save immediately on flush()", async () => {
      const store = new DeviceStateStore(logger, {
        persist: true,
        filePath: TEST_FILE,
        flushIntervalMs: 10_000,
      });
      store.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);
      await store.flush();

      const onDisk = JSON.parse(await readFile(TEST_FILE, "utf-8"));
      expect(onDisk[ZIGBEE_ID].state).toEqual({ state: "ON" });
    });

    it("flushIntervalMs: 0 saves on every record", async () => {
      let saveCount = 0;
      const store = new DeviceStateStore(logger, {
        persist: true,
        filePath: TEST_FILE,
        flushIntervalMs: 0,
      });
      const originalSave = store.save.bind(store);
      store.save = (async () => {
        saveCount++;
        return originalSave();
      }) as typeof store.save;

      store.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);
      store.record(SHELLY_ID, { output: true }, OBSERVATION);
      // Immediate-mode saves are fired without being awaited by record().
      await sleep(10);

      expect(saveCount).toBe(2);
      await store.flush();
    });

    it("schedules no save when persist is false", async () => {
      const store = new DeviceStateStore(logger, { persist: false, filePath: TEST_FILE });
      let saveCalled = false;
      const originalSave = store.save.bind(store);
      store.save = (async () => {
        saveCalled = true;
        return originalSave();
      }) as typeof store.save;

      store.record(ZIGBEE_ID, { state: "ON" }, OBSERVATION);
      await sleep(30);

      expect(saveCalled).toBe(false);
    });
  });
});
