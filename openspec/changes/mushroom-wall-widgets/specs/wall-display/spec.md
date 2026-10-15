## MODIFIED Requirements

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
- a temperature reading from a configured sensor device, together with that
  sensor's humidity reading where it declares one
- a status and presence summary
- one or more scene buttons that trigger an automation
- a link that opens another named wall profile
- a device grid over an explicitly selected set of devices
- a **typed device widget for each device class the capability model can drive**:
  a light, a cover, a fan, a climate, a lock, a numeric control, an enumerated
  control, and a name-and-state entity card for a device of no class

A device widget MUST be bound to a single device, and its type MUST determine the
card it presents rather than a single card serving every device. A widget MUST NOT
be offered for a device class the bound device's capabilities cannot drive; a
widget whose bound device cannot drive its class MUST report that inside its own
area.

A readout widget MUST present the readings its configured device declares, and
MUST present a reading the device does not declare as absent rather than as an
empty line or a placeholder: a temperature widget bound to a sensor that declares
a humidity reading presents both, and one bound to a sensor that declares only a
temperature presents only the temperature. Presenting a reading the bound device
already declares MUST NOT require a second device or a per-profile setting.

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

#### Scenario: A temperature widget shows its sensor's humidity

- **WHEN** a temperature widget's bound sensor declares both a temperature
  reading and a humidity reading
- **THEN** both readings are presented on the widget, the humidity as its
  secondary reading, each value with its own unit

#### Scenario: A sensor without humidity shows only its temperature

- **WHEN** a temperature widget's bound sensor declares a temperature reading and
  no humidity reading
- **THEN** only the temperature is presented, and no empty line or placeholder
  stands where a humidity reading would be

#### Scenario: An unknown temperature device is contained

- **WHEN** a temperature widget's configured device is not, or is no longer,
  available
- **THEN** the widget reports the device as unavailable within its own area and
  every other widget in the profile renders normally

#### Scenario: A device class has its own widget type

- **WHEN** a catalog is read
- **THEN** it offers a distinct widget type per device class the capability model
  can drive, each bound to a single device, rather than one type for any device

#### Scenario: A card is selected by the device's class

- **WHEN** two widgets of different device classes are placed
- **THEN** each presents the card of its own class

#### Scenario: A class the device cannot drive is explained

- **WHEN** a device widget's bound device declares no capability its class can
  drive
- **THEN** the widget reports that inside its own area rather than presenting an
  inert card

### Requirement: Wall Glanceability

A wall MUST be composed so it is legible at a glance from across a room, and its
card sizes MUST reflect each widget's declared span rather than the panel
height.

A widget's rendered height MUST be derived from its grid span and a bounded row
unit, so that a widget occupying a small span is not inflated to fill the panel.
That row unit MUST be derived from the smallest device card the ported card system
produces, so that a card at a widget type's minimum span fits its cell with nothing
to spare; a profile whose widgets occupy fewer rows than fill the panel MUST
occupy its natural height, centered, rather than stretching every card to fill the
panel.

The wall MUST apply a type scale sized for the card system it ports. The wall's
type ramp MUST be owned by the wall, MUST declare a tier for a grouped readout
distinct from the hero and metric tiers, and MUST declare its own minimum body
size; no wall body text may render below that floor. The floor MUST be the ported
card system's secondary text size, and the wall MUST NOT declare a size below it.
The ramp's readout tiers MUST remain above the dashboard's body scale, so a
readout's value keeps the wall's own distance scale rather than being drawn at the
ported card's text sizes; a widget's supporting text — its label, its captions and
its secondary figures — MUST be drawn at the ported primary and secondary sizes. A
readout's value MUST NOT be rendered separately from its unit, and a name too long
for its card MUST be shortened rather than truncated to a prefix that several
cards share.

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
- **THEN** it declares a minimum body size equal to the ported card system's
  secondary text size, and no wall body text renders below it

#### Scenario: A readout's value is not shrunk to the card's type sizes

- **WHEN** a widget presents a readout
- **THEN** its value is drawn on the wall's own readout tier, above the ported
  card's primary and secondary text sizes

#### Scenario: Supporting text is drawn at the ported sizes

- **WHEN** a widget presents a label, a caption, or a secondary figure
- **THEN** it is drawn at the ported card system's primary or secondary size

#### Scenario: The row unit holds the smallest card

- **WHEN** the wall's row unit is read
- **THEN** it is derived from the smallest card the ported card system produces,
  so a minimum-span device card fits its cell without overflowing

#### Scenario: Titles are opt-in

- **WHEN** a widget has no explicitly configured title
- **THEN** no title header is rendered and the widget's own content labels it

#### Scenario: A minimum gutter is kept

- **WHEN** a profile is rendered
- **THEN** adjacent widgets and the panel edge are separated by at least the
  wall's minimum gutter

#### Scenario: Grouped readouts do not compete with the hero

- **WHEN** a profile presents a hero readout and a group of readouts
- **THEN** the grouped readouts render on a tier below the hero tier

#### Scenario: A name is shortened, not truncated

- **WHEN** a device's name is longer than its card can show in full
- **THEN** the card presents a shortened form of the name, rather than a
  truncated prefix that does not distinguish it from another card

### Requirement: Touch Operation

The wall is operated by touch. Every interactive control a wall widget presents
MUST meet a minimum touch target of at least 42 CSS pixels — the control height of
the card system the wall ports — and MUST be drawn with that system's own control
treatment, its control height and corner radius, so a wall control and a card's
control cannot differ. Adjacent controls MUST be spaced by at least the ported
card system's control spacing, so they are not easily confused. Every control MUST
be operable without a hover interaction.

State MUST NOT be conveyed by color alone, and any device control shown on a
wall MUST behave as it does elsewhere in the product: reflected immediately,
reconciled against reported state, and reverted with the failure surfaced when a
command fails.

#### Scenario: Controls are touch-sized

- **WHEN** a wall widget presents an interactive control
- **THEN** its touch target is at least 42 CSS pixels

#### Scenario: A control is the ported control

- **WHEN** a wall widget presents an interactive control
- **THEN** its height and corner radius are the ported card system's control
  height and radius, rather than a treatment the widget declares for itself

#### Scenario: Adjacent controls are separated

- **WHEN** a wall widget presents two or more adjacent controls
- **THEN** they are separated by at least the ported card system's control
  spacing, so a touch intended for one does not plausibly activate its neighbour

#### Scenario: No interaction requires hover

- **WHEN** a wall is used on a touchscreen with no pointing device
- **THEN** every control, including any that reveals further options, is
  reachable without hovering

#### Scenario: A wall control reconciles like any other

- **WHEN** a device is toggled from a wall widget
- **THEN** the widget reflects the requested state immediately and reconciles
  against the device's reported state, reverting and surfacing the failure if
  the command fails

### Requirement: Wall Visual Language

The wall MUST present its own visual language rather than inheriting the
dashboard's design system, and MUST define its own colour, typography, spacing,
radius, elevation, and motion tokens rather than aliasing another system's.

Every wall widget MUST be composed from the wall's single card vocabulary — the
card system the wall ports, its anatomy and its token table — rather than from a
vocabulary of its own. That vocabulary MUST present:

- a leading circular icon affordance, a glyph on a tinted shape of the ported
  icon size, wherever a widget leads with a glyph;
- a primary line over a secondary line at the ported primary and secondary type,
  rather than a per-widget treatment;
- the ported card surface — its radius and its padding — wherever a widget draws
  a surface, so a widget's surface and a device card's are the same surface; and
- the ported control treatment for every control it presents.

A readout MAY render its value on the wall's own readout tiers, provided those
tiers stay above the ported type sizes. The wall MUST NOT carry a second card
vocabulary: no widget MAY declare its own icon, surface, control, or supporting
type treatment, and a value drawn from the ported table MUST be declared once as a
wall token with the system it is ported from recorded rather than restated per
widget.

The wall MUST be dark-first: a true-black authoritative scheme that avoids
full-white surfaces, suited to an always-on, low-light panel, with a light scheme
designed for its own contrast rather than produced by inverting the dark one.

The wall MUST NOT apply a device's own colour as a surface or a field. A device
card MAY carry that colour on the affordance that sets it — the icon shape and the
control that drives the value — using the ported card system's own contrast
improvement so the colour stays legible, and MUST fall back to the wall's own
accent when the device reports none. A device's colour MUST NOT be the sole
channel conveying any state.

#### Scenario: Wall tokens are wall-owned

- **WHEN** the wall's tokens are read
- **THEN** they are declared for the wall rather than aliasing the dashboard's
  design-system tokens

#### Scenario: Every widget is composed from the ported anatomy

- **WHEN** a wall renders a clock, a weather readout, an energy readout, a status
  summary, a temperature readout, a scene control and a link affordance
- **THEN** each presents the ported leading icon affordance and the ported primary
  and secondary type, rather than a treatment of its own

#### Scenario: The wall carries one card vocabulary

- **WHEN** the wall's widgets are read
- **THEN** every one draws its icon shape, its surface and its controls from the
  ported table, and no widget draws a second treatment for any of them

#### Scenario: A widget's surface is a card's surface

- **WHEN** a control widget and a device card are rendered on one panel
- **THEN** their surfaces share the ported card radius and padding

#### Scenario: Both wall schemes are usable

- **WHEN** the wall is rendered in either its dark or its light scheme
- **THEN** text meets the applicable contrast ratio and every state is
  distinguishable without relying on colour alone

#### Scenario: The light wall scheme is designed

- **WHEN** the wall's light-scheme tokens are read
- **THEN** each value is declared for the light scheme explicitly, rather than
  computed by inverting the dark scheme

#### Scenario: A ported token table is declared once

- **WHEN** a widget draws a value from the ported card system
- **THEN** that value is declared once as a wall token with the ported system
  recorded, rather than written into each widget

#### Scenario: A device colour is an accent, not a surface

- **WHEN** a wall control carries the colour reported by the device it controls
- **THEN** that colour appears on the control's own affordance and never as a card
  or panel surface

#### Scenario: A device without a colour falls back to the wall's accent

- **WHEN** a device reports no colour and no colour temperature
- **THEN** its control is presented with the wall's own accent
