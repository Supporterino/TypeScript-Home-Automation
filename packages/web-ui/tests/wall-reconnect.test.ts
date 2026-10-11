import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Reconnect guard for the wall (task 7.3; design.md D11; specs/wall-display
 * "Always-On Operation" "A wall recovers from a network drop").
 *
 * The wall inherits the data layer's existing reconnect-then-resnapshot rather
 * than owning a connection: the single `EventSource` is opened in
 * `lib/data-store.tsx` (the positive control below), which on a network drop
 * marks the transport degraded and falls back to periodic polling, then on
 * reopen re-reads the snapshot so events missed while disconnected are not
 * lost — all without a page reload. The wall's clock widget is derived from
 * the client clock, so it is unaffected by the connection state.
 *
 * This asserts the inheritance structurally: no module in the wall render
 * path may reference `EventSource` or `openEventStream`. Since there is no DOM
 * harness here and the transport wiring is the store's (not the wall's), a
 * source scan is the reachable check.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const WALL_DIR = join(APP_DIR, "wall");
const WALL_VIEW = join(APP_DIR, "views/WallView.tsx");
const DATA_STORE = join(APP_DIR, "lib/data-store.tsx");

const CONNECTION_TOKEN = /\b(?:EventSource|openEventStream)\b/;

/** Removes block and line comments so documentation about the connection is not mistaken for a reference. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Every `.ts`/`.tsx` under `dir`, recursing. */
async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(path);
    }
  }
  return files;
}

async function readRenderPathFiles(): Promise<Array<{ file: string; content: string }>> {
  const files = [...(await collectFiles(WALL_DIR)), WALL_VIEW];
  return Promise.all(
    files.map(async (file) => ({
      file,
      content: stripComments(await readFile(file, "utf8")),
    })),
  );
}

describe("wall reconnect guard", () => {
  it("scans the wall render path (guard is not vacuous)", async () => {
    const files = await readRenderPathFiles();
    expect(files.length).toBeGreaterThan(1);
    expect(files.some(({ file }) => file === WALL_VIEW)).toBe(true);
  });

  it("opens no EventSource or event stream from the wall render path", async () => {
    const offending = (await readRenderPathFiles())
      .filter(({ content }) => CONNECTION_TOKEN.test(content))
      .map(({ file }) => file);
    expect(offending).toEqual([]);
  });

  it("keeps the single connection in the shared data store (positive control)", async () => {
    const store = stripComments(await readFile(DATA_STORE, "utf8"));
    expect(CONNECTION_TOKEN.test(store)).toBe(true);
  });
});
