/**
 * The wall weather widget: reads `GET /api/weather` (or a fixture) and composes
 * for the box the frame gives it.
 */
import type { WeatherData, WeatherUnavailable } from "@ts-ha/shared";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Droplet,
  Snowflake,
  Sun,
  Wind,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchWeather } from "../../api.js";
import { sourcesOwnReading, useDataStore } from "../../lib/data-store.js";
import { unavailableMessage, windDirectionLabel } from "../../lib/weather.js";
import { Spinner } from "../../ui/index.js";
import { WallCardIcon, WallCardMessage, WallCardStateItem } from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_SECONDARY_FONT_SIZE } from "../cards/metrics.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_LABEL_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "../type-ramp.js";
import {
  weatherForecastDays,
  weatherWidgetComposition,
  weatherWidgetState,
} from "./weather-model.js";

type WeatherCondition = WeatherData["current"]["condition"];

/** Condition is conveyed by icon shape plus description text, never color alone. */
function conditionIcon(
  condition: WeatherCondition,
  size: number = WALL_CARD_GLYPH_SIZE,
): ReactNode {
  switch (condition) {
    case "clear":
      return <Sun size={size} />;
    case "rain":
    case "drizzle":
      return <CloudRain size={size} />;
    case "thunderstorm":
      return <CloudLightning size={size} />;
    case "snow":
      return <Snowflake size={size} />;
    case "mist":
    case "fog":
    case "haze":
    case "dust":
    case "smoke":
      return <CloudFog size={size} />;
    default:
      return <Cloud size={size} />;
  }
}

/** A supporting figure (humidity, wind) under the widget's stat, at the ported secondary size. */
function WeatherDetail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--hearth-space-2)",
        color: "var(--hearth-text-muted)",
        fontSize: WALL_CARD_SECONDARY_FONT_SIZE,
      }}
    >
      <WallCardIcon glyph={icon} />
      {children}
    </span>
  );
}

export function WeatherWidget({ rendererHeightPx }: WallWidgetProps) {
  const { fixtureWeather, transport } = useDataStore();
  const [value, setValue] = useState<WeatherData | WeatherUnavailable | null>(
    fixtureWeather ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // A supplied fixture is the widget's data, so this path issues no request.
    if (!sourcesOwnReading(fixtureWeather)) return;
    try {
      setValue(await fetchWeather());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load weather data");
    }
  }, [fixtureWeather]);

  useEffect(() => {
    void load();
  }, [load]);

  // Weather changes slowly: a stream reconnect is the only signal worth a
  // refetch (missed samples cannot be reconstructed from device events).
  const previousTransport = useRef(transport);
  useEffect(() => {
    const previous = previousTransport.current;
    previousTransport.current = transport;
    if (previous !== "live" && transport === "live") void load();
  }, [transport, load]);

  const state = weatherWidgetState(value, error);

  if (state.status === "loading") {
    return (
      <div
        style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}
      >
        <Spinner />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert">
        <p
          style={{
            margin: 0,
            fontWeight: "var(--hearth-weight-semibold)",
            color: "var(--hearth-danger)",
            fontSize: WALL_LABEL_FONT_SIZE,
          }}
        >
          Weather unavailable
        </p>
        <WallCardMessage>{state.message}</WallCardMessage>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div data-testid="wall-weather-unconfigured">
        <p
          style={{
            margin: 0,
            fontWeight: "var(--hearth-weight-semibold)",
            color: "var(--hearth-text-muted)",
            fontSize: WALL_LABEL_FONT_SIZE,
          }}
        >
          Weather is not configured
        </p>
        <WallCardMessage>{unavailableMessage(state.reason)}</WallCardMessage>
      </div>
    );
  }

  const { current } = state.data;
  const forecast = weatherForecastDays(state.data);
  // The composition resolves from the box the frame handed the renderer.
  const composition = weatherWidgetComposition(rendererHeightPx);
  const drawsDetails = composition !== "readout";
  const drawsForecast = composition === "full";

  return (
    <div
      data-composition={composition}
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        justifyContent: "center",
        gap: "var(--hearth-space-3)",
      }}
    >
      <WallCardStateItem
        icon={conditionIcon(current.condition)}
        label={current.description}
        reading={`${Math.round(current.temperature)}°C`}
        readingSize={WALL_METRIC_FONT_SIZE}
        tint="var(--hearth-info)"
      />

      {drawsDetails && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--hearth-space-4)",
          }}
        >
          <WeatherDetail icon={<Droplet size={WALL_CARD_GLYPH_SIZE} />}>
            {Math.round(current.humidity)}%
          </WeatherDetail>
          <WeatherDetail icon={<Wind size={WALL_CARD_GLYPH_SIZE} />}>
            {current.wind.speed.toFixed(1)} m/s {windDirectionLabel(current.wind.direction)}
          </WeatherDetail>
        </div>
      )}

      {drawsForecast && forecast.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "var(--hearth-space-3)",
          }}
          data-testid="wall-weather-forecast"
        >
          {forecast.map((day) => (
            <div
              key={day.date}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--hearth-space-1)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "var(--hearth-text-muted)",
                  fontSize: WALL_CARD_SECONDARY_FONT_SIZE,
                }}
              >
                {day.label}
              </p>
              <WallCardIcon
                glyph={conditionIcon(day.condition, WALL_CARD_GLYPH_SIZE)}
                tint="var(--hearth-info)"
              />
              <p style={{ margin: 0, fontSize: WALL_CARD_SECONDARY_FONT_SIZE }}>
                {day.high}°/{day.low}°
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
