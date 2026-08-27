import { z } from "zod";

const TRUTHY = new Set(["true", "1", "yes", "on"]);
const FALSY = new Set(["false", "0", "no", "off"]);

/**
 * Tolerant boolean coercion for environment variables, performed inside the
 * schema so any failure is reported through the normal validation-failure path
 * (`safeParse` → formatted error → `process.exit(1)`) rather than throwing an
 * uncaught `ZodError`.
 *
 * Matching is case-insensitive and ignores surrounding whitespace. Accepts
 * `true/false/1/0/yes/no/on/off`. Missing values fall through to the provided
 * default.
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

const configSchema = z.object({
  mqtt: z.object({
    host: z.string().default("localhost"),
    port: z.coerce.number().int().positive().default(1883),
    /** Username for MQTT broker authentication. Empty = no auth. */
    username: z.string().default(""),
    /** Password for MQTT broker authentication. */
    password: z.string().default(""),
    /**
     * The `src` identifier used in every Shelly MQTT RPC request
     * (`ShellyService`'s MQTT transport). Multiple application instances
     * sharing one broker must use distinct values to avoid receiving each
     * other's RPC responses.
     */
    shellyRpcSrc: z.string().default("ts-home-automation"),
  }),
  zigbee2mqttPrefix: z.string().default("zigbee2mqtt"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  state: z.object({
    // Defaults to true: the store now holds room definitions and automation
    // enabled flags, which must survive a restart (design.md D6, R14).
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
    // Defaults to true: the device list and capability schema should be
    // readable immediately on boot, before the bridge republishes
    // (design.md D6).
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
  httpServer: z.object({
    /** Port for the HTTP server (health probes + webhooks). Set to 0 to disable. */
    port: z.coerce.number().int().min(0).default(8080),
    /** Bearer token for debug and webhook endpoints. Empty = no auth. */
    token: z.string().default(""),
    /** Optional web UI served by Hono. */
    webUi: z.object({
      /** Whether to enable the web UI. */
      enabled: booleanEnv(false),
      /** URL path prefix for the web UI. Must start with /. */
      path: z.string().default("/status"),
    }),
  }),
  /**
   * Passthrough bag for optional-service configuration.
   *
   * Services validate and read their own slice of this record from environment
   * variables. The engine schema treats it as an open record so that adding a
   * new service never requires modifying `config.ts`.
   *
   * @example
   * ```ts
   * // A custom service reads its own config:
   * const token = (config.services["ha_token"] as string | undefined) ?? "";
   * ```
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
    httpServer: {
      port: process.env.HTTP_PORT,
      token: process.env.HTTP_TOKEN,
      webUi: {
        enabled: process.env.WEB_UI_ENABLED,
        path: process.env.WEB_UI_PATH,
      },
    },
  });

  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }

  return result.data;
}
