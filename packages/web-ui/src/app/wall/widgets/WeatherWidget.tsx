/**
 * The wall weather widget (design.md D11; specs/wall-display "Widget Catalog",
 * "An unconfigured widget is contained"). Reads `GET /api/weather`; when the
 * service is unconfigured it reports that inside its own area and never throws,
 * so the rest of the profile keeps rendering. A caller-supplied fixture reading
 * from the data layer is preferred over that fetch (design.md D5; specs/web-ui
 * "A widget that sources its own reading prefers the fixture"), so a
 * fixture-backed render reaches this composition with no engine.
 *
 * Composed on the shared Hearth card vocabulary (design.md D11): the condition
 * glyph leads, the condition description is the title, and the temperature is
 * the metric; humidity, wind, and the forecast sit below in the body tier.
 * Ambient — chrome-less, condition conveyed by icon shape plus description
 * text, never colour alone.
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
import { WALL_BODY_FONT_SIZE, WALL_LABEL_FONT_SIZE } from "../type-ramp.js";
import { WALL_CARD_GLYPH_SIZE, WallCardGlyph, WallCardStat } from "./card-vocab.js";
import { weatherForecastDays, weatherWidgetState } from "./weather-model.js";

type WeatherCondition = WeatherData["current"]["condition"];

/** Condition is conveyed by icon shape plus description text, never color alone (MASTER "State Encoding Rule"). */
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

/** A secondary condition reading (humidity, wind) in the vocabulary's body tier. */
function WeatherDetail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--hearth-space-2)",
        color: "var(--hearth-text-muted)",
        fontSize: WALL_BODY_FONT_SIZE,
      }}
    >
      <WallCardGlyph>{icon}</WallCardGlyph>
      {children}
    </span>
  );
}

export function WeatherWidget() {
  const { fixtureWeather, transport } = useDataStore();
  const [value, setValue] = useState<WeatherData | WeatherUnavailable | null>(
    fixtureWeather ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // A supplied fixture reading is the widget's data, so every path that would
    // fetch — the mount load and the reconnect refetch below — issues no request
    // for it (design.md D5). Without one the widget is byte-for-byte unchanged.
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
        <p style={{ margin: 0, color: "var(--hearth-text-muted)", fontSize: WALL_BODY_FONT_SIZE }}>
          {state.message}
        </p>
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
        <p style={{ margin: 0, color: "var(--hearth-text-muted)", fontSize: WALL_BODY_FONT_SIZE }}>
          {unavailableMessage(state.reason)}
        </p>
      </div>
    );
  }

  const { current } = state.data;
  const forecast = weatherForecastDays(state.data);

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
      <WallCardStat
        icon={conditionIcon(current.condition)}
        label={current.description}
        color="var(--hearth-info)"
      >
        {Math.round(current.temperature)}°C
      </WallCardStat>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "var(--hearth-space-4)",
        }}
      >
        <WeatherDetail icon={<Droplet size={18} />}>{Math.round(current.humidity)}%</WeatherDetail>
        <WeatherDetail icon={<Wind size={18} />}>
          {current.wind.speed.toFixed(1)} m/s {windDirectionLabel(current.wind.direction)}
        </WeatherDetail>
      </div>

      {forecast.length > 0 && (
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
                  fontSize: WALL_BODY_FONT_SIZE,
                }}
              >
                {day.label}
              </p>
              <WallCardGlyph color="var(--hearth-info)">
                {conditionIcon(day.condition, 26)}
              </WallCardGlyph>
              <p style={{ margin: 0, fontSize: WALL_BODY_FONT_SIZE }}>
                {day.high}°/{day.low}°
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
