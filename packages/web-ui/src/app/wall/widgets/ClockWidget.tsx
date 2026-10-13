/**
 * The wall clock/date widget (specs/wall-display "Widget Catalog", "Always-On
 * Operation"; design.md D13). Ticks once a second from the client clock and
 * needs no server data, so it renders correctly while the engine is
 * unreachable. An ambient readout: chrome-less, its large type on the panel.
 */
import { useNow } from "../../lib/use-now.js";
import { WALL_HERO_FONT_SIZE, WALL_LABEL_FONT_SIZE } from "../type-ramp.js";
import { formatClock } from "./clock.js";

export function ClockWidget() {
  const now = useNow(1000);
  const { time, date } = formatClock(now);

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <p
        className="font-display font-bold"
        style={{ fontSize: WALL_HERO_FONT_SIZE, lineHeight: 1.05 }}
      >
        {time}
      </p>
      <p className="text-center text-muted" style={{ fontSize: WALL_LABEL_FONT_SIZE }}>
        {date}
      </p>
    </div>
  );
}
