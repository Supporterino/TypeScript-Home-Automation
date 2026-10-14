/**
 * The wall status/presence summary widget (design.md D11; specs/wall-display
 * "Widget Catalog"). Reuses the overview's pure {@link summarizeDevices} over
 * the live device map, so counts update as `device_state`/`device_reachability`
 * events stream in — no manual refresh.
 *
 * Composed on the shared Hearth card vocabulary (design.md D11): each count is
 * a metric with its own leading glyph and label, laid out on the wall's own
 * grid. Ambient — chrome-less, its metrics on the panel. State is conveyed by
 * the label text as well as the glyph, never colour alone.
 */
import { Activity, Clock, Power, Unplug } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useDataStore } from "../../lib/data-store.js";
import { summarizeDevices } from "../../lib/overview.js";
import { useNow } from "../../lib/use-now.js";
import { WALL_CARD_GLYPH_SIZE, WallCardStat } from "./card-vocab.js";

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
    <WallCardStat icon={icon} label={label} color={color}>
      {value}
    </WallCardStat>
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
