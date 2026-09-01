import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { DeviceVisibility, HIDDEN_PREFIX, hiddenKey } from "../src/core/device-visibility.js";
import { StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });

describe("DeviceVisibility", () => {
  let stateManager: StateManager;
  let visibility: DeviceVisibility;

  beforeEach(() => {
    stateManager = new StateManager(logger, { persist: false });
    visibility = new DeviceVisibility(stateManager, logger);
  });

  describe("hide / unhide / isHidden", () => {
    it("a device is visible by default", () => {
      expect(visibility.isHidden("zigbee:0xaaa")).toBe(false);
    });

    it("hide() marks a device hidden", () => {
      visibility.hide("zigbee:0xaaa");
      expect(visibility.isHidden("zigbee:0xaaa")).toBe(true);
    });

    it("unhide() marks a hidden device visible again", () => {
      visibility.hide("zigbee:0xaaa");
      visibility.unhide("zigbee:0xaaa");
      expect(visibility.isHidden("zigbee:0xaaa")).toBe(false);
    });

    it("hiding is idempotent", () => {
      visibility.hide("zigbee:0xaaa");
      visibility.hide("zigbee:0xaaa");
      expect(visibility.isHidden("zigbee:0xaaa")).toBe(true);
    });

    it("unhiding is idempotent", () => {
      visibility.unhide("zigbee:0xaaa");
      expect(visibility.isHidden("zigbee:0xaaa")).toBe(false);
    });

    it("hiding a qualified id the system does not know succeeds", () => {
      expect(() => visibility.hide("zigbee:0xunknown")).not.toThrow();
      expect(visibility.isHidden("zigbee:0xunknown")).toBe(true);
    });

    it("persists across a reload (survives a fresh StateManager over the same store)", async () => {
      const { mkdtemp, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");

      const dir = await mkdtemp(join(tmpdir(), "ts-ha-visibility-"));
      const filePath = join(dir, "state.json");

      const sm1 = new StateManager(logger, { persist: true, filePath, flushIntervalMs: 0 });
      const vis1 = new DeviceVisibility(sm1, logger);
      vis1.hide("zigbee:0xaaa");
      await sm1.flush();

      const sm2 = new StateManager(logger, { persist: true, filePath, flushIntervalMs: 0 });
      await sm2.load();
      const vis2 = new DeviceVisibility(sm2, logger);

      expect(vis2.isHidden("zigbee:0xaaa")).toBe(true);

      await rm(dir, { recursive: true, force: true });
    });
  });

  describe("listHidden", () => {
    it("lists every hidden qualified id", () => {
      visibility.hide("zigbee:0xaaa");
      visibility.hide("shelly:plug1");
      expect(visibility.listHidden().sort()).toEqual(["shelly:plug1", "zigbee:0xaaa"].sort());
    });

    it("does not list an unhidden device", () => {
      visibility.hide("zigbee:0xaaa");
      visibility.unhide("zigbee:0xaaa");
      expect(visibility.listHidden()).toEqual([]);
    });

    it("returns an empty list when nothing is hidden", () => {
      expect(visibility.listHidden()).toEqual([]);
    });
  });

  describe("hiddenKey round-trip with a colon-scoped identifier", () => {
    it("a qualified id containing a colon round-trips through hiddenKey and listHidden", () => {
      // A state toggle's qualified id is itself colon-scoped: "state:<automation-name>:<key>".
      const colonScopedId = "state:night_mode:enabled";
      visibility.hide(colonScopedId);

      expect(visibility.listHidden()).toContain(colonScopedId);
      expect(hiddenKey(colonScopedId)).toBe(`${HIDDEN_PREFIX}${colonScopedId}`);
    });
  });

  describe("onChange", () => {
    it("fires with { qualifiedId, hidden: true } when a device is hidden", () => {
      const handler = mock(() => {});
      visibility.onChange(handler);

      visibility.hide("zigbee:0xaaa");

      expect(handler).toHaveBeenCalledWith({ qualifiedId: "zigbee:0xaaa", hidden: true });
    });

    it("fires with { qualifiedId, hidden: false } when a device is unhidden", () => {
      visibility.hide("zigbee:0xaaa");
      const handler = mock(() => {});
      visibility.onChange(handler);

      visibility.unhide("zigbee:0xaaa");

      expect(handler).toHaveBeenCalledWith({ qualifiedId: "zigbee:0xaaa", hidden: false });
    });

    it("does not fire for a no-op hide or unhide", () => {
      visibility.hide("zigbee:0xaaa");
      const handler = mock(() => {});
      visibility.onChange(handler);

      visibility.hide("zigbee:0xaaa"); // already hidden
      expect(handler).not.toHaveBeenCalled();

      visibility.unhide("zigbee:0xbbb"); // already visible
      expect(handler).not.toHaveBeenCalled();
    });

    it("a throwing listener does not prevent other listeners from being notified", () => {
      const bad = mock(() => {
        throw new Error("boom");
      });
      const good = mock(() => {});
      visibility.onChange(bad);
      visibility.onChange(good);

      visibility.hide("zigbee:0xaaa");

      expect(good).toHaveBeenCalledTimes(1);
    });

    it("stops firing after offChange", () => {
      const handler = mock(() => {});
      visibility.onChange(handler);
      visibility.offChange(handler);

      visibility.hide("zigbee:0xaaa");

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
