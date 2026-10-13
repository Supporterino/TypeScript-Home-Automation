import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Structural assertions for the narrow-viewport control bar (design.md D6;
 * specs/web-ui "Responsive Navigation"). There is no DOM harness here, so — like
 * `device-name-presentation.test.ts` and `wall-card-archetypes.test.ts` — the
 * render decisions are asserted against the source. The bar's destinations must
 * render as stacked icon-over-label tabs, or each `grid-cols-4` cell truncates
 * its label; the desktop rail keeps the default row layout.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const NAV = join(APP_DIR, "components/Nav.tsx");
const NAV_ITEM = join(APP_DIR, "ui/nav-item.tsx");

/** Removes block and line comments so prose is not mistaken for rendered code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

/** The body of an exported top-level function, up to its closing brace. */
function exportedBlock(content: string, name: string): string {
  const start = content.indexOf(`export function ${name}`);
  if (start === -1) throw new Error(`no export function ${name}`);
  const end = content.indexOf("\n}", start);
  return end === -1 ? content.slice(start) : content.slice(start, end + 2);
}

describe("MobileBottomBar renders stacked tabs", () => {
  it("declares the stacked-tab overrides as a column layout", async () => {
    const nav = await source(NAV);
    const declaration = nav.slice(nav.indexOf("const TAB_ITEM_CLASS"));
    expect(declaration).toContain("flex-col");
    expect(declaration).toContain("items-center");
  });

  it("applies the stacked tab class to every bar destination", async () => {
    const bar = exportedBlock(await source(NAV), "MobileBottomBar");
    expect(bar).toContain("className={TAB_ITEM_CLASS}");
    // The tab styling rides on the destination link, not on an inert wrapper.
    expect(bar).toContain("<NavLink");
  });

  it("keeps the desktop sidebar on the default row layout", async () => {
    const sidebar = exportedBlock(await source(NAV), "DesktopSidebar");
    expect(sidebar).not.toContain("TAB_ITEM_CLASS");
  });

  it("forwards a caller className from NavLink to the NavItem primitive", async () => {
    const nav = await source(NAV);
    const link = nav.slice(nav.indexOf("function NavLink"), nav.indexOf("function NavGroup"));
    expect(link).toContain("className?: string");
    expect(link).toContain("className={className}");
  });

  it("merges a caller className through cn in the NavItem primitive", async () => {
    const item = await source(NAV_ITEM);
    expect(item).toContain("className,");
    // The caller's classes are the last argument, so they win tailwind-merge conflicts.
    expect(item).toMatch(/cn\([\s\S]*className,\s*\)/);
  });
});
