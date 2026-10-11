import { describe, expect, it } from "bun:test";
import type { WallChangeKind, WallProfile } from "@ts-ha/shared";
import type { NormalizedStreamEvent } from "../src/app/types.js";
import {
  wallErrorIsFatal,
  wallEventAffectsProfile,
  wallEventKindForProfile,
  wallViewState,
} from "../src/app/wall/live.js";

// Pure live-update decisions for the wall (tasks 7.1, 7.2; design.md D9;
// specs/wall-display "Profile Changes Reach Open Walls"). No DOM, no React —
// `WallView` is a thin wrapper over these.

const KINDS: readonly WallChangeKind[] = ["created", "updated", "deleted"];

function wallEvent(name: string, kind: WallChangeKind): NormalizedStreamEvent {
  return { category: "wall", name, kind };
}

function profile(): WallProfile {
  return { name: "kitchen", version: 1, config: { widgets: [] } };
}

describe("wallEventKindForProfile", () => {
  it("returns the kind for a wall event naming the profile", () => {
    for (const kind of KINDS) {
      expect(wallEventKindForProfile(wallEvent("kitchen", kind), "kitchen")).toBe(kind);
    }
  });

  it("ignores a wall event for a different profile", () => {
    expect(wallEventKindForProfile(wallEvent("hallway", "updated"), "kitchen")).toBeNull();
  });

  it("ignores a non-wall event", () => {
    expect(wallEventKindForProfile({ category: "readiness", ready: true }, "kitchen")).toBeNull();
    expect(wallEventKindForProfile({ category: "unknown" }, "kitchen")).toBeNull();
  });
});

describe("wallEventAffectsProfile", () => {
  it("is true for a wall event naming the profile", () => {
    expect(wallEventAffectsProfile(wallEvent("kitchen", "created"), "kitchen")).toBe(true);
  });

  it("is false for a different name or a non-wall event", () => {
    expect(wallEventAffectsProfile(wallEvent("hallway", "updated"), "kitchen")).toBe(false);
    expect(wallEventAffectsProfile({ category: "unknown" }, "kitchen")).toBe(false);
  });

  it("agrees with wallEventKindForProfile", () => {
    const events: NormalizedStreamEvent[] = [
      wallEvent("kitchen", "deleted"),
      wallEvent("hallway", "deleted"),
      { category: "unknown" },
    ];
    for (const event of events) {
      expect(wallEventAffectsProfile(event, "kitchen")).toBe(
        wallEventKindForProfile(event, "kitchen") !== null,
      );
    }
  });
});

describe("wallViewState", () => {
  it("is loading before a profile has loaded", () => {
    expect(wallViewState({ profile: null, notFound: false, deleted: false })).toBe("loading");
  });

  it("is ready once a profile has loaded", () => {
    expect(wallViewState({ profile: profile(), notFound: false, deleted: false })).toBe("ready");
  });

  it("is unknown for a 404 on a profile that never existed", () => {
    expect(wallViewState({ profile: null, notFound: true, deleted: false })).toBe("unknown");
  });

  it("is deleted for a profile deleted while open", () => {
    expect(wallViewState({ profile: null, notFound: false, deleted: true })).toBe("deleted");
  });

  it("lets a deletion win over a stale in-memory profile", () => {
    expect(wallViewState({ profile: profile(), notFound: false, deleted: true })).toBe("deleted");
  });

  it("lets a deletion win over an earlier not-found", () => {
    expect(wallViewState({ profile: null, notFound: true, deleted: true })).toBe("deleted");
  });
});

describe("wallErrorIsFatal", () => {
  it("is fatal before any profile has loaded", () => {
    expect(wallErrorIsFatal(null)).toBe(true);
  });

  it("is non-fatal once a composition is showing, so a refetch failure keeps it", () => {
    expect(wallErrorIsFatal(profile())).toBe(false);
  });
});
