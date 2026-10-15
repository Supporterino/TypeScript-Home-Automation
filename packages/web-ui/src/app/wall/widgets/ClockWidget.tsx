/**
 * The wall clock/date widget (design.md D11, W1; specs/wall-display "Widget
 * Catalog", "Always-On Operation"). Ticks once a second from the client clock
 * and needs no server data, so it renders correctly while the engine is
 * unreachable.
 *
 * Composed on the wall's single card vocabulary (design.md W1): the ported
 * circular clock affordance, the date as the label, and the time as the reading —
 * the reading keeping the wall's hero tier, which is what is read from across the
 * room (design.md W2). Ambient — chrome-less, its large type sits directly on the
 * panel.
 */
import { Clock } from "lucide-react";
import { useNow } from "../../lib/use-now.js";
import { WallCardStateItem } from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE } from "../cards/metrics.js";
import { WALL_HERO_FONT_SIZE } from "../type-ramp.js";
import { formatClock } from "./clock.js";

export function ClockWidget() {
  const now = useNow(1000);
  const { time, date } = formatClock(now);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}
    >
      <WallCardStateItem
        icon={<Clock size={WALL_CARD_GLYPH_SIZE} />}
        label={date}
        reading={time}
        readingSize={WALL_HERO_FONT_SIZE}
      />
    </div>
  );
}
