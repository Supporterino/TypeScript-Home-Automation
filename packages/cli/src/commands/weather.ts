import type { WeatherData, WeatherUnavailable } from "@ts-ha/shared";
import type { DebugClient } from "../client.js";
import { formatTable, weatherUnavailableMessage } from "../format.js";

/**
 * Render weather as text. An unconfigured feature (the engine's unavailable
 * marker) reports that plainly rather than as a failed request.
 */
export function formatWeather(weather: WeatherData | WeatherUnavailable): string {
  if ("available" in weather) {
    return weatherUnavailableMessage(weather.reason);
  }

  const { location, current, forecast } = weather;
  const lines: string[] = [
    `Location:    ${location.latitude}, ${location.longitude}`,
    `Conditions:  ${current.description} (${current.condition})`,
    `Temperature: ${current.temperature}°C (feels like ${current.feelsLike}°C)`,
    `Humidity:    ${current.humidity}%`,
    `Wind:        ${current.wind.speed} m/s`,
  ];

  if (forecast.length > 0) {
    const rows = forecast.map((day) => [
      day.date,
      `${day.tempLow}–${day.tempHigh}°C`,
      day.description,
      `${Math.round(day.precipitationChance * 100)}%`,
    ]);
    lines.push("");
    lines.push(formatTable(["DATE", "TEMP", "CONDITIONS", "PRECIP"], rows));
  }

  return lines.join("\n");
}

/** Show the resolved location's current conditions and daily forecast. */
export async function showWeather(client: DebugClient, json: boolean): Promise<void> {
  const weather = await client.getWeather();

  if (json) {
    console.log(JSON.stringify(weather, null, 2));
    return;
  }

  console.log(formatWeather(weather));
}
