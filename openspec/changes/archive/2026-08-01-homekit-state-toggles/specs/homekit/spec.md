## MODIFIED Requirements

### Requirement: Configuration

The `HomekitService` MUST accept `HomekitServiceOptions`:

```ts
interface StateToggleConfig {
  stateKey: string;  // StateManager key to expose
  name: string;      // Display name in the Home app
}

interface HomekitServiceOptions {
  pinCode: string;              // REQUIRED — format "XXX-XX-XXX"
  persistPath?: string;         // default: "./homekit-persist"
  bridgeName?: string;          // default: "TS-Home-Automation"
  port?: number;                // default: 47128
  username?: string;            // default: "CC:22:3D:E3:CE:F8" (MAC format)
  bind?: string | string[];     // Network interfaces/IPs to advertise on
  pollIntervalMs?: number;      // default: 10000 — global Shelly poll interval
  stateToggles?: StateToggleConfig[]; // default: [] — state keys bridged as switches
}
```

The `HomekitService` constructor MUST accept a `ShellyService | null` handle (in
addition to the existing `MqttService`, `Logger`, and `DeviceRegistry | null`) so
that Shelly bridging and write-back are available. When `shelly` is null, no
Shelly source is created. The constructor MUST also accept the shared
`StateManager` so the state-toggle source can subscribe to and write back state
keys.

The `homekit` service factory signature MUST be a single context object rather
than positional arguments:

```ts
interface HomekitServiceContext {
  http: HttpClient;
  logger: Logger;
  mqtt: MqttService;
  deviceRegistry: DeviceRegistry | null;
  shelly: ShellyService | null;
  state: StateManager;
}
type HomekitServiceFactory = (ctx: HomekitServiceContext) => HomekitService;
```

#### Scenario: Factory receives a context object

- **WHEN** the engine resolves a function-form `homekit` service
- **THEN** it invokes the factory with a single `HomekitServiceContext` object
  containing `http`, `logger`, `mqtt`, `deviceRegistry`, `shelly`, and `state`

#### Scenario: Poll interval defaults when unset

- **WHEN** `pollIntervalMs` is not provided
- **THEN** the Shelly poll loop uses 10000 ms

#### Scenario: State toggles default to empty

- **WHEN** `stateToggles` is not provided
- **THEN** the state-toggle source is created with no accessories and does not
  affect the bridge

### Requirement: Requirements

The system MUST start the HomeKit bridge when at least one accessory source is
available. The Zigbee source requires `DEVICE_REGISTRY_ENABLED=true`; when the
registry is absent, the Zigbee source MUST be skipped (with a warning) but the
bridge MAY still start to serve the Shelly source. The state-toggle source is
available whenever `stateToggles` is configured, so the bridge MAY start with
only state toggles. If no source is available, the service MUST log a warning and
skip startup.

#### Scenario: Bridge runs with only Shelly source

- **WHEN** `DEVICE_REGISTRY_ENABLED=false` but a `ShellyService` is registered
- **THEN** the bridge starts with the Shelly source and skips the Zigbee source
  with a warning

#### Scenario: Bridge runs with only state toggles

- **WHEN** neither the device registry nor a Shelly service is available but
  `stateToggles` is configured
- **THEN** the bridge starts with the state-toggle source

#### Scenario: No sources available

- **WHEN** neither the device registry, a Shelly service, nor any state toggle is
  available
- **THEN** the service logs a warning and skips startup

### Requirement: Startup Behavior

`onStart()` MUST:

1. Lazy-load `hap-nodejs` (to avoid evaluating native modules at import time)
2. Configure HAP storage path (persists pairing data between restarts)
3. Create a `Bridge` with the configured name and UUID (generated from `username`)
4. Construct the available accessory sources (Zigbee when the registry is
   present; Shelly when a `ShellyService` is present; state toggles when
   `stateToggles` is configured)
5. Call each source's `start(sink)` so it builds its initial accessories and
   begins its own freshness mechanism (registry listeners for Zigbee; a polling
   loop for Shelly; `StateManager` listeners for state toggles)
6. Call `bridge.publish()` with pin code, port, and category (bridge = 2)
7. Mark `published = true` only after `publish()` resolves

#### Scenario: Sources start before publish

- **WHEN** `onStart()` runs
- **THEN** all available sources have `start(sink)` called before
  `bridge.publish()` resolves and `published` is set true
