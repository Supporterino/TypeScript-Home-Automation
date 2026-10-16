import { z } from "zod";

const TRUTHY = new Set(["true", "1", "yes", "on"]);
const FALSY = new Set(["false", "0", "no", "off"]);

/**
 * Tolerant boolean coercion for environment variables, performed inside the schema so a
 * failure is reported through the normal validation path. Accepts `true/false/1/0/yes/no/on/off`.
 */
function booleanEnv(defaultValue: boolean) {
  return z.preprocess((val) => {
    if (val === undefined || val === null) return defaultValue;
    if (typeof val === "boolean") return val;
    const normalized = String(val).trim().toLowerCase();
    if (TRUTHY.has(normalized)) return true;
    if (FALSY.has(normalized)) return false;
    // Return the raw value so zod's boolean check fails with a clear message.
    return val;
  }, z.boolean());
}

/**
 * Optional numeric environment variable; unset/empty resolves to `undefined` so a missing
 * coordinate never coerces to `0`.
 */
function optionalNumberEnv(min: number, max: number) {
  return z.preprocess(
    (val) => (val === undefined || val === null || val === "" ? undefined : val),
    z.coerce.number().min(min).max(max).optional(),
  );
}

/** Hard ceiling on `weather.forecastDays`, also clamping a client-requested horizon. */
export const WEATHER_MAX_FORECAST_DAYS = 7;

const configSchema = z.object({
  mqtt: z.object({
    host: z.string().default("localhost"),
    port: z.coerce.number().int().positive().default(1883),
    /** Username for MQTT broker authentication. Empty = no auth. */
    username: z.string().default(""),
    /** Password for MQTT broker authentication. */
    password: z.string().default(""),
    /**
     * The `src` identifier used in every Shelly MQTT RPC request; instances sharing a
     * broker must use distinct values.
     */
    shellyRpcSrc: z.string().default("ts-home-automation"),
  }),
  zigbee2mqttPrefix: z.string().default("zigbee2mqtt"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  state: z.object({
    // Defaults to true: the store holds room definitions and automation enabled
    // flags, which must survive a restart.
    persist: booleanEnv(true),
    filePath: z.string().default("./state.json"),
    /** Milliseconds between coalesced state saves. `0` saves on every write. */
    flushIntervalMs: z.coerce.number().int().min(0).default(1000),
  }),
  automations: z.object({
    /** Whether to scan subdirectories recursively for automation files. */
    recursive: booleanEnv(false),
  }),
  deviceRegistry: z.object({
    /** Whether to enable automatic Zigbee2MQTT device discovery and state tracking. */
    enabled: booleanEnv(false),
    // Defaults to true: the device list and capability schema are readable on boot,
    // before the bridge republishes.
    persist: booleanEnv(true),
    /** Path to the device registry persistence JSON file. */
    filePath: z.string().default("./device-registry.json"),
  }),
  devices: z.object({
    /**
     * Refresh interval, in milliseconds, for HTTP-transport Shelly devices in
     * the unified device source layer.
     */
    shellyPollMs: z.coerce.number().int().positive().default(10000),
    /** Refresh interval, in milliseconds, for the Nanoleaf device source. */
    nanoleafPollMs: z.coerce.number().int().positive().default(10000),
  }),
  deviceState: z.object({
    // Defaults to true: last-known state is readable on boot, matching the state
    // store and device registry defaults.
    persist: booleanEnv(true),
    /** Path to the device state persistence JSON file. */
    filePath: z.string().default("./device-state.json"),
    /** Milliseconds between coalesced device-state saves. `0` saves on every write. */
    flushIntervalMs: z.coerce.number().int().min(0).default(1000),
  }),
  energy: z.object({
    /**
     * Milliseconds between rolling power-history samples. `0` would sample
     * without bound, so it is normalized to the default rather than accepted.
     */
    sampleIntervalMs: z.coerce
      .number()
      .int()
      .min(0)
      .default(60000)
      .transform((value) => (value === 0 ? 60000 : value)),
    /** Rolling history window, in minutes. `0` disables history. */
    historyMinutes: z.coerce.number().int().min(0).default(1440),
  }),
  weather: z
    .object({
      /** Default latitude in decimal degrees; unset unless both coordinates are set. */
      latitude: optionalNumberEnv(-90, 90),
      /** Default longitude in decimal degrees; unset unless both coordinates are set. */
      longitude: optionalNumberEnv(-180, 180),
      /** Default forecast horizon, clamped to {@link WEATHER_MAX_FORECAST_DAYS}. */
      forecastDays: z.coerce
        .number()
        .int()
        .min(1)
        .default(3)
        .transform((days) => Math.min(days, WEATHER_MAX_FORECAST_DAYS)),
    })
    .transform((weather) => {
      if (weather.latitude === undefined || weather.longitude === undefined) {
        return { ...weather, latitude: undefined, longitude: undefined };
      }
      return weather;
    }),
  httpServer: z.object({
    /** Port for the HTTP server (health probes + webhooks). Set to 0 to disable. */
    port: z.coerce.number().int().min(0).default(8080),
    /** Bearer token for debug and webhook endpoints. Empty = no auth. */
    token: z.string().default(""),
  }),
  /**
   * Passthrough bag for optional-service configuration; each service validates and
   * reads its own slice, so adding a service never requires modifying `config.ts`.
   */
  services: z.record(z.string(), z.unknown()).default({}),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    mqtt: {
      host: process.env.MQTT_HOST,
      port: process.env.MQTT_PORT,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      shellyRpcSrc: process.env.MQTT_SHELLY_RPC_SRC,
    },
    zigbee2mqttPrefix: process.env.ZIGBEE2MQTT_PREFIX,
    logLevel: process.env.LOG_LEVEL,
    state: {
      persist: process.env.STATE_PERSIST,
      filePath: process.env.STATE_FILE_PATH,
      flushIntervalMs: process.env.STATE_FLUSH_MS,
    },
    automations: {
      recursive: process.env.AUTOMATIONS_RECURSIVE,
    },
    deviceRegistry: {
      enabled: process.env.DEVICE_REGISTRY_ENABLED,
      persist: process.env.DEVICE_REGISTRY_PERSIST,
      filePath: process.env.DEVICE_REGISTRY_FILE_PATH,
    },
    devices: {
      shellyPollMs: process.env.SHELLY_POLL_MS,
      nanoleafPollMs: process.env.NANOLEAF_POLL_MS,
    },
    deviceState: {
      persist: process.env.DEVICE_STATE_PERSIST,
      filePath: process.env.DEVICE_STATE_FILE,
      flushIntervalMs: process.env.DEVICE_STATE_FLUSH_MS,
    },
    energy: {
      sampleIntervalMs: process.env.ENERGY_SAMPLE_MS,
      historyMinutes: process.env.ENERGY_HISTORY_MINUTES,
    },
    weather: {
      latitude: process.env.WEATHER_LATITUDE,
      longitude: process.env.WEATHER_LONGITUDE,
      forecastDays: process.env.WEATHER_FORECAST_DAYS,
    },
    httpServer: {
      port: process.env.HTTP_PORT,
      token: process.env.HTTP_TOKEN,
    },
  });

  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }

  return result.data;
}
