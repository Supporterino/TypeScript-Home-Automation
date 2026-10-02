#!/usr/bin/env bun
/**
 * Resolve `workspace:` dependency ranges to concrete caret ranges on the publish
 * path.
 *
 * `@changesets/cli` maps the Bun package manager to its npm publish tool, and
 * `changesets publish` shells out to `npm publish`. npm neither rewrites nor
 * understands the `workspace:` protocol, and `@changesets/apply-release-plan`
 * leaves a literal `workspace:*` range untouched. Running this immediately
 * before `changeset publish` rewrites every internal range to `^<version>` so a
 * published tarball never carries a dangling `workspace:` range.
 *
 * Wired only into the root `publish` script; build/typecheck/test are unaffected.
 */

import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

interface Manifest {
  path: string;
  json: Record<string, unknown>;
}

const manifests: Manifest[] = [];
const manifestGlob = new Bun.Glob("packages/*/package.json");
for await (const file of manifestGlob.scan({ cwd: ROOT, onlyFiles: true })) {
  const path = join(ROOT, file);
  manifests.push({ path, json: (await Bun.file(path).json()) as Record<string, unknown> });
}

const versions = new Map<string, string>();
for (const { json } of manifests) {
  if (typeof json.name === "string" && typeof json.version === "string") {
    versions.set(json.name, json.version);
  }
}

let substitutions = 0;

for (const { path, json } of manifests) {
  let changed = false;
  for (const section of DEPENDENCY_SECTIONS) {
    const deps = json[section];
    if (!deps || typeof deps !== "object") continue;
    const ranges = deps as Record<string, unknown>;
    for (const [name, range] of Object.entries(ranges)) {
      if (typeof range !== "string" || !range.startsWith("workspace:")) continue;
      const version = versions.get(name);
      if (!version) {
        throw new Error(
          `Cannot resolve "${name}" in ${section} of ${path}: no matching local package`,
        );
      }
      const resolved = `^${version}`;
      ranges[name] = resolved;
      substitutions += 1;
      changed = true;
      console.log(`${json.name}: ${section}.${name} ${range} -> ${resolved}`);
    }
  }
  if (changed) await Bun.write(path, `${JSON.stringify(json, null, 2)}\n`);
}

console.log(
  substitutions === 0
    ? "resolve-workspace-protocol: no workspace: ranges found; nothing to do."
    : `resolve-workspace-protocol: resolved ${substitutions} workspace range(s).`,
);
