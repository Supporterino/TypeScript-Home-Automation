/**
 * The harness bench: it calls a widget's renderer directly, with the props supplied by
 * the panel rather than derived by the frame.
 */
import type { WallWidget } from "@ts-ha/shared";
import { wallFrameChrome } from "../frame.js";
import { getWidgetDescriptor } from "../registry.js";
import { WALL_LABEL_FONT_SIZE } from "../type-ramp.js";
import type { HarnessBenchControls } from "./messages.js";

export function Bench({
  widget,
  controls,
}: {
  widget: WallWidget;
  controls: HarnessBenchControls;
}) {
  const descriptor = getWidgetDescriptor(widget.type);
  const Renderer = descriptor.renderer;
  const chrome = wallFrameChrome(descriptor.grammar);
  // A hand-set `contained` that disagrees with the wall is visible, not ignored.
  const drawsSurface = controls.contained;

  return (
    // Hearth scopes its tokens under [data-wall-chunk]; the bench carries that scope itself.
    <div
      data-wall-chunk=""
      className="flex h-full flex-col overflow-hidden"
      style={{
        background: "var(--hearth-canvas)",
        color: "var(--hearth-text)",
        padding: "var(--hearth-space-4)",
        gap: "var(--hearth-space-3)",
      }}
    >
      <div
        className={drawsSurface ? "flex flex-col overflow-hidden border" : "flex flex-col"}
        style={{
          minHeight: 0,
          // The frame's own inset, so the bench's surface is the wall's.
          padding: drawsSurface ? "var(--hearth-card-padding)" : undefined,
          background: drawsSurface ? (chrome.background ?? undefined) : undefined,
          borderColor: drawsSurface ? (chrome.borderColor ?? undefined) : undefined,
          borderRadius: drawsSurface ? (chrome.radius ?? undefined) : undefined,
        }}
      >
        {/* The renderer's own box, exactly the hand-set height. */}
        <div style={{ height: controls.rendererHeightPx, minHeight: 0 }}>
          <Renderer
            widget={widget}
            contained={controls.contained}
            tier={controls.tier}
            cardForm={controls.cardForm}
            rendererHeightPx={controls.rendererHeightPx}
            rowUnit={controls.rowUnit}
          />
        </div>
      </div>

      <p
        style={{
          margin: 0,
          color: "var(--hearth-text-muted)",
          fontSize: WALL_LABEL_FONT_SIZE,
        }}
      >
        Bench — the widget frame is bypassed (design D7): {widget.type} “{widget.id}” · tier{" "}
        {controls.tier} · {controls.cardForm} · renderer {controls.rendererHeightPx}px · row unit{" "}
        {controls.rowUnit}px
      </p>
    </div>
  );
}
