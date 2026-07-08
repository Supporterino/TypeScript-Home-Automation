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
  }),
  zigbee2mqttPrefix: z.string().default("zigbee2mqtt"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  state: z.object({
    persist: booleanEnv(false),
    filePath: z.string().default("./state.json"),
  }),
  automations: z.object({
    /** Whether to scan subdirectories recursively for automation files. */
    recursive: booleanEnv(false),
  }),
  deviceRegistry: z.object({
    /** Whether to enable automatic Zigbee2MQTT device discovery and state tracking. */
    enabled: booleanEnv(false),
    /** Whether to persist the device list and state to disk on shutdown. */
    persist: booleanEnv(false),
    /** Path to the device registry persistence JSON file. */
    filePath: z.string().default("./device-registry.json"),
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
    },
    zigbee2mqttPrefix: process.env.ZIGBEE2MQTT_PREFIX,
    logLevel: process.env.LOG_LEVEL,
    state: {
      persist: process.env.STATE_PERSIST,
      filePath: process.env.STATE_FILE_PATH,
    },
    automations: {
      recursive: process.env.AUTOMATIONS_RECURSIVE,
    },
    deviceRegistry: {
      enabled: process.env.DEVICE_REGISTRY_ENABLED,
      persist: process.env.DEVICE_REGISTRY_PERSIST,
      filePath: process.env.DEVICE_REGISTRY_FILE_PATH,
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
