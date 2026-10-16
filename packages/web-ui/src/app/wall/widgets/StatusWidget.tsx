/**
 * The wall status/presence summary widget: reuses the overview's `summarizeDevices`
 * over the live device map.
 */
import { Activity, Clock, Power, Unplug } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useDataStore } from "../../lib/data-store.js";
import { summarizeDevices } from "../../lib/overview.js";
import { useNow } from "../../lib/use-now.js";
import { WallCardStateItem } from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE } from "../cards/metrics.js";
import { WALL_METRIC_FONT_SIZE } from "../type-ramp.js";

function Metric({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <WallCardStateItem
      icon={icon}
      label={label}
      reading={value}
      readingSize={WALL_METRIC_FONT_SIZE}
      tint={color}
    />
  );
}

export function StatusWidget() {
  const { devices } = useDataStore();
  const now = useNow();
  const summary = useMemo(() => summarizeDevices(devices, now), [devices, now]);

  return (
    <div
      style={{
        display: "grid",
        height: "100%",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        alignContent: "center",
        gap: "var(--hearth-space-4)",
      }}
    >
      <Metric
        icon={<Power size={WALL_CARD_GLYPH_SIZE} />}
        label="On"
        value={summary.on}
        color="var(--hearth-on)"
      />
      <Metric
        icon={<Unplug size={WALL_CARD_GLYPH_SIZE} />}
        label="Unreachable"
        value={summary.unreachable}
        color="var(--hearth-danger)"
      />
      <Metric
        icon={<Clock size={WALL_CARD_GLYPH_SIZE} />}
        label="Stale"
        value={summary.stale}
        color="var(--hearth-stale)"
      />
      <Metric
        icon={<Activity size={WALL_CARD_GLYPH_SIZE} />}
        label="Motion"
        value={summary.motion}
        color="var(--hearth-info)"
      />
    </div>
  );
}
