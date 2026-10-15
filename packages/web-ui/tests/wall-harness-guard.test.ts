import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { appPath, collectAppModules, isInside, listAppModules } from "./import-graph.js";

/**
 * The render harness must stay unreachable from the application entrypoint
 * (design.md D9; task 7.2; specs/web-ui "A development-only module does not
 * reach the shipped build").
 *
 * D9 needs two guards rather than trust. This one walks the app's *real* module
 * graph from `src/app/index.tsx` — static imports, side-effect imports,
 * re-exports, and dynamic `import()` — so a lazily loaded path counts exactly as
 * a static one, and it fails on any reachable route to `wall/harness/**`,
 * including a re-export. The asset test's marker assertion is the other guard: it
 * catches a regression in the build's own entrypoint list, which a walk of the
 * source graph cannot see.
 *
 * There is no DOM harness here and this is a source-level fact, so a source walk
 * is the reachable check — the same style as `wall-read-only.test.ts`.
 */
const HARNESS_DIR = join(import.meta.dirname, "..", "src/app/wall/harness");

/**
 * App modules the shipped graph deliberately no longer reaches beyond the
 * harness. `lib/card-archetype.ts` is intentionally retained: the change's
 * proposal (Non-Goals) states "the shared device tile, `lib/card-archetype.ts`
 * and the dashboard's device views keep their current presentation and ranking",
 * so only the wall's *use* of it is retired (task 5.2) — the module and its own
 * unit tests stay in the tree. No app module imports it now (the wall selects a
 * card through `wall/cards/device-class.ts`, and the shared tile ranks through
 * `lib/capability-ranking.ts`), which is why it has no consumer. Naming it here
 * keeps the walker's completeness check honest: a *new* edge to it, or any other
 * unreached module, still fails.
 */
const RETIRED_APP_MODULES: ReadonlySet<string> = new Set(["lib/card-archetype.ts"]);

describe("wall harness guard", () => {
  it("walks the app's module graph from the entrypoint (guard is not vacuous)", async () => {
    const graph = await collectAppModules();

    // A healthy app graph: every module is the package's own frontend source —
    // a bare specifier names another package, so the walk stops there rather
    // than wandering into `@ts-ha/shared` or `node_modules`.
    expect(graph.files.length).toBeGreaterThan(100);
    expect(graph.entry.endsWith("src/app/index.tsx")).toBe(true);
    const srcDir = join(import.meta.dirname, "..", "src");
    for (const file of graph.files) {
      expect(isInside(srcDir, file), file).toBe(true);
    }

    // It reaches the wall through the *lazy* route, which only a walk that
    // follows dynamic imports can do.
    expect(graph.files.some((file) => file.endsWith("/views/WallView.tsx"))).toBe(true);
    expect(graph.files.some((file) => file.endsWith("/wall/WallGrid.tsx"))).toBe(true);

    const viewEdge = graph.edges.find(
      (edge) => edge.imported.endsWith("/views/WallView.tsx") && edge.importer.endsWith("App.tsx"),
    );
    expect(viewEdge?.kind).toBe("dynamic");
  });

  it("misses no app module, so a hole in the walker cannot hide a path", async () => {
    const graph = await collectAppModules();
    const reached = new Set(graph.files);
    const unreached = (await listAppModules()).filter((file) => !reached.has(file));

    // The only modules the entrypoint cannot reach are the harness itself, the
    // ambient declaration files, and the retired wall archetype module named
    // above. Anything else unreached would mean this walker had missed an edge —
    // and the guard's silence would mean nothing — so the assertion makes the
    // walker's completeness part of the guard.
    const offenders = unreached
      .filter(
        (file) =>
          !isInside(HARNESS_DIR, file) &&
          !file.endsWith(".d.ts") &&
          !RETIRED_APP_MODULES.has(appPath(file)),
      )
      .map(appPath);
    expect(offenders).toEqual([]);
  });

  it("follows re-exports and side-effect imports as well as plain imports", async () => {
    const graph = await collectAppModules();

    // `ui/index.ts` is a barrel of `export … from` lines, and `index.tsx`
    // imports its stylesheet for its side effect; both are edges of the graph.
    const kinds = new Set(graph.edges.map((edge) => edge.kind));
    expect(kinds.has("import")).toBe(true);
    expect(kinds.has("re-export")).toBe(true);
    const barrelEdges = graph.edges.filter(
      (edge) => edge.importer.endsWith("/ui/index.ts") && edge.kind === "re-export",
    );
    expect(barrelEdges.length).toBeGreaterThan(5);
  });

  it("uses no computed dynamic import, which no static walk could follow", async () => {
    const graph = await collectAppModules();

    expect(graph.computedDynamicImports).toEqual([]);
  });

  it("reaches no module under wall/harness/", async () => {
    const graph = await collectAppModules();

    const reached = graph.files.filter((file) => isInside(HARNESS_DIR, file)).map(appPath);
    const route = graph.edges
      .filter((edge) => isInside(HARNESS_DIR, edge.imported))
      .map((edge) => `${appPath(edge.importer)} → ${appPath(edge.imported)} (${edge.kind})`);

    expect(reached).toEqual([]);
    expect(route).toEqual([]);
  });
});
