/**
 * The wall energy widget (design.md D11; specs/wall-display "Widget Catalog";
 * specs/energy-monitoring). Reads `GET /api/energy` and refetches, debounced,
 * on every device event that can change the aggregated totals, so the totals
 * update live without a manual refresh.
 *
 * Composed on the shared Hearth card vocabulary (design.md D11): a metric per
 * reading (instantaneous power and accumulated consumption), each with its own
 * leading glyph and label. Ambient — chrome-less, its metrics on the panel.
 */
import type { EnergyData } from "@ts-ha/shared";
import { Database, Zap } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchEnergy } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import { isEnergyRelevantEvent } from "../../lib/energy.js";
import { Spinner } from "../../ui/index.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import { WALL_CARD_GLYPH_SIZE, WallCardStat } from "./card-vocab.js";
import { energyDisplay } from "./energy-model.js";

/** Coalesces a burst of device events into one endpoint refetch. */
const REFETCH_DEBOUNCE_MS = 750;

function Metric({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <WallCardStat icon={icon} label={label} color={color}>
      {value}
    </WallCardStat>
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
      <p style={{ margin: 0, color: "var(--hearth-danger)", fontSize: WALL_BODY_FONT_SIZE }}>
        Energy data unavailable: {error}
      </p>
    );
  }

  if (data === null) {
    return (
      <div
        style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}
      >
        <Spinner />
      </div>
    );
  }

  const display = energyDisplay(data);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        justifyContent: "center",
        gap: "var(--hearth-space-3)",
      }}
    >
      <Metric
        icon={<Zap size={WALL_CARD_GLYPH_SIZE} />}
        label="Power"
        value={display.power}
        color="var(--hearth-info)"
      />
      <Metric
        icon={<Database size={WALL_CARD_GLYPH_SIZE} />}
        label="Total"
        value={display.consumption}
        color="var(--hearth-on)"
      />
      {display.meteringCount === 0 && (
        <p style={{ margin: 0, color: "var(--hearth-text-muted)", fontSize: WALL_BODY_FONT_SIZE }}>
          No metering devices report yet.
        </p>
      )}
    </div>
  );
}
