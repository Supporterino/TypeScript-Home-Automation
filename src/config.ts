import { z } from "zod";

const configSchema = z.object({
  mqtt: z.object({
    host: z.string().default("localhost"),
    port: z.coerce.number().int().positive().default(1883),
  }),
  zigbee2mqttPrefix: z.string().default("zigbee2mqtt"),
  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    mqtt: {
      host: process.env.MQTT_HOST,
      port: process.env.MQTT_PORT,
    },
    zigbee2mqttPrefix: process.env.ZIGBEE2MQTT_PREFIX,
    logLevel: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }

  return result.data;
}
