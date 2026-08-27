## Purpose

User-defined rooms that group devices across every device source, providing the
spatial organisation that Zigbee2MQTT does not supply, so that a device can be
found and controlled by where it is rather than by which integration it belongs
to.

## ADDED Requirements

### Requirement: Room Definition

The system MUST support user-defined rooms. A room has a stable identifier and a
display name that the user can change without affecting its membership.

Room names MUST be unique. Creating or renaming a room to a name already in use
MUST be rejected with a descriptive error.

Rooms MUST be creatable, renameable, and deletable. Deleting a room MUST NOT
delete any device; the devices it contained become unassigned.

#### Scenario: A room is created and named

- **WHEN** a user creates a room with a display name
- **THEN** the room exists with that name and no members

#### Scenario: Renaming preserves membership

- **WHEN** a room containing devices is renamed
- **THEN** the room's membership is unchanged

#### Scenario: Duplicate name is rejected

- **WHEN** a user creates a room with a name already in use
- **THEN** the request is rejected with a descriptive error and no room is
  created

#### Scenario: Deleting a room unassigns its devices

- **WHEN** a room containing devices is deleted
- **THEN** the room no longer exists, the devices still exist, and they are
  unassigned

### Requirement: Single Room Membership

A device MUST belong to at most one room. Assigning a device to a room MUST
remove it from any room it was previously in, as a single operation with no
intermediate state in which it belongs to both or neither.

A device that has never been assigned, or whose room has been deleted, MUST be
reported as unassigned rather than as a member of an implicit room.

#### Scenario: Reassignment moves rather than copies

- **WHEN** a device assigned to one room is assigned to another
- **THEN** it appears only in the new room and no longer in the old one

#### Scenario: Unassigned devices are enumerable

- **WHEN** devices exist that have never been assigned to a room
- **THEN** they are reported as unassigned and can be listed as a group

#### Scenario: Assignment is not duplicated

- **WHEN** a device is assigned to the room it is already in
- **THEN** the operation succeeds and the device has exactly one membership

### Requirement: Rooms Span Device Sources

A room MUST be able to contain devices from any source — Zigbee, Shelly,
Nanoleaf — simultaneously. Nothing in the room model may assume a single source.

#### Scenario: A room holds devices from three sources

- **WHEN** a Zigbee light, a Shelly switch, and a Nanoleaf panel are assigned to
  the same room
- **THEN** the room reports all three as members

### Requirement: Assignments Key On Stable Device Identity

A room assignment MUST be recorded against a device's stable per-source
identity, not against its display name. For Zigbee this is the device's hardware
address; for Shelly and Nanoleaf it is the name the device was registered under.

Consequently, renaming a device in the upstream system MUST NOT change or orphan
its room assignment.

Every device descriptor MUST therefore carry a stable identity distinct from its
display name.

#### Scenario: Upstream rename preserves the assignment

- **WHEN** a Zigbee device assigned to a room is renamed in Zigbee2MQTT
- **THEN** it remains a member of the same room under its new display name

#### Scenario: Two devices cannot share a stable identity

- **WHEN** assignments are recorded for devices from different sources
- **THEN** each assignment is unambiguously attributable to exactly one device

### Requirement: Absent Devices Retain Their Assignment

An assignment MUST be retained when its device is no longer present — because
the device has been unpaired, or because its source is disabled or
unconfigured.

Such a device MUST be reported as a member of its room and marked unavailable,
rather than being hidden or silently unassigned. When the device becomes present
again, it MUST be restored to the room with no user action.

An assignment referring to a device that has never been seen MUST NOT cause an
error when rooms are read.

#### Scenario: Unpaired device stays in its room as unavailable

- **WHEN** a device assigned to a room is unpaired
- **THEN** the room still lists it, marked unavailable

#### Scenario: Returning device is restored automatically

- **WHEN** a device that was unavailable becomes present again
- **THEN** it appears in its original room as available, without the user
  reassigning it

#### Scenario: Disabled source does not lose assignments

- **WHEN** a source is disabled and the engine restarts
- **THEN** assignments for that source's devices are retained and its devices are
  reported unavailable

#### Scenario: Unknown assignment does not break reads

- **WHEN** a stored assignment references a device that has never been observed
- **THEN** reading rooms succeeds and the entry is reported as unavailable

### Requirement: Room Durability

Rooms and their assignments MUST be persisted and restored across restarts,
subject to the bounded write-behind window described by the `state-management`
capability.

#### Scenario: Rooms survive a restart

- **WHEN** rooms are defined with device assignments and the engine is restarted
- **THEN** the same rooms exist with the same membership

#### Scenario: Rooms survive abrupt termination

- **WHEN** a room assignment is made and the process is killed without a graceful
  shutdown, after the write-behind window has elapsed
- **THEN** the assignment is present on next start

### Requirement: Room Membership Query

The system MUST expose, for any room, its member devices, and for any device,
the room it belongs to if any. It MUST also expose the set of unassigned
devices.

Membership queries MUST reflect the current availability of each member so that
a consumer can render unavailable members distinctly.

#### Scenario: Room reports its members with availability

- **WHEN** a room containing one present and one absent device is read
- **THEN** both are returned, with the absent one marked unavailable

#### Scenario: Device reports its room

- **WHEN** an assigned device is read
- **THEN** it reports the room it belongs to

#### Scenario: Unassigned group is queryable

- **WHEN** the unassigned group is read
- **THEN** it returns every present device that belongs to no room
