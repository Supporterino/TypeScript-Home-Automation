/**
 * The wall status/presence summary widget (specs/wall-display "Widget
 * Catalog"; design.md D13). Reuses the overview's pure {@link summarizeDevices}
 * over the live device map, so counts update as `device_state`/
 * `device_reachability` events stream in — no manual refresh. An ambient
 * readout: chrome-less, its metrics on the panel.
 */
import { Activity, Clock, Power, Unplug } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useDataStore } from "../../lib/data-store.js";
import { summarizeDevices } from "../../lib/overview.js";
import { useNow } from "../../lib/use-now.js";
import { Grid } from "../../ui/index.js";
import { WALL_LABEL_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "../type-ramp.js";

function Metric({
  icon,
  label,
  value,
  colorVar,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  colorVar: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="flex" style={{ color: `var(${colorVar})` }}>
          {icon}
        </span>
        <p
          className="font-semibold uppercase text-muted"
          style={{ fontSize: WALL_LABEL_FONT_SIZE }}
        >
          {label}
        </p>
      </div>
      <p className="font-display font-bold" style={{ fontSize: WALL_METRIC_FONT_SIZE }}>
        {value}
      </p>
    </div>
  );
}

export function StatusWidget() {
  const { devices } = useDataStore();
  const now = useNow();
  const summary = useMemo(() => summarizeDevices(devices, now), [devices, now]);

  return (
    <Grid columns={2} gap={2} className="h-full">
      <Metric icon={<Power size={15} />} label="On" value={summary.on} colorVar="--on" />
      <Metric
        icon={<Unplug size={15} />}
        label="Unreachable"
        value={summary.unreachable}
        colorVar="--danger"
      />
      <Metric icon={<Clock size={15} />} label="Stale" value={summary.stale} colorVar="--stale" />
      <Metric
        icon={<Activity size={15} />}
        label="Motion"
        value={summary.motion}
        colorVar="--info"
      />
    </Grid>
  );
}
