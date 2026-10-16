/**
 * The framed container each grid widget renders inside: the grammar-driven
 * surface, the opt-in title, and the resolved span tier and card form.
 */
import type { WallWidget } from "@ts-ha/shared";
import { useDataStore } from "../lib/data-store.js";
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
import { boundDeviceReadOnly, effectiveSpanDescriptor } from "./slim.js";
import {
  cardHeightPx,
  composesMinimumSpan,
  resolveCardFormForHeight,
  resolveSpanTier,
} from "./span.js";
import { WALL_TITLE_FONT_SIZE } from "./type-ramp.js";

export function WidgetFrame({ widget, rowUnit }: { widget: WallWidget; rowUnit: number }) {
  const descriptor = getWidgetDescriptor(widget.type);
  const { devicesByQualifiedId } = useDataStore();
  const Renderer = descriptor.renderer;
  const title = widgetTitle(widget);
  const chrome = wallFrameChrome(descriptor.grammar);
  const drawsSurface = wallFrameDrawsSurface(widget.type, descriptor.grammar, widget);
  // The frame resolves its bound device so the guard knows a control-less typed device
  // may render one row. A missing device falls back to the type's static minimum.
  const qualifiedId =
    typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
  const readOnly = boundDeviceReadOnly(descriptor, devicesByQualifiedId.get(qualifiedId));
  const effective = effectiveSpanDescriptor(descriptor, readOnly);
  // The form is resolved from the box the renderer actually gets, not its cell.
  const tier = resolveSpanTier(widget, descriptor);
  const rendererHeightPx = rendererBoxHeightPx({
    cellHeightPx: cardHeightPx({ rows: widget.h, rowUnit }),
    framed: drawsSurface,
    titled: title !== null,
  });
  const cardForm = resolveCardFormForHeight(rendererHeightPx);
  // A placement below the type's effective minimum cannot render its guaranteed card,
  // so the wall explains it instead of clipping. The test is on the card boxes.
  const tooSmall = !composesMinimumSpan({
    placement: widget,
    descriptor: effective,
    rendererHeightPx,
    minimumRendererHeightPx: minimumRendererBoxHeightPx({
      descriptor: effective,
      rowUnit,
      framed: drawsSurface,
    }),
  });

  const content = (
    <>
      {title !== null && (
        // The opt-in title is the wall's own chrome, not widget content.
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
