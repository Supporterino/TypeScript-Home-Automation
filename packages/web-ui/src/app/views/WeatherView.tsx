/**
 * The lazy Weather view (design.md D11, D12; specs/weather-services; specs/web-ui
 * "Weather View"; task 6.3).
 *
 * Reads `GET /api/weather`: current conditions and, when the registered service
 * provides one, a daily forecast. No service (or no resolvable location) is a
 * supported state, not an error — the endpoint's 404/400 map to an explicit
 * "not configured" message. Weather changes slowly, so the view refetches on
 * mount and on a stream reconnect only.
 *
 * Condition is conveyed by icon + description text, never colour alone.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react`.
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
  Thermometer,
  Wind,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchWeather } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import {
  formatForecastDate,
  isWeatherUnavailable,
  unavailableMessage,
  windDirectionLabel,
} from "../lib/weather.js";
import { Card, Grid, Row, Spinner, Stack, Stat } from "../ui/index.js";

type WeatherCondition = WeatherData["current"]["condition"];

/** Condition is conveyed by icon + description text, never colour alone. */
function conditionIcon(condition: WeatherCondition): ReactNode {
  switch (condition) {
    case "clear":
      return <Sun size={44} />;
    case "rain":
    case "drizzle":
      return <CloudRain size={44} />;
    case "thunderstorm":
      return <CloudLightning size={44} />;
    case "snow":
      return <Snowflake size={44} />;
    case "mist":
    case "fog":
    case "haze":
    case "dust":
    case "smoke":
      return <CloudFog size={44} />;
    default:
      return <Cloud size={44} />;
  }
}

export function WeatherView() {
  const { transport } = useDataStore();
  const [data, setData] = useState<WeatherData | WeatherUnavailable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchWeather();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load weather data");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Weather changes slowly: a reconnect is the only stream signal worth a
  // refetch (missed samples cannot be reconstructed from device events).
  const previousTransport = useRef(transport);
  useEffect(() => {
    const previous = previousTransport.current;
    previousTransport.current = transport;
    if (previous !== "live" && transport === "live") void load();
  }, [transport, load]);

  if (data && isWeatherUnavailable(data)) {
    return (
      <Stack gap={4}>
        <h2 className="font-display text-2xl font-bold text-ink">Weather</h2>
        <Card data-testid="weather-unconfigured">
          <Stack gap={2}>
            <Row gap={2} align="center">
              <Cloud size={18} aria-hidden className="text-accent" />
              <span className="font-semibold text-ink">Weather is not configured</span>
            </Row>
            <p className="max-w-prose text-sm text-muted">{unavailableMessage(data.reason)}</p>
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <h2 className="font-display text-2xl font-bold text-ink">Weather</h2>

      {error && (
        <Stack gap={1} className="rounded-tile border border-danger/40 bg-danger/10 p-3">
          <span className="font-semibold text-ink">Weather data unavailable</span>
          <p role="alert" className="text-sm text-muted">
            {error}
          </p>
        </Stack>
      )}

      {!data && !error ? (
        <Spinner className="mt-2" />
      ) : data ? (
        <>
          <Card>
            <Row justify="between" align="center" gap={3} wrap>
              <Row gap={3} align="center" className="min-w-0" wrap={false}>
                <span aria-hidden className="flex text-info">
                  {conditionIcon(data.current.condition)}
                </span>
                <Stack gap={0}>
                  <span className="font-display text-3xl font-bold leading-none text-ink">
                    {Math.round(data.current.temperature)}°C
                  </span>
                  <span className="text-sm capitalize text-muted">{data.current.description}</span>
                </Stack>
              </Row>
              <span className="text-right font-mono text-xs text-muted">
                {data.location.latitude.toFixed(2)}, {data.location.longitude.toFixed(2)}
              </span>
            </Row>
          </Card>

          <Grid columns={2} md={4} gap={3}>
            <Card>
              <Stat
                icon={<Thermometer size={14} />}
                label="Feels like"
                value={`${Math.round(data.current.feelsLike)}°C`}
              />
            </Card>
            <Card>
              <Stat
                icon={<Droplet size={14} />}
                label="Humidity"
                value={`${Math.round(data.current.humidity)}%`}
              />
            </Card>
            <Card>
              <Stat
                icon={<Wind size={14} />}
                label="Wind"
                value={`${data.current.wind.speed.toFixed(1)} m/s ${windDirectionLabel(
                  data.current.wind.direction,
                )}`}
              />
            </Card>
            <Card>
              <Stat label="Cloud cover" value={`${Math.round(data.current.cloudCover)}%`} />
            </Card>
          </Grid>

          {data.forecast.length > 0 && (
            <Stack gap={2}>
              <Row gap={1} align="center">
                <Thermometer size={14} aria-hidden className="text-muted" />
                <span className="text-xs font-bold uppercase tracking-wide text-muted">
                  Forecast
                </span>
              </Row>
              {data.forecast.map((day) => (
                <Card key={day.date}>
                  <Row justify="between" align="center" gap={2} wrap>
                    <span className="w-36 shrink-0 text-sm font-medium text-ink">
                      {formatForecastDate(day.date)}
                    </span>
                    <Row gap={2} align="center" className="min-w-0" wrap={false}>
                      <span aria-hidden className="flex shrink-0 text-info">
                        {conditionIcon(day.condition)}
                      </span>
                      <span className="truncate text-sm capitalize text-muted">
                        {day.description}
                      </span>
                    </Row>
                    <Row gap={3} align="center" wrap={false}>
                      <Row gap={1} align="center" wrap={false}>
                        <Droplet size={12} aria-hidden className="text-muted" />
                        <span className="font-mono text-sm text-ink">
                          {Math.round(day.precipitationChance * 100)}%
                        </span>
                      </Row>
                      <Row gap={1} align="center" wrap={false}>
                        <Wind size={12} aria-hidden className="text-muted" />
                        <span className="font-mono text-sm text-ink">
                          {day.wind.speed.toFixed(1)}
                        </span>
                      </Row>
                      <span className="font-mono text-sm text-ink">
                        {Math.round(day.tempHigh)}° / {Math.round(day.tempLow)}°
                      </span>
                    </Row>
                  </Row>
                </Card>
              ))}
            </Stack>
          )}
        </>
      ) : null}
    </Stack>
  );
}
