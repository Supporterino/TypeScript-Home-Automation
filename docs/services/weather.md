# Weather

The engine supports an optional weather service for fetching current conditions and multi-day forecasts. The `WeatherService` interface is abstract — two built-in implementations are provided, and you can implement your own.

---

## Built-in: Open-Meteo

Free, no API key required. Uses the [Open-Meteo](https://open-meteo.com/) API.

```ts
import { createEngine, OpenMeteoService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    weather: (http, logger) =>
      new OpenMeteoService(
        { location: { latitude: 49.4, longitude: 8.7 } },
        http,
        logger,
      ),
  },
});
```

---

## Built-in: OpenWeatherMap

Free tier requires an API key from [openweathermap.org](https://openweathermap.org/).

```ts
import { createEngine, OpenWeatherMapService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    weather: (http, logger) =>
      new OpenWeatherMapService(
        {
          apiKey: process.env.OWM_API_KEY!,
          location: { latitude: 49.4, longitude: 8.7 },
        },
        http,
        logger,
      ),
  },
});
```

---

## Using in automations

```ts
import type { WeatherService } from "ts-home-automation";

// Current conditions
const weather = this.services.get<WeatherService>("weather");
if (!weather) return;

const current = await weather.getCurrent();
this.logger.info(
  { temp: current.temperature, condition: current.condition },
  "Current weather",
);

// 3-day forecast
const forecast = await weather.getForecast(3);
if (forecast[0].precipitationChance > 0.5) {
  await this.notify({ title: "Rain tomorrow", message: "Bring an umbrella" });
}
```

---

## Data types

### Current weather (`WeatherCurrent`)

| Field | Type | Description |
|---|---|---|
| `temperature` | `number` | Temperature in °C |
| `feelsLike` | `number` | Feels-like temperature in °C |
| `humidity` | `number` | Relative humidity % |
| `condition` | `string` | Category: `clear`, `clouds`, `rain`, `snow`, `thunderstorm`, `fog`, etc. |
| `description` | `string` | Human-readable description (e.g. `"light rain"`) |
| `wind.speed` | `number` | Wind speed in m/s |
| `wind.direction` | `number` | Wind direction in degrees |
| `cloudCover` | `number` | Cloud cover % |
| `uvIndex` | `number \| undefined` | UV index (if available) |

### Forecast day (`WeatherForecastDay`)

| Field | Type | Description |
|---|---|---|
| `date` | `Date` | The forecast date |
| `tempHigh` | `number` | Maximum temperature in °C |
| `tempLow` | `number` | Minimum temperature in °C |
| `precipitationChance` | `number` | Probability of precipitation 0–1 |
| `condition` | `string` | Day condition category |
| `description` | `string` | Human-readable description |
| `sunrise` | `Date \| undefined` | Sunrise time |
| `sunset` | `Date \| undefined` | Sunset time |

---

## Custom implementation

Implement the `WeatherService` interface to integrate any other weather provider:

```ts
import type { WeatherService, WeatherCurrent, WeatherForecastDay } from "ts-home-automation";

class MyWeatherService implements WeatherService {
  async getCurrent(): Promise<WeatherCurrent> {
    // fetch from your API
  }

  async getForecast(days: number): Promise<WeatherForecastDay[]> {
    // fetch from your API
  }
}

const engine = createEngine({
  automationsDir: "...",
  services: {
    weather: new MyWeatherService(),
  },
});
```
