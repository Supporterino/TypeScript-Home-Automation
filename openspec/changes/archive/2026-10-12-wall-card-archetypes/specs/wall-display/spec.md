## MODIFIED Requirements

### Requirement: Wall Device Presentation

A device shown on a wall MUST present its actuation and its state, and MUST NOT
present device-management affordances. On the wall, a device tile MUST NOT offer
a favorite toggle, a hide/unhide toggle, or an explicit open-detail affordance.

A wall device card MUST select its presentation from the device's ranked
capabilities rather than applying a single template to every device. At minimum
it MUST distinguish:

- a device whose primary action is a pure toggle (an on/off card presented as a
  single dominant action),
- a device that combines a toggle with a value control (an on/off toggle and a
  brightness control coexisting — a wall-only exception to the one-dominant-
  action rule),
- a device with no actuatable property (a read-only readout card), and
- a cover (presenting transport controls, per "Cover Transport Controls").

For a card whose primary action is a toggle and which presents no other control,
the whole card MUST be the actuation target. A card that presents a value control
MUST use that embedded control as the value's actuation target, since a bare tile
activation cannot express the value to set.

A readout card MUST present its value as the card's dominant content without a
control surface competing with it.

A wall device card MUST encode state by more than color alone and MUST still
distinguish a push-backed observation, a polled observation, and an unreachable
device. The observation state MUST be presented as a non-textual indicator, so
that connectivity state does not compete with the card's control or readout;
unreachable MAY additionally be marked. Every wall control MUST actuate as device
actuation behaves elsewhere: reflected immediately, reconciled against reported
state, and reverted with the failure surfaced when the command fails.

A device with no actuatable property MUST render on the wall as a read-only
readout without presenting a navigation affordance.

A device card rendered inside a wall widget frame MUST be a single surface — it
MUST NOT nest one control surface inside another.

#### Scenario: No management affordances are presented

- **WHEN** a device is shown on a wall
- **THEN** no favorite, hide/unhide, or open-detail control is presented

#### Scenario: The whole tile actuates a toggle

- **WHEN** a user activates a wall card for a device whose only primary action is
  a toggle
- **THEN** the device is actuated without opening any other view

#### Scenario: A light card presents both a toggle and a value control

- **WHEN** a device declares both an on/off capability and a brightness
  capability
- **THEN** its wall card presents an on/off toggle and a brightness control
  together, each independently operable

#### Scenario: A value device keeps its embedded control

- **WHEN** a device whose primary action sets a value is shown on a wall
- **THEN** its embedded control is the value's actuation target

#### Scenario: State is still encoded

- **WHEN** a wall device card is shown
- **THEN** its state is conveyed by at least one non-color channel in addition to
  any color

#### Scenario: Observation is a quiet indicator

- **WHEN** a wall device card is shown while its device is push-backed, polled,
  or unreachable
- **THEN** the observation is presented as a non-textual indicator that
  distinguishes those states from one another

#### Scenario: A sensor is read-only

- **WHEN** a device with no actuatable property is shown on a wall
- **THEN** its reading is presented as the card's dominant content and no
  navigation affordance is offered

#### Scenario: A card is a single surface

- **WHEN** a device card is rendered inside a wall widget frame
- **THEN** one control surface is drawn, not a surface nested inside another

#### Scenario: Actuation reconciles and reverts

- **WHEN** a device is actuated from a wall card and the command fails
- **THEN** the card reverts and surfaces the failure

### Requirement: Wall Configuration Editor

Wall profiles MUST be created, renamed, deleted, and configured from the admin
interface on a non-wall device. The editor MUST allow a user to add a widget of
any supported type, configure it, and place and size it on the grid, and MUST
allow the widget order and placement to be changed without a drag interaction.

The wall surface itself MUST be read-only: it MUST NOT expose editing controls.
Saving a profile MUST validate the configuration, and an invalid configuration
MUST be rejected rather than persisted. The configuration MUST carry a version
so its shape can evolve without a migration.

The editor MUST present the profile's widgets in a dense, multi-column layout on
wide viewports — one column on narrow viewports and two or more on wide ones —
so a profile with many widgets remains scannable without excessive scrolling.
Each widget MUST remain a self-contained, labelled group carrying its placement
controls and its type-specific configuration, and a smaller viewport MUST NOT be
made to scroll horizontally.

#### Scenario: A profile is built in the editor

- **WHEN** a user creates a profile, adds widgets, and saves
- **THEN** the profile is persisted and the wall at its address renders it

#### Scenario: Placement is possible without dragging

- **WHEN** a user arranges widgets using the editor's non-drag controls
- **THEN** the widgets' positions and sizes are updated

#### Scenario: The wall cannot be edited in place

- **WHEN** a wall is open on the panel
- **THEN** no control for adding, removing, or editing a widget is presented

#### Scenario: An invalid profile is rejected

- **WHEN** a configuration the editor cannot validate is submitted
- **THEN** it is rejected and the previously saved configuration is unchanged

#### Scenario: The widget list is dense and scannable

- **WHEN** a profile with many widgets is edited on a wide viewport
- **THEN** the widgets are laid out in two or more columns, each remaining a
  self-contained group, without horizontal scrolling

## ADDED Requirements

### Requirement: Cover Transport Controls

A device whose primary action positions a cover MUST present, on the wall,
transport controls — open and close — that command the cover to its extremes
rather than a bare position slider, so the cover is operable as a discrete,
touch-friendly action.

A stop control MUST be presented only when the device declares a writable
transport property capable of expressing stop. When the device cannot express
stop, the stop control MUST be omitted rather than rendered inert, and open and
close MUST remain available.

Transport controls MUST meet the wall's minimum touch target, MUST not require a
hover interaction, and MUST actuate optimistically — reflected immediately,
reconciled against reported state, and reverted with the failure surfaced when
the command fails.

#### Scenario: Open and close move the cover

- **WHEN** a user activates a cover's open control
- **THEN** the cover is commanded to its fully-open position

#### Scenario: A stop-capable cover shows stop

- **WHEN** a cover declares a writable transport property that can express stop
- **THEN** a stop control is presented and commands the cover to stop

#### Scenario: A cover that cannot stop omits stop

- **WHEN** a cover does not declare any writable property capable of expressing
  stop
- **THEN** no stop control is presented and open and close remain operable

#### Scenario: Transport controls are touch-sized

- **WHEN** a cover's transport controls are shown on a wall
- **THEN** each control meets the wall's minimum touch target

#### Scenario: A transport command reconciles and reverts

- **WHEN** a transport command is issued from a wall card and it fails
- **THEN** the control reverts and surfaces the failure
