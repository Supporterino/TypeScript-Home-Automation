import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import { resolveDeviceClass } from "../src/app/wall/cards/device-class.js";
import { lockCardLocked, lockCardModel, lockCardReading } from "../src/app/wall/cards/LockCard.js";

/**
 * The wall lock card: the property it is driven on and the exact lock/unlock values
 * covered directly; the render asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const CARD = join(APP_DIR, "wall/cards/LockCard.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function enu(property: string, permittedValues: (string | number)[], access = rw): Capability {
  return { kind: "lock", property, access, valueType: "enum", permittedValues };
}

function lock(features: Capability[]): Capability {
  return { kind: "lock", access: rw, valueType: "composite", features };
}

/** A Zigbee2MQTT lock: a `state` enum naming its authored lock and unlock values. */
const LOCK: Capability[] = [lock([enu("state", ["LOCK", "UNLOCK"])])];

/** A lock expressed as a boolean `locked` property with its own on/off encoding. */
const BOOLEAN_LOCK: Capability[] = [
  {
    kind: "lock",
    property: "locked",
    access: rw,
    valueType: "boolean",
    valueOn: true,
    valueOff: false,
  },
];

/** A lock that reports its state but declares nothing writable to drive. */
const READ_ONLY_LOCK: Capability[] = [lock([enu("state", ["LOCK", "UNLOCK"], ro)])];

/** A writable enum whose values name neither lock nor unlock — not a lock's state. */
const NO_TOKENS: Capability[] = [lock([enu("state", ["jammed", "unknown"])])];

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function cardSource(): Promise<string> {
  return stripComments(await readFile(CARD, "utf8"));
}

describe("lockCardModel", () => {
  it("drives the lock on its declared state enum and commands its authored values", () => {
    const model = lockCardModel(LOCK);
    expect(model.property).toBe("state");
    expect(model.lock).toBe("LOCK");
    expect(model.unlock).toBe("UNLOCK");
    expect(model.stateProperty).toBe("state");
  });

  it("drives a boolean lock through its own on/off encoding", () => {
    const model = lockCardModel(BOOLEAN_LOCK);
    expect(model.property).toBe("locked");
    expect(model.lock).toBe(true);
    expect(model.unlock).toBe(false);
  });

  it("reports no property for a lock with nothing writable to drive", () => {
    const model = lockCardModel(READ_ONLY_LOCK);
    expect(model.property).toBeUndefined();
    expect(model.lock).toBeUndefined();
    expect(model.unlock).toBeUndefined();
    expect(model.stateProperty).toBe("state");
  });

  it("reports no property for a writable enum that names neither command", () => {
    expect(lockCardModel(NO_TOKENS).property).toBeUndefined();
    expect(lockCardModel([]).property).toBeUndefined();
  });
});

describe("lockCardLocked", () => {
  it("reads a lock-like value as locked and an unlock-like one as unlocked", () => {
    expect(lockCardLocked("LOCK")).toBe(true);
    expect(lockCardLocked("locked")).toBe(true);
    expect(lockCardLocked("UNLOCK")).toBe(false);
    expect(lockCardLocked("unlocked")).toBe(false);
  });

  it("never guesses at a state neither token matches", () => {
    expect(lockCardLocked("jammed")).toBeUndefined();
    expect(lockCardLocked(5)).toBeUndefined();
    expect(lockCardLocked(undefined)).toBeUndefined();
  });
});

describe("lockCardReading", () => {
  it("reads a recognised state as Locked or Unlocked", () => {
    expect(lockCardReading("LOCK")).toBe("Locked");
    expect(lockCardReading("UNLOCK")).toBe("Unlocked");
  });

  it("reads the state as reported when it matches neither, and an em dash when absent", () => {
    expect(lockCardReading("jammed")).toBe("jammed");
    expect(lockCardReading(undefined)).toBe("—");
  });
});

describe("the lock card's class", () => {
  it("is the class the resolver selects for a lock capability profile", () => {
    expect(resolveDeviceClass(LOCK)).toBe("lock");
    expect(resolveDeviceClass(BOOLEAN_LOCK)).toBe("lock");
  });
});

describe("wall lock card source", () => {
  it("presents the ported anatomy and the locked/unlocked reading", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardIcon");
    expect(source).toContain("<WallCardText");
    expect(source).toContain("lockCardReading(");
    expect(source).toContain("<WallCardObservation");
  });

  it("presents lock and unlock as the actions row's controls", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardActions>");
    expect(source).toContain("<WallCardOption");
    expect(source).toContain("model.lock");
    expect(source).toContain("model.unlock");
    // The options are the state's actuation target: the card never actuates whole.
    expect(source).not.toContain("onActivate");
    expect(source).not.toContain("onClick={toggle}");
  });

  it("presents no control for a lock with nothing writable to drive", async () => {
    const source = await cardSource();
    expect(source).toContain("composition.controls && model.property");
  });

  it("reverts a failed command inline and disables both options while unreachable", async () => {
    const source = await cardSource();
    expect(source).toContain("useOptimisticDeviceProperty");
    expect(source).toContain('role="alert"');
    expect(source).toContain("const disabled = !device.reachable");
    expect(source).toContain("disabled={disabled}");
  });

  it("presents no device-management affordance", async () => {
    const source = await cardSource();
    for (const affordance of [
      "isFavorite",
      "toggleFavorite",
      "hideDevice",
      "unhideDevice",
      "deviceDetailPath",
      "HiddenMarker",
      "FavoriteToggle",
    ]) {
      expect(source).not.toContain(affordance);
    }
  });
});
