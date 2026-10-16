/**
 * The wall link widget: opens another named wall profile through the wall's own
 * route affordance.
 */
import { ArrowRight } from "lucide-react";
import { shortDeviceName } from "../../lib/humanize-name.js";
import { wallPath } from "../../lib/router.js";
import { useRouter } from "../../lib/router-context.js";
import { WallCardMessage, WallCardRoute } from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE } from "../cards/metrics.js";
import type { WallWidgetProps } from "../registry.js";
import { linkLabel, linkLabelFontSize, linkTarget } from "./link-model.js";

export function LinkWidget({ widget, tier }: WallWidgetProps) {
  const { basePath } = useRouter();
  const target = linkTarget(widget.config);
  const label = linkLabel(widget.config, target);

  if (target === null) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center" }}>
        <WallCardMessage>
          No wall profile configured for this link. Choose one in the wall editor.
        </WallCardMessage>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <WallCardRoute
        to={wallPath(basePath, target)}
        glyph={<ArrowRight size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
        label={shortDeviceName(label ?? target)}
        labelSize={linkLabelFontSize(tier)}
      />
    </div>
  );
}
