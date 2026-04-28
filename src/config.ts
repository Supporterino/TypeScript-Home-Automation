import { z } from "zod";

/** Coerce common truthy/falsy strings to boolean. */
const booleanString = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    return val === "true" || val === "1" || val === "yes";
  });

const configSchema = z.object({
  mqtt: z.object({
    host: z.string().default("localhost"),
    port: z.coerce.number().int().positive().default(1883),
  }),
  zigbee2mqttPrefix: z.string().default("zigbee2mqtt"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  state: z.object({
    persist: z.boolean().default(false),
    filePath: z.string().default("./state.json"),
  }),
  automations: z.object({
    /** Whether to scan subdirectories recursively for automation files. */
    recursive: z.boolean().default(false),
  }),
  deviceRegistry: z.object({
    /** Whether to enable automatic Zigbee2MQTT device discovery and state tracking. */
    enabled: z.boolean().default(false),
    /** Whether to persist the device list and state to disk on shutdown. */
    persist: z.boolean().default(false),
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
      enabled: z.boolean().default(false),
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
  const parsedPersist = booleanString.parse(process.env.STATE_PERSIST);
  const parsedRecursive = booleanString.parse(process.env.AUTOMATIONS_RECURSIVE);
  const parsedWebUiEnabled = booleanString.parse(process.env.WEB_UI_ENABLED);
  const parsedDeviceRegistryEnabled = booleanString.parse(process.env.DEVICE_REGISTRY_ENABLED);
  const parsedDeviceRegistryPersist = booleanString.parse(process.env.DEVICE_REGISTRY_PERSIST);

  const result = configSchema.safeParse({
    mqtt: {
      host: process.env.MQTT_HOST,
      port: process.env.MQTT_PORT,
    },
    zigbee2mqttPrefix: process.env.ZIGBEE2MQTT_PREFIX,
    logLevel: process.env.LOG_LEVEL,
    state: {
      persist: parsedPersist,
      filePath: process.env.STATE_FILE_PATH,
    },
    automations: {
      recursive: parsedRecursive,
    },
    deviceRegistry: {
      enabled: parsedDeviceRegistryEnabled,
      persist: parsedDeviceRegistryPersist,
      filePath: process.env.DEVICE_REGISTRY_FILE_PATH,
    },
    httpServer: {
      port: process.env.HTTP_PORT,
      token: process.env.HTTP_TOKEN,
      webUi: {
        enabled: parsedWebUiEnabled,
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
