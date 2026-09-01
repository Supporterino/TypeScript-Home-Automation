## Purpose

Exposes the groups a user has already defined in Zigbee2MQTT as ordinary devices,
so that a fixture built from several bulbs can be read and controlled as the one
thing it physically is, rather than as the several radios it happens to contain.

## ADDED Requirements

### Requirement: Group Discovery

The system MUST discover Zigbee groups from the bridge's published group list and
keep its own view reconciled with it: groups present in a newly published list are
tracked, groups absent from it are dropped.

A group MUST be identified by the numeric identifier the bridge assigns it, not by
its friendly name, so that renaming a group in Zigbee2MQTT does not detach anything
that references it.

A malformed group list, or an individual entry missing the fields needed to
identify it, MUST be skipped with a warning rather than aborting discovery or
throwing.

Group discovery MUST be governed by the same enablement as device discovery: when
the device registry is disabled, no groups are discovered and no group devices are
presented.

#### Scenario: Groups are discovered from the bridge

- **WHEN** the bridge publishes a group list containing two groups
- **THEN** both groups are tracked, each identified by its numeric identifier

#### Scenario: A removed group is dropped

- **WHEN** the bridge publishes a group list from which a previously tracked group
  is absent
- **THEN** that group is no longer tracked and no longer appears as a device

#### Scenario: Renaming a group preserves its identity

- **WHEN** a group's friendly name changes in Zigbee2MQTT and the bridge
  republishes
- **THEN** the group keeps the same identity, and anything referencing it — such as
  a room assignment — still refers to the same group

#### Scenario: A malformed entry is skipped, not fatal

- **WHEN** the published group list contains an entry that cannot be identified
- **THEN** that entry is skipped with a warning and the remaining groups are
  tracked

#### Scenario: Groups are absent when the registry is disabled

- **WHEN** the device registry is disabled
- **THEN** no group devices are presented and enumeration does not fail

### Requirement: Group Persistence

The tracked group list MUST be persisted and restored under the same setting that
governs device persistence, so that a group is available on boot rather than only
after the bridge republishes.

A restored group is a cold-start seed, never a source of truth: an incoming
published group list MUST overwrite it.

#### Scenario: Groups survive a restart

- **WHEN** the engine restarts and the bridge has not yet published its group list
- **THEN** the previously tracked groups are already present as devices

#### Scenario: A room assignment referencing a group survives a restart

- **WHEN** a group assigned to a room is present at shutdown and the engine
  restarts
- **THEN** the room still reports that group as a member before the bridge
  republishes

#### Scenario: Published groups overwrite restored ones

- **WHEN** the bridge publishes a group list that differs from the restored one
- **THEN** the published list wins

#### Scenario: Group persistence follows the registry setting

- **WHEN** registry persistence is explicitly disabled
- **THEN** no group snapshot is written and groups repopulate from the bridge

### Requirement: Groups Are Devices

Each discovered group MUST be presented as a device through the unified device
model, carrying a qualified identifier distinct from any member's, its friendly
name as display name, and a capability description like any other device.

Everything above the source layer MUST treat a group as an ordinary device: it can
be assigned to a room, retrieved by qualified identifier, commanded, and observed
over the event stream, with no group-specific handling required of the consumer.

A group MUST NOT be presented as a member's parent, and a member MUST NOT be
presented as a child. Membership is metadata about the group, not a structural
relationship the device model exposes.

#### Scenario: A group appears in the device list

- **WHEN** a client enumerates devices and a group exists
- **THEN** the group appears alongside its member devices, each with its own
  qualified identifier

#### Scenario: A group can be assigned to a room

- **WHEN** a user assigns a group to a room
- **THEN** the group appears as a member of that room, and the assignment behaves
  identically to assigning any other device

#### Scenario: A group is retrievable and commandable by qualified identifier

- **WHEN** a client retrieves and then commands a group by its qualified identifier
- **THEN** both succeed, using the same endpoints as any other device

### Requirement: Group Capabilities Are The Intersection Of Member Capabilities

A group's declared capabilities MUST be the intersection of its members'
capabilities: a property is offered only when every member supports it, with
compatible access and type.

Where a property is numeric and members declare different ranges, the declared
range MUST be the one every member can satisfy.

This is deliberately conservative. Zigbee2MQTT multicasts a group command and lets
incapable members ignore it, so a union would be closer to what the transport
does — but a capability the system declares is one a client will render a control
for and a command validator will accept, and neither should promise behaviour a
member cannot deliver. A group of identical bulbs is unaffected; only a mixed group
loses the properties its weakest member lacks.

A group whose members share no capability MUST still be presented as a device, with
an empty capability set, rather than being omitted.

#### Scenario: Identical members yield full capabilities

- **WHEN** a group contains three bulbs with identical capabilities
- **THEN** the group declares those same capabilities

#### Scenario: A mixed group loses the unsupported property

- **WHEN** a group contains two colour bulbs and one that supports only on/off and
  brightness
- **THEN** the group declares on/off and brightness, and does not declare colour

#### Scenario: A narrower numeric range wins

- **WHEN** members declare different ranges for the same numeric property
- **THEN** the group declares the range every member can satisfy

#### Scenario: A command outside the group's capabilities is rejected

- **WHEN** a client sends a group a property the group does not declare
- **THEN** the command is rejected as invalid, and nothing is published

#### Scenario: A group with no shared capability is still a device

- **WHEN** a group's members share no capability
- **THEN** the group appears in the device list with an empty capability set

### Requirement: Group State Is Derived From Member State

A group's reported state MUST be derived from the tracked state of its members
rather than read from any state the bridge publishes for the group itself. The
bridge's own group state is optimistic — computed from commands it sent, not from
what the devices report — and would drift from the member states presented
alongside it.

Derivation rules:

- A boolean property MUST report on when **any** member reports on, matching how
  Zigbee2MQTT itself summarises a group, so the two do not disagree about the same
  fixture.
- A numeric property MUST report the average across members that are currently on.
  Averaging across off members would drag a dimmed fixture's brightness toward zero
  for no reason a user could see.
- A property whose value cannot be derived, because no member reports it, MUST be
  absent rather than reported as a default.

A group's state MUST update when any member's state changes, and that update MUST
be observable through the same subscription and event stream as any other device
state change.

A group MUST be reported as reachable; the system does not track group
reachability, and a group has no radio of its own to be unreachable.

#### Scenario: Any member on makes the group on

- **WHEN** one of three members is on and the other two are off
- **THEN** the group reports on

#### Scenario: All members off makes the group off

- **WHEN** every member is off
- **THEN** the group reports off

#### Scenario: Brightness averages across members that are on

- **WHEN** two members are on at different brightnesses and a third is off
- **THEN** the group reports the average brightness of the two that are on

#### Scenario: A member state change updates the group

- **WHEN** a member reports a new state
- **THEN** the group's derived state updates and an event is emitted for the group
  as well as for the member

#### Scenario: An underivable property is omitted

- **WHEN** no member reports a property the group declares
- **THEN** the group's state omits that property rather than reporting a default

### Requirement: Group Commands Are Multicast By The Bridge

A command addressed to a group MUST be published so that Zigbee2MQTT multicasts it
to the group's members, rather than being fanned out into one command per member by
this system. Multicast is why groups exist: it is a single radio transmission, so
the members change together instead of visibly cascading.

A command to a group MUST be validated against the group's declared capabilities
before being published.

The system MUST NOT optimistically report the commanded value as the group's state.
The group's state remains derived from what the members report.

#### Scenario: A group command is published once

- **WHEN** a client turns a three-member group on
- **THEN** one command is published addressing the group, not three addressing
  members

#### Scenario: The group's state follows the members, not the command

- **WHEN** a group is commanded on and the members have not yet reported
- **THEN** the group's reported state is still derived from member state, not from
  the command

### Requirement: Group Management Is Out Of Scope

The system MUST NOT create, rename, delete, or alter the membership of Zigbee
groups. Groups are defined in Zigbee2MQTT and read here.

#### Scenario: No endpoint mutates a group

- **WHEN** a client looks for a way to change a group's membership through this
  system
- **THEN** none is offered, and group membership changes only when Zigbee2MQTT
  publishes a new group list
