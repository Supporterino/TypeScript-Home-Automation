# Configuration

## Purpose

Configuration is loaded from environment variables and validated with Zod at startup. It defines all runtime parameters for the engine, MQTT broker, state persistence, device registry, HTTP server, and service passthrough.

## Requirements

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
    webUi: {
      enabled: boolean;  // default: false
      path: string;      // default: "/status"
    };
  };
  services: Record<string, unknown>;  // default: {}
};
```

Where `LogLevel` is `"fatal" | "error" | "warn" | "info" | "debug" | "trace"`.

Both persistence defaults change from `false` to `true`. `stateToggles` moves to
the top level from the HomeKit service options. There is no web UI development
setting: the development workflow is a build-time watcher, and the server serves
its content-addressed assets identically in every environment.

#### Scenario: Persistence defaults are enabled

- **WHEN** configuration is loaded with no persistence variables set
- **THEN** both `state.persist` and `deviceRegistry.persist` resolve to `true`

#### Scenario: State toggles default to empty

- **WHEN** no state toggles are configured
- **THEN** `stateToggles` is an empty list and no toggle devices are exposed

### Requirement: Environment Variable Mapping

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

### Requirement: Boolean Coercion

The system MUST coerce boolean environment variables tolerantly — matching is case-insensitive and ignores surrounding whitespace:
- Truthy: `"true"`, `"1"`, `"yes"`, `"on"` (any letter case, trimmed)
- Falsy: `"false"`, `"0"`, `"no"`, `"off"` (any letter case, trimmed)
- Undefined/missing: `undefined` (falls through to Zod default)

A value that does not match any recognized token MUST NOT throw an uncaught error. The coercion MUST be performed inside the schema so any failure is reported through the normal validation-failure path (formatted error message + `process.exit(1)`), consistent with all other config validation.

#### Scenario: Uppercase boolean is coerced

- **WHEN** an environment variable is set to `"TRUE"` or `"On"`
- **THEN** it is coerced to the corresponding boolean without throwing

#### Scenario: Invalid boolean fails gracefully

- **WHEN** a boolean environment variable is set to an unrecognized value (e.g. `"maybe"`)
- **THEN** the system reports a formatted validation error and exits via `process.exit(1)`, rather than throwing an uncaught `ZodError` with a raw stack trace

### Requirement: Validation Failure

The system MUST call `process.exit(1)` and print formatted Zod errors when validation fails.

### Requirement: Services Passthrough

The `services` field MUST be an open record (`z.record(z.string(), z.unknown())`). Services read their own slice of this record. This allows adding new service configurations without modifying the config schema.

### Requirement: State Flush Interval Setting

The configuration schema MUST include a state flush interval, controlling how
long state mutations are coalesced before being written behind.

- Environment variable: `STATE_FLUSH_MS`
- Type: non-negative integer, milliseconds
- Default: `1000`
- A value of `0` means "write on every mutation"

The setting MUST only take effect when state persistence is enabled. An invalid
or negative value MUST be rejected by schema validation on the same terms as
every other setting.

#### Scenario: Default applies when unset

- **WHEN** `STATE_FLUSH_MS` is not set
- **THEN** the configured flush interval is the default

#### Scenario: Invalid value fails validation

- **WHEN** `STATE_FLUSH_MS` is set to a negative or non-numeric value
- **THEN** configuration validation fails with a descriptive message

### Requirement: Device Source Refresh Interval Settings

The configuration schema MUST include refresh intervals for device sources whose
transports do not push state.

- `SHELLY_POLL_MS` — refresh interval for HTTP-transport Shelly devices,
  non-negative integer milliseconds, retaining the existing default
- `NANOLEAF_POLL_MS` — refresh interval for Nanoleaf devices, non-negative
  integer milliseconds

An interval MUST only apply to devices whose transport does not push state.
Devices with push-capable transports MUST NOT be polled regardless of these
settings.

#### Scenario: Push-capable devices ignore the interval

- **WHEN** `SHELLY_POLL_MS` is configured and a Shelly device is registered with
  MQTT transport
- **THEN** that device is not polled

#### Scenario: Interval is validated

- **WHEN** a refresh interval is set to a negative value
- **THEN** configuration validation fails with a descriptive message

### Requirement: State Toggle Configuration Location

State toggles MUST be configured at engine level rather than as an option of any
individual service, because they are presented as devices to every consumer of
the shared device sources and are not specific to the HomeKit bridge.

Each entry MUST identify the state key to expose and the display name to present
it under. Only explicitly configured keys are exposed; the engine MUST NOT derive
toggles from the contents of the state store.

This relocates the setting from the HomeKit service options. A deployment that
supplies state toggles under the HomeKit service options MUST fail validation
with a message naming the new location, rather than silently ignoring them.

A configured key that falls within the state store's reserved internal namespace
MUST fail validation. Reserved keys hold room assignments and automation enabled
flags; exposing one as a toggle would present it as a user-facing switch and
would attempt writes the store rejects. The allowlist prevents the engine from
deriving such keys on its own, and this prevents an operator from naming one
explicitly.

#### Scenario: A reserved key cannot be configured as a toggle

- **WHEN** a state toggle names a key in the reserved internal namespace
- **THEN** configuration validation fails with a message identifying the key as
  reserved

#### Scenario: Toggles are configured independently of HomeKit

- **WHEN** state toggles are configured and the HomeKit bridge is disabled
- **THEN** configuration validates and the toggles are exposed as devices

#### Scenario: The old location is rejected, not ignored

- **WHEN** state toggles are supplied under the HomeKit service options
- **THEN** configuration validation fails with a message naming the engine-level
  setting to use instead

### Requirement: Persistence Defaults

State persistence and device registry persistence MUST both be enabled by
default.

- `STATE_PERSIST` — default `true`
- `DEVICE_REGISTRY_PERSIST` — default `true`

Both remain explicitly disablable. The defaults MUST agree with each other, so
that an operator does not have to reason about one store persisting while the
other does not.

Because both reverse their previous default, the change MUST be documented as
breaking in operator-facing configuration documentation, noting that an upgraded
deployment which never set either variable will begin writing files it did not
write before.

#### Scenario: Both default to enabled

- **WHEN** neither `STATE_PERSIST` nor `DEVICE_REGISTRY_PERSIST` is set
- **THEN** both the state store and the device registry persist and restore
  across restarts

#### Scenario: Either can be disabled explicitly

- **WHEN** a persistence variable is explicitly set to false
- **THEN** that store performs no writes
