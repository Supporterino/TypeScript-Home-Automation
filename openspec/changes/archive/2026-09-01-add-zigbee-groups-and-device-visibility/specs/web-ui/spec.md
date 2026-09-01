## ADDED Requirements

### Requirement: Hidden Devices Are Filtered By Default And Revealable

Every view that lists devices — the dashboard, the device views, and a room's
membership — MUST omit hidden devices by default.

Each such view MUST offer a way to reveal hidden devices, alongside the existing
operable-only filter. Reveal is a viewing preference, not a change to the device:
it MUST NOT unhide anything, and it MAY be session-scoped and reset on reload, as
the operable-only filter is.

When hidden devices are revealed, they MUST be visually distinguishable from
visible ones, so a user can tell why a device they thought they had removed is on
screen.

A view emptied only because every device in it is hidden MUST say so, and MUST
distinguish that from having no devices at all. A room reading "no devices" when it
in fact contains three hidden ones is a bug report waiting to happen.

Counts the interface presents — such as a room's member count — MUST count what the
user can see under the current filters, so a count never disagrees with the list
beneath it.

#### Scenario: Hidden devices are absent by default

- **WHEN** a user opens the device list and some devices are hidden
- **THEN** the hidden devices are not shown

#### Scenario: Revealing shows them, marked

- **WHEN** the user turns on reveal
- **THEN** the hidden devices appear, visually distinguished from the visible ones,
  and remain hidden

#### Scenario: An all-hidden room explains itself

- **WHEN** a room's every member is hidden and reveal is off
- **THEN** the room reports that its devices are hidden, not that it has none

#### Scenario: Reveal does not persist as a device change

- **WHEN** the user reveals hidden devices and reloads
- **THEN** the devices are hidden again in the interface, and their hidden status
  was never changed

### Requirement: Hiding And Unhiding From The Interface

A user MUST be able to hide a device and unhide it from the interface, without
leaving the view they are in.

The action MUST be available from a device's own presentation — its tile or its
detail view — and MUST NOT require the user to know the device's qualified
identifier.

The interface MUST reflect the change immediately, and MUST reflect a change made
by another client without a manual refresh.

Hiding MUST be presented as a viewing choice, not a removal. A user must not
believe they have deleted a device, unpaired it, or stopped it working.

#### Scenario: A device is hidden from its tile

- **WHEN** a user hides a device from its tile
- **THEN** the device disappears from the list, and reappears if reveal is turned on

#### Scenario: A hidden device is unhidden

- **WHEN** a user reveals hidden devices and unhides one
- **THEN** it returns to the default listing

#### Scenario: Another client's change is reflected

- **WHEN** a device is hidden from a second browser
- **THEN** the first browser removes it from its listings without a manual refresh

### Requirement: Zigbee Groups Are Presented As Devices With Their Membership

A Zigbee group MUST be presented as a device, using the same tiles, controls, and
detail view as any other device. It MUST NOT require a separate top-level view.

A group MUST be visually identifiable as a group, and its detail view MUST show its
members and let the user reach each member's own detail view. Without that, a user
who has hidden the members has no route back to an individual bulb.

A group MUST offer only the controls its declared capabilities support. Because
those capabilities are the intersection of its members', a control a member has and
the group lacks MUST NOT be shown on the group, and the member's own detail view
remains the place to use it.

A group's membership MUST reflect what Zigbee2MQTT publishes and MUST NOT be
editable from this interface.

#### Scenario: A group appears as a controllable device

- **WHEN** a group of dimmable bulbs is discovered
- **THEN** it appears as a device tile with on/off and brightness controls

#### Scenario: A group is identifiable as a group

- **WHEN** a user views a list containing a group and ordinary devices
- **THEN** the group is visually distinguishable from the others

#### Scenario: Members are reachable from the group

- **WHEN** a user opens a group's detail view
- **THEN** its members are listed and each can be opened, including members that
  are hidden

#### Scenario: A capability only some members have is absent from the group

- **WHEN** a group contains one bulb with colour support and two without
- **THEN** the group offers no colour control, and the colour-capable member still
  offers one on its own detail view

#### Scenario: Membership is read-only

- **WHEN** a user views a group's members
- **THEN** no control is offered to add or remove a member
