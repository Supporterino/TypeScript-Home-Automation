# Configuration

## Purpose

Configuration is loaded from environment variables and validated with Zod at startup. It defines all runtime parameters for the engine, MQTT broker, state persistence, device registry, HTTP server, and service passthrough.

## Requirements

### Schema

The system MUST validate configuration against a Zod schema with these sections:

```ts
type Config = {
  mqtt: {
    host: string;        // default: "localhost"
    port: number;        // default: 1883
    username: string;    // default: ""
    password: string;    // default: ""
  };
  zigbee2mqttPrefix: string;  // default: "zigbee2mqtt"
  logLevel: LogLevel;         // default: "info"
  state: {
    persist: boolean;    // default: false
    filePath: string;    // default: "./state.json"
  };
  automations: {
    recursive: boolean;  // default: false
  };
  deviceRegistry: {
    enabled: boolean;    // default: false
    persist: boolean;    // default: false
    filePath: string;    // default: "./device-registry.json"
  };
  httpServer: {
    port: number;        // default: 8080 (0 = disabled)
    token: string;       // default: ""
    webUi: {
      enabled: boolean;  // default: false
      path: string;      // default: "/status"
    };
  };
  services: Record<string, unknown>;  // default: {}
};
```

Where `LogLevel` is `"fatal" | "error" | "warn" | "info" | "debug" | "trace"`.

### Environment Variable Mapping

| Environment Variable | Config Path |
|---------------------|-------------|
| `MQTT_HOST` | `mqtt.host` |
| `MQTT_PORT` | `mqtt.port` |
| `MQTT_USERNAME` | `mqtt.username` |
| `MQTT_PASSWORD` | `mqtt.password` |
| `ZIGBEE2MQTT_PREFIX` | `zigbee2mqttPrefix` |
| `LOG_LEVEL` | `logLevel` |
| `STATE_PERSIST` | `state.persist` |
| `STATE_FILE_PATH` | `state.filePath` |
| `AUTOMATIONS_RECURSIVE` | `automations.recursive` |
| `DEVICE_REGISTRY_ENABLED` | `deviceRegistry.enabled` |
| `DEVICE_REGISTRY_PERSIST` | `deviceRegistry.persist` |
| `DEVICE_REGISTRY_FILE_PATH` | `deviceRegistry.filePath` |
| `HTTP_PORT` | `httpServer.port` |
| `HTTP_TOKEN` | `httpServer.token` |
| `WEB_UI_ENABLED` | `httpServer.webUi.enabled` |
| `WEB_UI_PATH` | `httpServer.webUi.path` |

### Boolean Coercion

The system MUST coerce boolean environment variables from these truthy/falsy strings:
- Truthy: `"true"`, `"1"`, `"yes"`
- Falsy: `"false"`, `"0"`, `"no"`
- Undefined/missing: `undefined` (falls through to Zod default)

### Validation Failure

The system MUST call `process.exit(1)` and print formatted Zod errors when validation fails.

### Services Passthrough

The `services` field MUST be an open record (`z.record(z.string(), z.unknown())`). Services read their own slice of this record. This allows adding new service configurations without modifying the config schema.
