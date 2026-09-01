# Device Visibility Specification

## Purpose

Lets a user mark a device as hidden so it stops appearing on the surfaces people
look at — the dashboard and the HomeKit bridge — without removing it from the
system, so the bulbs behind a group, and the sensors nobody controls, stop
competing for attention with the things that matter.

## Requirements

### Requirement: Per-Device Hidden Flag

The system MUST support marking any device hidden, and unmarking it, addressed by
qualified device identifier. The flag MUST persist across restarts.

Hiding MUST be available for a device from any source, not only Zigbee, and not
only for group members.

Hiding a device MUST NOT alter the device, its state, its room assignment, or its
reachability. It is a presentation preference and nothing else.

Hiding MUST be idempotent: hiding an already-hidden device, or unhiding a visible
one, MUST succeed and change nothing.

A device MAY be hidden before it is known to the system, and a hidden device that
disappears MUST retain its flag, so that a device flapping or a bridge restarting
does not silently unhide it.

#### Scenario: A device is hidden and stays hidden

- **WHEN** a user hides a device and the engine restarts
- **THEN** the device is still hidden

#### Scenario: Hiding does not change the device

- **WHEN** a device assigned to a room is hidden
- **THEN** its state, reachability, and room assignment are unchanged

#### Scenario: Hiding is idempotent

- **WHEN** a user hides a device that is already hidden
- **THEN** the request succeeds and nothing changes

#### Scenario: A hidden device that disappears stays hidden

- **WHEN** a hidden device leaves the network and later rejoins
- **THEN** it is still hidden

#### Scenario: Any source's device can be hidden

- **WHEN** a user hides a Shelly device and a state toggle
- **THEN** both are hidden, using the same mechanism as a Zigbee device

### Requirement: Hiding Is Explicit, Never Derived

A device MUST become hidden only because a user hid it. The system MUST NOT infer
hiding from any other property — in particular, membership of a Zigbee group MUST
NOT hide a device.

Deriving hiding from group membership would be wrong in both directions: a bulb can
belong to a group and still be worth controlling alone, and a device can be
clutter without belonging to any group. An explicit flag serves both cases with one
rule instead of a rule plus an exception.

#### Scenario: A group member is visible until hidden

- **WHEN** a group is discovered whose members were all visible
- **THEN** the members remain visible, and the group appears alongside them

#### Scenario: A device outside any group can be hidden

- **WHEN** a user hides a sensor that belongs to no group
- **THEN** it is hidden, by the same mechanism as any other device

### Requirement: Visibility Applies To Presentation Surfaces Only

Hiding MUST take effect on surfaces a person reads, and MUST NOT take effect on
surfaces the system reads.

Hidden devices MUST be excluded from:

- the HomeKit bridge's exposed accessories
- the device lists the web UI presents by default

Hidden devices MUST remain fully present in:

- total device enumeration, so that reconciliation of appearances and
  disappearances continues to see them and does not report a hidden device as gone
- retrieval and command by qualified identifier, so automations and clients that
  address a device directly are unaffected
- room membership, so a hidden device does not silently leave its room
- the event stream's device state and reachability events

The distinction MUST be explicit at each point of use rather than applied silently
inside enumeration: a listing surface either asks for all devices or asks for
visible devices. Filtering all enumeration would make a hidden device appear to
have disappeared, and would make it unassignable and unrecoverable.

#### Scenario: A hidden device leaves HomeKit

- **WHEN** a device exposed as a HomeKit accessory is hidden
- **THEN** the accessory is removed from the bridge

#### Scenario: A hidden device is not reported as disappeared

- **WHEN** a device is hidden
- **THEN** no device-disappeared event is emitted for it, and none is emitted later
  while it remains present

#### Scenario: A hidden device is still commandable

- **WHEN** an automation commands a hidden device by qualified identifier
- **THEN** the command is dispatched normally

#### Scenario: A hidden device keeps its room

- **WHEN** a device assigned to a room is hidden
- **THEN** the room still counts it as a member, and unhiding it restores it to the
  room's presented membership without reassignment

#### Scenario: A hidden device still reports state

- **WHEN** a hidden device reports a new state
- **THEN** a device state event is emitted for it

### Requirement: Visibility Is Discoverable And Reversible

A client MUST be able to determine whether a device is hidden, and MUST be able to
unhide it. A hidden device that no client can see or reach would be unrecoverable
except by editing persisted state by hand.

Each device's hidden status MUST therefore be readable together with the device
itself, so that a client can both filter on it and offer to reverse it without a
second lookup and a join.

#### Scenario: Hidden status is readable with the device

- **WHEN** a client reads a device
- **THEN** the response says whether it is hidden

#### Scenario: A hidden device can be found and restored

- **WHEN** a user reveals hidden devices and unhides one
- **THEN** it reappears on the default listings and in HomeKit

### Requirement: Visibility Changes Propagate Immediately

A change in a device's visibility MUST take effect without restarting the engine,
on every surface that honours it.

Connected clients MUST be informed of a visibility change through the event stream,
identifying the affected device and its new visibility, without resending the
device list.

The HomeKit bridge MUST add or remove the corresponding accessory when visibility
changes. A visibility change is not a device state change and produces no device
event of its own, so the bridge MUST observe visibility directly rather than
waiting for unrelated device activity to prompt it. Otherwise a hidden device would
linger in the Home app until it happened to report something.

#### Scenario: HomeKit reacts without a restart

- **WHEN** a user hides a device and the device reports nothing further
- **THEN** its accessory is removed from the HomeKit bridge promptly, without a
  restart

#### Scenario: Another client is informed

- **WHEN** one client hides a device
- **THEN** every other connected client receives an event naming that device and
  its new visibility, and updates without refetching the device list

#### Scenario: Unhiding restores the accessory

- **WHEN** a hidden device is unhidden
- **THEN** its HomeKit accessory is added back
