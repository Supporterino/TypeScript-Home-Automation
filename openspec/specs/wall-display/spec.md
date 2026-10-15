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

### Requirement: Wall Profile Version and Migration

A wall profile MUST carry a version, and a stored profile of an older version MUST
be migrated rather than rejected, so a wall that has been authored and saved
survives a change to the profile contract.

Migration MUST preserve each widget's placement, its size, and its zone label, and
MUST preserve the devices the profile references: a widget that named a single
device MUST become the typed widget for that device, and a widget that named a set
of devices MUST keep that set. A stored profile that cannot be migrated MUST be
reported rather than silently dropped, and MUST NOT prevent the wall's other
profiles from loading.

#### Scenario: A stored profile is migrated

- **WHEN** a profile stored at an older version is loaded
- **THEN** its widgets are migrated to the current version and the wall at its
  address renders the profile

#### Scenario: A migrated widget keeps its placement

- **WHEN** a widget that named a single device is migrated
- **THEN** its position, size and zone label are unchanged and it binds the same
  device

#### Scenario: A migrated grid keeps its selection

- **WHEN** a widget that named a set of devices is migrated
- **THEN** the devices it presents are unchanged

#### Scenario: A profile that cannot be migrated is reported

- **WHEN** a stored profile cannot be migrated
- **THEN** it is reported rather than silently dropped, and the wall's other
  profiles still load

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

### Requirement: Span-Aware Card Presentation

A card MUST compose its content for the box it is given, in both directions: its
content MUST NOT overflow that box, and a card given more room MUST NOT repeat the
composition it renders when it has less. The composition a card resolves MUST be a
function of that box and the card's own configuration alone, so the same box
composes identically wherever the card is drawn and nothing is measured at render
time. A readout MUST NOT render its value separately from its unit.

A card MUST resolve a distinct composition wherever the box admits one: a
composition for the smallest box its type permits, a composition for a box that
cannot hold its fullest content, and a composition that presents its full content
once the box can hold it. A card given a box between two of its compositions MUST
present the composition that box holds, rather than one that overflows it or a
smaller one inflated to fill it.

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

#### Scenario: The composition follows the box

- **WHEN** the same card is given a box of the same width and height in two
  different widgets
- **THEN** it presents the same composition in both

#### Scenario: A taller box is composed, not inflated

- **WHEN** a card is given a box tall enough for a composition richer than the one
  its smallest box presents
- **THEN** it presents that richer composition rather than enlarging the smaller
  one into the space

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
explicitly selects in the editor. It MUST render the selection as a uniform grid of
the typed device cards, one per selected device, which actuate and report state as
a device card does elsewhere on the wall. When the selection cannot fit the
widget's span at the wall's floors, the widget MUST page it rather than overflow or
scroll, and MUST present a page affordance. It MUST meet the wall's touch target
and not require hover.

#### Scenario: The selected devices are rendered

- **WHEN** a device grid widget is configured with a set of devices
- **THEN** it renders exactly those devices as a uniform grid of tiles, each
  presenting the card of its own device class

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

### Requirement: Wall Device Presentation

A device shown on a wall MUST present its actuation and its state, and MUST NOT
present device-management affordances. On the wall, a device card MUST NOT offer a
favorite toggle, a hide/unhide toggle, or an explicit open-detail affordance.

A wall device card MUST be composed from the anatomy of the device card system the
wall ports, rather than by dispatching one template across every device class. Its
anatomy MUST present, in this order:

- a leading icon affordance: a circular icon on a filled shape of the device's own
  colour where the device reports one, and on the wall's own surface where it does
  not, whose glyph states the device's on/off state by its fill as well as by
  colour,
- the device's name and, beneath it, its state or its primary reading, and
- where the device has controls, one actions row carrying the active control and
  the affordances for the device's other controls.

For a card whose whole surface is the actuation target — a device whose primary
action is a pure toggle — activating the card MUST actuate it. A card that
presents a value control MUST use that embedded control as the value's actuation
target, since a bare card activation cannot express the value to set. A control
the device cannot express MUST NOT be presented, and a card MUST NOT present a
control whose class the device's capabilities cannot drive.

A device card MUST carry the card options the ported system offers that have
meaning on a wall: a layout (default, vertical, or horizontal) and whether its
controls are hidden while the device is inactive. While its controls are hidden,
the card MUST keep the composition of its non-control content rather than
reflowing into a different card.

A device card MUST resolve its composition from the box it is given. A device with
no actuatable property MUST render as a read-only card whose reading is its
dominant content, without presenting a navigation affordance.

A wall device card MUST encode state by more than color alone and MUST still
distinguish a push-backed observation, a polled observation, and an unreachable
device. The observation state MUST be presented as a non-textual indicator, so
that connectivity state does not compete with the card's control or readout;
unreachable MAY additionally be marked. Every wall control MUST actuate as device
actuation behaves elsewhere: reflected immediately, reconciled against reported
state, and reverted with the failure surfaced when the command fails.

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

- **WHEN** a device declares both an on/off capability and one or more value
  capabilities
- **THEN** its card presents an on/off affordance and a control for each declared
  value, each independently operable

#### Scenario: A light card can be turned on from its affordances

- **WHEN** a card is shown with its device off and the user activates either its
  icon affordance or a value control
- **THEN** the device is commanded on and the card reflects the request
  immediately

#### Scenario: Colour controls appear only when supported

- **WHEN** a device declares a colour-temperature capability, a colour
  capability, or neither
- **THEN** its card presents an affordance for a declared capability only and
  presents no control for an undeclared one

#### Scenario: A card presents the ported anatomy

- **WHEN** any device card is shown on a wall
- **THEN** it presents a leading icon affordance, the device's name with its state
  or primary reading beneath it, and — where the device has controls — one actions
  row

#### Scenario: A light card fits its minimum span

- **WHEN** a device card is placed at its type's minimum span
- **THEN** every control it presents stays within its cells and no control
  overflows the card

#### Scenario: A control's layout is configured

- **WHEN** a device card is configured with a layout or with its controls hidden
  while inactive
- **THEN** it composes that layout, and hides its controls only while the device
  is inactive

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

### Requirement: Paged Tile Sizing

A wall widget that presents its content as a grid of tiles MUST size each tile row
from the tile's own cell — the tile's span multiplied by the wall's resolved row
unit, plus the gutter it spans — and MUST NOT inflate a tile row beyond a bounded
multiple of that cell to fill the widget's height. The bound MUST be no more than
one and a quarter times the tile's cell. A widget whose tiles do not fill its
height MUST centre the space left over rather than stretching its tiles into it,
so a tile renders at a predictable size on every panel instead of at whatever
height the widget's leftover space happens to provide.

The bound MUST be declared once and shared by every paging widget — the device
grid, a room's tiles, and the favorites grid — and the rows the wall draws MUST be
the rows the page plan resolved, so a page the plan reports is the page the wall
presents and the editor's page count agrees with it.

A tile row MUST still be at least the tile's own cell, so no row the plan promises
can clip its tile, and a widget MUST still page its content rather than overflow
or scroll.

#### Scenario: A tile is not inflated to fill its widget

- **WHEN** a paging widget's tiles occupy fewer rows than its height provides
- **THEN** each tile row is at most the bounded multiple of the tile's cell and the
  widget centres the space left over rather than stretching a tile into it

#### Scenario: The bound is shared by every paging widget

- **WHEN** the device grid, a room's tile grid, and the favorites grid page their
  content on the same panel
- **THEN** each sizes its tile rows by the same bound

#### Scenario: A promised row still holds its tile

- **WHEN** a widget's page plan promises a row for a tile
- **THEN** the row is at least the tile's own cell and the tile is not clipped

#### Scenario: The drawn rows are the planned rows

- **WHEN** a widget's content pages
- **THEN** the page is drawn at the height the plan resolved, rather than being
  stretched to the widget's height

### Requirement: Wall Configuration Editor

Wall profiles MUST be created, renamed, deleted, and configured from the admin
interface on a non-wall device. The editor MUST allow a user to add a widget of
any supported type, configure it, and place and size it on the grid, and MUST
allow the widget order and placement to be changed without a drag interaction.

The wall surface itself MUST be read-only: it MUST NOT expose editing controls.
Saving a profile MUST validate the configuration, and an invalid configuration
MUST be rejected rather than persisted. The configuration MUST carry a version, and
a profile written by the editor MUST be written at the current version.

The editor MUST present the profile's widgets in a dense, multi-column layout on
wide viewports — one column on narrow viewports and two or more on wide ones —
so a profile with many widgets remains scannable without excessive scrolling.
Each widget MUST remain a self-contained, labelled group carrying its placement
controls and its type-specific configuration, and a smaller viewport MUST NOT be
made to scroll horizontally.

The editor MUST present the draft profile at the wall's target panel aspect
ratio, so a user sees the composition as the panel will render it, and MUST
report whether the draft fits the panel at the wall's floors and how many pages a
device grid widget in the draft would present. The editor MUST refuse to save a
draft that cannot fit.

For each widget it MUST allow the configuration that widget's type supports: a
link widget's target profile, a device grid widget's selected devices, and — for a
typed device widget — the device it is bound to, together with that card's layout
and whether its controls are hidden while the device is inactive. The editor MUST
NOT offer a device for a widget whose class that device's capabilities cannot
drive.

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

#### Scenario: A saved profile carries the current version

- **WHEN** the editor saves a profile
- **THEN** it is written at the current profile version

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

#### Scenario: A typed device widget is configured

- **WHEN** a user configures a typed device widget
- **THEN** the widget binds the device the user selected and carries the card's
  layout and its inactive-controls setting

#### Scenario: A device its class cannot drive is not offered

- **WHEN** a user configures a widget of a device class
- **THEN** the devices offered are the ones whose capabilities can drive that
  class

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
