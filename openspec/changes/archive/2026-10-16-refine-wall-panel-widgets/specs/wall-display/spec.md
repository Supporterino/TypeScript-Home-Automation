## MODIFIED Requirements

### Requirement: Widget Catalog

The system MUST provide at least the following widget types, each independently
configurable:

- a clock and date readout, derived from the client clock and requiring no
  server data
- current weather and, when the registered service provides it, a forecast
- instantaneous power and the home's recent energy usage over a rolling window
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

## ADDED Requirements

### Requirement: One-Row Scene Tile

A scene widget MUST be placeable at a minimum of one grid row. A scene placed at
one row MUST render without the frame's surface inset, so the whole cell is the
scene's touch target; a scene placed at two rows or more MUST render the framed
glyph-and-label tile. A one-row scene MUST remain within its cell and MUST NOT
present a control smaller than the wall's minimum touch target.

#### Scenario: A one-row scene is chrome-less

- **WHEN** a scene widget is placed at one row
- **THEN** it renders without the frame's surface inset and its whole cell is the
  scene's touch target, at or above the wall's minimum touch target

#### Scenario: A larger scene keeps the framed tile

- **WHEN** a scene widget is placed at two rows or more
- **THEN** it renders the framed glyph-and-label tile

#### Scenario: A one-row scene still triggers and does not overflow

- **WHEN** a user activates a one-row scene
- **THEN** its automation is triggered, its pressed and busy states are conveyed,
  and the tile does not overflow its cell

### Requirement: Temperature Widget Identifies Its Sensor

A temperature widget MUST identify the sensor it reads by the device's room name
where the device is assigned to a room, and by the device's shortened name
otherwise. The identifier MUST be presented on the widget's label, and the
widget MUST continue to present the sensor's readings as this catalog specifies.

#### Scenario: A room-assigned sensor is identified by its room

- **WHEN** a temperature widget's bound sensor is assigned to a room
- **THEN** the widget's label is that room's name

#### Scenario: An unassigned sensor is identified by its name

- **WHEN** a temperature widget's bound sensor is not assigned to any room
- **THEN** the widget's label is the device's shortened name

#### Scenario: Sensors in different rooms are distinguishable

- **WHEN** two temperature widgets are bound to sensors in different rooms whose
  device names are otherwise identical
- **THEN** their labels differ, each naming its own room

### Requirement: Energy Widget Presents Recent Usage

An energy widget MUST present the home's usage over the recent rolling window
alongside the instantaneous power, rather than the cumulative lifetime total.
The widget MUST label the usage with the span the retained samples actually
cover, so a partial window is presented as partial rather than as a full-window
figure, and MUST present the usage as absent only when nothing has been covered.

#### Scenario: A full window's usage is presented

- **WHEN** an energy widget is rendered and the retained samples cover the whole
  rolling window
- **THEN** the widget presents the usage, as a value with its unit, labelled with
  the window, alongside the instantaneous power

#### Scenario: A partial window is labelled as partial

- **WHEN** the retained samples cover only part of the rolling window
- **THEN** the widget presents the usage labelled with the span it actually
  covers, rather than as a full-window figure

#### Scenario: An uncovered window is absent, not zero

- **WHEN** nothing has been covered for the rolling window
- **THEN** the widget presents the usage as absent rather than as a zero

#### Scenario: The lifetime total is not presented

- **WHEN** an energy widget is rendered
- **THEN** it presents no cumulative lifetime consumption total

### Requirement: Device Card Actions Row Uses The Card Width

A typed device card's actions row MUST use the full width of the card. A row
composed solely of fixed-size controls MUST distribute those controls across the
width; a row that contains a flexible control MUST keep that control flexible and
MUST centre the fixed controls beside it, so no control is distorted. The ported
control height and corner radius MUST be unchanged.

#### Scenario: A fixed-control row is distributed

- **WHEN** a device card presents an actions row composed solely of fixed-size
  controls, such as a cover's transport
- **THEN** the controls are distributed across the full card width

#### Scenario: A flexible control is not distorted

- **WHEN** a device card presents an actions row containing a slider
- **THEN** the slider keeps its flexible width and the fixed controls beside it
  are centred, rather than the slider being stretched or the controls distorted

#### Scenario: The ported control treatment is preserved

- **WHEN** an actions row is distributed across the card width
- **THEN** each control keeps the ported control height and corner radius
