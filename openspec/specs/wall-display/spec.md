# Wall Display

## Purpose

A composable, full-bleed dashboard surface for wall-mounted touchscreens, where
a user configures named profiles of curated widgets (time, weather, energy,
device and room controls, scene buttons) and the panel renders exactly those,
read-only, at a glance.

## Requirements

### Requirement: Named Wall Profiles

The system MUST support multiple named wall profiles, each a distinct
composition of widgets, so a home can run several panels (for example a kitchen
and a hallway) showing different content.

A profile MUST have a stable name used both to address it and to label it.
Profiles MUST persist across an engine restart. A request for a profile that
does not exist MUST be distinguishable from one that exists and is empty, and
MUST NOT render as a blank panel without explanation.

#### Scenario: A profile is addressed by name

- **WHEN** a wall is opened at its profile address
- **THEN** the widgets configured for that profile are rendered

#### Scenario: Profiles survive a restart

- **WHEN** a profile is configured and the engine restarts
- **THEN** the profile and its widgets are still present

#### Scenario: An unknown profile explains itself

- **WHEN** a wall is opened for a profile that has never been created
- **THEN** the panel renders an explanation with a route to the editor, not a
  blank surface

#### Scenario: Profiles are independent

- **WHEN** two profiles exist with different widgets
- **THEN** each renders only its own widgets

### Requirement: Widget Grid Layout

Each widget in a profile MUST be placed on a fixed-column grid, declaring its
position and its width and height in grid cells. The grid MUST reflow so a
profile renders usably in both portrait and landscape orientations without
requiring a separate profile per orientation.

Every widget MUST have sensible default dimensions, and a widget type MAY
declare minimum and maximum dimensions that the editor MUST respect so a
widget cannot be sized smaller than it can meaningfully render.

#### Scenario: Widgets are placed by cell and span

- **WHEN** a profile is rendered
- **THEN** each widget occupies the grid cells its configuration declares

#### Scenario: A profile reflows for orientation

- **WHEN** the same profile is viewed in portrait and then landscape
- **THEN** the layout adapts to the available space and every widget remains
  usable

#### Scenario: A widget cannot be under-sized

- **WHEN** a user attempts to size a widget below its type's declared minimum
- **THEN** the editor prevents the undersized placement

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

### Requirement: Widget Catalog

The system MUST provide at least the following widget types, each independently
configurable:

- a clock and date readout, derived from the client clock and requiring no
  server data
- current weather and, when the registered service provides it, a forecast
- instantaneous energy and consumption
- a room's devices as touch-operable tiles, including a room-wide command
- the user's favorited devices as tiles
- a single configured device as its own control
- a status and presence summary
- one or more scene buttons that trigger an automation

A widget whose backing feature is unconfigured — for example weather when no
weather service is registered — MUST report the feature as unconfigured within
its own area, and MUST NOT prevent the rest of the profile from rendering.

#### Scenario: A clock renders without server data

- **WHEN** a profile containing only a clock widget is opened with the engine
  unreachable
- **THEN** the clock renders the current time

#### Scenario: An unconfigured widget is contained

- **WHEN** a profile contains a weather widget and no weather service is
  registered
- **THEN** the weather widget reports the feature as unconfigured and every
  other widget in the profile renders normally

#### Scenario: A room widget commands the room

- **WHEN** a user activates a room widget's all-off action
- **THEN** every actuatable member of that room is commanded off through the
  room batch command

### Requirement: Touch Operation

The wall is operated by touch. Every interactive control a wall widget presents
MUST meet a minimum touch target size suitable for a wall-mounted panel, and
MUST be operable without a hover interaction.

State MUST NOT be conveyed by color alone, and any device control shown on a
wall MUST behave as it does elsewhere in the product: reflected immediately,
reconciled against reported state, and reverted with the failure surfaced when a
command fails.

#### Scenario: Controls are touch-sized

- **WHEN** a wall widget presents an interactive control
- **THEN** its touch target meets the wall's minimum size

#### Scenario: No interaction requires hover

- **WHEN** a wall is used on a touchscreen with no pointing device
- **THEN** every control, including any that reveals further options, is
  reachable without hovering

#### Scenario: A wall control reconciles like any other

- **WHEN** a device is toggled from a wall widget
- **THEN** the widget reflects the requested state immediately and reconciles
  against the device's reported state, reverting and surfacing the failure if
  the command fails

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

### Requirement: Scene Buttons Trigger Automations

A scene button MUST trigger an existing automation rather than introducing a
separate scene concept. The button's label MUST be configurable, and its trigger
MUST use the same manual-trigger path the admin interface uses.

#### Scenario: A scene button runs its automation

- **WHEN** a user activates a scene button bound to an automation
- **THEN** that automation is manually triggered

#### Scenario: A scene failure is surfaced

- **WHEN** a scene button's automation cannot be triggered
- **THEN** the failure is surfaced on the wall without taking down the profile

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

### Requirement: Profile Changes Reach Open Walls

When a profile is saved (created, updated, or deleted) from the editor, every
wall currently displaying that profile MUST reflect the change without a manual
reload.

#### Scenario: An open wall updates on save

- **WHEN** a profile is edited and saved while that profile is open on a wall
- **THEN** the wall re-renders the updated composition without a reload

#### Scenario: A deleted profile is explained on an open wall

- **WHEN** a profile open on a wall is deleted from the editor
- **THEN** the wall replaces the composition with an explanation rather than
  continuing to show a now-nonexistent profile

### Requirement: Always-On Operation

A wall is expected to run unattended for long periods. The wall MUST recover its
data connection after a network interruption without a reload, MUST re-read its
snapshot after reconnecting rather than assuming continuity, and MUST bound the
state it retains in memory so an always-on session does not grow without limit.

The wall's clock widget MUST continue to show the correct local time without
depending on a successful connection.

#### Scenario: A wall recovers from a network drop

- **WHEN** the network connection is interrupted and then restored
- **THEN** the wall resumes receiving updates and re-reads its snapshot, without
  a reload

#### Scenario: Memory is bounded over a long session

- **WHEN** a wall runs for an extended period receiving continuous events
- **THEN** the state it retains stays within a fixed bound rather than growing
  without limit

#### Scenario: The clock does not depend on the connection

- **WHEN** the engine becomes unreachable while a clock widget is displayed
- **THEN** the clock continues to show the correct local time
