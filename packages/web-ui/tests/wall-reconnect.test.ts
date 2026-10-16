import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Reconnect guard for the wall: no module in the wall render path may reference
 * `EventSource` or `openEventStream` — the data layer owns the connection.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const WALL_DIR = join(APP_DIR, "wall");
const WALL_VIEW = join(APP_DIR, "views/WallView.tsx");
const DATA_STORE = join(APP_DIR, "lib/data-store.tsx");

const CONNECTION_TOKEN = /\b(?:EventSource|openEventStream)\b/;

/** Removes block and line comments so prose about a connection is not mistaken for a reference. */
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
