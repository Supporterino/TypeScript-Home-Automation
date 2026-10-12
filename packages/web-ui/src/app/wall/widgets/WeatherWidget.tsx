/**
 * The wall weather widget (specs/wall-display "Widget Catalog", "An
 * unconfigured widget is contained"). Reads `GET /api/weather`; when the
 * service is unconfigured it reports that inside its own area and never throws,
 * so the rest of the profile keeps rendering.
 */
import { Alert, Group, Loader, Stack, Text } from "@mantine/core";
import {
  IconCloud,
  IconCloudRain,
  IconCloudStorm,
  IconDroplet,
  IconMist,
  IconSnowflake,
  IconSun,
  IconWind,
} from "@tabler/icons-react";
import type { WeatherData, WeatherUnavailable } from "@ts-ha/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchWeather } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import { unavailableMessage, windDirectionLabel } from "../../lib/weather.js";
import { WALL_BODY_FONT_SIZE, WALL_LABEL_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "../type-ramp.js";
import { weatherForecastDays, weatherWidgetState } from "./weather-model.js";

type WeatherCondition = WeatherData["current"]["condition"];

/** Condition is conveyed by icon shape plus description text, never color alone (MASTER "State Encoding Rule"). */
function conditionIcon(condition: WeatherCondition, size = 40): ReactNode {
  switch (condition) {
    case "clear":
      return <IconSun size={size} />;
    case "rain":
    case "drizzle":
      return <IconCloudRain size={size} />;
    case "thunderstorm":
      return <IconCloudStorm size={size} />;
    case "snow":
      return <IconSnowflake size={size} />;
    case "mist":
    case "fog":
    case "haze":
    case "dust":
    case "smoke":
      return <IconMist size={size} />;
    default:
      return <IconCloud size={size} />;
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
      <Stack h="100%" justify="center" align="center">
        <Loader size="sm" />
      </Stack>
    );
  }

  if (state.status === "error") {
    return (
      <Alert color="red" p="xs">
        <Text fz={WALL_LABEL_FONT_SIZE} fw={600}>
          Weather unavailable
        </Text>
        <Text fz={WALL_BODY_FONT_SIZE}>{state.message}</Text>
      </Alert>
    );
  }

  if (state.status === "unavailable") {
    return (
      <Alert color="ambient" p="xs" data-testid="wall-weather-unconfigured">
        <Text fz={WALL_LABEL_FONT_SIZE} fw={600}>
          Weather is not configured
        </Text>
        <Text fz={WALL_BODY_FONT_SIZE}>{unavailableMessage(state.reason)}</Text>
      </Alert>
    );
  }

  const { current } = state.data;
  const forecast = weatherForecastDays(state.data);

  return (
    <Stack gap="xs" h="100%" justify="center">
      <Group gap="sm" wrap="nowrap" align="center">
        <span style={{ color: "var(--info)", display: "flex" }} aria-hidden>
          {conditionIcon(current.condition)}
        </span>
        <Stack gap={0}>
          <Text
            fw={700}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: WALL_METRIC_FONT_SIZE,
              lineHeight: 1.1,
            }}
          >
            {Math.round(current.temperature)}°C
          </Text>
          <Text fz={WALL_LABEL_FONT_SIZE} c="dimmed" tt="capitalize">
            {current.description}
          </Text>
        </Stack>
      </Group>

      <Group gap="lg" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          <IconDroplet size={18} aria-hidden />
          <Text fz={WALL_BODY_FONT_SIZE} ff="monospace">
            {Math.round(current.humidity)}%
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap">
          <IconWind size={18} aria-hidden />
          <Text fz={WALL_BODY_FONT_SIZE} ff="monospace">
            {current.wind.speed.toFixed(1)} m/s {windDirectionLabel(current.wind.direction)}
          </Text>
        </Group>
      </Group>

      {forecast.length > 0 && (
        <Group gap="md" wrap="nowrap" justify="space-between" data-testid="wall-weather-forecast">
          {forecast.map((day) => (
            <Stack key={day.date} gap={2} align="center">
              <Text fz={WALL_BODY_FONT_SIZE} c="dimmed" ff="monospace">
                {day.label}
              </Text>
              <span style={{ color: "var(--info)", display: "flex" }} aria-hidden>
                {conditionIcon(day.condition, 26)}
              </span>
              <Text fz={WALL_BODY_FONT_SIZE} ff="monospace">
                {day.high}°/{day.low}°
              </Text>
            </Stack>
          ))}
        </Group>
      )}
    </Stack>
  );
}
