/**
 * The lazy Weather view (design.md D8, D12; specs/weather-services;
 * specs/web-ui "Weather View"; task 11.3).
 *
 * Reads `GET /api/weather`: current conditions and, when the registered
 * service provides one, a daily forecast. No service (or no resolvable
 * location) is a supported state, not an error — the endpoint's 404/400 map
 * to an explicit "not configured" message. Weather changes slowly, so the
 * view refetches on mount and on a stream reconnect only.
 */
import { Alert, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import {
  IconCloud,
  IconCloudRain,
  IconCloudStorm,
  IconDroplet,
  IconMist,
  IconSnowflake,
  IconSun,
  IconTemperature,
  IconWind,
} from "@tabler/icons-react";
import type { WeatherData, WeatherUnavailable } from "@ts-ha/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchWeather } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import {
  formatForecastDate,
  isWeatherUnavailable,
  unavailableMessage,
  windDirectionLabel,
} from "../lib/weather.js";

type WeatherCondition = WeatherData["current"]["condition"];

/** Condition is conveyed by icon + description text, never color alone (MASTER "State Encoding Rule"). */
function conditionIcon(condition: WeatherCondition): ReactNode {
  switch (condition) {
    case "clear":
      return <IconSun size={44} />;
    case "rain":
    case "drizzle":
      return <IconCloudRain size={44} />;
    case "thunderstorm":
      return <IconCloudStorm size={44} />;
    case "snow":
      return <IconSnowflake size={44} />;
    case "mist":
    case "fog":
    case "haze":
    case "dust":
    case "smoke":
      return <IconMist size={44} />;
    default:
      return <IconCloud size={44} />;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="sm">
      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={500}>
        {value}
      </Text>
    </Paper>
  );
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
      <Stack gap="md">
        <Title order={2}>Weather</Title>
        <Alert
          color="ambient"
          title="Weather is not configured"
          icon={<IconCloud size={16} />}
          data-testid="weather-unconfigured"
        >
          {unavailableMessage(data.reason)}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Title order={2}>Weather</Title>

      {error && (
        <Alert color="red" title="Weather data unavailable">
          {error}
        </Alert>
      )}

      {!data && !error ? (
        <Loader size="sm" mt="md" />
      ) : data ? (
        <>
          <Paper withBorder p="md">
            <Group justify="space-between" wrap="nowrap" gap="md">
              <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
                <span style={{ color: "var(--info)", display: "flex" }} aria-hidden>
                  {conditionIcon(data.current.condition)}
                </span>
                <Stack gap={0}>
                  <Text
                    fw={700}
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 32,
                      lineHeight: 1.1,
                    }}
                  >
                    {Math.round(data.current.temperature)}°C
                  </Text>
                  <Text size="sm" c="dimmed" tt="capitalize">
                    {data.current.description}
                  </Text>
                </Stack>
              </Group>
              <Text size="xs" c="dimmed" ff="monospace" ta="right">
                {data.location.latitude.toFixed(2)}, {data.location.longitude.toFixed(2)}
              </Text>
            </Group>
          </Paper>

          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <Stat label="Feels like" value={`${Math.round(data.current.feelsLike)}°C`} />
            <Stat label="Humidity" value={`${Math.round(data.current.humidity)}%`} />
            <Stat
              label="Wind"
              value={`${data.current.wind.speed.toFixed(1)} m/s ${windDirectionLabel(
                data.current.wind.direction,
              )}`}
            />
            <Stat label="Cloud cover" value={`${Math.round(data.current.cloudCover)}%`} />
          </SimpleGrid>

          {data.forecast.length > 0 && (
            <Stack gap="xs">
              <Group gap={6}>
                <IconTemperature size={14} />
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  Forecast
                </Text>
              </Group>
              {data.forecast.map((day) => (
                <Paper key={day.date} withBorder p="sm">
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Text size="sm" fw={500} w={140}>
                      {formatForecastDate(day.date)}
                    </Text>
                    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                      <span style={{ color: "var(--info)", display: "flex" }} aria-hidden>
                        {conditionIcon(day.condition)}
                      </span>
                      <Text size="sm" c="dimmed" truncate tt="capitalize">
                        {day.description}
                      </Text>
                    </Group>
                    <Group gap="lg" wrap="nowrap">
                      <Group gap={4} wrap="nowrap">
                        <IconDroplet size={12} />
                        <Text size="sm" ff="monospace">
                          {Math.round(day.precipitationChance * 100)}%
                        </Text>
                      </Group>
                      <Group gap={4} wrap="nowrap">
                        <IconWind size={12} />
                        <Text size="sm" ff="monospace">
                          {day.wind.speed.toFixed(1)}
                        </Text>
                      </Group>
                      <Text size="sm" ff="monospace">
                        {Math.round(day.tempHigh)}° / {Math.round(day.tempLow)}°
                      </Text>
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
        </>
      ) : null}
    </Stack>
  );
}
