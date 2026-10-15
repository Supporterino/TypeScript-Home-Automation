/**
 * The wall weather widget (design.md D11; specs/wall-display "Widget Catalog",
 * "An unconfigured widget is contained"). Reads `GET /api/weather`; when the
 * service is unconfigured it reports that inside its own area and never throws,
 * so the rest of the profile keeps rendering. A caller-supplied fixture reading
 * from the data layer is preferred over that fetch (design.md D5; specs/web-ui
 * "A widget that sources its own reading prefers the fixture"), so a
 * fixture-backed render reaches this composition with no engine.
 *
 * Composed on the wall's single card vocabulary (design.md W1): the ported
 * circular condition affordance leads, the condition description is the label,
 * and the temperature is the reading on the wall's own metric tier (design.md
 * W2) — what is read at distance. The humidity, the wind and the forecast are
 * the widget's supporting figures, so each is drawn at the ported secondary size
 * with a ported-size glyph (specs/wall-display "Supporting text is drawn at the
 * ported sizes") rather than at a tier of the widget's own. Ambient —
 * chrome-less, condition conveyed by icon shape plus description text, never
 * colour alone.
 *
 * The widget resolves its own composition from the box the frame hands it
 * (specs/wall-display "Span-Aware Card Presentation"; design.md W1): the full
 * composition only where the box holds every part, the condition and its details
 * alone where the forecast does not fit, and the leading affordance with its
 * temperature alone where neither does — so a card at the type's minimum span
 * composes for the space it has rather than clipping. The condition and the
 * temperature reading are drawn in every composition; they are what is read at
 * distance. The budgets are the widget's own (see `weather-model.ts`), so it is
 * measured against its content rather than one global card budget.
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
  // The composition the box the frame handed the renderer holds (design.md W1;
  // specs/wall-display "Span-Aware Card Presentation"): the full composition only
  // where it fits, the details alone where the forecast does not, and the
  // condition with its temperature alone where neither does — so a card at the
  // type's minimum span never clips.
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
