# Realtime Events Specification

## Purpose

A server-to-client event stream that pushes incremental state, device, log, and
automation updates to connected dashboards, replacing periodic full refetching
so that an actuated control is confirmed in the interface without waiting for a
polling interval.

## Requirements

### Requirement: Event Stream Endpoint

The system MUST expose an endpoint that holds an open connection and delivers
server-sent events to the client for as long as the connection lasts.

The stream MUST be subject to the same authorisation rules as the other API
endpoints. It MUST be unidirectional: clients MUST NOT send commands over it and
MUST continue to use ordinary requests to mutate anything.

The stream MUST remain open across periods of inactivity, emitting a periodic
keep-alive so that intermediaries do not close an idle connection.

#### Scenario: Client receives events on an open stream

- **WHEN** a client opens the stream and a state value subsequently changes
- **THEN** the client receives an event describing that change without issuing a
  further request

#### Scenario: Unauthorised client is refused

- **WHEN** an access token is configured and a client opens the stream without
  valid credentials
- **THEN** the connection is refused as unauthorised

#### Scenario: Idle stream stays open

- **WHEN** no events occur for longer than a typical proxy idle timeout
- **THEN** a keep-alive is emitted and the connection remains usable

### Requirement: Event Categories

The stream MUST deliver typed events covering at least:

- state key changes, including the key, the new value, and the previous value
- device state changes, identified by qualified device identifier, carrying the
  changed properties and the observation's freshness
- device reachability changes
- devices appearing and disappearing
- device visibility changes, identified by qualified device identifier, carrying
  the device's new visibility
- new log entries
- automation enabled state changes
- automation execution completions, carrying the automation, its trigger,
  duration, and outcome
- room definition and membership changes
- engine readiness changes

Each event MUST identify its category so a client can route it without
inspecting its payload shape.

A visibility change MUST be its own category rather than being expressed as a
device appearing or disappearing. A hidden device has not disappeared — it is still
enumerable, still commandable, and still a member of its room — and a client that
treated the two as the same would drop state it must keep in order to offer to
unhide the device.

A visibility change MUST carry only the affected device, not the device list, and
MUST NOT be inferable only from a state key change: the flag is stored in the
reserved state namespace, which is deliberately not streamed.

The device categories — device state changes, reachability changes, and devices
appearing and disappearing — depend on qualified device identifiers and
observation freshness, which the unified device model defines. They MUST be
delivered once that model exists, and MUST NOT be delivered in terms of any
earlier, source-specific device representation. The remaining categories do not
depend on it.

#### Scenario: Device categories are expressed in the unified model

- **WHEN** a device event is emitted
- **THEN** it identifies the device by qualified identifier and reports the
  observation's freshness, in the same terms as the device read endpoints

#### Scenario: Device change is attributed to a device

- **WHEN** a device reports a state change
- **THEN** the emitted event names its category, its qualified device
  identifier, and the changed properties

#### Scenario: Automation toggle is broadcast

- **WHEN** an automation is disabled through the API
- **THEN** every connected client receives an event reporting the new enabled
  state

#### Scenario: Execution completion is broadcast

- **WHEN** an automation finishes executing
- **THEN** an event is emitted naming the automation, its trigger, its duration,
  and whether it succeeded

#### Scenario: Room membership change is broadcast

- **WHEN** a device is assigned to a different room
- **THEN** an event is emitted describing the change, without resending the full
  room list

#### Scenario: Visibility change is broadcast

- **WHEN** a device is hidden
- **THEN** an event is emitted naming its category, the device's qualified
  identifier, and its new visibility, without resending the device list

#### Scenario: Hiding is not reported as disappearing

- **WHEN** a device is hidden
- **THEN** no device-disappeared event is emitted for it

#### Scenario: The reserved key backing visibility is still not streamed

- **WHEN** a device's visibility changes
- **THEN** a visibility event is delivered and no state key change event is
  delivered for the reserved key that stores it

### Requirement: Incremental Delivery

Events MUST carry only what changed, not a full snapshot of the affected
collection. A client MUST be able to establish an initial snapshot through the
ordinary read endpoints and thereafter maintain it from the stream alone.

#### Scenario: A single key change does not resend all state

- **WHEN** one state key changes while a client is connected
- **THEN** the event describes only that key, not the whole state map

#### Scenario: A single device change does not resend the device list

- **WHEN** one device reports a state change
- **THEN** the event describes only that device, not the full device inventory

### Requirement: Reserved State Keys Are Not Streamed

The state key change category MUST exclude keys in the state store's reserved
internal namespace.

Room definitions, room membership, and automation enabled flags are stored under
that namespace and are already delivered through their own typed categories.
Emitting them as raw state changes as well would deliver every such mutation
twice, once typed and once as an untyped key-and-value pair, and would expose
internal keys to clients that the read endpoints deliberately hide from them.

The typed categories are the interface for this data; the raw state category MUST
NOT shadow them.

#### Scenario: A room assignment is emitted once

- **WHEN** a device is assigned to a room
- **THEN** a room membership event is emitted and no state key change event is
  emitted for the underlying reserved key

#### Scenario: An automation toggle is emitted once

- **WHEN** an automation's enabled flag changes
- **THEN** an automation enabled event is emitted and no state key change event
  is emitted for the underlying reserved key

#### Scenario: Ordinary state keys are unaffected

- **WHEN** a non-reserved state key changes
- **THEN** a state key change event is emitted as normal

### Requirement: Disconnection and Recovery

The system MUST tolerate clients disconnecting at any time, releasing all
resources associated with a closed connection, including any listener
registered on its behalf.

A client MUST be able to reconnect and re-establish a correct view. Because
events are incremental, a client that has been disconnected MUST refresh its
snapshot on reconnection rather than assuming continuity.

Clients MUST retain a working fallback: where a stream cannot be established,
the dashboard MUST fall back to periodic refresh rather than displaying no data.

#### Scenario: Disconnect releases listeners

- **WHEN** a connected client disconnects
- **THEN** every listener registered for that connection is removed and no
  further work is performed on its behalf

#### Scenario: Reconnection refreshes the snapshot

- **WHEN** a client reconnects after an interruption
- **THEN** it re-reads the current snapshot before resuming incremental updates

#### Scenario: Stream unavailable falls back to polling

- **WHEN** the stream cannot be established
- **THEN** the dashboard falls back to periodic refresh and reports the degraded
  connection state to the user

### Requirement: Multiple Concurrent Clients

The system MUST support multiple simultaneous stream clients. An event MUST be
delivered to every connected client, and a failure delivering to one client MUST
NOT prevent delivery to the others or disrupt the engine.

#### Scenario: All clients receive an event

- **WHEN** three clients are connected and a state key changes
- **THEN** all three receive the corresponding event

#### Scenario: One failing client does not affect others

- **WHEN** delivery to one client fails
- **THEN** the failure is logged, that connection is cleaned up, and other
  clients continue to receive events

### Requirement: Bounded Per-Connection Buffering

The system MUST bound the events buffered for any one connection, and MUST NOT
let a client that cannot keep up grow the engine's memory without limit.

A failing client and a slow client are different failures. A failing client is
detected by a write error and its connection is closed. A slow client accepts
writes, just not quickly enough, and so is never detected by an error at all.
This matters because the stream replaces a bounded five-second poll with an
unbounded push: the log category delivers every entry as it is written rather
than the tail of a fixed-size buffer on request, and a device reporting power
measurements each second emits continuously with no client involvement.

When a connection's buffer is full, the system MUST discard its oldest undelivered
events rather than blocking the producer or growing the buffer, and MUST then
inform that client that it has fallen behind. The client MUST treat that signal
the way it treats a reconnection: re-read the current snapshot before resuming
incremental updates, because it can no longer assume continuity.

Discarding MUST affect only the connection that fell behind. Other connections
MUST continue to receive every event.

This is the same recovery path as reconnection, reached without disconnecting.
Both cases end in the client re-establishing a snapshot, so the system MUST NOT
carry a second recovery mechanism for it.

The bound MUST be a fixed limit rather than an unbounded queue, mirroring the log
buffer's existing bounded-retention policy rather than introducing a second
policy for the same class of problem.

#### Scenario: A slow client is bounded, not buffered indefinitely

- **WHEN** a connected client stops reading while events continue to be produced
- **THEN** the events retained for that connection stop at a fixed limit and the
  oldest undelivered events are discarded, rather than accumulating in memory

#### Scenario: A client that fell behind re-snapshots

- **WHEN** events have been discarded for a connection and it resumes reading
- **THEN** it is told it fell behind, and it re-reads the current snapshot before
  applying further incremental updates

#### Scenario: Falling behind is isolated to one connection

- **WHEN** one of several connected clients falls behind and has events discarded
- **THEN** the other clients receive every event with nothing discarded

#### Scenario: A high-volume category does not displace a quiet one

- **WHEN** log events are produced continuously and a room membership change
  occurs
- **THEN** a client keeping up receives the room event, which is not lost to the
  volume of the log category
