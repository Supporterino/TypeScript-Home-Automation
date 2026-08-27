## ADDED Requirements

### Requirement: Device Capability Schema Access

The registry MUST retain each tracked device's published capability schema — the
Zigbee2MQTT `exposes` description — and MUST make it readable by consumers.

The schema MUST be typed rather than opaque, describing at minimum, for each
declared entry: its kind, the property it reads or writes, whether it is
readable, writable, or both, its value type, and its constraints — numeric range
and step where applicable, permitted values where enumerated, and unit where
supplied. Composite entries that group nested features MUST preserve that
nesting.

The schema MUST be expressed in the shared, source-neutral capability vocabulary
rather than in a Zigbee-specific one, since sources that publish no schema of
their own describe themselves in the same terms. The registry maps what the
bridge publishes into that vocabulary; it does not define it.

An entry whose shape the engine does not recognise MUST be preserved and
surfaced rather than discarded, so that a consumer can still present it.

The schema MUST be included in the registry's persisted snapshot and restored on
load, so that capability information is available before the bridge republishes
its device list.

#### Scenario: Capability schema is readable

- **WHEN** a consumer reads a tracked device
- **THEN** the device's published capability schema is available, describing its
  readable and writable properties with their constraints

#### Scenario: Nested features are preserved

- **WHEN** a device publishes a composite entry grouping several features, such
  as a light with brightness and colour temperature
- **THEN** the nested features are preserved with their individual constraints

#### Scenario: Unrecognised entry is preserved

- **WHEN** a device publishes a capability entry of a kind the engine has no
  specific handling for
- **THEN** the entry is retained and surfaced rather than dropped

#### Scenario: Schema survives a restart

- **WHEN** the registry is loaded from its persisted snapshot before the bridge
  has republished its device list
- **THEN** each restored device's capability schema is available

#### Scenario: Device without a schema is well-formed

- **WHEN** a tracked device publishes no capability schema
- **THEN** it is described as having an empty schema rather than an absent one

### Requirement: Registry Persistence Default

Registry persistence MUST be enabled by default, matching the state store, so
that the device list and each device's capability schema are available
immediately on boot rather than only after the bridge republishes.

An operator MAY still disable it explicitly. Because this reverses the previous
default, an existing deployment that has never set `DEVICE_REGISTRY_PERSIST` MUST
begin persisting its snapshot after upgrading.

#### Scenario: Registry persistence is on when unset

- **WHEN** `DEVICE_REGISTRY_PERSIST` is not set and the registry is enabled
- **THEN** the registry snapshot is persisted and restored across restarts

#### Scenario: Devices are available before the bridge republishes

- **WHEN** the engine restarts and the bridge has not yet published its device
  list
- **THEN** the previously tracked devices and their capability schemas are
  already readable

#### Scenario: Registry persistence can still be disabled

- **WHEN** `DEVICE_REGISTRY_PERSIST` is explicitly set to false
- **THEN** no snapshot is written and the registry repopulates from the bridge
