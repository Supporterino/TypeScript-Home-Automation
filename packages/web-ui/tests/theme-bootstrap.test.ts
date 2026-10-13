import { describe, expect, it } from "bun:test";
import { htmlShell } from "../src/components/html-shell.js";
import {
  resolveTheme,
  THEME_STORAGE_KEY,
  themeBootstrapScript,
} from "../src/components/theme-bootstrap.js";

// Pure test — no DOM. The theme behaves correctly in the browser via
// `useTheme()`, but its two testable pieces are pure strings/logic: the
// no-flash bootstrap script inlined into the shell's <head>, and the
// preference → scheme resolution rule (design.md D4; specs/web-ui "Theme
// Selection").

describe("themeBootstrapScript", () => {
  it("reads the persisted preference from the dashboard's scoped storage key", () => {
    const script = themeBootstrapScript();
    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain("localStorage");
  });

  it("falls back to the system preference when nothing is persisted", () => {
    expect(themeBootstrapScript()).toContain("prefers-color-scheme: dark");
  });

  it("applies the resolved scheme to the document element before the app runs", () => {
    const script = themeBootstrapScript();
    expect(script).toContain("document.documentElement");
    expect(script).toContain("data-theme");
  });

  it("sets a defined data-theme even when reading storage throws", () => {
    const script = themeBootstrapScript();
    const fallbackIndex = script.indexOf("prefers-color-scheme: dark");
    const readIndex = script.indexOf("localStorage");
    const applyIndex = script.indexOf('setAttribute("data-theme",d)');

    // The system fallback is computed before the storage read, so the value
    // survives the catch; the attribute is applied after it, unconditionally.
    expect(fallbackIndex).toBeGreaterThanOrEqual(0);
    expect(fallbackIndex).toBeLessThan(readIndex);
    expect(applyIndex).toBeGreaterThan(script.indexOf("catch"));
  });
});

describe("resolveTheme", () => {
  it("returns an explicit preference unchanged", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("follows the system scheme for the system preference", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
  });
});

describe("no-flash bootstrap placement", () => {
  it("runs in the shell head, before the stylesheet and bundle scripts", () => {
    const html = htmlShell({ basePath: "/status", hasAuth: false });
    const bootstrap = html.indexOf(themeBootstrapScript());
    const stylesheet = html.indexOf('rel="stylesheet"');
    const bundle = html.indexOf('<script type="module"');

    expect(bootstrap).toBeGreaterThanOrEqual(0);
    expect(bootstrap).toBeLessThan(stylesheet);
    expect(bootstrap).toBeLessThan(bundle);
  });
});
