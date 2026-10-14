# Spec Delta

## MODIFIED Requirements

### Requirement: Data Sources

The dashboard is a pure client of the engine's API. It MUST obtain its initial
snapshot from the JSON API endpoints (`/api/*`) and thereafter maintain it from
the event stream, refetching only on reconnection or explicit user request.

When the event stream delivers a device snapshot on connect, the dashboard MUST
reconcile it into its device map keyed by qualified identifier rather than
replacing the map wholesale, so a value that arrived from the read endpoints or
a stream event before or after the snapshot is not lost. When a device event
arrives for an identifier the dashboard does not currently hold, it MUST recover
by refetching that device rather than discarding the event; an incremental delta
for an unknown device carries no full descriptor and would otherwise be dropped
silently.

Descriptors ingested from either path MUST carry the complete declared
capability contract through to the components that consume them. A device
snapshot is not a display payload that may be narrowed: every field a control
reads from a capability — including the values a boolean property declares for on
and off — MUST survive ingestion, so a device the dashboard learns about only
from the stream is exactly as controllable as one it read from the read
endpoints. A normaliser that reconstructs a capability from a fixed field list
MUST NOT omit a field the declared contract requires, and MUST be extended rather
than left behind whenever that contract grows; a declared field silently dropped
at ingestion is indistinguishable to the user from a device that does not support
it.

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

#### Scenario: The stream's device snapshot is reconciled by identifier

- **WHEN** the stream sends a device snapshot while the dashboard already holds
  device state
- **THEN** each device is merged by its qualified identifier rather than
  replacing the whole map

#### Scenario: A delta for an unknown device recovers it

- **WHEN** a device event arrives for an identifier the dashboard does not hold
- **THEN** the dashboard refetches that device instead of discarding the event

#### Scenario: A device known only from the stream keeps its declared encoding

- **WHEN** the dashboard learns a device from the event stream's snapshot, or
  from a recovery refetch, whose boolean capability declares string on and off
  values
- **THEN** the capability the controls receive still declares those values, and a
  control for that device reads and composes through them

#### Scenario: Ingestion does not narrow a declared capability

- **WHEN** a descriptor is ingested from the read endpoints or from the event
  stream
- **THEN** every field the declared capability contract requires survives
  ingestion, so the same device is controllable whichever path it arrived on

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
reconcile against the device's reported state when it arrives. A report
reconciles a control when it carries the value the newest request for that
property asked for; a report carrying any other value is a report for a
superseded or ignored command and MUST NOT move the control, which its deadline
reverts instead. A device report carries no request identity, so the value it
carries is the only thing that can attribute it to a request; reconciling on a
report regardless of its value would let the confirmation for an intermediate
value move a control the user has already moved past. A command that is rejected
or fails MUST revert the displayed value and surface the error.

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

Only the most recent request for a device and property MUST own the revert
deadline and the reconciliation. Without this, a confirmation for a superseded
intermediate value arrives after the user has moved on and snaps the control back
to a value nobody asked for, and each intermediate command restarts a deadline
that then applies to the wrong value. The visible failure is a control that jumps
backwards during or just after a drag, which reads as the device refusing the
command.

Owning the deadline and the reconciliation MUST NOT depend on the transport
request still being in flight. A command is accepted or rejected long before its
deadline expires and before the device reports back; a request that has been
dispatched successfully, or has been superseded by the coalescer, MUST still
revert at its deadline when nothing confirms it and MUST still yield to a
device report when it carries the value the request asked for. An accepted
response is not a confirmation of
physical device state, and treating it as one leaves the control displaying a
value the device never reached, with no error and no reversion.

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

#### Scenario: An accepted command that the device ignores still reverts

- **WHEN** a toggle has been dispatched and accepted, the device has not reported
  a matching state, and the deadline for the device's own observation mode
  elapses
- **THEN** the control returns to the device's last reported state, so a command
  the device never carried out cannot remain displayed as applied

#### Scenario: A device report still reconciles a settled command

- **WHEN** a device reports, for a property, the value a settled command for that
  property asked for
- **THEN** the control follows the device's report rather than holding the
  optimistic value

#### Scenario: A report for a superseded value does not move the control

- **WHEN** the device reports a value for a property while a newer request for
  that property is awaiting confirmation, and the reported value is not the value
  the newer request asked for
- **THEN** the control continues to show the newer request's requested value and
  is reverted only by that request's deadline if the device never reports that
  value

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
