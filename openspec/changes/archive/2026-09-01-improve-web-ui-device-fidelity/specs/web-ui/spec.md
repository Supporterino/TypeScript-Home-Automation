## MODIFIED Requirements

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
