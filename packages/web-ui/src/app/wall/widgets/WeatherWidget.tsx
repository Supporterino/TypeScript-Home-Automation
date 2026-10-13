/**
 * The wall weather widget (specs/wall-display "Widget Catalog", "An
 * unconfigured widget is contained"; design.md D13). Reads `GET /api/weather`;
 * when the service is unconfigured it reports that inside its own area and
 * never throws, so the rest of the profile keeps rendering. An ambient readout:
 * chrome-less, condition conveyed by icon shape plus description text — never
 * colour alone.
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
import { useDataStore } from "../../lib/data-store.js";
import { unavailableMessage, windDirectionLabel } from "../../lib/weather.js";
import { Spinner } from "../../ui/index.js";
import { WALL_BODY_FONT_SIZE, WALL_LABEL_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "../type-ramp.js";
import { weatherForecastDays, weatherWidgetState } from "./weather-model.js";

type WeatherCondition = WeatherData["current"]["condition"];

/** Condition is conveyed by icon shape plus description text, never color alone (MASTER "State Encoding Rule"). */
function conditionIcon(condition: WeatherCondition, size = 40): ReactNode {
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

export function WeatherWidget() {
  const { transport } = useDataStore();
  const [value, setValue] = useState<WeatherData | WeatherUnavailable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setValue(await fetchWeather());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load weather data");
    }
  }, []);

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
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert">
        <p className="font-semibold text-danger" style={{ fontSize: WALL_LABEL_FONT_SIZE }}>
          Weather unavailable
        </p>
        <p className="text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
          {state.message}
        </p>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div data-testid="wall-weather-unconfigured">
        <p className="font-semibold text-muted" style={{ fontSize: WALL_LABEL_FONT_SIZE }}>
          Weather is not configured
        </p>
        <p className="text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
          {unavailableMessage(state.reason)}
        </p>
      </div>
    );
  }

  const { current } = state.data;
  const forecast = weatherForecastDays(state.data);

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex text-info" aria-hidden>
          {conditionIcon(current.condition)}
        </span>
        <div className="flex flex-col">
          <p
            className="font-display font-bold"
            style={{ fontSize: WALL_METRIC_FONT_SIZE, lineHeight: 1.1 }}
          >
            {Math.round(current.temperature)}°C
          </p>
          <p className="capitalize text-muted" style={{ fontSize: WALL_LABEL_FONT_SIZE }}>
            {current.description}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          <Droplet size={18} aria-hidden />
          <p className="font-mono" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
            {Math.round(current.humidity)}%
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Wind size={18} aria-hidden />
          <p className="font-mono" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
            {current.wind.speed.toFixed(1)} m/s {windDirectionLabel(current.wind.direction)}
          </p>
        </div>
      </div>

      {forecast.length > 0 && (
        <div
          className="flex flex-wrap items-start justify-between gap-3"
          data-testid="wall-weather-forecast"
        >
          {forecast.map((day) => (
            <div key={day.date} className="flex flex-col items-center gap-0.5">
              <p className="font-mono text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
                {day.label}
              </p>
              <span className="flex text-info" aria-hidden>
                {conditionIcon(day.condition, 26)}
              </span>
              <p className="font-mono" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
                {day.high}°/{day.low}°
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
