/**
 * The harness bench (design.md D7; tasks 6.1, 6.2).
 *
 * It calls `getWidgetDescriptor(type).renderer` itself — no `WidgetFrame` in the
 * path — with `contained`, `tier`, `cardForm`, `rendererHeightPx`, and `rowUnit`
 * supplied by the panel. That is the one place the harness deliberately bypasses
 * production code, and it is the point: the frame *derives* tier and form from
 * the placement, so it can never answer "at what height does this card flip?",
 * which is what the budgets in `span.ts` actually encode.
 *
 * Everything else is still the wall's: the type's descriptor, the surface tokens
 * (`wallFrameChrome`), and the renderer itself. The renderer's box is exactly the
 * hand-set `rendererHeightPx`, so crossing the compact/full boundary is a matter
 * of moving one number — and the caption says, in the surface itself, that the
 * frame is not being used.
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
  // The panel sets `contained` to what the frame would pass for this type
  // (`wallFrameDrawsSurface`), so a hand-set value that disagrees with the wall
  // is visible as a difference in the surface rather than silently ignored.
  const drawsSurface = controls.contained;

  return (
    // Hearth declares every `--hearth-*` token under `[data-wall-chunk]` and
    // nowhere else, and in bench mode the wall grid — whose own root carries that
    // scope — is not rendered at all. So the bench surface carries the scope
    // itself: without it every token below resolves to nothing, the frame chrome
    // goes transparent, and the scheme toggle has nothing to switch. The value is
    // empty on purpose: the wall grid's marker is the wall chunk's own signal for
    // the asset test (design.md D9), and this is only a scope.
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
          // The frame's own inset, so the bench's surface is the surface the wall
          // draws: the ported card padding (design.md W3).
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
