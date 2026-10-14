/**
 * The framed container each grid widget renders inside (design.md D6, D11;
 * specs/wall-display "Wall Glanceability", "Wall Visual Language"). The frame
 * owns the widget's grammar-driven surface and its opt-in title, while the
 * per-widget render boundary is applied by {@link WallGrid}. The
 * ambient-vs-control decision and the title rule are the pure
 * {@link wallFrameChrome}/{@link widgetTitle} helpers, so this component stays a
 * thin wrapper that dispatches to the registry's renderer.
 *
 * Re-skinned onto Hearth (design.md D6): an ambient readout draws no surface and
 * sits its large type directly on the panel background, while a control widget
 * draws a `--hearth-surface` tile with a `--hearth-hairline` border and the
 * Hearth radius. The surface tokens come from {@link wallFrameChrome} and the
 * title/padding use Hearth's own tokens — never a Lumen alias or a literal.
 */
import type { WallWidget } from "@ts-ha/shared";
import { wallFrameChrome, wallFrameDrawsSurface, widgetTitle } from "./frame.js";
import { getWidgetDescriptor } from "./registry.js";
import { WALL_TITLE_FONT_SIZE } from "./type-ramp.js";

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
          className="truncate font-semibold uppercase"
          style={{
            color: "var(--hearth-text-muted)",
            fontSize: WALL_TITLE_FONT_SIZE,
            marginBottom: "var(--hearth-space-2)",
          }}
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
      className="flex h-full flex-col overflow-hidden border"
      style={{
        minHeight: 0,
        padding: "var(--hearth-space-4)",
        background: chrome.background ?? undefined,
        borderColor: chrome.borderColor ?? undefined,
        borderRadius: chrome.radius ?? undefined,
      }}
    >
      {content}
    </div>
  );
}
