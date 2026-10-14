import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { backToWallPath } from "../src/app/lib/router.js";
import { wallViewState } from "../src/app/wall/live.js";

/**
 * Wall navigation (wall-zones-and-fit D11; specs/wall-display "Wall
 * Navigation", "Named Wall Profiles"). The rule that decides whether a wall
 * offers a way back is pure, so it is asserted directly; the affordance's wiring
 * is asserted structurally, since there is no DOM harness — the same style as
 * `wall-read-only.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const WALL_VIEW = join(APP_DIR, "views/WallView.tsx");
const ROUTER_CONTEXT = join(APP_DIR, "lib/router-context.tsx");

/** Removes block and line comments so prose is not mistaken for markup. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

describe("backToWallPath", () => {
  it("returns the wall a wall was opened from", () => {
    expect(backToWallPath("/wall/Overview", "/")).toBe("/wall/Overview");
    expect(backToWallPath("/wall/Kitchen", "/")).toBe("/wall/Kitchen");
  });

  it("keeps the app's base path in the returned address", () => {
    expect(backToWallPath("/home/wall/Overview", "/home")).toBe("/home/wall/Overview");
  });

  it("escapes a profile name that needs it", () => {
    expect(backToWallPath("/wall/Upstairs%20hall", "/")).toBe("/wall/Upstairs%20hall");
  });

  it("offers no way back for a deep link", () => {
    expect(backToWallPath(null, "/")).toBeNull();
  });

  it("offers no way back when the previous route was not a wall", () => {
    expect(backToWallPath("/devices", "/")).toBeNull();
    expect(backToWallPath("/walls", "/")).toBeNull();
    expect(backToWallPath("/", "/")).toBeNull();
  });

  it("offers no way back for a path outside the app's base", () => {
    expect(backToWallPath("/other/wall/Kitchen", "/home")).toBeNull();
  });
});

describe("the wall's back affordance", () => {
  it("renders a back control only for a wall reached from a wall", async () => {
    const view = await source(WALL_VIEW);

    expect(view).toContain("backToWallPath(origin, basePath)");
    expect(view).toContain("{backTo !== null && (");
    expect(view).toContain("<Link to={backTo}");
    // A touch-sized Hearth affordance over the composition, never a hover-only
    // control (specs/wall-display "Navigation is touch-operable").
    expect(view).toContain("wallAffordanceStyle()");
    expect(view).not.toContain("onMouseEnter");
  });

  it("takes the wall it was opened from out of the shared router's history", async () => {
    const router = await source(ROUTER_CONTEXT);

    // The router records the path each in-app navigation was pushed from, and
    // exposes it to the surface that asks — no bespoke history layer (design.md
    // D11).
    expect(router).toContain("pushState({ from: window.location.pathname }");
    expect(router).toContain("origin: string | null");
    expect(router).toContain("originPathname()");
  });
});

describe("a link to an unknown profile", () => {
  it("reaches the wall's own not-found explanation rather than a dead end", async () => {
    const view = await source(WALL_VIEW);

    // The link navigates to the target's wall address, so a target that does not
    // exist lands on the same explanation an unknown profile always shows.
    expect(view).toContain("Wall not found");
    expect(view).toContain("wallsPath(basePath)");
    expect(wallViewState({ profile: null, notFound: true, deleted: false })).toBe("unknown");
  });

  it("still offers the way back from that explanation", async () => {
    const view = await source(WALL_VIEW);
    const explanation = view.slice(view.indexOf("Wall not found"));

    expect(explanation).toContain("Back to the previous wall");
    expect(explanation).toContain("<Link to={backTo}");
  });
});
