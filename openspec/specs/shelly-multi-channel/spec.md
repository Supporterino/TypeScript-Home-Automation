# Shelly Multi-Channel Devices

## Purpose

Enumerates the individual components (switch and cover channels) of a
multi-component Shelly device and presents each as its own addressable logical
device, so that a single physical appliance such as a Shelly Pro 4PM can be
controlled circuit-by-circuit.

## Requirements

### Requirement: Component Discovery

When a Shelly device is registered, the system MUST determine how many
switch/cover components it exposes rather than assuming a single component at
channel 0.

- For a device registered with HTTP transport, the system MUST query the
  device for its component inventory (e.g. `Shelly.GetComponents`) at startup.
- For a device registered with MQTT transport, the system MUST derive the
  component inventory from an explicit RPC query over the MQTT channel. If that
  inventory query cannot be completed, the device MUST fall back to a single
  channel-0 component (as for any other discovery failure) rather than blocking
  registration or fabricating components from notification payloads.
- The component inventory query MUST account for paging: a
  `Shelly.GetComponents` response reports a `total` and may return only a
  subset, so discovery MUST page through the inventory until every reported
  component is covered rather than trusting a single response. Reading only the
  first page MUST NOT be treated as a complete inventory.
- Where the inventory can carry a component's configured name (e.g. by
  requesting component config alongside status), the system MUST obtain it so
  per-channel identity can use it.
- The source MUST complete discovery for every already-registered device before
  it reports itself started, so enumeration is complete once the engine is up.
  A device MUST NOT appear in enumeration until its discovery resolves.
- Discovery MUST be resilience-isolated: a device whose inventory cannot be
  determined MUST fall back to a single channel-0 component rather than
  failing registration or blocking other devices.
- Discovery MUST be idempotent: re-running it for an already-discovered device
  MUST NOT create duplicate descriptors or lose tracked state.

#### Scenario: Multi-component device is enumerated

- **WHEN** a Shelly Pro 4PM exposing `switch:0`..`switch:3` is registered
- **THEN** the system discovers four switch components and proceeds to build
  one logical device per component

#### Scenario: Single-component device is unchanged

- **WHEN** a Shelly Plus 1PM exposing only `switch:0` is registered
- **THEN** discovery yields exactly one component and its logical identity is
  unchanged from before this capability existed

#### Scenario: Discovery precedes enumeration

- **WHEN** the source has started
- **THEN** every device registered before startup has completed discovery and
  appears in enumeration with all of its components

#### Scenario: Discovery failure falls back gracefully

- **WHEN** a device's component inventory cannot be queried or the response is
  malformed
- **THEN** the device is presented as a single channel-0 component and its
  registration still succeeds

#### Scenario: Discovery is idempotent

- **WHEN** component discovery runs a second time for a device already
  discovered
- **THEN** no duplicate logical devices are created and existing tracked state
  is preserved

#### Scenario: Paginated inventory is fully enumerated

- **WHEN** a device reports more components than fit on one inventory page and
  its switch components sort onto a later page
- **THEN** discovery pages through the inventory to the reported total and
  enumerates every switch/cover component, rather than stopping at the first
  page and falling back to a single channel

#### Scenario: Configured component names are available to identity

- **WHEN** a multi-component device's inventory is queried with component config
- **THEN** each discovered component's configured name is available for the
  identity scheme rather than only its numeric channel

### Requirement: Per-Channel Logical Identity

Each discovered component MUST become a logical device with an identity that
uniquely identifies the physical device and the component channel, and that is
stable across restarts for the same physical device, channel, and component
name.

- When discovery yields exactly one component, its identity MUST be the base
  registration name, so existing single-component deployments keep their
  identity.
- When discovery yields multiple components, each identity MUST be the
  component's configured name when present and unique **across every registered
  device**, otherwise the base name joined with the channel; colliding
  configured names MUST be disambiguated by the channel so identities stay
  unique within the source.
- The human-facing display name MUST distinguish channels (e.g. by appending the
  channel or the component's configured name) so two channels of one appliance
  are not displayed ambiguously.
- Renaming a component on the physical device MAY yield a new identity; that is
  an accepted consequence (orphaned persisted state and a HomeKit re-pair), not
  a violation.

#### Scenario: Channels of one device have distinct identities

- **WHEN** `switch:0` and `switch:1` of one Pro 4PM are enumerated
- **THEN** they carry distinct logical identities and distinct display names

#### Scenario: Identity survives a restart

- **WHEN** the engine restarts and the same physical device is re-discovered
  without its components being renamed
- **THEN** each channel's logical identity is unchanged

#### Scenario: Single-component identity is preserved

- **WHEN** a device that exposes one component is discovered
- **THEN** its logical identity is the base registration name, unchanged from
  before this capability existed

#### Scenario: Missing or colliding names fall back deterministically

- **WHEN** a discovered component has no configured name, or two components of
  one device share a configured name
- **THEN** the identity falls back to the base name joined with the channel,
  disambiguating collisions by channel

#### Scenario: Same-named components across two devices do not collide

- **WHEN** two different registered devices each expose a component with the
  same configured name
- **THEN** their identities remain unique within the source, each falling back
  to its base name joined with the channel where the configured name is not
  unique across all registered devices

### Requirement: Per-Channel Capability Description

Each channel's descriptor MUST carry a capability description that reflects
that component's kind and its own metering status, independently of the other
channels.

- The component's kind (`switch` vs `cover`) MUST be taken from discovery; the
  `outlet` distinction MUST be taken from the device's registration type and
  applied to its switch channels.
- A channel that reports cumulative energy MUST declare the energy capability;
  a channel that does not MUST omit it — the two MUST NOT be conflated even
  when they belong to the same physical device.

#### Scenario: Metered and non-metered channels differ

- **WHEN** one channel of a device reports a cumulative `aenergy` reading and
  another channel does not
- **THEN** only the reporting channel's descriptor declares the energy
  capability

#### Scenario: Channel kind is respected

- **WHEN** a component is a cover
- **THEN** its descriptor declares position and movement state rather than
  on/off

#### Scenario: Outlet kind comes from registration

- **WHEN** a device whose registration type is `outlet` exposes switch
  components
- **THEN** each switch channel's descriptor declares the `outlet` kind
