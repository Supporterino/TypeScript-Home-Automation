#!/usr/bin/env bun
/**
 * Dependency-direction guard (design.md D7; task 7.2).
 *
 * Asserts the workspace dependency graph matches `specs/packaging`
 * "Dependency Direction":
 *   - `packages/web-ui/src` must not import `@ts-ha/core`, even type-only.
 *   - `packages/core/src` must not import `@ts-ha/web-ui`, static or dynamic.
 *   - no package other than `@ts-ha/cli` may depend on `@ts-ha/core`.
 *   - the only allowed runtime edges are shared→(none), core→shared,
 *     web-ui→shared, and cli→{core, shared}; cli's web-ui edge may only be an
 *     optional peer.
 *
 * Wired into the root `check` script and CI.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const WORKSPACE_PACKAGES = ["@ts-ha/shared", "@ts-ha/core", "@ts-ha/web-ui", "@ts-ha/cli"];
const WORKSPACE_PREFIX = "@ts-ha/";

/** Runtime (`dependencies`) edges each package may declare. */
const ALLOWED_RUNTIME: Record<string, readonly string[]> = {
  "@ts-ha/shared": [],
  "@ts-ha/core": ["@ts-ha/shared"],
  "@ts-ha/web-ui": ["@ts-ha/shared"],
  "@ts-ha/cli": ["@ts-ha/core", "@ts-ha/shared"],
};

/** Optional peer edges each package may declare (and must mark optional). */
const ALLOWED_OPTIONAL_PEERS: Record<string, readonly string[]> = {
  "@ts-ha/shared": [],
  "@ts-ha/core": [],
  "@ts-ha/web-ui": [],
  "@ts-ha/cli": ["@ts-ha/web-ui"],
};

/** Edges the spec requires to exist. */
const REQUIRED_RUNTIME: Record<string, readonly string[]> = {
  "@ts-ha/shared": [],
  "@ts-ha/core": ["@ts-ha/shared"],
  "@ts-ha/web-ui": ["@ts-ha/shared"],
  "@ts-ha/cli": ["@ts-ha/core", "@ts-ha/shared"],
};

/** Importer package name → workspace packages it may not import from source. */
const FORBIDDEN_IMPORTS: Record<string, readonly string[]> = {
  "@ts-ha/web-ui": ["@ts-ha/core"],
  "@ts-ha/core": ["@ts-ha/web-ui"],
};

interface Manifest {
  name: string;
  dir: string;
  json: Record<string, unknown>;
}

const failures: string[] = [];

// --- Module specifier extraction ---------------------------------------------

const IMPORT_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /(?:^|\n)[ \t]*import\s*["']([^"']+)["']/g,
];

/** Strip comments so a package name mentioned in prose is not treated as an import. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function importedSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function basePackage(specifier: string): string | undefined {
  return WORKSPACE_PACKAGES.find((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

function workspaceDeps(section: unknown): string[] {
  if (!section || typeof section !== "object") return [];
  return Object.keys(section as Record<string, unknown>).filter((name) =>
    name.startsWith(WORKSPACE_PREFIX),
  );
}

// --- Source import scan -------------------------------------------------------

const manifests = new Map<string, Manifest>();
const manifestGlob = new Bun.Glob("packages/*/package.json");
for await (const file of manifestGlob.scan({ cwd: ROOT, onlyFiles: true })) {
  const json = (await Bun.file(join(ROOT, file)).json()) as Record<string, unknown>;
  manifests.set(dirname(file), { name: String(json.name), dir: dirname(file), json });
}

const sourceGlob = new Bun.Glob("packages/*/src/**/*.{ts,tsx}");
for await (const file of sourceGlob.scan({ cwd: ROOT, onlyFiles: true })) {
  const ownerDir = file.match(/^packages\/[^/]+/)?.[0];
  const owner = ownerDir ? manifests.get(ownerDir) : undefined;
  const forbidden = owner ? FORBIDDEN_IMPORTS[owner.name] : undefined;
  if (!owner || !forbidden || forbidden.length === 0) continue;

  const source = stripComments(await readFile(join(ROOT, file), "utf8"));
  for (const specifier of importedSpecifiers(source)) {
    const target = basePackage(specifier);
    if (target && forbidden.includes(target)) {
      failures.push(
        `[import] ${file} imports "${specifier}", but ${owner.name} must not depend on ${target}`,
      );
    }
  }
}

// --- Manifest edge scan -------------------------------------------------------

for (const manifest of manifests.values()) {
  const { name, json } = manifest;
  const runtime = workspaceDeps(json.dependencies);
  const dev = workspaceDeps(json.devDependencies);
  const peer = workspaceDeps(json.peerDependencies);
  const optional = workspaceDeps(json.optionalDependencies);
  const peerMeta = (json.peerDependenciesMeta ?? {}) as Record<string, { optional?: boolean }>;

  for (const dep of runtime) {
    // The non-cli core edge has its own dedicated message below.
    if (name !== "@ts-ha/cli" && dep === "@ts-ha/core") continue;
    if (!(ALLOWED_RUNTIME[name] ?? []).includes(dep)) {
      failures.push(`[edge] ${name} -> ${dep} is not an allowed runtime dependency`);
    }
  }

  for (const dep of REQUIRED_RUNTIME[name] ?? []) {
    if (!runtime.includes(dep)) {
      failures.push(`[edge] ${name} must declare ${dep} as a runtime dependency`);
    }
  }

  for (const dep of dev) {
    failures.push(`[edge] ${name} must not declare workspace dependency ${dep} in devDependencies`);
  }

  for (const dep of optional) {
    failures.push(
      `[edge] ${name} must not declare workspace dependency ${dep} in optionalDependencies`,
    );
  }

  for (const dep of peer) {
    if (!(ALLOWED_OPTIONAL_PEERS[name] ?? []).includes(dep)) {
      failures.push(`[edge] ${name} must not declare workspace peer ${dep}`);
      continue;
    }
    if (peerMeta[dep]?.optional !== true) {
      failures.push(`[edge] ${name}'s workspace peer ${dep} must be marked optional`);
    }
  }

  // Only @ts-ha/cli may reach core, in any dependency section.
  if (name !== "@ts-ha/cli" && [runtime, dev, peer, optional].flat().includes("@ts-ha/core")) {
    failures.push(`[edge] ${name} must not depend on @ts-ha/core (only @ts-ha/cli may)`);
  }
}

// --- Report -------------------------------------------------------------------

for (const pkg of WORKSPACE_PACKAGES) {
  if (![...manifests.values()].some((manifest) => manifest.name === pkg)) {
    failures.push(`[topology] workspace package ${pkg} is missing a packages/*/package.json`);
  }
}

if (failures.length > 0) {
  console.error(`guard-deps: ${failures.length} dependency violation(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  "guard-deps: dependency graph matches specs/packaging " +
    "(no core→web-ui, no web-ui→core, cli→{core,shared}).",
);
