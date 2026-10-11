import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Read-only guard for the wall surface (task 6.3; specs/wall-display "The wall
 * cannot be edited in place"). The wall render path — `WallView`, the grid, and
 * every widget renderer — must expose no add/remove/edit control. Since there
 * is no DOM harness here, this asserts it structurally: none of those modules
 * may import the `wall/editor/**` chunk or the profile-mutation API
 * (`createWall`/`updateWall`/`deleteWall`). The editor module is separately
 * asserted to be the mutation site, so the guard is not vacuous.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const WALL_DIR = join(APP_DIR, "wall");
const EDITOR_DIR = join(WALL_DIR, "editor");
const WALL_VIEW = join(APP_DIR, "views/WallView.tsx");

const MUTATION_API = ["createWall", "updateWall", "deleteWall"] as const;

/** Every `.ts`/`.tsx` under `dir`, skipping the editor chunk (already excluded from the render path). */
async function collectRenderFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "editor") continue;
      files.push(...(await collectRenderFiles(path)));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(path);
    }
  }
  return files;
}

/** Removes block and line comments so prose about the editor is not mistaken for an import. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function readRenderPathFiles(): Promise<Array<{ file: string; content: string }>> {
  const files = [...(await collectRenderFiles(WALL_DIR)), WALL_VIEW];
  return Promise.all(
    files.map(async (file) => ({
      file,
      content: stripComments(await readFile(file, "utf8")),
    })),
  );
}

const EDITOR_IMPORT = /(?:from\s*|import\s*\(\s*)["'][^"']*\/editor(?:\/[^"']*)?["']/;
const MUTATION_TOKEN = new RegExp(`\\b(?:${MUTATION_API.join("|")})\\b`);

describe("wall read-only guard", () => {
  it("finds the expected render-path modules (guard is not vacuous)", async () => {
    const files = await readRenderPathFiles();
    expect(files.length).toBeGreaterThan(1);
    expect(files.some(({ file }) => file === WALL_VIEW)).toBe(true);
  });

  it("imports no editor module from the wall render path", async () => {
    const offending = (await readRenderPathFiles())
      .filter(({ content }) => EDITOR_IMPORT.test(content))
      .map(({ file }) => file);
    expect(offending).toEqual([]);
  });

  it("never imports a profile-mutation API from the wall render path", async () => {
    const offending = (await readRenderPathFiles())
      .filter(({ content }) => MUTATION_TOKEN.test(content))
      .map(({ file }) => file);
    expect(offending).toEqual([]);
  });

  it("keeps the mutation site inside the editor chunk", async () => {
    const editorFiles = (await readdir(EDITOR_DIR)).filter(
      (name) => name.endsWith(".ts") || name.endsWith(".tsx"),
    );
    expect(editorFiles.length).toBeGreaterThan(0);

    const source = (
      await Promise.all(editorFiles.map((name) => readFile(join(EDITOR_DIR, name), "utf8")))
    ).join("\n");
    expect(MUTATION_TOKEN.test(source)).toBe(true);
  });
});
