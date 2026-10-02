import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const SRC_DIR = join(import.meta.dir, "..", "src");

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

/** Removes block and line comments so doc examples are not mistaken for imports. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("@ts-ha/shared import-time safety", () => {
  it("imports the barrel without throwing and exposes the capability helpers", async () => {
    const shared = await import("../src/index.js");
    expect(typeof shared.readBooleanCapabilityValue).toBe("function");
    expect(typeof shared.composeBooleanCapabilityValue).toBe("function");
    expect(shared.SESSION_COOKIE).toBe("ts-ha-session");
    expect(shared.INTERNAL_STATE_PREFIX).toBe("$internal:");
  });

  it("contains no node: builtin imports in its source", async () => {
    const files = await collectSourceFiles(SRC_DIR);
    const offending: string[] = [];
    for (const file of files) {
      const content = stripComments(await readFile(file, "utf8"));
      if (/from\s+["']node:/.test(content) || /import\s*\(\s*["']node:/.test(content)) {
        offending.push(file);
      }
    }
    expect(offending).toEqual([]);
  });

  it("contains no non-relative runtime imports (no runtime dependencies)", async () => {
    const files = await collectSourceFiles(SRC_DIR);
    const offending: Array<{ file: string; specifier: string }> = [];
    // Matches static imports and dynamic imports with a string specifier.
    const importPattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
    for (const file of files) {
      const content = stripComments(await readFile(file, "utf8"));
      for (const match of content.matchAll(importPattern)) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) offending.push({ file, specifier });
      }
    }
    expect(offending).toEqual([]);
  });
});
