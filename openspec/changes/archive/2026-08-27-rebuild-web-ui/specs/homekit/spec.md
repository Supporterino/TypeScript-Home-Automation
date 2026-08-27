## MODIFIED Requirements

### Requirement: Accessory Source Abstraction

The HomeKit bridge MUST consume devices through the shared `device-sources`
capability rather than reading device families directly or maintaining its own
parallel source implementations. Device discovery, freshness, and command
dispatch for Zigbee, Shelly, Nanoleaf, and configured state toggles are owned by
that capability and are shared with other consumers. The bridge MUST NOT retain
any accessory source of its own.

`HomekitService` MUST own the HAP bridge lifecycle (publish/unpublish, persist
path, PIN/port/bind, status endpoint, accessory map) and MUST NOT reference
`ZigbeeDevice`, Zigbee2MQTT `exposes`, MQTT, or Shelly RPC directly.

Because the shared device descriptor is deliberately richer than the HomeKit
model, `HomekitService` MUST narrow it to HAP services and characteristics at
its own boundary. The shared descriptor MUST NOT be reduced to the HomeKit
subset for the benefit of other consumers.

Accessory identifiers MUST remain unique across sources, namespaced by source
name.

Observable HomeKit behaviour MUST be unchanged by this consolidation. In
particular, accessory UUID derivation and the bridge UUID derivation MUST be
preserved exactly, so that an existing paired bridge continues to work and no
user is required to re-pair.

#### Scenario: Bridge starts all sources

- **WHEN** `HomekitService.onStart()` runs with one or more device sources
  available
- **THEN** each source is started after the HAP bridge is created
- **AND** devices yielded by a source are bridged as accessories

#### Scenario: Bridge stops all sources

- **WHEN** `HomekitService.onStop()` runs
- **THEN** each source is stopped
- **AND** the bridge is unpublished and the accessory map is cleared

#### Scenario: Source-agnostic accessory IDs avoid collisions

- **WHEN** two sources yield devices that share a friendly name
- **THEN** the bridge keeps them as distinct accessories because IDs are
  namespaced per source

#### Scenario: Existing pairing survives the consolidation

- **WHEN** an engine with an already-paired HomeKit bridge is upgraded to consume
  the shared device sources
- **THEN** the bridge UUID and every accessory UUID are unchanged, and the Home
  app continues to control the same accessories without re-pairing

#### Scenario: HomeKit narrowing does not constrain other consumers

- **WHEN** a device declares capabilities that have no HomeKit representation
- **THEN** those capabilities are absent from the HAP accessory but remain
  present in the shared device descriptor for other consumers

#### Scenario: One device family is bridged only once

- **WHEN** both the HomeKit bridge and another consumer are reading the same
  device source
- **THEN** the source performs discovery and refresh once, and both consumers
  observe the same device state

### Requirement: State Toggle Configuration

State toggles MUST be configured at engine level rather than as an option of the
HomeKit service, because they are consumed by every device source consumer and
not only by the HomeKit bridge.

Configuring a state toggle MUST NOT require the HomeKit bridge to be enabled, and
disabling the bridge MUST NOT remove a toggle from any other consumer.

The bridge MUST continue to present configured toggles as HomeKit switches with
the same accessory identifiers as before the relocation, so that an existing
pairing is unaffected.

#### Scenario: Toggles survive HomeKit being disabled

- **WHEN** state toggles are configured and the HomeKit bridge is disabled
- **THEN** the toggles remain enumerable and controllable through the shared
  device sources

#### Scenario: Relocation does not disturb existing accessories

- **WHEN** an engine with an already-paired bridge is upgraded and its state
  toggles are moved to engine-level configuration
- **THEN** the corresponding switch accessories keep their identifiers and the
  Home app continues to control them without re-pairing
