## MODIFIED Requirements

### Requirement: Schema

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
    persist: boolean;    // default: true
    filePath: string;    // default: "./state.json"
    flushIntervalMs: number;  // default: 1000 (0 = save on every mutation)
  };
  stateToggles: { stateKey: string; name: string }[];  // default: []
  automations: {
    recursive: boolean;  // default: false
  };
  deviceRegistry: {
    enabled: boolean;    // default: false
    persist: boolean;    // default: true
    filePath: string;    // default: "./device-registry.json"
  };
  deviceSources: {
    shellyPollMs: number;    // default: existing Shelly poll interval
    nanoleafPollMs: number;  // default: nanoleaf refresh interval
  };
  httpServer: {
    port: number;        // default: 8080 (0 = disabled)
    token: string;       // default: ""
  };
  services: Record<string, unknown>;  // default: {}
};
```

Where `LogLevel` is `"fatal" | "error" | "warn" | "info" | "debug" | "trace"`.

Both persistence defaults change from `false` to `true`. `stateToggles` moves to
the top level from the HomeKit service options. There is no web UI development
setting: the development workflow is a build-time watcher, and the server serves
its content-addressed assets identically in every environment.

The `httpServer.webUi` section is removed from this schema. The web UI is a
separate package that owns its own configuration; the core engine MUST NOT parse
or expose web UI settings. The engine learns nothing about the web UI from its
validated configuration.

The Shelly MQTT RPC source identifier (`MQTT_SHELLY_RPC_SRC`, default
`"ts-home-automation"`) is unchanged by the package rename. It is an on-wire
value two instances sharing a broker use to disambiguate RPC responses, so its
default MUST remain `"ts-home-automation"`; the rename covers package names, the
binary name, and import paths only.

#### Scenario: Persistence defaults are enabled

- **WHEN** configuration is loaded with no persistence variables set
- **THEN** both `state.persist` and `deviceRegistry.persist` resolve to `true`

#### Scenario: State toggles default to empty

- **WHEN** no state toggles are configured
- **THEN** `stateToggles` is an empty list and no toggle devices are exposed

#### Scenario: Core config has no web UI settings

- **WHEN** the validated core configuration is inspected
- **THEN** it contains no web UI section, regardless of the `WEB_UI_*`
  environment variables that may be set

### Requirement: Environment Variable Mapping

The core schema MUST map these environment variables:

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

`WEB_UI_ENABLED` and `WEB_UI_PATH` MUST NOT appear in the core schema's mapping;
they are parsed by `@ts-ha/web-ui` for its own options.

`HTTP_TOKEN` remains the core mapping for `httpServer.token`, and it is the
source of the web UI's auth token: the registering entry point passes the
resolved `httpServer.token` to the web UI plugin. `@ts-ha/web-ui` MUST NOT read
`HTTP_TOKEN` itself.

#### Scenario: Web UI variables are not part of core config

- **WHEN** `WEB_UI_ENABLED` is set in the environment and the core configuration
  is loaded
- **THEN** the core configuration is unaffected and contains no web UI setting
