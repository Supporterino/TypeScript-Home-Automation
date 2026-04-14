import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { HttpClient, HttpResponse } from "../src/core/http/http-client.js";
import { OpenMeteoService } from "../src/core/services/open-meteo-service.js";
import { OpenWeatherMapService } from "../src/core/services/openweathermap-service.js";
import type { WeatherCondition } from "../src/types/weather.js";

const logger = pino({ level: "silent" });

function createMockHttp(data: unknown): HttpClient {
  const response: HttpResponse = {
    status: 200,
    ok: true,
    headers: new Headers(),
    data,
  };

  return {
    get: mock(() => Promise.resolve(response)),
    post: mock(() => Promise.resolve(response)),
    put: mock(() => Promise.resolve(response)),
    patch: mock(() => Promise.resolve(response)),
    del: mock(() => Promise.resolve(response)),
    request: mock(() => Promise.resolve(response)),
  } as unknown as HttpClient;
}

// ---------------------------------------------------------------------------
// Open-Meteo
// ---------------------------------------------------------------------------

const OPEN_METEO_RESPONSE = {
  current: {
    time: "2026-03-30T12:00",
    temperature_2m: 18.5,
    relative_humidity_2m: 65,
    apparent_temperature: 17.2,
    surface_pressure: 1013,
    weather_code: 3,
    cloud_cover: 75,
    wind_speed_10m: 14.4, // km/h
    wind_direction_10m: 220,
    wind_gusts_10m: 25.2,
  },
  daily: {
    time: ["2026-03-30", "2026-03-31", "2026-04-01"],
    temperature_2m_max: [20, 22, 18],
    temperature_2m_min: [10, 12, 8],
    weather_code: [3, 61, 0],
    precipitation_sum: [0, 5.2, 0],
    precipitation_probability_max: [10, 80, 5],
    wind_speed_10m_max: [20, 30, 15],
    wind_direction_10m_dominant: [220, 180, 90],
    wind_gusts_10m_max: [35, 50, 25],
    sunrise: ["2026-03-30T06:30", "2026-03-31T06:28", "2026-04-01T06:26"],
    sunset: ["2026-03-30T19:45", "2026-03-31T19:47", "2026-04-01T19:49"],
    uv_index_max: [5, 3, 7],
  },
};

describe("OpenMeteoService", () => {
  it("maps current weather correctly", async () => {
    const http = createMockHttp(OPEN_METEO_RESPONSE);
    const service = new OpenMeteoService(
      { location: { latitude: 49.4, longitude: 8.7 } },
      http,
      logger,
    );

    const current = await service.getCurrent();

    expect(current.temperature).toBe(18.5);
    expect(current.feelsLike).toBe(17.2);
    expect(current.humidity).toBe(65);
    expect(current.pressure).toBe(1013);
    expect(current.condition).toBe("clouds"); // WMO code 3 = overcast
    expect(current.description).toBe("overcast");
    expect(current.cloudCover).toBe(75);
    expect(current.wind.speed).toBeCloseTo(4, 0); // 14.4 km/h ≈ 4 m/s
    expect(current.wind.direction).toBe(220);
    expect(current.uvIndex).toBe(5);
  });

  it("maps forecast correctly", async () => {
    const http = createMockHttp(OPEN_METEO_RESPONSE);
    const service = new OpenMeteoService(
      { location: { latitude: 49.4, longitude: 8.7 } },
      http,
      logger,
    );

    const forecast = await service.getForecast(3);

    expect(forecast).toHaveLength(3);
    expect(forecast[0].date).toBe("2026-03-30");
    expect(forecast[0].tempHigh).toBe(20);
    expect(forecast[0].tempLow).toBe(10);
    expect(forecast[0].condition).toBe("clouds");
    expect(forecast[0].precipitationChance).toBeCloseTo(0.1, 1);

    expect(forecast[1].condition).toBe("rain"); // WMO 61
    expect(forecast[1].precipitationChance).toBeCloseTo(0.8, 1);
    expect(forecast[1].precipitationAmount).toBe(5.2);

    expect(forecast[2].condition).toBe("clear"); // WMO 0
  });

  it("respects forecast days limit", async () => {
    const http = createMockHttp(OPEN_METEO_RESPONSE);
    const service = new OpenMeteoService(
      { location: { latitude: 49.4, longitude: 8.7 } },
      http,
      logger,
    );

    const forecast = await service.getForecast(2);
    expect(forecast).toHaveLength(2);
  });

  it("constructs correct API URL", async () => {
    const http = createMockHttp(OPEN_METEO_RESPONSE);
    const service = new OpenMeteoService(
      { location: { latitude: 49.4, longitude: 8.7 } },
      http,
      logger,
    );

    await service.getCurrent();
    const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(url).toContain("api.open-meteo.com");
    expect(url).toContain("latitude=49.4");
    expect(url).toContain("longitude=8.7");
  });

  it("maps WMO codes to conditions", async () => {
    // Test various WMO codes by modifying the response
    const codes: [number, WeatherCondition][] = [
      [0, "clear"],
      [1, "clear"],
      [2, "clouds"],
      [3, "clouds"],
      [45, "fog"],
      [51, "drizzle"],
      [61, "rain"],
      [71, "snow"],
      [80, "rain"],
      [85, "snow"],
      [95, "thunderstorm"],
    ];

    for (const [code, expected] of codes) {
      const response = {
        ...OPEN_METEO_RESPONSE,
        current: { ...OPEN_METEO_RESPONSE.current, weather_code: code },
      };
      const http = createMockHttp(response);
      const svc = new OpenMeteoService({ location: { latitude: 0, longitude: 0 } }, http, logger);
      const current = await svc.getCurrent();
      expect(current.condition).toBe(expected);
    }
  });

  it("throws on non-OK response", async () => {
    const http = {
      get: mock(() =>
        Promise.resolve({ status: 500, ok: false, headers: new Headers(), data: {} }),
      ),
    } as unknown as HttpClient;

    const service = new OpenMeteoService({ location: { latitude: 0, longitude: 0 } }, http, logger);

    expect(service.getCurrent()).rejects.toThrow("HTTP 500");
  });
});

// ---------------------------------------------------------------------------
// OpenWeatherMap
// ---------------------------------------------------------------------------

const OWM_RESPONSE = {
  current: {
    dt: 1711800000,
    temp: 22.3,
    feels_like: 21.0,
    humidity: 55,
    pressure: 1015,
    uvi: 6,
    clouds: 40,
    visibility: 10000,
    wind_speed: 5.5,
    wind_deg: 180,
    wind_gust: 8.2,
    weather: [{ id: 802, main: "Clouds", description: "scattered clouds" }],
  },
  daily: [
    {
      dt: 1711800000,
      temp: { min: 14, max: 24 },
      weather: [{ id: 500, main: "Rain", description: "light rain" }],
      humidity: 60,
      wind_speed: 6,
      wind_deg: 200,
      wind_gust: 10,
      pop: 0.7,
      rain: 2.5,
      sunrise: 1711770000,
      sunset: 1711815600,
      uvi: 5,
    },
    {
      dt: 1711886400,
      temp: { min: 12, max: 20 },
      weather: [{ id: 800, main: "Clear", description: "clear sky" }],
      humidity: 45,
      wind_speed: 3,
      wind_deg: 90,
      pop: 0.05,
      sunrise: 1711856400,
      sunset: 1711902000,
    },
  ],
};

describe("OpenWeatherMapService", () => {
  it("maps current weather correctly", async () => {
    const http = createMockHttp(OWM_RESPONSE);
    const service = new OpenWeatherMapService(
      { apiKey: "test-key", location: { latitude: 49.4, longitude: 8.7 } },
      http,
      logger,
    );

    const current = await service.getCurrent();

    expect(current.temperature).toBe(22.3);
    expect(current.feelsLike).toBe(21.0);
    expect(current.humidity).toBe(55);
    expect(current.pressure).toBe(1015);
    expect(current.condition).toBe("clouds");
    expect(current.description).toBe("scattered clouds");
    expect(current.wind.speed).toBe(5.5);
    expect(current.wind.direction).toBe(180);
    expect(current.wind.gust).toBe(8.2);
    expect(current.cloudCover).toBe(40);
    expect(current.visibility).toBe(10000);
    expect(current.uvIndex).toBe(6);
  });

  it("maps forecast correctly", async () => {
    const http = createMockHttp(OWM_RESPONSE);
    const service = new OpenWeatherMapService(
      { apiKey: "test-key", location: { latitude: 49.4, longitude: 8.7 } },
      http,
      logger,
    );

    const forecast = await service.getForecast(2);

    expect(forecast).toHaveLength(2);
    expect(forecast[0].tempHigh).toBe(24);
    expect(forecast[0].tempLow).toBe(14);
    expect(forecast[0].condition).toBe("rain");
    expect(forecast[0].precipitationChance).toBe(0.7);
    expect(forecast[0].precipitationAmount).toBe(2.5);
    expect(forecast[0].sunrise).toBeDefined();

    expect(forecast[1].condition).toBe("clear");
    expect(forecast[1].precipitationChance).toBe(0.05);
  });

  it("constructs correct API URL with key", async () => {
    const http = createMockHttp(OWM_RESPONSE);
    const service = new OpenWeatherMapService(
      { apiKey: "my-api-key", location: { latitude: 49.4, longitude: 8.7 } },
      http,
      logger,
    );

    await service.getCurrent();
    const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(url).toContain("api.openweathermap.org");
    expect(url).toContain("appid=my-api-key");
    expect(url).toContain("lat=49.4");
    expect(url).toContain("lon=8.7");
    expect(url).toContain("units=metric");
  });

  it("maps OWM conditions", async () => {
    const conditions: [string, WeatherCondition][] = [
      ["Clear", "clear"],
      ["Clouds", "clouds"],
      ["Rain", "rain"],
      ["Drizzle", "drizzle"],
      ["Thunderstorm", "thunderstorm"],
      ["Snow", "snow"],
      ["Mist", "mist"],
      ["Fog", "fog"],
      ["Haze", "haze"],
      ["Smoke", "smoke"],
      ["Dust", "dust"],
      ["SomethingElse", "unknown"],
    ];

    for (const [main, expected] of conditions) {
      const response = {
        ...OWM_RESPONSE,
        current: {
          ...OWM_RESPONSE.current,
          weather: [{ id: 0, main, description: "test" }],
        },
      };
      const http = createMockHttp(response);
      const svc = new OpenWeatherMapService(
        { apiKey: "k", location: { latitude: 0, longitude: 0 } },
        http,
        logger,
      );
      const current = await svc.getCurrent();
      expect(current.condition).toBe(expected);
    }
  });

  it("throws on non-OK response", async () => {
    const http = {
      get: mock(() =>
        Promise.resolve({ status: 401, ok: false, headers: new Headers(), data: {} }),
      ),
    } as unknown as HttpClient;

    const service = new OpenWeatherMapService(
      { apiKey: "bad", location: { latitude: 0, longitude: 0 } },
      http,
      logger,
    );

    expect(service.getCurrent()).rejects.toThrow("HTTP 401");
  });
});
