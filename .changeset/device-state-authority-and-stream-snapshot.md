---
"@ts-ha/core": minor
"@ts-ha/web-ui": minor
---

Persist last-known device state and send the current device set on every stream
connect.

- `@ts-ha/core`: a durable device state store holding every device's last-known
  state and the observation that produced it, keyed by qualified identifier —
  loaded before any source starts and written behind a debounced flush, so a
  descriptor reports last-known state from the first read after a restart
  instead of empty, and a live observation still supersedes it
- `@ts-ha/core`: every device source records its observations into the store; a
  source that does not persist its own state (Shelly, Nanoleaf) seeds a
  descriptor's state from it when it has no fresher observation of its own,
  while a self-persisting source (Zigbee, state toggles) records for
  durability/pruning only — in both cases a descriptor reports last-known state
  from the first read after a restart, keeping enumeration, retrieval by
  identifier, and subscription delivery consistent; a restored record keeps its
  original observation time so a stale value reads as last-known rather than
  live, and records are pruned when a device drops out of enumeration but
  retained while its owning source is unavailable
- `@ts-ha/core`: `GET /api/events` sends a per-connection initial device
  snapshot on connect — one `device_appeared` event per device carrying its full
  descriptor, from the total enumeration including hidden devices and matching
  `GET /api/device-catalog` — before any later device event, which stays an
  incremental delta
- `@ts-ha/core`: the new `DeviceStateStore` / `DeviceStateStoreOptions` /
  `DeviceStateRecord` exports, `DEVICE_STATE_PERSIST` / `DEVICE_STATE_FILE` /
  `DEVICE_STATE_FLUSH_MS` config, and the `deviceState` engine option, with
  persistence enabled by default alongside the existing persistence defaults
- `@ts-ha/web-ui`: the dashboard reconciles the stream's device snapshot into
  its device map by qualified identifier rather than replacing the map, so state
  from the read endpoints or an event is not lost, and refetches a device on a
  delta for an identifier it does not hold instead of dropping the event
