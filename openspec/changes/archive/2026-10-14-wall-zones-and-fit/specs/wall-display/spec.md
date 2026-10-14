# Spec Delta

## ADDED Requirements

### Requirement: Wall Zones

A wall widget MAY declare an optional zone label. The wall MUST group the widgets
that share a zone label into one zone: a labelled region drawn with the wall's
band surface. A widget that declares no zone label MUST render outside any zone.
Grouping MUST NOT change a widget's authored placement.

#### Scenario: A shared zone label forms one band

- **WHEN** a profile places widgets that share a zone label
- **THEN** those widgets render inside one band carrying the zone's label and the
  wall's band surface

#### Scenario: An unzoned widget renders outside a band

- **WHEN** a widget declares no zone label
- **THEN** it renders without a band

#### Scenario: A zone does not move its widgets

- **WHEN** widgets that share a zone label are rendered
- **THEN** each still occupies the grid cells its configuration declares

### Requirement: Span-Aware Card Presentation

A card MUST compose its content for its declared span in both directions: its
content MUST NOT overflow the cells it was placed in, and a card placed at a
larger span MUST NOT repeat the composition it renders at a smaller span. A
readout MUST NOT render its value separately from its unit.

#### Scenario: A card's content fits its span

- **WHEN** a card for a device that declares additional controls is placed at its
  type's minimum span
- **THEN** every control it presents stays within the card's cells and the card
  does not overflow

#### Scenario: A large span is composed

- **WHEN** a card is placed at a span larger than its type's minimum
- **THEN** its composition adapts to the space rather than repeating its
  minimum-span composition

#### Scenario: A value stays with its unit

- **WHEN** a readout's value and unit are rendered
- **THEN** they are not split onto separate lines

### Requirement: Wall Navigation

A wall profile MAY include a link widget that opens another named wall profile.
Activating a link MUST open the target profile's wall at its address. A wall
opened from a link MUST present an affordance to return to the wall it was opened
from. A link whose target profile does not exist MUST present the same
explanation an unknown profile presents, rather than a blank or broken surface.
Navigation MUST use the wall's minimum touch target and MUST NOT require a hover
interaction.

#### Scenario: A link opens its target wall

- **WHEN** a user activates a link widget
- **THEN** the named target profile's wall opens

#### Scenario: A wall reached from a link offers a way back

- **WHEN** a wall is open having been reached from a link
- **THEN** it presents an affordance that returns to the wall it was opened from

#### Scenario: A broken link is explained

- **WHEN** a link's target profile does not exist
- **THEN** the target wall presents the unknown-profile explanation rather than a
  blank surface

#### Scenario: Navigation is touch-operable

- **WHEN** a wall presents a link
- **THEN** its touch target meets the wall's minimum and it can be activated
  without hovering

### Requirement: Device Grid Widget

A wall MUST provide a device-grid widget whose device set the profile author
explicitly selects in the editor. It MUST render the selection as a uniform grid
of simple device tiles that actuate and report state as a wall device card does
elsewhere. When the selection cannot fit the widget's span at the wall's floors,
the widget MUST page it rather than overflow or scroll, and MUST present a page
affordance. It MUST meet the wall's touch target and not require hover.

#### Scenario: The selected devices are rendered

- **WHEN** a device grid widget is configured with a set of devices
- **THEN** it renders exactly those devices as a uniform grid of tiles

#### Scenario: A selection too large pages rather than scrolls

- **WHEN** a device grid's selection cannot fit its span at the floors
- **THEN** the grid pages the selection, presents a page affordance, and does not
  scroll

#### Scenario: Each tile behaves like a wall device

- **WHEN** a device grid tile is activated or its device changes
- **THEN** it actuates and reports state as a wall device card does elsewhere

#### Scenario: A device grid is touch-operable

- **WHEN** a device grid is shown on a wall
- **THEN** every tile and page control meets the wall's minimum touch target and
  is operable without hovering

### Requirement: Panel Fit

The wall MUST NOT scroll. It MUST resolve a composition to fit its panel, with
every control at or above the wall's minimum touch target and no wall body text
below the wall's body floor. An authored composition that cannot fit those floors
MUST render a contained explanation. A widget whose own content cannot fit the
span it was placed at MUST page its content rather than overflow or scroll, and
MUST present a page affordance.

#### Scenario: A composition fits the panel

- **WHEN** a profile's widgets fit the panel at the floors
- **THEN** the composition is rendered within the panel and the panel does not
  scroll

#### Scenario: An unfittable profile is explained

- **WHEN** an authored composition cannot fit the panel at the floors
- **THEN** the panel presents a contained explanation rather than a clipped or
  scrolling composition

#### Scenario: The floors hold

- **WHEN** any composition is resolved
- **THEN** every control meets the wall's minimum touch target and no wall body
  text falls below the wall's body floor

#### Scenario: A widget pages rather than scrolls

- **WHEN** a widget holds more content than its span can present at the floors
- **THEN** it pages the content and presents a page affordance, and the wall does
  not scroll

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
- a temperature reading from a configured sensor device
- a status and presence summary
- one or more scene buttons that trigger an automation
- a link that opens another named wall profile
- a device grid over an explicitly selected set of devices

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

### Requirement: Widget Grid Layout

Each widget in a profile MUST be placed on a fixed-column grid, declaring its
position and its width and height in grid cells, and MAY declare a zone label
(see "Wall Zones"). The grid MUST reflow so a profile renders usably in both
portrait and landscape orientations without requiring a separate profile per
orientation.

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

#### Scenario: A zone label does not change placement

- **WHEN** widgets that share a zone label are placed on the grid
- **THEN** each occupies the grid cells its configuration declares

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
controls — by their surface and by the container level they occupy. The wall's
type ramp MUST be owned by the wall, MUST declare a tier for a grouped readout
distinct from the hero and metric tiers, and MUST declare its own minimum body
size; no wall body text may render below that floor. The floor MUST be at least
16 px and is expected to exceed it for distance legibility. A readout's value
MUST NOT be rendered separately from its unit, and a name too long for its card
MUST be shortened rather than truncated to a prefix that several cards share.

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

#### Scenario: Grouped readouts do not compete with the hero

- **WHEN** a profile presents a hero readout and a group of readouts
- **THEN** the grouped readouts render on a tier below the hero tier

#### Scenario: A name is shortened, not truncated

- **WHEN** a device's name is longer than its card can show in full
- **THEN** the card presents a shortened form of the name, rather than a
  truncated prefix that does not distinguish it from another card

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
control the device cannot express. A light card MUST fit the type's declared
minimum span: where the controls' full form does not fit that span, the card MUST
use a compact form that still presents every control the device declares, rather
than dropping a control or overflowing the card.

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

#### Scenario: A light card fits its minimum span

- **WHEN** a light that declares brightness, colour-temperature, and colour is
  placed at its type's minimum span
- **THEN** its card presents every declared control within its cells and no
  control overflows the card

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

The editor MUST present the draft profile at the wall's target panel aspect
ratio, so a user sees the composition as the panel will render it, and MUST
report whether the draft fits the panel at the wall's floors and how many pages a
device grid widget in the draft would present. The editor MUST allow configuring
a link widget's target profile and a device grid widget's selected devices. The
editor MUST refuse to save a draft that cannot fit.

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

#### Scenario: The draft is presented at panel size

- **WHEN** a user is editing a profile
- **THEN** the draft is presented at the wall's target panel aspect ratio

#### Scenario: An unfittable draft is refused

- **WHEN** a draft cannot fit the panel at the wall's floors
- **THEN** the editor reports it and refuses to save the draft

#### Scenario: A link target is configured

- **WHEN** a user configures a link widget
- **THEN** the widget's target wall profile is set and saved

#### Scenario: A device grid's devices are selected

- **WHEN** a user configures a device grid widget
- **THEN** the devices it presents are the ones the user selected

#### Scenario: A device grid's pages are reported

- **WHEN** a device grid widget's selection cannot fit its span at the floors
- **THEN** the editor reports how many pages it would present
