/**
 * The framed container each grid widget renders inside (design.md D6, D11;
 * specs/wall-display "Wall Glanceability", "Wall Visual Language",
 * "Panel Fit"). The frame owns the widget's grammar-driven surface, its opt-in
 * title, the resolved span tier and card form it hands the renderer
 * (wall-zones-and-fit D3, D4), and the one place the wall explains a placement
 * that cannot render its type's own minimum rather than clipping it (a renderer
 * that resolves its *own* compositions — the scene tile — explains its own
 * sub-budget box with the same words, from `frame.js`). The per-widget render
 * boundary is applied by {@link WallGrid}. The ambient-vs-control decision, the
 * title rule, and the renderer's own box height are the pure
 * {@link wallFrameChrome}/{@link widgetTitle}/{@link rendererBoxHeightPx}
 * helpers, so this component stays a thin wrapper that dispatches to the
 * registry's renderer.
 *
 * Re-skinned onto Hearth (design.md D6): an ambient readout draws no surface and
 * sits its large type directly on the panel background, while a control widget
 * draws a `--hearth-surface` tile with a `--hearth-hairline` border at the ported
 * card surface — `--hearth-card-radius` and `--hearth-card-padding` — so a
 * control widget's tile and a device card's are the same surface (design.md W3).
 * The surface tokens come from {@link wallFrameChrome}; the title is the wall's own
 * chrome, so it keeps the wall's title tier and adopts the ported
 * family/weight/tracking ({@link wallChromeTextStyle}, design.md W4) — never a
 * Lumen alias, a card role's semantics or a literal.
 */
import type { WallWidget } from "@ts-ha/shared";
import { WallCardMessage } from "./cards/card-anatomy.js";
import {
  minimumRendererBoxHeightPx,
  rendererBoxHeightPx,
  WALL_TOO_SMALL_MESSAGE,
  wallChromeTextStyle,
  wallFrameChrome,
  wallFrameDrawsSurface,
  widgetTitle,
} from "./frame.js";
import { getWidgetDescriptor } from "./registry.js";
import {
  cardHeightPx,
  composesMinimumSpan,
  resolveCardFormForHeight,
  resolveSpanTier,
} from "./span.js";
import { WALL_TITLE_FONT_SIZE } from "./type-ramp.js";

export function WidgetFrame({ widget, rowUnit }: { widget: WallWidget; rowUnit: number }) {
  const descriptor = getWidgetDescriptor(widget.type);
  const Renderer = descriptor.renderer;
  const title = widgetTitle(widget);
  const chrome = wallFrameChrome(descriptor.grammar);
  const drawsSurface = wallFrameDrawsSurface(widget.type, descriptor.grammar);
  // The tier comes from the type's own registry spans, so a renderer's
  // composition and the editor's size rule cannot drift (design.md D3); the form
  // comes from the box the renderer *actually* gets — the cell minus the frame's
  // inset and its title, when it draws one — so a card whose full form does not
  // fit composes its compact form instead of clipping (design.md D3, D4). That
  // same box is handed to the renderer, so a widget whose own composition is
  // budget-driven (the scene tile) resolves it against its own budget rather than
  // this card's.
  const tier = resolveSpanTier(widget, descriptor);
  const rendererHeightPx = rendererBoxHeightPx({
    cellHeightPx: cardHeightPx({ rows: widget.h, rowUnit }),
    framed: drawsSurface,
    titled: title !== null,
  });
  const cardForm = resolveCardFormForHeight(rendererHeightPx);
  // A placement below the type's own minimum — a profile authored before a
  // minimum was re-derived, or written through the API — cannot render the card
  // its type guarantees, so the wall explains it instead of clipping it
  // (specs/wall-display "Panel Fit": overflow becomes an explanation). The test is
  // the cards' *boxes*, not their cells, so a configured title counts against the
  // height here exactly as it does against the form above.
  const tooSmall = !composesMinimumSpan({
    placement: widget,
    descriptor,
    rendererHeightPx,
    minimumRendererHeightPx: minimumRendererBoxHeightPx({
      descriptor,
      rowUnit,
      framed: drawsSurface,
    }),
  });

  const content = (
    <>
      {title !== null && (
        // The opt-in title is the wall's chrome, not widget content (design.md
        // W4): it keeps the wall's own title tier and draws it with the ported
        // family/weight/tracking, so a container label is never given a card
        // role's semantics.
        <p
          className="truncate"
          style={{
            ...wallChromeTextStyle(),
            color: "var(--hearth-text-muted)",
            fontSize: WALL_TITLE_FONT_SIZE,
            marginBottom: "var(--hearth-space-2)",
          }}
        >
          {title}
        </p>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        {tooSmall ? (
          <div className="flex h-full flex-col justify-center">
            <WallCardMessage>{WALL_TOO_SMALL_MESSAGE}</WallCardMessage>
          </div>
        ) : (
          <Renderer
            widget={widget}
            contained={drawsSurface}
            tier={tier}
            cardForm={cardForm}
            rendererHeightPx={rendererHeightPx}
            rowUnit={rowUnit}
          />
        )}
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
        padding: chrome.padding ?? undefined,
        background: chrome.background ?? undefined,
        borderColor: chrome.borderColor ?? undefined,
        borderRadius: chrome.radius ?? undefined,
      }}
    >
      {content}
    </div>
  );
}
