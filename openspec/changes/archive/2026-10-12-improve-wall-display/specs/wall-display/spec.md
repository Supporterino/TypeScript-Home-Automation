## ADDED Requirements

### Requirement: Wall Glanceability

A wall MUST be composed so it is legible at a glance from across a room, and its
card sizes MUST reflect each widget's declared span rather than the panel
height.

A widget's rendered height MUST be derived from its grid span and a bounded row
unit, so that a widget occupying a small span is not inflated to fill the panel.
A profile whose widgets occupy fewer rows than fill the panel MUST occupy its
natural height, centered, rather than stretching every card to fill the panel.

The wall MUST apply a type scale larger than the dashboard's body scale, sized
for viewing at distance, and MUST present ambient readouts distinctly from touch
controls. The wall MUST maintain a minimum gutter between widgets and from the
panel edge.

A widget's title MUST be shown only when the profile explicitly configures one;
otherwise the widget's own content provides its labelling.

#### Scenario: A small control is not inflated

- **WHEN** a widget with a small span is rendered on a panel taller than the
  profile needs
- **THEN** its height follows its span and the row unit, not the panel height

#### Scenario: A short profile is centered

- **WHEN** a profile's widgets occupy fewer rows than fill the panel
- **THEN** the composition is centered and each card keeps its span-derived
  height

#### Scenario: Readouts and controls are distinguishable

- **WHEN** a profile mixes an ambient readout and a touch control
- **THEN** the readout is presented without a control surface and the control is
  presented as a touch surface

#### Scenario: Titles are opt-in

- **WHEN** a widget has no explicitly configured title
- **THEN** no title header is rendered and the widget's own content labels it

#### Scenario: A minimum gutter is kept

- **WHEN** a profile is rendered
- **THEN** adjacent widgets and the panel edge are separated by at least the
  wall's minimum gutter

### Requirement: Wall Device Presentation

A device shown on a wall MUST present its actuation and its state, and MUST NOT
present device-management affordances. On the wall, a device tile MUST NOT offer
a favorite toggle, a hide/unhide toggle, or an explicit open-detail affordance.
For a device whose primary action is a toggle, the whole tile MUST be the
actuation target; a device whose primary action sets a value MUST present its
embedded control as the actuation target, since a bare tile activation cannot
express the value to set.

A wall device tile MUST still encode state by more than color alone, MUST still
distinguish a push-backed observation, a polled observation with the age of its
last observation, and an unreachable device, and MUST actuate as device
actuation behaves elsewhere: reflected immediately, reconciled against reported
state, and reverted with the failure surfaced when the command fails.

A device with no actuatable property MUST render on the wall as a read-only
readout without presenting a navigation affordance.

#### Scenario: No management affordances are presented

- **WHEN** a device is shown on a wall
- **THEN** no favorite, hide/unhide, or open-detail control is presented

#### Scenario: The whole tile actuates a toggle

- **WHEN** a user activates a wall tile for a device whose primary action is a
  toggle
- **THEN** the device is actuated without opening any other view

#### Scenario: A value device keeps its embedded control

- **WHEN** a device whose primary action sets a value is shown on a wall
- **THEN** its embedded control remains the actuation target and the whole tile
  is not required to actuate on a bare activation

#### Scenario: State is still encoded

- **WHEN** a wall device tile is shown
- **THEN** its state is conveyed by at least one non-color channel in addition
  to any color

#### Scenario: A sensor is read-only

- **WHEN** a device with no actuatable property is shown on a wall
- **THEN** its reading is presented and no navigation affordance is offered

#### Scenario: Actuation reconciles and reverts

- **WHEN** a device is actuated from a wall tile and the command fails
- **THEN** the tile reverts and surfaces the failure
