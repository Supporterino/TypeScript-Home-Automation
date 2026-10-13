# Device Sources

## ADDED Requirements

### Requirement: Shelly Full-Status Ingestion

A Shelly source MUST ingest a full component-status notification
(`NotifyFullStatus`) for an MQTT-transport device, not only incremental
(`NotifyStatus`) changes. Each `switch:N` / `cover:N` component key present in
the payload MUST be dispatched to its logical channel entry, so a full status
seeds `on` for a switch and `position` / `state` for a cover.

#### Scenario: A full-status notification seeds a switch's on/off

- **WHEN** an MQTT-transport Shelly switch publishes a `NotifyFullStatus` naming
  `switch:0`
- **THEN** the source records that component's output and the device's
  descriptor reports its `on` property without any physical change

#### Scenario: A full-status notification seeds a cover's position and state

- **WHEN** an MQTT-transport Shelly cover publishes a `NotifyFullStatus` naming
  `cover:0`
- **THEN** the source records the cover's position and movement state, and the
  descriptor reports them

#### Scenario: A multi-component full status updates every channel

- **WHEN** an MQTT-transport device with `switch:0` and `switch:1` publishes a
  `NotifyFullStatus` naming both
- **THEN** each channel's logical device records its own output and subscribers
  are notified for each

#### Scenario: Incremental notifications still apply

- **WHEN** an MQTT-transport device later publishes a partial `NotifyStatus`
- **THEN** the changed attributes are merged onto the last-known state,
  preserving the seeded values

### Requirement: Shelly Status Seeding at Subscription

A Shelly source MUST obtain an MQTT-transport device's current component status
through its RPC status query when the device is first subscribed — at source
start, and when a device is registered after the source has started — because
the events topic is not retained and a connect-time full status may have been
published before the source subscribed. A seed failure MUST be logged and
non-fatal, leaving the device enumerable.

#### Scenario: Current status is obtained at first subscription

- **WHEN** the source starts with an MQTT-transport device already registered,
  or that device is registered after the source has started
- **THEN** the source obtains the device's current component status through its
  RPC status query, so the descriptor carries the reported properties without
  waiting for a change

#### Scenario: A failed seed does not fail the source

- **WHEN** an MQTT-transport device's status query fails or times out at
  subscription
- **THEN** the failure is logged, the device remains enumerable, and the source
  otherwise starts normally

#### Scenario: A never-reported attribute is absent, not synthesized

- **WHEN** an MQTT-transport device has not reported a readable attribute
- **THEN** that attribute is absent from the descriptor's state rather than
  reported as off or zero
