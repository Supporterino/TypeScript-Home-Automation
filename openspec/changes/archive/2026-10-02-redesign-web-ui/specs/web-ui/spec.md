## ADDED Requirements

### Requirement: Visual Design System

The dashboard MUST present a single designed visual system rather than
component-library defaults. The system MUST define, centrally and without
per-view hard-coded values, a color palette, typography scale, spacing rhythm,
elevation, corner radii, and motion durations.

The system MUST provide a dark scheme and a light scheme. The dark scheme is
authoritative and the light scheme MUST be designed for contrast in its own
right, not produced by mechanically inverting the dark one.

State MUST NOT be conveyed by color alone: an on/off or reachable/unreachable
condition MUST be distinguishable by at least one non-color channel such as an
icon, label, or shape, so the interface remains usable to a user who cannot
distinguish the hues.

Elevation and translucency MUST be applied sparingly enough that text contrast
and rendering performance are preserved with many device tiles on screen;
text on any surface MUST maintain at least the WCAG AA contrast ratio for its
size in both schemes.

Motion MUST be limited to non-essential transitions, MUST NOT shift layout
bounds of surrounding content, and MUST be suppressed when the user requests
reduced motion.

#### Scenario: Both schemes are usable

- **WHEN** the dashboard is rendered in either the dark or the light scheme
- **THEN** text meets the applicable contrast ratio and every state is
  distinguishable without relying on color alone

#### Scenario: Reduced motion is respected

- **WHEN** the user's system requests reduced motion
- **THEN** non-essential transitions are not played and content appears in its
  final state

#### Scenario: Tokens are the single source

- **WHEN** a view needs a color, spacing, or radius
- **THEN** it consumes a design-system token rather than a literal value

### Requirement: Overview Landing

The dashboard's landing view MUST be a control surface that summarizes the
home before listing it. It MUST present, at minimum:

- counts or indicators for devices that are on, unreachable, and stale
- the user's favorites, when any are set
- the rooms as navigable zones, each with its devices or a route into them

The summary MUST be derived from live device state so that it updates without a
manual refresh as the event stream delivers changes.

An empty home MUST be explained rather than shown as a set of empty zones.

#### Scenario: The overview reflects live state

- **WHEN** a device is turned on while the overview is open
- **THEN** the summary's on-count changes without a manual refresh

#### Scenario: Favorites are prominent when set

- **WHEN** the user has favorited devices
- **THEN** those devices are presented on the overview for direct control

#### Scenario: An empty home is explained

- **WHEN** no devices are known
- **THEN** the overview explains that devices appear once a source reports them,
  rather than presenting empty zones

### Requirement: Room-Level Command

A room view MUST offer an action that commands every member capable of it to a
requested state, in particular to turn all actuatable members on or off.

A room command MUST be issued as a single request to the engine rather than one
request per member, and MUST report which members were actuated and which were
skipped because they do not support the command.

Because the underlying transports do not guarantee atomic execution, the
interface MUST reflect the requested change optimistically and reconcile each
member against its reported state, reverting any member whose command fails and
surfacing the failure.

#### Scenario: All-off turns off the room's actuators

- **WHEN** a user requests all-off for a room containing several lights
- **THEN** a single request is sent, every actuatable member is commanded off,
  and members that only report are skipped

#### Scenario: A member failure is surfaced and reverted

- **WHEN** one member of a room command fails
- **THEN** that member reverts to its reported state and the failure is
  surfaced, while the other members remain commanded

#### Scenario: Non-actuatable members are identified as skipped

- **WHEN** a room contains sensors that cannot be turned off
- **THEN** the room command reports them as skipped rather than failing the
  whole command

### Requirement: Favorites

The dashboard MUST let a user mark a device as a favorite and remove that mark,
from the device's own presentation, without knowing its identifier.

Favorites MUST be persisted so they survive a reload and are reflected in every
connected dashboard, and MUST be stored as ordinary state rather than as a
device change.

#### Scenario: A favorite persists

- **WHEN** a user favorites a device and reloads the dashboard
- **THEN** the device is still a favorite

#### Scenario: Favorites are reflected across clients

- **WHEN** a device is favorited from one browser
- **THEN** another open dashboard reflects the change without a manual refresh

### Requirement: Device Tile Presentation

Where devices are presented as a tile, the tile MUST convey the device's state
and its available action unambiguously:

- the primary action or readout MUST be visually dominant
- the device's state MUST be encoded by more than color alone
- an explicit affordance MUST indicate that the tile opens the device's detail
  view, so that opening the detail is not a hidden behavior of clicking the
  tile's empty area
- a control embedded in the tile MUST NOT be mistaken for the tile's
  open-detail action

A read-only tile MUST remain fully activatable to open the detail view. A tile
MUST distinguish a push-backed observation, a polled observation with the age of
its last observation, and an unreachable device, as required of device
presentation elsewhere.

#### Scenario: The open-detail affordance is explicit

- **WHEN** a user looks at a device tile
- **THEN** an affordance indicates the tile opens the device's detail view, and
  activating the tile's embedded control does not open it

#### Scenario: A read-only tile still opens detail

- **WHEN** a sensor tile with no actuatable property is activated
- **THEN** its detail view opens

#### Scenario: State is not color-only

- **WHEN** a device is shown as on or off
- **THEN** the state is conveyed by at least one non-color channel in addition
  to any color

### Requirement: Energy View

The dashboard MUST provide an energy view presenting the home's instantaneous
power, cumulative consumption, and per-device breakdown, and a recent trend when
history is enabled.

The view MUST update from the event stream and the energy endpoint without a
manual refresh, and MUST report a degraded transport in the same way as every
other view. It MUST remain useful when history is disabled or when no device
meters energy.

#### Scenario: Instantaneous power is shown live

- **WHEN** a reporting device's power changes while the energy view is open
- **THEN** the displayed total updates without a manual refresh

#### Scenario: History-disabled deployment is still useful

- **WHEN** history is disabled
- **THEN** the view shows current totals and per-device breakdown without a
  trend, and without an error

### Requirement: Weather View

The dashboard MUST provide a weather view reporting current conditions and, when
the registered service provides it, a forecast.

Where no weather service is configured, the view MUST report the feature as
unconfigured rather than presenting an error or an empty forecast.

#### Scenario: Weather is shown when configured

- **WHEN** a weather service is registered and its view is opened
- **THEN** current conditions are shown, and a forecast if the service provides
  one

#### Scenario: Unconfigured weather is explained

- **WHEN** no weather service is registered and its view is opened
- **THEN** the view reports the feature as unconfigured

### Requirement: Self-Hosted Typography

The dashboard's display typeface MUST be served from the application's own
content-addressed assets, not fetched from a third-party origin, so the
dashboard renders correctly on a network without internet access.

The typeface MUST be delivered as part of the same content-addressed, cached,
pre-compressed asset pipeline as the scripts and stylesheets, and the bytes it
contributes to first paint MUST be counted against the first-paint budget.

#### Scenario: No third-party font request

- **WHEN** the dashboard loads on a network with no internet access
- **THEN** its typeface loads and the dashboard is fully styled

#### Scenario: The font counts against the budget

- **WHEN** the frontend is built
- **THEN** the typeface's transferred bytes are included in the first-paint
  budget assertion

## MODIFIED Requirements

### Requirement: Navigation and Information Architecture

The dashboard MUST organise its views into two groups by audience: a control
group covering rooms and devices, and an operator group covering automations,
state, logs, and HomeKit status. Navigation MUST present that grouping.

A user's favorites MUST be presented as a navigable group, distinct from the
rooms, when any favorites are set.

The dashboard MUST support drilling from a collection to an individual item. At
minimum it MUST provide a device list with a device detail view, and an
automation list with an automation detail view.

The landing view MUST be an overview control surface. Engine readiness MUST
remain visible as a status indicator but MUST NOT be the landing view.

Rooms MUST appear as navigable entries within the control group, alongside an
entry for devices belonging to no room and an entry listing all devices.

Every view reachable by navigation MUST have a URL that can be shared and
reloaded, and browser history navigation MUST move between views correctly.
Navigation MUST indicate the active view, including while viewing an item that
belongs to a navigable collection.

#### Scenario: Landing view is a control surface

- **WHEN** a user opens the dashboard at its base path
- **THEN** an overview control surface is shown, not engine status and not a raw
  list of every device

#### Scenario: Rooms are navigable entries

- **WHEN** rooms are defined
- **THEN** each appears as a navigation entry within the control group

#### Scenario: Favorites are a navigable group

- **WHEN** the user has favorited devices
- **THEN** the favorites appear as a navigation group distinct from the rooms

#### Scenario: Device detail is deep-linkable

- **WHEN** a user opens a device's detail view and reloads the page
- **THEN** the same device's detail view is shown

#### Scenario: Active view is indicated within a collection

- **WHEN** a user opens an item within a navigable collection
- **THEN** the collection's navigation entry is indicated as active

#### Scenario: Back navigation returns to the list

- **WHEN** a user navigates from a list into a detail view and presses back
- **THEN** the list view is restored
