import type { Logger } from "pino";
import type {
  CurrentWeather,
  DailyForecast,
  WeatherCondition,
  WeatherLocation,
  WeatherService,
} from "../../types/weather.js";
import type { HttpClient } from "../http/http-client.js";

/**
 * Configuration for the OpenWeatherMap service.
 */
export interface OpenWeatherMapConfig {
  /** API key from openweathermap.org. */
  apiKey: string;
  /** Location for weather queries. */
  location: WeatherLocation;
  /** API base URL (default: https://api.openweathermap.org). */
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// OpenWeatherMap API response types
// ---------------------------------------------------------------------------

interface OWMForecastDay {
  dt: number;
  temp: { min: number; max: number };
  weather: { id: number; main: string; description: string }[];
  humidity: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  pop: number;
  rain?: number;
  snow?: number;
  sunrise: number;
  sunset: number;
  uvi?: number;
}

interface OWMOneCallResponse {
  current: {
    dt: number;
    temp: number;
    feels_like: number;
    humidity: number;
    pressure: number;
    uvi?: number;
    clouds: number;
    visibility?: number;
    wind_speed: number;
    wind_deg: number;
    wind_gust?: number;
    weather: { id: number; main: string; description: string }[];
  };
  daily: OWMForecastDay[];
}

/**
 * Weather service implementation using OpenWeatherMap.
 *
 * Uses the One Call API 3.0 for both current conditions and forecast.
 * Requires an API key from https://openweathermap.org/api.
 *
 * @example
 * ```ts
 * import { createEngine, OpenWeatherMapService } from "ts-home-automation";
 *
 * const engine = createEngine({
 *   automationsDir: "...",
 *   weather: (http, logger) =>
 *     new OpenWeatherMapService({
 *       apiKey: process.env.OWM_API_KEY!,
 *       location: { latitude: 49.4, longitude: 8.7 },
 *     }, http, logger),
 * });
 * ```
 */
export class OpenWeatherMapService implements WeatherService {
  private readonly baseUrl: string;

  /** Cached API response with TTL. */
  private cache: { data: OWMOneCallResponse; fetchedAt: number } | null = null;

  /** Cache TTL in milliseconds (default: 5 minutes). */
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(
    private readonly config: OpenWeatherMapConfig,
    private readonly http: HttpClient,
    private readonly logger: Logger,
  ) {
    this.baseUrl = config.baseUrl ?? "https://api.openweathermap.org";
  }

  async getCurrent(): Promise<CurrentWeather> {
    const data = await this.fetchOneCall();
    const c = data.current;
    const weather = c.weather[0];

    return {
      temperature: c.temp,
      feelsLike: c.feels_like,
      humidity: c.humidity,
      pressure: c.pressure,
      condition: mapOWMCondition(weather?.main ?? ""),
      description: weather?.description ?? "unknown",
      wind: {
        speed: c.wind_speed,
        direction: c.wind_deg,
        gust: c.wind_gust,
      },
      cloudCover: c.clouds,
      visibility: c.visibility,
      uvIndex: c.uvi,
      timestamp: c.dt,
    };
  }

  async getForecast(days = 5): Promise<DailyForecast[]> {
    const data = await this.fetchOneCall();
    return data.daily.slice(0, days).map((day) => {
      const weather = day.weather[0];
      return {
        date: new Date(day.dt * 1000).toISOString().slice(0, 10),
        tempHigh: day.temp.max,
        tempLow: day.temp.min,
        condition: mapOWMCondition(weather?.main ?? ""),
        description: weather?.description ?? "unknown",
        precipitationChance: day.pop,
        precipitationAmount: (day.rain ?? 0) + (day.snow ?? 0) || undefined,
        wind: {
          speed: day.wind_speed,
          direction: day.wind_deg,
          gust: day.wind_gust,
        },
        sunrise: new Date(day.sunrise * 1000).toISOString(),
        sunset: new Date(day.sunset * 1000).toISOString(),
      };
    });
  }

  private async fetchOneCall(): Promise<OWMOneCallResponse> {
    // Return cached data if still fresh
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.data;
    }

    const { latitude, longitude } = this.config.location;
    const url = `${this.baseUrl}/data/3.0/onecall?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.config.apiKey}`;

    this.logger.debug({ latitude, longitude }, "Fetching OpenWeatherMap data");
    const response = await this.http.get<OWMOneCallResponse>(url);

    if (!response.ok) {
      const errMsg = `OpenWeatherMap API error: HTTP ${response.status}`;
      this.logger.error({ status: response.status }, errMsg);
      throw new Error(errMsg);
    }

    this.cache = { data: response.data, fetchedAt: Date.now() };
    return response.data;
  }
}

/**
 * Map OpenWeatherMap condition string to generic WeatherCondition.
 */
function mapOWMCondition(main: string): WeatherCondition {
  switch (main.toLowerCase()) {
    case "clear":
      return "clear";
    case "clouds":
      return "clouds";
    case "rain":
      return "rain";
    case "drizzle":
      return "drizzle";
    case "thunderstorm":
      return "thunderstorm";
    case "snow":
      return "snow";
    case "mist":
      return "mist";
    case "fog":
      return "fog";
    case "haze":
      return "haze";
    case "dust":
    case "sand":
    case "ash":
      return "dust";
    case "smoke":
      return "smoke";
    default:
      return "unknown";
  }
}
