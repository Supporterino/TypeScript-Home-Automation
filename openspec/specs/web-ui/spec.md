# Web UI

## Purpose

A React + Mantine web dashboard served by the engine's HTTP server. Provides a browser-based UI for monitoring automations, devices, state, logs, and HomeKit status. Compiles to static JS/CSS strings embedded in the package.

## Requirements

### Requirement: Enabling

The web UI MUST be enabled via `WEB_UI_ENABLED=true`. When disabled, no UI routes are mounted and the web UI source is never imported.

### Requirement: URL Path

The web UI MUST be served at the configured path (default: `/status`). The path MUST start with `/`.

### Requirement: Authentication

The system MUST handle authentication for the web UI:

- **No token configured** (`HTTP_TOKEN=""`): Direct access to the dashboard without login
- **Token configured**: Redirect to login page; verify via session cookie (`session=<token>`) or `Authorization: Bearer <token>` header
- The auth check MUST be inline in the route handler (not via `app.use()`) to avoid matching health probes and other routes

### Requirement: Routes

The system MUST serve these web UI routes:

| Route | Description |
|-------|-------------|
| `GET {path}` | Dashboard HTML shell (auth-protected when token is set) |
| `GET {path}/<ui-segment>` and `GET {path}/<ui-segment>/*` | Dashboard HTML shell for each registered application view segment |
| `GET {path}/login` | Login page (redirects to dashboard if already authenticated) |
| `POST {path}/login` | Login form submission — validates token, sets session cookie |
| `GET {path}/logout` | Clears session cookie, redirects to login |
| `GET {path}/assets/*` | Compiled JS and CSS bundles, addressed by content hash |
| `GET {path}/icon.svg` | PWA icon (SVG, served with `image/svg+xml`) |
| `GET {path}/apple-touch-icon.svg` | Apple touch icon |
| `GET {path}/manifest.json` | PWA manifest (`application/manifest+json`) |

Application view segments MUST be registered explicitly, one route per known
top-level view. The system MUST NOT register a catch-all route beneath the UI
path. This constraint exists because the UI path is configurable and may be set
to `/`, where a catch-all would shadow health probes, webhooks, and the API.

A request beneath the UI path that matches no registered route MUST NOT be
served the dashboard shell.

#### Scenario: Deep link serves the shell

- **WHEN** a request arrives for a registered view segment such as a device
  detail path
- **THEN** the dashboard shell is served and the client renders that view

#### Scenario: Root mount does not shadow health probes

- **WHEN** the web UI is mounted at `/` and a request arrives for `/healthz`
- **THEN** the health probe responds normally and the dashboard shell is not
  served

#### Scenario: Root mount does not shadow webhooks

- **WHEN** the web UI is mounted at `/` and a request arrives for a registered
  webhook path
- **THEN** the webhook handler responds and the dashboard shell is not served

#### Scenario: Unknown sub-path is not the shell

- **WHEN** a request arrives beneath the UI path for a segment that is not a
  registered view
- **THEN** the response is a not-found, not the dashboard shell

### Requirement: Dashboard Shell

The `htmlShell()` function MUST render a complete HTML page that:
- References the compiled JS bundle by its content-addressed URL
- References the compiled CSS by its content-addressed URL
- Configures the app with `basePath`, `hasAuth`, and `token`

The shell MUST NOT inline the compiled bundles into the document. Bundle content
MUST be delivered from the asset routes so that it is cacheable across requests
and across views.

#### Scenario: Shell references rather than inlines the bundle

- **WHEN** the dashboard shell is requested
- **THEN** the response references the JS and CSS by URL and does not contain the
  bundle contents

#### Scenario: Shell is small

- **WHEN** the dashboard shell is requested
- **THEN** its size is independent of the size of the compiled application

### Requirement: Login Shell

The `loginShell()` function MUST render a login page with:
- A password/token input field
- An error message display (when login fails with invalid token)
- Submits via POST to `{path}/login`

### Requirement: PWA Support

The web UI MUST function as a Progressive Web App:
- `manifest.json` with app name, icons, theme colors, display mode
- SVG icon (512x512) served as both `icon.svg` and `apple-touch-icon.svg`
- Standalone display mode
- Dark theme (`background_color: #1a1b1e`, `theme_color: #228be6`)

### Requirement: Build Process

The web UI source (`src/core/web-ui/app/`) is a separate React + Mantine project:
- Built via `bun run build:web-ui`
- Produces content-hashed JS and CSS assets embedded in the package as generated
  modules, so the package ships without a separate static asset directory
- Produces more than one JS asset where the application is split, so that
  features not required for first paint are not loaded on first paint
- Produces a compressed representation of each asset alongside the uncompressed
  one, so that compression is a build product rather than a per-request cost
- Fails when the assets required for a first paint exceed the transferred-size
  budget
- These generated files are git-ignored
- The build runs automatically as a `prebuild` hook
- A development workflow MUST exist that applies frontend source changes without
  requiring a full rebuild and engine restart

#### Scenario: Assets are content-addressed

- **WHEN** the frontend is built
- **THEN** each emitted asset's URL incorporates a hash of its contents, so a
  changed build produces a different URL

#### Scenario: Package needs no static directory

- **WHEN** the built package is installed as a dependency
- **THEN** the web UI serves its assets without requiring any file outside the
  installed module

#### Scenario: Frontend iteration does not require a restart

- **WHEN** a developer edits frontend source in the development workflow
- **THEN** the change is observable in the browser without rebuilding and
  restarting the engine

### Requirement: Technology Stack

The web UI MUST be built on the following stack:

- **Framework**: React
- **UI Library**: Mantine
- **Router**: Client-side routing over real URL paths, matched against the
  server's registered view segments
- **Build**: Bun.build, emitting content-hashed, code-split, pre-compressed
  assets as generated modules
- **Transport**: A server-sent event stream for incremental updates, with
  periodic refresh as a fallback

#### Scenario: Client routing matches server-registered segments

- **WHEN** the client navigates to a view
- **THEN** the resulting URL corresponds to a view segment the server serves the
  shell for, so the link survives a page reload

### Requirement: Data Sources

The dashboard is a pure client of the engine's API. It MUST obtain its initial
snapshot from the JSON API endpoints (`/api/*`) and thereafter maintain it from
the event stream, refetching only on reconnection or explicit user request.

The dashboard MUST NOT poll all endpoints on a fixed interval while the event
stream is healthy.

#### Scenario: Snapshot then stream

- **WHEN** the dashboard loads
- **THEN** it reads its initial data from the API endpoints and then holds the
  event stream open for updates

#### Scenario: Degraded transport is visible

- **WHEN** the event stream is unavailable and the dashboard falls back to
  periodic refresh
- **THEN** the interface reports the degraded connection state to the user

### Requirement: Asset Delivery and Caching

Compiled assets MUST be served from routes beneath the UI path, addressed by a
hash of their contents, with cache directives permitting indefinite client
caching.

Because an asset's URL changes whenever its contents change, a client MUST never
be served a stale asset for a new build.

Asset routes MUST be readable without authentication so that the shell can load
before a session exists; assets MUST NOT contain instance data, credentials, or
device information.

Assets MUST be compressed. The compressed representation MUST be produced when
the assets are built, not per request, and MUST be served with the corresponding
content encoding to clients that accept it, with the uncompressed representation
served to clients that do not.

The encoding MUST be one that browsers offer over an insecure origin. The
dashboard is normally reached over plain HTTP on a local network, and browsers
restrict some encodings to secure origins, so an encoding that is only offered
over HTTPS would go permanently unused on a typical installation while appearing
to work in tests. Exactly one compressed representation per asset is required; a
second encoding is optional and MUST NOT be the only one stored.

The bytes transferred for a first paint — scripts and stylesheets required before
the interface is usable, excluding anything loaded on demand — MUST stay within a
stated budget, and that budget MUST be enforced at build time rather than
observed after the fact.

The budget MUST be measured against the representation a client on an insecure
origin actually receives. Measuring it against a smaller representation that such
a client never negotiates would assert a first paint the deployment does not
have.

#### Scenario: Assets are served compressed

- **WHEN** a client that accepts a compressed encoding requests an asset
- **THEN** the compressed representation is served with its content encoding
  declared, and is smaller than the uncompressed one

#### Scenario: A client that cannot decompress is still served

- **WHEN** a client that accepts no compressed encoding requests an asset
- **THEN** the uncompressed representation is served and is usable

#### Scenario: Compression applies over an insecure origin

- **WHEN** a browser loads the dashboard over plain HTTP on a local network
- **THEN** it negotiates the stored compressed representation, rather than
  falling back to the uncompressed one because the stored encoding is offered
  only on secure origins

#### Scenario: First paint stays within budget

- **WHEN** the frontend is built
- **THEN** the combined transferred size of the assets required for a first paint
  is within the stated budget, and a build exceeding it fails

#### Scenario: On-demand code does not count against first paint

- **WHEN** a feature is loaded on demand rather than at first paint
- **THEN** its size is excluded from the first-paint budget and it is not
  fetched until the feature is opened

#### Scenario: Repeat visit does not refetch the bundle

- **WHEN** a client that has already loaded the dashboard navigates to it again
- **THEN** the bundles are served from the client cache rather than refetched

#### Scenario: New build invalidates the cache

- **WHEN** the frontend is rebuilt with changed source and the dashboard is
  reloaded
- **THEN** the client requests the new asset URLs and does not use the previous
  cached bundles

### Requirement: Navigation and Information Architecture

The dashboard MUST organise its views into two groups by audience: a control
group covering rooms and devices, and an operator group covering automations,
state, logs, and HomeKit status. Navigation MUST present that grouping.

The dashboard MUST support drilling from a collection to an individual item. At
minimum it MUST provide a device list with a device detail view, and an
automation list with an automation detail view.

The landing view MUST be a device control surface. Engine readiness MUST remain
visible as a status indicator but MUST NOT be the landing view.

Rooms MUST appear as navigable entries within the control group, alongside an
entry for devices belonging to no room and an entry listing all devices.

Every view reachable by navigation MUST have a URL that can be shared and
reloaded, and browser history navigation MUST move between views correctly.

#### Scenario: Landing view is a control surface

- **WHEN** a user opens the dashboard at its base path
- **THEN** a device control surface is shown, not engine status

#### Scenario: Rooms are navigable entries

- **WHEN** rooms are defined
- **THEN** each appears as a navigation entry within the control group

#### Scenario: Device detail is deep-linkable

- **WHEN** a user opens a device's detail view and reloads the page
- **THEN** the same device's detail view is shown

#### Scenario: Back navigation returns to the list

- **WHEN** a user navigates from a list into a detail view and presses back
- **THEN** the list view is restored

### Requirement: Responsive Navigation

The dashboard MUST present one information architecture through navigation
appropriate to the viewport.

On wide viewports it MUST present persistent navigation showing both groups,
with each group collapsible.

On narrow viewports it MUST present the control group as primary, immediately
reachable navigation, and MUST NOT place primary device control behind a
disclosure such as a drawer or menu. Operator views MUST NOT be promoted into
narrow-viewport navigation, but MUST remain reachable by URL so that no view is
unreachable on any device.

#### Scenario: Control surface is one tap away on a phone

- **WHEN** the dashboard is opened on a narrow viewport
- **THEN** device control navigation is directly visible without opening a menu

#### Scenario: Operator views remain reachable on a phone

- **WHEN** a user navigates directly to a logs or state URL on a narrow viewport
- **THEN** that view renders correctly

#### Scenario: Wide viewport shows both groups

- **WHEN** the dashboard is opened on a wide viewport
- **THEN** both the control group and the operator group are visible in
  persistent navigation, and each can be collapsed

### Requirement: Room Management Interface

The dashboard MUST allow rooms to be created, renamed, and deleted, and devices
to be assigned to a room or unassigned.

A room view MUST show its member devices, including members that are currently
unavailable, marked distinctly. A device shown as unavailable MUST NOT present
its last known state as current.

A room's member devices MUST be presented in the same layout the dashboard uses
for any other device collection. A room MUST NOT adopt a different presentation
merely because it also offers membership management: a management affordance is
not a reason for a device to look different in one place than another.

An unavailable member MUST be presented using the same device presentation as an
available one, in an unavailable state, rather than a separate presentation of
its own. It MUST remain distinguishable at a glance from an available member.

The affordance for removing a device from a room MUST NOT be permanently present
alongside every member. The room MUST offer a way to enter a mode in which
removal is available for its members, and that mode MUST be reachable without a
pointing device.

Assigning a device to a room MUST move it out of any room it was previously in,
and the change MUST be reflected in every connected dashboard.

Deleting a room MUST make clear that its devices become unassigned rather than
being deleted.

#### Scenario: A device is moved between rooms

- **WHEN** a user assigns a device already in one room to another
- **THEN** the device appears only in the new room, in this and every other
  connected dashboard

#### Scenario: Unavailable member is visible but distinct

- **WHEN** a room contains a device whose source is unconfigured
- **THEN** the device is listed, marked unavailable, and its stale state is not
  shown as current

#### Scenario: Deleting a room is non-destructive

- **WHEN** a user deletes a room containing devices
- **THEN** the devices remain and appear in the unassigned group

#### Scenario: A room's devices look like devices anywhere else

- **WHEN** a user opens a room containing several devices
- **THEN** those devices are presented in the same layout as the dashboard's
  device collections

#### Scenario: Removal is available on request, not always

- **WHEN** a user views a room without having asked to manage its membership
- **THEN** no per-device removal affordance is shown, and one becomes available
  after the user enters the room's management mode

#### Scenario: Removal is reachable without hover

- **WHEN** a user on a touch device enters a room's management mode
- **THEN** the removal affordance for each member is operable without a hover
  interaction

### Requirement: Device Tiles

Where devices are presented as a collection, each device MUST be shown as a tile
carrying at most one primary action and at most one primary readout, selected by
ranking the device's declared capabilities.

A tile's primary action MUST be a property that operates the device, not one that
configures it. Many devices whose purpose is purely to report — motion sensors,
buttons, contact sensors — nonetheless declare writable settings such as
sensitivity or timeout. Presenting such a setting as a tile's primary action
misrepresents a sensor as something the user operates, and buries its actual
reading. A writable property MUST NOT be selected as a tile's primary action
unless it belongs to a capability whose declared category is one that operates
the physical world. A configuration property MUST remain available in the device
detail view.

A device whose capabilities include no actuatable property matching the ranking
MUST render as a read-only tile that opens the device detail view, rather than
failing to render or rendering an inoperative control.

A device collection MUST offer a way to show only devices that can be operated,
hiding those that only report. The selection MUST be derived from the same
declared category that governs primary-action ranking, so that a device hidden by
the filter is exactly one that would not have offered a primary action. The
selection MUST default to showing all devices and MUST NOT persist beyond the
current session.

A tile MUST indicate whether the device is push-backed or polled, the age of the
observation when polled, and whether it is unreachable.

Actuating a tile MUST behave as device actuation does elsewhere: reflected
immediately, reconciled against reported state, reverted with an error surfaced
on failure.

#### Scenario: A light tile toggles inline

- **WHEN** a dimmable light is shown as a tile
- **THEN** the tile presents a single primary action toggling the light, without
  opening the detail view

#### Scenario: A sensor tile is read-only

- **WHEN** a temperature sensor with no actuatable property is shown as a tile
- **THEN** the tile presents its reading and opens the detail view when
  activated

#### Scenario: An unrankable device degrades gracefully

- **WHEN** a device declares only capabilities the ranking does not cover
- **THEN** a read-only tile is rendered that opens the detail view

#### Scenario: A sensor's configuration setting is not its primary action

- **WHEN** a motion sensor declaring a writable sensitivity setting is shown as a
  tile
- **THEN** the tile presents the sensor's reading rather than a control for that
  setting, and the setting remains available in the device detail view

#### Scenario: An actuator controlled only by a discrete setting still works

- **WHEN** a device whose declared category operates the physical world offers
  actuation only through a discrete choice of values
- **THEN** the tile presents that choice as its primary action

#### Scenario: Filtering to operable devices hides reporting-only devices

- **WHEN** a user asks a device collection to show only devices that can be
  operated
- **THEN** lights, switches, outlets, covers, fans, locks and thermostats remain
  visible, and devices that only report are hidden

#### Scenario: The filter does not survive a reload

- **WHEN** a user who has filtered a collection to operable devices reloads the
  dashboard
- **THEN** the collection again shows all devices

### Requirement: Device Control Interface

The device detail view MUST render controls derived from the device's declared
capabilities rather than from a fixed per-model list, so that a device family the
dashboard has no specific knowledge of is still controllable.

Each declared actuatable property MUST be presented with a control appropriate
to its declared type and constraints, respecting the declared range or permitted
values so that an out-of-range command cannot be composed in the interface.

A control for a boolean property MUST determine its displayed state, and compose
its commands, from the values that property declares for on and off. The
interface MUST NOT infer a boolean's state by general-purpose truthiness, and MUST
NOT assume a boolean is commanded as a true boolean. Both assumptions hold for
some sources and fail for others; where they fail the device is shown in the
wrong state and the command has no effect, which is the most damaging failure a
control surface can have because nothing appears to be broken.

Actuating a control MUST reflect the requested change immediately and MUST
reconcile against the device's reported state when it arrives. A command that is
rejected or fails MUST revert the displayed value and surface the error.

A command that is neither confirmed nor rejected MUST also revert, after a
deadline derived from the device's own observation mode. A push-backed device
MUST be given a short fixed deadline; a polled device MUST be given at least the
refresh interval its descriptor reports, plus a margin.

A single deadline applied to every device is incorrect at both ends: short enough
to be useful for a device that confirms in milliseconds, it reverts a working
polled device before its next refresh arrives; long enough for the slowest polled
device, it leaves a failed command on a push-backed device appearing successful
for seconds. The deadline MUST be computed from the descriptor, and the interface
MUST NOT encode which configuration setting governs which device family.

A continuous control MUST NOT issue one command per intermediate value. Where a
user adjusts a property continuously — dragging a brightness or position slider —
the interface MUST coalesce the adjustment so that at most one command per device
and property is outstanding at a time, issuing the latest requested value once
the previous command settles.

Only the most recent outstanding command for a device and property MUST own the
revert deadline and the reconciliation. Without this, a confirmation for a
superseded intermediate value arrives after the user has moved on and snaps the
control back to a value nobody asked for, and each intermediate command restarts
a deadline that then applies to the wrong value. The visible failure is a control
that jumps backwards during or just after a drag, which reads as the device
refusing the command.

Coalescing MUST apply per device and property, so adjusting one device does not
delay a command to another.

The interface MUST distinguish a push-backed device from a polled one, showing
the age of the last observation for polled devices, and MUST indicate when a
device is unreachable.

#### Scenario: A drag issues one command, not one per step

- **WHEN** a user drags a brightness slider across many intermediate values
- **THEN** at most one command for that device and property is outstanding at a
  time and the final value is the one the device is left at

#### Scenario: A superseded confirmation does not move the control

- **WHEN** a confirmation arrives for an intermediate value that a later command
  has already superseded
- **THEN** the control continues to show the latest requested value rather than
  reverting to the superseded one

#### Scenario: Coalescing is per property

- **WHEN** a user adjusts one device while a command to another device is
  outstanding
- **THEN** the second command is issued without waiting for the first

#### Scenario: An unfamiliar device is still controllable

- **WHEN** a device declares a capability the dashboard has no specific handling
  for
- **THEN** a control appropriate to that property's declared type and constraints
  is rendered

#### Scenario: Control respects declared limits

- **WHEN** a numeric property declares a range
- **THEN** the control cannot be used to request a value outside that range

#### Scenario: Actuation feels immediate

- **WHEN** a user toggles a device
- **THEN** the interface reflects the requested state immediately and reconciles
  when the device reports back

#### Scenario: Failed command reverts

- **WHEN** a command is rejected or fails
- **THEN** the displayed value returns to the last known device state and the
  error is surfaced to the user

#### Scenario: Unconfirmed command on a push-backed device reverts promptly

- **WHEN** a command to a push-backed device is neither confirmed nor rejected
- **THEN** the displayed value reverts after a short deadline rather than
  remaining optimistically wrong

#### Scenario: A polled device is given until its next refresh

- **WHEN** a command is issued to a device whose descriptor reports a long
  refresh interval
- **THEN** the optimistic value is retained at least until that interval has
  elapsed, and is not reverted while confirmation is still expected

#### Scenario: Stale data is labelled

- **WHEN** a polled device's last observation is older than its refresh interval
- **THEN** the interface shows the age of that observation rather than presenting
  it as current

#### Scenario: Unreachable device is marked

- **WHEN** a device is reported unreachable
- **THEN** the interface marks it as such and does not present its last known
  state as current

#### Scenario: A device reporting off as a string is shown as off

- **WHEN** a device whose boolean capability declares string on and off values
  reports itself off
- **THEN** its control is displayed in the off state

#### Scenario: Turning off a string-encoded device actually turns it off

- **WHEN** a user switches off a device whose boolean capability declares string
  on and off values
- **THEN** the command carries that capability's declared off value, the device
  turns off, and the control settles in the off state rather than reverting

### Requirement: Automation Management Interface

The automation list MUST show each automation's enabled state and MUST allow it
to be toggled. The automation detail view MUST show the automation's triggers,
its enabled state, a manual trigger control, and its source.

The detail view MUST additionally show:

- recent executions, with time, trigger, duration, and outcome, including the
  error message for a failed run
- log entries filtered to that automation
- declared required services with their current registration status
- related devices derived from its triggers, linked to their detail views
- state keys it watches, derived from its triggers
- state keys it has been observed writing

Declared information MUST be presented distinctly from observed information, so
that an automation which has not run since startup is not misread as one that
writes nothing or never runs.

Source MUST be displayed with syntax highlighting. The highlighting capability
MUST NOT be loaded until a source view is first opened.

A toggle that fails MUST revert the displayed state and surface the reported
error.

#### Scenario: Automation can be disabled from the list

- **WHEN** a user toggles an automation off in the list
- **THEN** the automation is disabled and every connected dashboard reflects the
  new state

#### Scenario: Source is shown highlighted

- **WHEN** a user opens an automation's detail view and requests its source
- **THEN** the current file contents are displayed with syntax highlighting

#### Scenario: Highlighter is not loaded on first paint

- **WHEN** the dashboard first loads
- **THEN** the syntax highlighting capability has not been fetched

#### Scenario: Failed toggle reverts

- **WHEN** enabling an automation fails because a required service is
  unavailable
- **THEN** the displayed state returns to disabled and the reported error is
  surfaced

#### Scenario: A failed run is visible with its error

- **WHEN** an automation raises an error during execution
- **THEN** its detail view shows that run marked failed with the error message

#### Scenario: Executions appear without a refresh

- **WHEN** an automation executes while its detail view is open
- **THEN** the new execution appears without the user refreshing

#### Scenario: Missing required service is explained

- **WHEN** an automation declares a required service that is not registered
- **THEN** the detail view shows that service as unavailable

#### Scenario: Related device links to its detail view

- **WHEN** an automation declares a device trigger
- **THEN** the referenced device is shown and activating it opens that device's
  detail view

#### Scenario: Observed writes are labelled as observations

- **WHEN** an automation that has not run since startup is opened
- **THEN** its observed written state keys are shown as empty and labelled as
  observed since startup, distinct from its declared watched keys

### Requirement: View Failure Isolation

A rendering failure in one part of the dashboard MUST NOT take down the rest of
it. The failing region MUST be replaced with an error indication that allows
recovery, while the surrounding interface remains usable.

The dashboard has no failure isolation today, so a single unhandled error in any
view discards the entire interface, including views unrelated to the failure such
as state, logs, and automations. Isolation MUST be in place before the changes
that alter the shape of device data reach the dashboard, so that a client reading
data it does not recognise degrades to a broken region rather than a blank page.

#### Scenario: A failing view does not take down the dashboard

- **WHEN** one view throws while rendering
- **THEN** that view is replaced with an error indication and the remaining
  navigation and views continue to function

#### Scenario: Recovery without a reload

- **WHEN** a user navigates away from a failed view and returns to it
- **THEN** the view is re-attempted without requiring a full page reload

#### Scenario: Unrecognised data does not blank the page

- **WHEN** a view receives data in a shape it cannot render
- **THEN** the failure is contained to that view

### Requirement: Operator Views

The operator group MUST provide a state view, a log view, and a HomeKit view
alongside the automation views, each rebuilt on the same navigation, routing, and
data layer as the rest of the interface rather than retained from the previous
tabbed dashboard.

Each MUST be deep-linkable, MUST update from the event stream without a manual
refresh, and MUST report a degraded transport in the same way as every other
view.

The state view MUST list stored keys with their values and MUST support
inspecting, writing, and deleting them, subject to the reserved-namespace
restriction below.

The log view MUST support filtering by level and by free text, and MUST append
new entries as they arrive without discarding an active filter.

The HomeKit view MUST report bridge status, pairing information, and the
accessories currently bridged. Where the HomeKit service is not configured, it
MUST report the service as unconfigured rather than presenting an error or an
empty bridge.

#### Scenario: State view reflects an external write

- **WHEN** a key is written by an automation while the state view is open
- **THEN** the new value appears without a manual refresh

#### Scenario: Log filter survives new entries

- **WHEN** a level filter is active and new entries arrive
- **THEN** matching entries append and the filter remains applied

#### Scenario: HomeKit view without the service configured

- **WHEN** the HomeKit service is not configured and its view is opened
- **THEN** the service is reported as unconfigured rather than as a bridge with
  no accessories

#### Scenario: Operator view is deep-linkable

- **WHEN** a log or state URL is opened directly
- **THEN** that view renders, having loaded its own data

#### Scenario: No view from the previous dashboard remains

- **WHEN** the rebuilt interface is served
- **THEN** every view is rendered by the rebuilt implementation and none of the
  previous tab components remains reachable

### Requirement: Internal State Keys Are Not Presented

The state view MUST NOT present keys belonging to the state store's reserved
internal namespace, and MUST NOT offer editing or deletion of them.

Room definitions, room membership, and automation enabled flags are stored as
state. Presented as ordinary editable state, a single deletion would discard
every room assignment, and editing an enabled flag directly would change what the
interface reports about an automation without stopping or starting it — showing
an automation as disabled while its triggers remain wired.

These are managed through the room and automation interfaces, which are the only
surfaces that present them.

#### Scenario: Internal keys are absent from the state view

- **WHEN** rooms are defined and automations have enabled flags stored
- **THEN** none of the underlying keys appear in the state view

#### Scenario: Rooms cannot be destroyed from the state view

- **WHEN** a user works through the state view
- **THEN** no action available there can remove or alter room assignments

#### Scenario: Enabled state is changed only through automation controls

- **WHEN** a user disables an automation
- **THEN** it is done through the automation interface, which stops the
  automation, rather than by editing a stored value
</content>
