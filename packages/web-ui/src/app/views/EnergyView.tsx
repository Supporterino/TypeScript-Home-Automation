/**
 * The lazy Energy view: aggregated power, cumulative consumption, per-device
 * breakdown, and a hand-rendered inline SVG trend.
 */

import type { EnergyData } from "@ts-ha/shared";
import { ChartLine, Database, Gauge, PlugZap, TriangleAlert, Unplug, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchEnergy } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import {
  formatKwh,
  formatWatts,
  isEnergyRelevantEvent,
  SPARKLINE_HEIGHT,
  SPARKLINE_WIDTH,
  sparklineLabel,
  sparklinePoints,
} from "../lib/energy.js";
import { humanizeDeviceName } from "../lib/humanize-name.js";
import { Badge, Card, EmptyState, Grid, Row, Spinner, Stack, Stat } from "../ui/index.js";

/** Coalesces a burst of device events into one endpoint refetch. */
const REFETCH_DEBOUNCE_MS = 750;

function Sparkline({ data }: { data: EnergyData }) {
  const points = useMemo(() => sparklinePoints(data.history), [data.history]);
  const label = useMemo(() => sparklineLabel(data.history), [data.history]);
  if (points === "") return null;

  return (
    <Card>
      <Stack gap={2}>
        <Row gap={1} align="center">
          <ChartLine size={14} aria-hidden className="text-muted" />
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            Recent power trend
          </span>
        </Row>
        <svg
          viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
          width="100%"
          height={64}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
          className="text-info"
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </Stack>
    </Card>
  );
}

export function EnergyView() {
  const { subscribe, transport } = useDataStore();
  const [data, setData] = useState<EnergyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchEnergy();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load energy data");
    }
  }, []);

  // The route is a lazy chunk, so `/api/energy` is never requested for first paint.
  useEffect(() => {
    void load();
  }, [load]);

  // Re-fetch when the stream (re)connects: events may have been missed.
  const previousTransport = useRef(transport);
  useEffect(() => {
    const previous = previousTransport.current;
    previousTransport.current = transport;
    if (previous !== "live" && transport === "live") void load();
  }, [transport, load]);

  // Device events carry no aggregated total, so refetch the endpoint — debounced,
  // because a room command emits one event per member.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return subscribe((event) => {
      if (!isEnergyRelevantEvent(event)) return;
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => {
        refetchTimer.current = null;
        void load();
      }, REFETCH_DEBOUNCE_MS);
    });
  }, [subscribe, load]);

  useEffect(() => {
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, []);

  const noMetering = data !== null && data.breakdown.length === 0;

  return (
    <Stack gap={4}>
      <Row justify="between" align="center" gap={3} wrap>
        <h2 className="font-display text-2xl font-bold text-ink">Energy</h2>
        {data && !noMetering && (
          <span className="text-xs text-muted">
            {data.breakdown.length} metering device{data.breakdown.length === 1 ? "" : "s"}
          </span>
        )}
      </Row>

      {error && (
        <Stack gap={1} className="rounded-tile border border-danger/40 bg-danger/10 p-3">
          <Row gap={2} align="center">
            <TriangleAlert size={16} aria-hidden className="text-danger" />
            <span className="font-semibold text-ink">Energy data unavailable</span>
          </Row>
          <p role="alert" className="text-sm text-muted">
            {error}
          </p>
        </Stack>
      )}

      {!data && !error ? (
        <Spinner className="mt-2" />
      ) : data ? (
        <>
          <Grid columns={2} md={3} gap={3}>
            <Card>
              <Stat
                icon={<Zap size={14} />}
                label="Current power"
                value={formatWatts(data.powerWatts)}
                tone="info"
              />
            </Card>
            <Card>
              <Stat
                icon={<Database size={14} />}
                label="Cumulative"
                value={formatKwh(data.energyWh)}
                tone="on"
              />
            </Card>
            <Card>
              <Stat
                icon={<Gauge size={14} />}
                label="Metering devices"
                value={data.breakdown.length}
                tone="stale"
              />
            </Card>
          </Grid>

          <Sparkline data={data} />

          {data.history.length === 0 && !noMetering && (
            <p className="text-xs text-muted">
              No history samples are available — history may be disabled on this deployment.
            </p>
          )}

          {noMetering ? (
            <EmptyState
              icon={<PlugZap size={28} />}
              title="No devices report energy metering yet"
              description="Instantaneous power and cumulative consumption appear here once a metering device (for example a Shelly switch) is reporting."
            />
          ) : (
            <Stack gap={2}>
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                Per-device breakdown
              </span>
              {data.breakdown.map((device) => (
                <Card key={device.qualifiedId}>
                  <Row justify="between" align="center" gap={2} wrap>
                    <Row gap={2} align="center" className="min-w-0" wrap={false}>
                      <span className="truncate text-sm font-medium text-ink">
                        {humanizeDeviceName(device.displayName)}
                      </span>
                      {!device.available && (
                        <Badge tone="danger">
                          <Unplug size={12} aria-hidden />
                          unavailable
                        </Badge>
                      )}
                    </Row>
                    <Row gap={3} align="center" wrap={false}>
                      <span className="font-mono text-sm text-ink">
                        {device.powerWatts === undefined ? "—" : formatWatts(device.powerWatts)}
                      </span>
                      <span className="font-mono text-sm text-ink">
                        {device.energyWh === undefined ? "—" : formatKwh(device.energyWh)}
                      </span>
                    </Row>
                  </Row>
                </Card>
              ))}
              <p className="text-xs text-muted">
                A dash means the device reports no such reading — it is not counted as zero.
                Unavailable devices are excluded from the totals above.
              </p>
            </Stack>
          )}
        </>
      ) : null}
    </Stack>
  );
}
