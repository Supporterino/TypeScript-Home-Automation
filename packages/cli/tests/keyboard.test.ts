import { describe, expect, it } from "bun:test";
import { shouldHandleGlobalShortcut } from "../src/keyboard.js";

// specs/cli "Command Surface" — a tab's free-text input must not be corrupted
// by the dashboard's global shortcuts (digits switch tabs, `q` quits).

describe("shouldHandleGlobalShortcut", () => {
  it("handles global shortcuts when no input is active", () => {
    expect(shouldHandleGlobalShortcut(false)).toBe(true);
  });

  it("stands down while a tab is capturing free text", () => {
    expect(shouldHandleGlobalShortcut(true)).toBe(false);
  });
});
