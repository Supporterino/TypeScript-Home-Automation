# Weather Services

## Purpose

Retrieve current weather conditions and forecasts from external weather APIs. Two implementations are provided: Open-Meteo (free, no API key) and OpenWeatherMap (paid, requires API key). Both implement the `WeatherService` interface with 5-minute in-memory caching.

## Requirements

### Weather Service Interface

```ts
interface WeatherService {
  getCurrent(location: WeatherLocation): Promise<CurrentWeather>;
  getForecast(location: WeatherLocation, days?: number): Promise<DailyForecast[]>;
}

interface WeatherLocation {
  latitude: number;
  longitude: number;
}

interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  condition: WeatherCondition;
  wind: WindData;
  timestamp: number;
}

interface DailyForecast {
  date: string;
  temperatureMin: number;
  temperatureMax: number;
  condition: WeatherCondition;
  precipitationProbability: number;
  wind: WindData;
}

interface WindData {
  speed: number;
  direction: number;  // degrees
  gust?: number;
}
```

### Caching

Both implementations MUST cache responses in-memory with a 5-minute TTL per unique location (latitude/longitude). Cache keys are derived from coordinates rounded to a reasonable precision.

### Open-Meteo Implementation

**`OpenMeteoService`** MUST:
- Use the free Open-Meteo API (`https://api.open-meteo.com`)
- Require no API key
- Map WMO weather codes to `WeatherCondition` values
- Support configurable `baseUrl` via `OpenMeteoConfig`

```ts
interface OpenMeteoConfig {
  baseUrl?: string;  // default: "https://api.open-meteo.com"
}
```

### OpenWeatherMap Implementation

**`OpenWeatherMapService`** MUST:
- Use the One Call API 3.0 (`https://api.openweathermap.org/data/3.0/onecall`)
- Require an `apiKey`
- Map OpenWeatherMap condition IDs to `WeatherCondition` values
- Support configurable `baseUrl` via `OpenWeatherMapConfig`

```ts
interface OpenWeatherMapConfig {
  apiKey: string;
  baseUrl?: string;  // default: "https://api.openweathermap.org/data/3.0/onecall"
}
```

### Weather Condition Mapping

Both implementations MUST map their API-specific condition codes to a unified `WeatherCondition` union type. The type covers: clear, partly-cloudy, cloudy, overcast, fog, rain (light/moderate/heavy), snow (light/moderate/heavy), thunderstorm, and others.

### Engine Integration

The engine registers a weather service under the `"weather"` key in the `ServiceRegistry`. Automations access it via `this.services.get<WeatherService>("weather")`.

### Error Handling

Both implementations MUST:
- Log errors on API failures
- Not cache error responses
- Throw on persistent failures (after logging)
