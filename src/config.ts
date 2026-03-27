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
  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  state: z.object({
    persist: z.boolean().default(false),
    filePath: z.string().default("./state.json"),
  }),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const parsedPersist = booleanString.parse(process.env.STATE_PERSIST);

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
  });

  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }

  return result.data;
}
