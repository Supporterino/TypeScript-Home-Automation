import type { Logger } from "pino";
import type {
  CurrentWeather,
  DailyForecast,
  WeatherCondition,
  WeatherLocation,
  WeatherService,
} from "../types/weather.js";
import type { HttpClient } from "./http-client.js";

/**
 * Configuration for the Open-Meteo service.
 */
export interface OpenMeteoConfig {
  /** Location for weather queries. */
  location: WeatherLocation;
  /** API base URL (default: https://api.open-meteo.com). */
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Open-Meteo API response types
// ---------------------------------------------------------------------------

interface OMCurrentResponse {
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    surface_pressure: number;
    weather_code: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    wind_direction_10m_dominant: number[];
    wind_gusts_10m_max: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: number[];
  };
}

/**
 * Weather service implementation using Open-Meteo.
 *
 * Completely free, no API key required. Uses the Open-Meteo forecast API
 * for both current conditions and daily forecast.
 *
 * @example
 * ```ts
 * import { createEngine, OpenMeteoService } from "ts-home-automation";
 *
 * const engine = createEngine({
 *   automationsDir: "...",
 *   weather: (http, logger) =>
 *     new OpenMeteoService({
 *       location: { latitude: 49.4, longitude: 8.7 },
 *     }, http, logger),
 * });
 * ```
 */
export class OpenMeteoService implements WeatherService {
  private readonly baseUrl: string;

  constructor(
    private readonly config: OpenMeteoConfig,
    private readonly http: HttpClient,
    private readonly logger: Logger,
  ) {
    this.baseUrl = config.baseUrl ?? "https://api.open-meteo.com";
  }

  async getCurrent(): Promise<CurrentWeather> {
    const data = await this.fetchData(1);
    const c = data.current;

    return {
      temperature: c.temperature_2m,
      feelsLike: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      pressure: c.surface_pressure,
      condition: mapWMOCode(c.weather_code),
      description: describeWMOCode(c.weather_code),
      wind: {
        speed: c.wind_speed_10m / 3.6, // km/h → m/s
        direction: c.wind_direction_10m,
        gust: c.wind_gusts_10m / 3.6,
      },
      cloudCover: c.cloud_cover,
      uvIndex: data.daily.uv_index_max?.[0],
      timestamp: Math.floor(new Date(c.time).getTime() / 1000),
    };
  }

  async getForecast(days = 5): Promise<DailyForecast[]> {
    const data = await this.fetchData(Math.min(days, 16));
    const d = data.daily;
    const result: DailyForecast[] = [];

    for (let i = 0; i < d.time.length && i < days; i++) {
      result.push({
        date: d.time[i],
        tempHigh: d.temperature_2m_max[i],
        tempLow: d.temperature_2m_min[i],
        condition: mapWMOCode(d.weather_code[i]),
        description: describeWMOCode(d.weather_code[i]),
        precipitationChance: (d.precipitation_probability_max[i] ?? 0) / 100,
        precipitationAmount: d.precipitation_sum[i] || undefined,
        wind: {
          speed: d.wind_speed_10m_max[i] / 3.6, // km/h → m/s
          direction: d.wind_direction_10m_dominant[i],
          gust: d.wind_gusts_10m_max[i] / 3.6,
        },
        sunrise: d.sunrise[i],
        sunset: d.sunset[i],
      });
    }

    return result;
  }

  private async fetchData(forecastDays: number): Promise<OMCurrentResponse> {
    const { latitude, longitude } = this.config.location;
    const params = [
      `latitude=${latitude}`,
      `longitude=${longitude}`,
      `current=temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m`,
      `daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max,sunrise,sunset,uv_index_max`,
      `forecast_days=${forecastDays}`,
      `timezone=auto`,
    ].join("&");

    const url = `${this.baseUrl}/v1/forecast?${params}`;

    this.logger.debug({ latitude, longitude }, "Fetching Open-Meteo data");
    const response = await this.http.get<OMCurrentResponse>(url);

    if (!response.ok) {
      const errMsg = `Open-Meteo API error: HTTP ${response.status}`;
      this.logger.error({ status: response.status }, errMsg);
      throw new Error(errMsg);
    }

    return response.data;
  }
}

// ---------------------------------------------------------------------------
// WMO Weather Code mapping
// https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM
// ---------------------------------------------------------------------------

function mapWMOCode(code: number): WeatherCondition {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "clouds";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95 && code <= 99) return "thunderstorm";
  return "unknown";
}

function describeWMOCode(code: number): string {
  const descriptions: Record<number, string> = {
    0: "clear sky",
    1: "mainly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    48: "depositing rime fog",
    51: "light drizzle",
    53: "moderate drizzle",
    55: "dense drizzle",
    56: "light freezing drizzle",
    57: "dense freezing drizzle",
    61: "slight rain",
    63: "moderate rain",
    65: "heavy rain",
    66: "light freezing rain",
    67: "heavy freezing rain",
    71: "slight snowfall",
    73: "moderate snowfall",
    75: "heavy snowfall",
    77: "snow grains",
    80: "slight rain showers",
    81: "moderate rain showers",
    82: "violent rain showers",
    85: "slight snow showers",
    86: "heavy snow showers",
    95: "thunderstorm",
    96: "thunderstorm with slight hail",
    99: "thunderstorm with heavy hail",
  };
  return descriptions[code] ?? "unknown";
}
