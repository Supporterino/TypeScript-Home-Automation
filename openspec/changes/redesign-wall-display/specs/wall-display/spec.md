## MODIFIED Requirements

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
controls. The wall's type ramp MUST be owned by the wall and MUST declare its own
minimum body size; no wall body text may render below that floor. The floor MUST
be at least 16 px and is expected to exceed it for distance legibility.

A widget's title MUST be shown only when the profile explicitly configures one;
otherwise the widget's own content provides its labelling.

The wall MUST maintain a minimum gutter between widgets and from the panel edge.

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

#### Scenario: The ramp defines the body floor

- **WHEN** the wall's type ramp is read
- **THEN** it declares a minimum body size for wall text, and no wall body text
  renders below it

#### Scenario: Titles are opt-in

- **WHEN** a widget has no explicitly configured title
- **THEN** no title header is rendered and the widget's own content labels it

#### Scenario: A minimum gutter is kept

- **WHEN** a profile is rendered
- **THEN** adjacent widgets and the panel edge are separated by at least the
  wall's minimum gutter

### Requirement: Touch Operation

The wall is operated by touch. Every interactive control a wall widget presents
MUST meet a kiosk-class minimum touch target of at least 56 CSS pixels, and
adjacent controls MUST be separated by enough space that they are not easily
confused. Every control MUST be operable without a hover interaction.

State MUST NOT be conveyed by color alone, and any device control shown on a
wall MUST behave as it does elsewhere in the product: reflected immediately,
reconciled against reported state, and reverted with the failure surfaced when a
command fails.

#### Scenario: Controls are touch-sized

- **WHEN** a wall widget presents an interactive control
- **THEN** its touch target is at least 56 CSS pixels

#### Scenario: Adjacent controls are separated

- **WHEN** a wall widget presents two or more adjacent controls
- **THEN** they are separated by enough space that a touch intended for one does
  not plausibly activate its neighbour

#### Scenario: No interaction requires hover

- **WHEN** a wall is used on a touchscreen with no pointing device
- **THEN** every control, including any that reveals further options, is
  reachable without hovering

#### Scenario: A wall control reconciles like any other

- **WHEN** a device is toggled from a wall widget
- **THEN** the widget reflects the requested state immediately and reconciles
  against the device's reported state, reverting and surfacing the failure if
  the command fails

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
- a temperature reading from a configured sensor device
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

#### Scenario: A temperature widget shows its sensor's reading

- **WHEN** a profile contains a temperature widget bound to a configured sensor
  device
- **THEN** the device's temperature reading is presented on the widget

#### Scenario: An unknown temperature device is contained

- **WHEN** a temperature widget's configured device is not, or is no longer,
  available
- **THEN** the widget reports the device as unavailable within its own area and
  every other widget in the profile renders normally

### Requirement: Wall Device Presentation

A device shown on a wall MUST present its actuation and its state, and MUST NOT
present device-management affordances. On the wall, a device tile MUST NOT offer
a favorite toggle, a hide/unhide toggle, or an explicit open-detail affordance.

A wall device card MUST select its presentation from the device's ranked
capabilities rather than applying a single template to every device. At minimum
it MUST distinguish:

- a device whose primary action is a pure toggle (an on/off card presented as a
  single dominant action),
- a light that combines a toggle with one or more value controls (an on/off
  control and a brightness control coexisting, and — where the device declares
  them — a colour-temperature control and a colour control: a wall-only exception
  to the one-dominant-action rule),
- a device with no actuatable property (a read-only readout card), and
- a cover (presenting transport controls, per "Cover Transport Controls").

For a card whose primary action is a toggle and which presents no other control,
the whole card MUST be the actuation target. A card that presents a value control
MUST use that embedded control as the value's actuation target, since a bare tile
activation cannot express the value to set.

A light card MUST present its on/off control as a distinct affordance of its own
— for example its device-icon affordance — and, while the light is off, MUST
present its brightness control in an off state that turns the light on when
activated. A light card MUST present a colour-temperature or colour control only
when the device declares the corresponding capability, and MUST NOT present a
control the device cannot express.

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
- **THEN** its wall card presents an on/off control and a brightness control
  together, each independently operable

#### Scenario: A light card can be turned on from its affordances

- **WHEN** a light card is shown with its light off and the user activates either
  its on/off affordance or its brightness control
- **THEN** the light is commanded on and the card reflects the request
  immediately

#### Scenario: Colour controls appear only when supported

- **WHEN** a light declares a colour-temperature capability, a colour
  capability, or neither
- **THEN** its wall card presents a control for a declared capability only and
  presents no control for an undeclared one

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

A cover — a device whose primary action positions it, or which declares a
writable transport action — MUST present, on the wall, transport controls — open
(up), close (down), and stop — rather than a bare position slider, so the cover
is operable as a discrete, touch-friendly action. When the device declares a
transport action, open and close MUST use it rather than only the position
extremes.

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

#### Scenario: Open and close use the declared transport

- **WHEN** a cover declares a writable transport action
- **THEN** its open and close controls command the device's declared open and
  close values

#### Scenario: A position-less cover still gets transport

- **WHEN** a cover declares a writable transport action but no writable position
- **THEN** the wall presents transport controls for it rather than a generic
  control

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

## ADDED Requirements

### Requirement: Wall Visual Language

The wall MUST present its own visual language rather than inheriting the
dashboard's design system, and MUST define its own colour, typography, spacing,
radius, elevation, and motion tokens rather than aliasing another system's.

The wall MUST be dark-first: a true-black authoritative scheme that avoids
full-white surfaces, suited to an always-on, low-light panel, with a light scheme
designed for its own contrast rather than produced by inverting the dark one.

#### Scenario: Wall tokens are wall-owned

- **WHEN** the wall's tokens are read
- **THEN** they are declared for the wall rather than aliasing the dashboard's
  design-system tokens

#### Scenario: Both wall schemes are usable

- **WHEN** the wall is rendered in either its dark or its light scheme
- **THEN** text meets the applicable contrast ratio and every state is
  distinguishable without relying on colour alone

#### Scenario: The light wall scheme is designed

- **WHEN** the wall's light-scheme tokens are read
- **THEN** each value is declared for the light scheme explicitly, rather than
  computed by inverting the dark scheme

### Requirement: On-Demand Wall Stylesheet

The wall's stylesheet MUST be delivered as its own content-hashed asset, loaded
only with the wall surface and excluded from the dashboard's first-paint
transferred-size budget. Loading the dashboard MUST NOT fetch the wall's
stylesheet, and a changed wall stylesheet MUST be served under a new URL.

#### Scenario: The wall stylesheet is not in the dashboard's first paint

- **WHEN** the frontend is built
- **THEN** the wall's stylesheet is emitted as its own content-hashed asset and
  is not among the assets counted against the dashboard's first-paint budget

#### Scenario: Loading the dashboard does not fetch the wall stylesheet

- **WHEN** the dashboard is loaded without opening a wall
- **THEN** the wall's stylesheet is not fetched

#### Scenario: A changed wall stylesheet invalidates the cache

- **WHEN** the wall's stylesheet changes and a wall is opened again
- **THEN** the client requests the new content-addressed URL rather than a cached
  one
