import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Structural assertions for device-name presentation (task 6.2; design.md D8;
 * specs/web-ui "Device Name Presentation"). There is no DOM harness here, so —
 * like `wall-read-only.test.ts` and `wall-card-archetypes.test.ts` — the render
 * decisions are asserted against the source while the humanisation rule itself
 * is covered by `humanize-name.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");

const TILE = join(APP_DIR, "components/DeviceTile.tsx");
const DETAIL = join(APP_DIR, "views/DeviceDetailView.tsx");
const ROOM = join(APP_DIR, "views/RoomView.tsx");
const NAV = join(APP_DIR, "components/Nav.tsx");
const ENERGY = join(APP_DIR, "views/EnergyView.tsx");
const CONFIG = join(APP_DIR, "wall/editor/WidgetConfigFields.tsx");
const AUTOMATION_DETAIL = join(APP_DIR, "views/AutomationDetailView.tsx");

/** Removes block and line comments so prose is not mistaken for rendered code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

describe("humanised labels at presentation sites", () => {
  it("presents the tile header and readout label through the humaniser", async () => {
    const tile = await source(TILE);
    expect(tile).toContain("humanizeDeviceName(device.displayName)");
    expect(tile).toContain("const deviceLabel = humanizeDeviceName(device.displayName)");
    expect(tile).toContain("title={deviceLabel}");
    expect(tile).toContain("{deviceLabel}");
  });

  it("humanises the tile detail affordance's accessible name", async () => {
    const tile = await source(TILE);
    expect(tile).toMatch(/Open \$\{deviceLabel\} details/);
  });

  it("humanises the device detail heading and group-member buttons", async () => {
    const detail = await source(DETAIL);
    expect(detail).toContain("humanizeDeviceName(device.displayName)");
    expect(detail).toContain("humanizeDeviceName(member.displayName)");
  });

  it("humanises the unassigned-device select option label", async () => {
    const room = await source(ROOM);
    expect(room).toContain("humanizeDeviceName(d.displayName)");
  });

  it("humanises the nav device label", async () => {
    const nav = await source(NAV);
    expect(nav).toContain("humanizeDeviceName(device.displayName)");
  });

  it("humanises the energy per-device name", async () => {
    const energy = await source(ENERGY);
    expect(energy).toContain("humanizeDeviceName(device.displayName)");
  });

  it("humanises the wall editor device select label and sorts by it", async () => {
    const config = await source(CONFIG);
    expect(config).toContain("humanizeDeviceName(device.displayName)");
    expect(config).toContain(
      "humanizeDeviceName(a.displayName).localeCompare(humanizeDeviceName(b.displayName))",
    );
  });
});

describe("the raw identifier still addresses the device", () => {
  it("routes and addresses through qualifiedId, not the humanised label", async () => {
    expect(await source(TILE)).toContain("deviceDetailPath(basePath, device.qualifiedId)");
    expect(await source(NAV)).toContain("deviceDetailPath(basePath, device.qualifiedId)");
    expect(await source(DETAIL)).toContain("deviceDetailPath(basePath, memberId)");
    expect(await source(ROOM)).toContain("value={d.qualifiedId}");
    expect(await source(CONFIG)).toContain("value: device.qualifiedId");
  });

  it("keeps the raw qualifiedId visible in the device detail view", async () => {
    const detail = await source(DETAIL);
    expect(detail).toContain("font-mono");
    expect(detail).toContain("{qualifiedId}");
  });
});

describe("out-of-scope identities stay raw", () => {
  it("leaves the automation identity matcher on the raw name/id comparison", async () => {
    const automation = await source(AUTOMATION_DETAIL);
    expect(automation).toContain("d.displayName === name || d.id === name");
    expect(automation).not.toContain("humanizeDeviceName");
  });
});
