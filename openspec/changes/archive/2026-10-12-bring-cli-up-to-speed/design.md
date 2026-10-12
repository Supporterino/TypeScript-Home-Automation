## Context

See `proposal.md` — Why. The engine already exposes every endpoint the CLI needs
(`http-server.ts`); the web UI already consumes all of them. This is a CLI-only
catch-up, so no engine or contract *production* changes are needed — only a
contract *removal* in `@ts-ha/shared` and a rewrite of the CLI's client, commands,
and dashboard.

Constraints that shape the approach:

- `@ts-ha/cli` is the only consumer of the legacy `SerializedDevice`, `DeviceInfo`,
  and `AutomationInfo` wire DTOs; deleting them is safe once the CLI migrates.
- The CLI authenticates with a Bearer token (`--token` / config). An `EventSource`
  cannot attach that header, so the stream must be read another way.
- The event stream carries deltas for state, log, readiness, automation, device,
  room, membership, visibility, and wall changes — but **not** HomeKit, energy, or
  weather, which have no event category.
- The capability vocabulary (`Capability`, `readBooleanCapabilityValue`,
  `composeBooleanCapabilityValue`) already encodes everything needed to render and
  compose a control without source-specific knowledge.

## Goals / Non-Goals

**Goals:**
- Restore the device surface against the unified catalog and stop the silent
  Devices-tab misrender.
- Reach operator parity with the web UI: device/room control, energy, weather,
  automation history/relationships, wall administration.
- Make the dashboard live off the event stream.
- Retire the legacy wire DTOs.

**Non-Goals:**
- Any engine or web-UI behavior change.
- Rendering a wall display in the terminal (administration only).
- An in-process (no-HTTP) dashboard data path for `ts-ha run` — the dashboard keeps
  talking to the engine over HTTP even when both are in the same process.
- New authentication or config semantics.

## Decisions

### D1 — Address devices by `qualifiedId`, with a display-name fallback

Commands take a `qualifiedId` (`source:id`). When the argument matches no known
`qualifiedId`, the client resolves it as a case-insensitive substring of a
device's `displayName`, acting only when exactly one device matches and otherwise
listing candidates.

*Alternative considered:* friendly-name-only addressing (pre-redesign) — rejected
because display names are non-unique and mutable, and the API is keyed by
`qualifiedId`. *Alternative:* `qualifiedId` only — rejected as hostile to
shell use, where names are what an operator remembers.

### D2 — Delete the legacy DTOs rather than shim them

Migrate `client.ts`, `format.ts`, and the tabs to `DeviceDescriptor`,
`Automation`, and `Capability`, then remove `SerializedDevice`, `DeviceInfo`, and
`AutomationInfo` from `shared/wire.ts`.

*Alternative considered:* leave the types as deprecated aliases — rejected; a
one-consumer type with no producer is dead weight, and the spec's single-definition
rule is cleaner without them.

### D3 — Read the stream with fetch-streaming, not `EventSource`

`EventSource` cannot send an `Authorization` header, and the CLI cannot rely on a
session cookie. The client opens `GET /api/events` with `fetch`, reads the
`ReadableStream` body, and parses `data: {json}\n\n` frames itself (the hub emits
only `data:` lines and `: keep-alive` comments — `event-stream.ts:12`). A `401`
surfaces as an auth error; the reader reconnects on drop.

*Alternative considered:* a token query parameter to make `EventSource` usable —
rejected as a token-leak in URLs/logs, and a server-side change this change does
not need.

### D4 — Snapshot + stream + slow poll, with re-snapshot on `fell_behind`

The dashboard takes one full snapshot on mount, then patches domains from stream
events, and refreshes the non-streamed domains (HomeKit, energy, weather) on a
slower interval. A `fell_behind` event triggers a full re-snapshot, since the
stream cannot guarantee the client saw every delta.

*Alternative considered:* pure stream with no snapshot — rejected; the stream is
delta-only and a fresh client has no base state. *Alternative:* keep interval-only
polling — rejected by the change's premise.

### D5 — Project controls from the capability vocabulary

The Devices tab renders one control per flattened writable capability:
`boolean` → toggle, `numeric` → range/step adjust, `enum` → cycle over
`permittedValues`, `text` → inline edit; read-only → readout. Boolean read and
compose go through the shared `readBooleanCapabilityValue` /
`composeBooleanCapabilityValue` helpers, so a source that reports `"ON"`/`"OFF"`
is handled correctly. This mirrors the web UI's `CapabilityControl.tsx` without
sharing code (the CLI cannot import the web UI).

*Alternative considered:* source-specific controls — rejected; it reintroduces the
exact coupling the device-source redesign removed.

### D6 — Wall administration only

`walls` subcommands manage profiles; the terminal never renders a wall. A wall is
a browser-display concept (grid coordinates, orientation overrides) with no
sensible terminal projection.

*Alternative considered:* a text-rendered wall — rejected as a different product.

### D7 — Code layout

New `DebugClient` methods in `client.ts`; one command module per domain in
`commands/`; new dashboard tabs as separate components in `components/`; device
and room formatting in `format.ts`. Dispatch and usage live in `index.ts`.

## Risks / Trade-offs

- **Control from a shell is dangerous** → device/room commands are explicit
  subcommands with required arguments; the TUI shows the selected device and
  property. No confirmation prompt is added (it would break scripting), matching
  the web UI's immediacy.
- **Stream reconnection churn** → the reader backs off and re-snapshots on
  reconnect, so a dropped connection never leaves stale data indefinitely.
- **Renaming two spec requirements** (`Remote Communication` → `Engine
  Communication`, `Commands` → `Command Surface`) to retire their degradation
  scenarios → the tool only drops scenarios via requirement removal; the successor
  names are recorded in the proposal and migration notes.
- **Legacy-DTO removal is breaking for any external importer** → the types were
  public in `@ts-ha/shared`; a Changeset marks the removal.

## Migration Plan

1. Phase 1 (repair) lands first and is independently shippable: catalog migration
   and legacy-DTO removal.
2. Phases 2–3 are additive subcommands and tabs; nothing existing is removed, so
   rollback is reverting the release.
3. A Changeset records the `@ts-ha/shared` removal and the `@ts-ha/cli` feature
   bumps.

## Open Questions

- Whether `ts-ha run` should later serve the dashboard from the in-process engine
  instead of over HTTP. Deferrable: the HTTP path works for both.
- Whether `fell_behind` handling should be tuned (buffer size is an engine-side
  constant) once real terminal usage is observed. Deferrable: the re-snapshot
  behavior is correct regardless of the buffer size.
