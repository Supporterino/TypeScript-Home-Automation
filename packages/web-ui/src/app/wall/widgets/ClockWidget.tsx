/**
 * The wall clock/date widget: ticks once a second from the client clock with no
 * server data.
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
