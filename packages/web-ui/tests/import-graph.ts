/**
 * The web UI app's own module graph, resolved from its entrypoint (task 7.2;
 * design.md D9).
 *
 * A real walk rather than a text scan: every *relative* specifier is resolved to
 * the file it names — the repo writes `.js` specifiers that resolve to the
 * `.ts`/`.tsx` source beside them — and every form that can add an edge counts:
 * a static `import`, a side-effect `import "x"`, a re-export (`export … from`),
 * and a dynamic `import()`. Following the dynamic ones is what makes a lazily
 * loaded view part of the graph, which is exactly the kind of path a guard about
 * what ships must see.
 *
 * Bare specifiers (`@ts-ha/shared`, `react`, …) and non-TS files (the
 * stylesheets) name another package or a non-module asset, so the walk stops
 * there. A relative specifier that names *no* file at all is a different case
 * and throws rather than being skipped — silently skipping one is how a guard
 * stops guarding — while a relative specifier for a non-TS file is a deliberate
 * stop, not a failure (see {@link resolveSpecifier}).
 *
 * This module is deliberately not a `*.test.ts` file — `bun test` does not pick
 * it up — so the harness guard and the fixture-seam scan share one walker
 * instead of two approximations of it.
 */
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";

/** The app directory every walked module lives in. */
export const APP_DIR = join(import.meta.dirname, "..", "src/app");

/** The application entrypoint the shipped build compiles (design.md D1, D9). */
export const APP_ENTRY = join(APP_DIR, "index.tsx");

/** How a specifier was written in the importing module. */
export type AppImportKind = "import" | "re-export" | "dynamic";

/** One resolved edge of the app's module graph. */
export interface AppImportEdge {
  /** The module doing the importing. */
  readonly importer: string;
  /** The module imported — always a `.ts`/`.tsx` file under {@link APP_DIR}. */
  readonly imported: string;
  readonly kind: AppImportKind;
}

/** The traversed graph: the entrypoint, every reachable module, and every edge. */
export interface AppModuleGraph {
  readonly entry: string;
  /** Every reachable module, entry first, in breadth-first order. */
  readonly files: readonly string[];
  readonly edges: readonly AppImportEdge[];
  /**
   * Every dynamic `import()` whose argument is not a string literal. A computed
   * specifier cannot be followed, so the graph is only complete while this is
   * empty — the guard asserts that.
   */
  readonly computedDynamicImports: readonly { readonly file: string; readonly source: string }[];
}

/** Removes block and line comments so prose about an import is not read as one. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Every specifier written in `source`, with the form it was written in. */
function specifiersIn(source: string): { specifier: string; kind: AppImportKind }[] {
  const code = stripComments(source);
  const found: { specifier: string; kind: AppImportKind }[] = [];

  for (const match of code.matchAll(/\b(import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']/g)) {
    const [, keyword, specifier] = match;
    if (specifier === undefined) continue;
    found.push({ specifier, kind: keyword === "export" ? "re-export" : "import" });
  }
  for (const match of code.matchAll(/\bimport\s*["']([^"']+)["']/g)) {
    const [, specifier] = match;
    if (specifier !== undefined) found.push({ specifier, kind: "import" });
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const [, specifier] = match;
    if (specifier !== undefined) found.push({ specifier, kind: "dynamic" });
  }

  return found;
}

/** Every dynamic `import()` argument that is not a string literal. */
function computedDynamicImportsIn(source: string): string[] {
  const code = stripComments(source);
  const computed: string[] = [];
  for (const match of code.matchAll(/\bimport\s*\(\s*([^)]*?)\s*\)/g)) {
    const argument = match[1] ?? "";
    if (!/^["']/.test(argument)) computed.push(argument);
  }
  return computed;
}

/**
 * Extensions this walk treats as non-module assets: they travel in the shipped
 * bundle but carry no imports of their own, so the module graph ends at them.
 * The app imports its stylesheets this way (`./styles/app.css`,
 * `../wall/hearth.css`); the font and image kinds are listed so a future asset
 * import is a stop rather than a false alarm.
 */
const NON_MODULE_ASSET_EXTENSIONS = [
  ".css",
  ".woff2",
  ".woff",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".webp",
  ".gif",
  ".ico",
];

/**
 * The file a relative specifier names, or `null` when the specifier is not a
 * module of the graph at all: a bare specifier (another package), or a relative
 * specifier naming a non-module asset — one of
 * {@link NON_MODULE_ASSET_EXTENSIONS}, which is only the stylesheets in the tree
 * today.
 *
 * Every other relative specifier must resolve to TypeScript source (`.js`
 * specifiers resolve to the `.ts`/`.tsx` file beside them; an extensionless one
 * resolves the same way), and one that resolves to nothing throws: silently
 * skipping it is how a guard stops guarding, and a specifier that names no file
 * is a broken import the build would fail on anyway.
 */
function resolveSpecifier(importer: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = normalize(join(dirname(importer), specifier));
  const withoutExtension = base.replace(/\.js$/, "");

  for (const candidate of [
    base,
    `${withoutExtension}.ts`,
    `${withoutExtension}.tsx`,
    `${withoutExtension}/index.ts`,
    `${withoutExtension}/index.tsx`,
  ]) {
    if (!candidate.endsWith(".ts") && !candidate.endsWith(".tsx")) continue;
    if (existsSync(candidate)) return candidate;
  }

  if (NON_MODULE_ASSET_EXTENSIONS.includes(extname(base))) {
    // A stylesheet, font, or image: part of the shipped bundle, but not part of
    // the module graph.
    return null;
  }
  throw new Error(`cannot resolve "${specifier}" imported by ${importer}`);
}

/** Walks the app's module graph from `entry`, breadth-first. */
export async function collectAppModules(entry: string = APP_ENTRY): Promise<AppModuleGraph> {
  const files: string[] = [];
  const edges: AppImportEdge[] = [];
  const computedDynamicImports: { file: string; source: string }[] = [];
  const seen = new Set<string>([entry]);
  const queue = [entry];

  while (queue.length > 0) {
    const importer = queue.shift();
    if (importer === undefined) break;
    files.push(importer);

    const source = await Bun.file(importer).text();
    for (const argument of computedDynamicImportsIn(source)) {
      computedDynamicImports.push({ file: importer, source: argument });
    }

    for (const { specifier, kind } of specifiersIn(source)) {
      const imported = resolveSpecifier(importer, specifier);
      if (imported === null) continue;
      edges.push({ importer, imported, kind });
      if (seen.has(imported)) continue;
      seen.add(imported);
      queue.push(imported);
    }
  }

  return { entry, files, edges, computedDynamicImports };
}

/** Whether `path` is inside `dir` (and not `dir` itself). */
export function isInside(dir: string, path: string): boolean {
  return path.startsWith(`${dir}/`);
}

/** A short, readable form of a module path: its path relative to the app directory. */
export function appPath(path: string): string {
  return path.startsWith(APP_DIR) ? path.slice(APP_DIR.length + 1) : path;
}

/**
 * Every `.ts`/`.tsx` file under `dir`, whether or not the entrypoint can reach
 * it. Comparing this against a walk is how a caller proves the walk missed no
 * edge: an app module the walk did not reach is either genuinely unreachable
 * (the harness) or a hole in the walker.
 */
export async function listAppModules(dir: string = APP_DIR): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listAppModules(path)));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(path);
  }
  return files;
}
