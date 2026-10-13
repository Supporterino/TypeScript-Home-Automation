/**
 * The framed container each grid widget renders inside (design.md D13; specs/
 * wall-display "Wall Glanceability"). The frame owns the widget's
 * grammar-driven surface and its opt-in title, while the per-widget render
 * boundary is applied by {@link WallGrid}. The ambient-vs-control decision and
 * the title rule are the pure {@link wallFrameChrome}/{@link widgetTitle}
 * helpers, so this component stays a thin wrapper that dispatches to the
 * registry's renderer.
 *
 * Rebuilt on the Lumen layers (design.md D13): an ambient readout draws no
 * surface and sits its large type directly on the panel background, while a
 * control widget draws a `--surface` tile with a hairline border and the shared
 * tile radius. The surface tokens come from {@link wallFrameChrome} — never a
 * literal in the view.
 */
import type { WallWidget } from "@ts-ha/shared";
import { wallFrameChrome, wallFrameDrawsSurface, widgetTitle } from "./frame.js";
import { getWidgetDescriptor } from "./registry.js";
import { WALL_LABEL_FONT_SIZE } from "./type-ramp.js";

export function WidgetFrame({ widget }: { widget: WallWidget }) {
  const descriptor = getWidgetDescriptor(widget.type);
  const Renderer = descriptor.renderer;
  const title = widgetTitle(widget);
  const chrome = wallFrameChrome(descriptor.grammar);
  const drawsSurface = wallFrameDrawsSurface(widget.type, descriptor.grammar);

  const content = (
    <>
      {title !== null && (
        <p
          className="truncate font-semibold uppercase text-muted"
          style={{ fontSize: WALL_LABEL_FONT_SIZE, marginBottom: 6 }}
        >
          {title}
        </p>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Renderer widget={widget} contained={drawsSurface} />
      </div>
    </>
  );

  if (!drawsSurface) {
    return (
      <div className="flex h-full flex-col overflow-hidden" style={{ minHeight: 0 }}>
        {content}
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden border p-4"
      style={{
        minHeight: 0,
        background: chrome.background ?? undefined,
        borderColor: chrome.borderColor ?? undefined,
        borderRadius: chrome.radius ?? undefined,
      }}
    >
      {content}
    </div>
  );
}
