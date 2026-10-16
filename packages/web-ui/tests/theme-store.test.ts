import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  applyResolvedTheme,
  readStoredPreference,
  writeStoredPreference,
} from "../src/app/lib/theme-storage.js";
import { resolveTheme, THEME_STORAGE_KEY } from "../src/components/theme-bootstrap.js";

// Pure test — no DOM harness. The read/apply/persist rules default to the live
// `localStorage`/document globals, so stubbing those exercises the real behaviour.

const globalObject = globalThis as Record<string, unknown>;
const ORIGINAL_LOCAL_STORAGE = globalObject.localStorage;
const ORIGINAL_DOCUMENT = globalObject.document;

/** A minimal in-memory stand-in for `localStorage`. */
class MemoryStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

interface StubRoot {
  dataset: { theme?: string };
}

function restore(key: string, original: unknown): void {
  if (original === undefined) Reflect.deleteProperty(globalObject, key);
  else globalObject[key] = original;
}

describe("theme preference persistence", () => {
  let storage: MemoryStorage;
  let root: StubRoot;

  beforeEach(() => {
    storage = new MemoryStorage();
    root = { dataset: {} };
    globalObject.localStorage = storage;
    globalObject.document = { documentElement: root };
  });

  afterEach(() => {
    restore("localStorage", ORIGINAL_LOCAL_STORAGE);
    restore("document", ORIGINAL_DOCUMENT);
  });

  it("defaults to the system preference when nothing is stored", () => {
    expect(readStoredPreference()).toBe("system");
  });

  it("reads a stored explicit preference", () => {
    storage.setItem(THEME_STORAGE_KEY, "light");
    expect(readStoredPreference()).toBe("light");
    storage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readStoredPreference()).toBe("dark");
  });

  it("ignores an unrecognised stored value", () => {
    storage.setItem(THEME_STORAGE_KEY, "neon");
    expect(readStoredPreference()).toBe("system");
  });

  it("applies a stored scheme to the document root's data-theme", () => {
    storage.setItem(THEME_STORAGE_KEY, "dark");
    applyResolvedTheme(resolveTheme(readStoredPreference(), "light"));
    expect(root.dataset.theme).toBe("dark");
  });

  it("follows the system scheme when nothing is stored", () => {
    applyResolvedTheme(resolveTheme(readStoredPreference(), "light"));
    expect(root.dataset.theme).toBe("light");
  });

  it("persists the chosen preference under the shared storage key", () => {
    writeStoredPreference("dark");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
