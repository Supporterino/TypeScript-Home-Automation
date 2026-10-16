/**
 * The wall energy widget: reads `GET /api/energy` and refetches, debounced, on
 * relevant device events (or a fixture).
 */
import type { EnergyData } from "@ts-ha/shared";
import { Database, Zap } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchEnergy } from "../../api.js";
import { sourcesOwnReading, useDataStore } from "../../lib/data-store.js";
import { isEnergyRelevantEvent } from "../../lib/energy.js";
import { Spinner } from "../../ui/index.js";
import { WallCardMessage, WallCardStateItem } from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE } from "../cards/metrics.js";
import { WALL_BODY_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "../type-ramp.js";
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
    <WallCardStateItem
      icon={icon}
      label={label}
      reading={value}
      readingSize={WALL_METRIC_FONT_SIZE}
      tint={color}
    />
  );
}

export function EnergyWidget() {
  const { fixtureEnergy, subscribe, transport } = useDataStore();
  const [data, setData] = useState<EnergyData | null>(fixtureEnergy ?? null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // A supplied fixture is the widget's data, so this path issues no request.
    if (!sourcesOwnReading(fixtureEnergy)) return;
    try {
      setData(await fetchEnergy());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load energy data");
    }
  }, [fixtureEnergy]);

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
        <WallCardMessage>No metering devices report yet.</WallCardMessage>
      )}
    </div>
  );
}
