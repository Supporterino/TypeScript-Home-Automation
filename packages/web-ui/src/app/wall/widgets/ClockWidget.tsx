/**
 * The wall clock/date widget (design.md D11; specs/wall-display "Widget
 * Catalog", "Always-On Operation"). Ticks once a second from the client clock
 * and needs no server data, so it renders correctly while the engine is
 * unreachable.
 *
 * Composed on the shared Hearth card vocabulary (design.md D11): a leading
 * clock glyph and the date as the title, with the time as the hero metric.
 * Ambient — chrome-less, its large type sits directly on the panel.
 */
import { Clock } from "lucide-react";
import { useNow } from "../../lib/use-now.js";
import { WALL_CARD_GLYPH_SIZE, WallCardStat } from "./card-vocab.js";
import { formatClock } from "./clock.js";

export function ClockWidget() {
  const now = useNow(1000);
  const { time, date } = formatClock(now);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}
    >
      <WallCardStat icon={<Clock size={WALL_CARD_GLYPH_SIZE} />} label={date} size="hero">
        {time}
      </WallCardStat>
    </div>
  );
}
