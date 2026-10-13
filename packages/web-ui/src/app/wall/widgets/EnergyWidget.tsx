/**
 * The wall energy widget (specs/wall-display "Widget Catalog"; specs/energy-
 * monitoring; design.md D13). Reads `GET /api/energy` and refetches, debounced,
 * on every device event that can change the aggregated totals, so the totals
 * update live without a manual refresh. An ambient readout: chrome-less, its
 * metrics on the panel.
 */
import type { EnergyData } from "@ts-ha/shared";
import { Database, Zap } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchEnergy } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import { isEnergyRelevantEvent } from "../../lib/energy.js";
import { Spinner } from "../../ui/index.js";
import { WALL_BODY_FONT_SIZE, WALL_LABEL_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "../type-ramp.js";
import { energyDisplay } from "./energy-model.js";

/** Coalesces a burst of device events into one endpoint refetch. */
const REFETCH_DEBOUNCE_MS = 750;

function Metric({
  icon,
  label,
  value,
  colorVar,
}: {
  icon: ReactNode;
  label: string;
  value: string;
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

export function EnergyWidget() {
  const { subscribe, transport } = useDataStore();
  const [data, setData] = useState<EnergyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchEnergy());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load energy data");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const previousTransport = useRef(transport);
  useEffect(() => {
    const previous = previousTransport.current;
    previousTransport.current = transport;
    if (previous !== "live" && transport === "live") void load();
  }, [transport, load]);

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

  if (error !== null) {
    return (
      <p className="text-danger" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
        Energy data unavailable: {error}
      </p>
    );
  }

  if (data === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const display = energyDisplay(data);

  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <Metric icon={<Zap size={15} />} label="Power" value={display.power} colorVar="--info" />
      <Metric
        icon={<Database size={15} />}
        label="Total"
        value={display.consumption}
        colorVar="--on"
      />
      {display.meteringCount === 0 && (
        <p className="text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
          No metering devices report yet.
        </p>
      )}
    </div>
  );
}
