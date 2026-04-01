/**
 * Generic weather service types.
 *
 * Defines a provider-agnostic interface for weather data. Implementations
 * map provider-specific responses to these common types.
 */

// ---------------------------------------------------------------------------
// Current conditions
// ---------------------------------------------------------------------------

/** Weather condition category. */
export type WeatherCondition =
  | "clear"
  | "clouds"
  | "rain"
  | "drizzle"
  | "thunderstorm"
  | "snow"
  | "mist"
  | "fog"
  | "haze"
  | "dust"
  | "smoke"
  | "unknown";

/** Wind data. */
export interface WindData {
  /** Wind speed in m/s. */
  speed: number;
  /** Wind direction in degrees (0-360, 0 = north). */
  direction: number;
  /** Wind gust speed in m/s (if available). */
  gust?: number;
}

/** Current weather conditions. */
export interface CurrentWeather {
  /** Temperature in Celsius. */
  temperature: number;
  /** Feels-like temperature in Celsius. */
  feelsLike: number;
  /** Relative humidity in % (0-100). */
  humidity: number;
  /** Atmospheric pressure in hPa. */
  pressure: number;
  /** Weather condition category. */
  condition: WeatherCondition;
  /** Human-readable weather description (e.g. "light rain"). */
  description: string;
  /** Wind data. */
  wind: WindData;
  /** Cloud cover in % (0-100). */
  cloudCover: number;
  /** Visibility in meters. */
  visibility?: number;
  /** UV index (if available). */
  uvIndex?: number;
  /** Observation timestamp (Unix seconds). */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

/** Daily forecast entry. */
export interface DailyForecast {
  /** Date as ISO string (YYYY-MM-DD). */
  date: string;
  /** High temperature in Celsius. */
  tempHigh: number;
  /** Low temperature in Celsius. */
  tempLow: number;
  /** Weather condition category. */
  condition: WeatherCondition;
  /** Human-readable description. */
  description: string;
  /** Probability of precipitation (0-1). */
  precipitationChance: number;
  /** Expected precipitation in mm. */
  precipitationAmount?: number;
  /** Wind data. */
  wind: WindData;
  /** Sunrise time as ISO string. */
  sunrise?: string;
  /** Sunset time as ISO string. */
  sunset?: string;
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

/** Location specified by coordinates. */
export interface WeatherLocation {
  /** Latitude in decimal degrees. */
  latitude: number;
  /** Longitude in decimal degrees. */
  longitude: number;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

/**
 * Abstract weather service interface.
 *
 * Implement this to integrate any weather data provider.
 * The engine accepts an optional `WeatherService` — if configured,
 * automations can use `this.weather` to fetch weather data.
 *
 * @example
 * ```ts
 * const current = await this.weather.getCurrent();
 * if (current.temperature > 30) {
 *   this.logger.info("It's hot!");
 * }
 *
 * const forecast = await this.weather.getForecast(3);
 * if (forecast[0].precipitationChance > 0.5) {
 *   this.logger.info("Rain expected tomorrow");
 * }
 * ```
 */
export interface WeatherService {
  /** Get current weather conditions. */
  getCurrent(): Promise<CurrentWeather>;

  /**
   * Get daily forecast.
   * @param days Number of days to forecast (1-7, provider may limit)
   */
  getForecast(days?: number): Promise<DailyForecast[]>;
}
