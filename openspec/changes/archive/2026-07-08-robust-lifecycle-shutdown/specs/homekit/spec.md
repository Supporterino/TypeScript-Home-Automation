## MODIFIED Requirements

### Requirement: Startup Behavior

`onStart()` MUST:

1. Lazy-load `hap-nodejs` (to avoid evaluating native modules at import time)
2. Configure HAP storage path (persists pairing data between restarts)
3. Create a `Bridge` with the configured name and UUID (generated from `username`)
4. Construct the available accessory sources (Zigbee when the registry is
   present; Shelly when a `ShellyService` is present)
5. Call each source's `start(sink)` so it builds its initial accessories and
   begins its own freshness mechanism (registry listeners for Zigbee; a polling
   loop for Shelly)
6. Call `bridge.publish()` with pin code, port, and category (bridge = 2)
7. Mark `published = true` only after `publish()` resolves

If `bridge.publish()` fails (throws or rejects), `onStart()` MUST tear down any already-started sources by calling their `stop()` (releasing poll intervals and registry listeners), reset `published` to `false`, and clear the `bridge` reference before propagating the error — so a failed startup leaves no orphaned poll timers or registry listeners running.

#### Scenario: Sources start before publish

- **WHEN** `onStart()` runs
- **THEN** all available sources have `start(sink)` called before
  `bridge.publish()` resolves and `published` is set true

#### Scenario: Publish failure tears down started sources

- **WHEN** `bridge.publish()` throws or rejects after sources were started
- **THEN** each started source's `stop()` is called, `published` is `false`, `bridge` is cleared, and no poll interval or registry listener remains active
