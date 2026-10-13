# Proposal

## Why

Device state is held in per-source memory. For sources that persist (Zigbee
registry, state toggles) it survives a restart; for Shelly and Nanoleaf it is
rebuilt empty on every start and only repopulated by the next observation. The
REST snapshot is the client's only source of truth, and the event stream is
delta-only — it reports changes, never current values — so a client that starts
with an incomplete snapshot can hold a wrong or missing value indefinitely, with
no self-healing path. This is a resilience gap independent of how any single
source acquires state (see the separate change `fix-shelly-mqtt-initial-state`).

## What Changes

- Introduce a **durable, unified device state store**: the last-known state and
  observation for every device, keyed by qualified id, persisted write-behind
  and loaded before device sources start.
- Device sources record every observation into the store and seed a descriptor's
  `state` from it, so enumeration reports last-known state from the first read
  after a restart rather than an empty state.
- On every stream connection, the server sends a **per-connection initial device
  snapshot** — one `device_appeared` per device carrying its full descriptor —
  before any subsequent device event.
- The dashboard reconciles that snapshot by qualified id (never clobbering
  already-newer local state) and refetches a device when a delta arrives for an
  id it does not know.
- New configuration for the store's persistence, enabled by default to match the
  existing persistence defaults.
- **BREAKING** (mild): after a restart a device's descriptor now reports its
  persisted last-known state, marked by observation freshness, instead of an
  empty state. Existing empty-state behaviour was already a bug for poll-backed
  sources; this makes it uniform.

## Capabilities

### New Capabilities
- `device-state-store`: a durable, unified last-known device state store that
  every device source records into and seeds descriptors from.

### Modified Capabilities
- `device-sources`: sources MUST record observations into the store and seed a
  descriptor's state from the store's last-known value.
- `realtime-events`: the stream MUST send a per-connection initial device
  snapshot on connect, in addition to incremental updates.
- `web-ui`: the dashboard MUST reconcile the stream's device snapshot by
  qualified id and recover an unknown device by refetching it.
- `configuration`: the schema MUST include the device state store's persistence
  settings, enabled by default.

## Impact

- `core`: new `packages/core/src/device-sources/device-state-store.ts`; engine
  wiring in `engine.ts`; `device-sources/*` and `device-event-bridge.ts`.
- `web-ui`: `packages/web-ui/src/app/lib/data-store.tsx`,
  `device-reduction.ts`.
- `shared`: no new contract is expected (the store is a core-internal concern and
  the stream reuses the existing `device_appeared` category).
- `docs`: `docs/architecture.md`, `docs/configuration.md`,
  `docs/api-reference.md`, `docs/device-registry.md`.
- No dependency-direction change.
