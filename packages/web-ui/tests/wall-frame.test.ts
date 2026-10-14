import { describe, expect, it } from "bun:test";
import { WALL_WIDGET_TYPES, type WallWidget, type WallWidgetType } from "@ts-ha/shared";
import { wallFrameChrome, widgetTitle } from "../src/app/wall/frame.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";

// Pure frame decisions — no DOM. The ambient/control grammar and the opt-in
// title rule are the whole frame's behaviour (design.md D2, D3; specs/wall-
// display "Wall Glanceability").

function widget(type: WallWidgetType, config: Record<string, unknown> = {}): WallWidget {
  return { id: "a", type, config, x: 0, y: 0, w: 3, h: 2 };
}

describe("wallFrameChrome", () => {
  it("renders an ambient readout without a control surface", () => {
    const chrome = wallFrameChrome("ambient");
    expect(chrome.surface).toBe(false);
    expect(chrome.background).toBeNull();
    expect(chrome.borderColor).toBeNull();
    expect(chrome.radius).toBeNull();
  });

  it("renders a control widget as a Hearth surface tile", () => {
    const chrome = wallFrameChrome("control");
    expect(chrome.surface).toBe(true);
    expect(chrome.background).toBe("var(--hearth-surface)");
    expect(chrome.borderColor).toBe("var(--hearth-hairline)");
    expect(chrome.radius).toBe("var(--hearth-radius-md)");
  });

  it("derives the surface from each type's descriptor grammar", () => {
    for (const type of WALL_WIDGET_TYPES) {
      const grammar = WALL_WIDGET_REGISTRY[type].grammar;
      expect(wallFrameChrome(grammar).surface).toBe(grammar === "control");
    }
  });
});

describe("widgetTitle", () => {
  it("returns null when no title is configured, so no header is rendered", () => {
    expect(widgetTitle(widget("clock"))).toBeNull();
    expect(widgetTitle(widget("device", { qualifiedId: "zigbee:0xabc" }))).toBeNull();
  });

  it("returns the configured title when one is set", () => {
    expect(widgetTitle(widget("clock", { title: "Hallway" }))).toBe("Hallway");
  });

  it("treats a blank configured title as unset", () => {
    expect(widgetTitle(widget("clock", { title: "   " }))).toBeNull();
  });

  it("ignores a non-string title value", () => {
    expect(widgetTitle(widget("clock", { title: 42 }))).toBeNull();
  });
});
