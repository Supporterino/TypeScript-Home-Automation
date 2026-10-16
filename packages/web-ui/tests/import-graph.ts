/**
 * The web UI app's own module graph, resolved from its entrypoint. A real walk
 * rather than a text scan: static, side-effect, re-export, and dynamic imports.
 */
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";

/** The app directory every walked module lives in. */
export const APP_DIR = join(import.meta.dirname, "..", "src/app");

/** The application entrypoint the shipped build compiles. */
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
  /** Non-literal dynamic `import()` arguments; the graph is complete only while this is empty. */
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

/** Extensions treated as non-module assets: they ship but carry no imports of their own. */
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

/** Resolves a relative specifier to its file, or `null` when it is not a module of the graph. */
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

/** Every `.ts`/`.tsx` file under `dir`, reachable or not — the completeness check for a walk. */
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
