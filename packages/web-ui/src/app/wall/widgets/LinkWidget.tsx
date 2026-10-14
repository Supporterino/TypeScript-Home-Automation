/**
 * The wall link widget (wall-zones-and-fit D11; specs/wall-display "Wall
 * Navigation", "Widget Catalog"). A link opens another named wall profile: it
 * renders a touch-sized Hearth affordance carrying the configured label (or the
 * target profile's name) and navigates to the target's own address through the
 * shared router, so the address changes, the browser's own back works, and the
 * wall is reload-safe.
 *
 * A link whose target names no saved profile is resolved when the target wall
 * renders — it shows that wall's own unknown-profile explanation, so a broken
 * link has no separate error path (design.md D11). A link with no target
 * configured explains itself inside its own area rather than drawing a dead
 * affordance. The affordance meets the wall's minimum touch target in both
 * directions and needs no hover.
 */
import { ArrowRight } from "lucide-react";
import { shortDeviceName } from "../../lib/humanize-name.js";
import { wallPath } from "../../lib/router.js";
import { Link, useRouter } from "../../lib/router-context.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_CARD_GLYPH_SIZE, WallCardMessage, wallAffordanceStyle } from "./card-vocab.js";
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
      <Link
        to={wallPath(basePath, target)}
        style={{ ...wallAffordanceStyle(), textDecoration: "none" }}
      >
        <ArrowRight size={WALL_CARD_GLYPH_SIZE} aria-hidden />
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: linkLabelFontSize(tier),
          }}
        >
          {shortDeviceName(label ?? target)}
        </span>
      </Link>
    </div>
  );
}
