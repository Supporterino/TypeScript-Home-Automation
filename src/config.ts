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
  httpServer: z.object({
    /** Port for the HTTP server (health probes + webhooks). Set to 0 to disable. */
    port: z.coerce.number().int().min(0).default(8080),
    /** Bearer token for debug and webhook endpoints. Empty = no auth. */
    token: z.string().default(""),
    /** Optional web-based status/dashboard page. */
    statusPage: z.object({
      /** Whether to enable the web status page. */
      enabled: z.boolean().default(false),
      /** URL path prefix for the status page. Must start with /. */
      path: z.string().default("/status"),
    }),
  }),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const parsedPersist = booleanString.parse(process.env.STATE_PERSIST);
  const parsedRecursive = booleanString.parse(process.env.AUTOMATIONS_RECURSIVE);
  const parsedStatusPageEnabled = booleanString.parse(process.env.STATUS_PAGE_ENABLED);

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
    httpServer: {
      port: process.env.HTTP_PORT,
      token: process.env.HTTP_TOKEN,
      statusPage: {
        enabled: parsedStatusPageEnabled,
        path: process.env.STATUS_PAGE_PATH,
      },
    },
  });

  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }

  return result.data;
}
