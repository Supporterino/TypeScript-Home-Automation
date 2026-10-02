#!/usr/bin/env bun
/**
 * Contract guard (design.md D5, D7; task 2.7).
 *
 * Asserts that every contract in `scripts/contract-inventory.json` has exactly
 * one declaration site under `packages/shared/src` and is not re-declared in a
 * consumer source root (`src/` and `packages/*\/src`, excluding shared).
 *
 * Detection is declaration-shaped (`interface`/`type`/`class`/`const`/
 * `function`/`enum`), so a re-export shim does not count as a declaration.
 * Wired into the root `check` script.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

type Kind = "interface" | "type" | "class" | "const" | "function" | "enum";

interface Contract {
  name: string;
  kind: Kind;
  definedIn: string;
  consumers?: string[];
}

const inventory = (await Bun.file(join(ROOT, "scripts/contract-inventory.json")).json()) as {
  contracts: Contract[];
};

const fileCache = new Map<string, string>();

async function read(file: string): Promise<string> {
  const cached = fileCache.get(file);
  if (cached !== undefined) return cached;
  const content = await readFile(join(ROOT, file), "utf8");
  fileCache.set(file, content);
  return content;
}

async function listFiles(pattern: string): Promise<string[]> {
  const glob = new Bun.Glob(pattern);
  const files: string[] = [];
  for await (const file of glob.scan({ cwd: ROOT, onlyFiles: true })) {
    files.push(file);
  }
  return files;
}

const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function declarationPattern(name: string, kind: Kind): RegExp {
  const n = escapeForRegex(name);
  const head = "(?:^|\\n)[ \\t]*(?:export[ \\t]+)?(?:declare[ \\t]+)?";
  // A declaration's name is followed by one of these shapes; requiring it
  // prevents matching an inline `type X,` specifier inside an import/export
  // list (which is a re-export, not a declaration).
  const body: Record<Kind, string> = {
    interface: `interface[ \\t]+${n}\\b(?:[ \\t]*<|[ \\t]+extends\\b|[ \\t]*\\{)`,
    type: `type[ \\t]+${n}\\b(?:[ \\t]*<|[ \\t]*=)`,
    class: `class[ \\t]+${n}\\b(?:[ \\t]*<|[ \\t]+extends\\b|[ \\t]+implements\\b|[ \\t]*\\{)`,
    const: `const[ \\t]+${n}\\b[ \\t]*[:=]`,
    function: `(?:async[ \\t]+)?function[ \\t]+${n}\\b(?:[ \\t]*<[^>]*>)?[ \\t]*\\(`,
    enum: `enum[ \\t]+${n}\\b[ \\t]*\\{`,
  };
  return new RegExp(head + body[kind], "g");
}

const countSites = (content: string, pattern: RegExp): number =>
  content.match(pattern)?.length ?? 0;

const sharedFiles = await listFiles("packages/shared/src/**/*.{ts,tsx}");
const consumerFiles = [
  ...(await listFiles("src/**/*.{ts,tsx}")),
  ...(await listFiles("packages/*/src/**/*.{ts,tsx}")),
].filter((file) => !file.startsWith("packages/shared/"));

const failures: string[] = [];

for (const contract of inventory.contracts) {
  const pattern = declarationPattern(contract.name, contract.kind);

  const sharedSites: string[] = [];
  for (const file of sharedFiles) {
    if (countSites(await read(file), pattern) > 0) sharedSites.push(file);
  }

  if (sharedSites.length !== 1) {
    failures.push(
      `[shared] ${contract.name} (${contract.kind}) has ${sharedSites.length} definition site(s) ` +
        `in @ts-ha/shared; expected exactly 1. Found: ${sharedSites.join(", ") || "(none)"}`,
    );
  } else if (sharedSites[0] !== contract.definedIn) {
    failures.push(
      `[shared] ${contract.name} (${contract.kind}) is defined in ${sharedSites[0]}, ` +
        `but the inventory pins ${contract.definedIn}`,
    );
  }

  const consumerSites: string[] = [];
  for (const file of consumerFiles) {
    if (countSites(await read(file), pattern) > 0) consumerSites.push(file);
  }

  if (consumerSites.length > 0) {
    failures.push(
      `[consumer] ${contract.name} (${contract.kind}) is re-declared outside @ts-ha/shared: ` +
        consumerSites.join(", "),
    );
  }
}

if (failures.length > 0) {
  console.error(`guard-contracts: ${failures.length} contract violation(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `guard-contracts: ${inventory.contracts.length} shared contracts each have exactly one definition site.`,
);
