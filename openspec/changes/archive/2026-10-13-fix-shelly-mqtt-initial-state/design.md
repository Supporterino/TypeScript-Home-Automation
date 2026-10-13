# Design

## Context

See proposal.md — Why. The relevant existing behaviour lives in
`packages/core/src/device-sources/shelly-source.ts`:

- `addMqttSubscriptions()` subscribes to `<topicPrefix>/events/rpc` and
  `<topicPrefix>/online`, wired to `handleNotifyStatus` and `handleOnline`.
- `handleNotifyStatus()` returns early unless `payload.method === "NotifyStatus"`,
  then dispatches each `switch:N` / `cover:N` key in `params` to its logical
  channel entry via `entryKeys` and `normalize()`.
- `rebuildEntries()` seeds each logical entry's `tracked` state as `{}` and never
  fetches a status for MQTT-transport devices; HTTP devices are refreshed by
  `poll()` through `shelly.getStatus()` / `shelly.getCoverStatus()`.
- `ShellyService.getStatus()` / `getCoverStatus()` already perform the channel-
  aware RPC (`Switch.GetStatus` / `Cover.GetStatus`) on either transport.

`normalize()` builds `{ on: sw.output, power: sw.apower, … }`; when `sw.output`
is `undefined` the `on` key is present-but-undefined and JSON serialisation drops
it, which is what the dashboard observed.

## Goals / Non-Goals

**Goals:**
- A Shelly descriptor reports its readable properties from first enumeration,
  regardless of transport, without depending on a physical change.
- One code path applies both a full and a partial status frame.

**Non-Goals:**
- Changing what the client renders when a property is absent (separate change).
- Changing the observation mode of MQTT devices (they remain push-backed).
- Polling MQTT devices on an interval.

## Decisions

### D1 — Ingest `NotifyFullStatus` alongside `NotifyStatus`

Shelly publishes `NotifyFullStatus` on connect and `NotifyStatus` for subsequent
partial changes; both carry the same `switch:N` / `cover:N` keys in `params`.
The handler accepts both method names and routes them through the existing
per-component-key dispatch and `normalize()`.

- *Alternative:* continue to rely on `NotifyStatus` only. Rejected: it is
  partial by design — it reports only what changed, so an attribute that has not
  changed since the device's last transition is never delivered.

### D2 — Seed status at first subscription via the RPC status query

Because `events/rpc` is not retained (and `retain` is a per-device Zigbee2MQTT/
Shelly setting the engine does not control), a connect-time `NotifyFullStatus`
published before the source subscribed is lost. On `start()` and on late
registration, the source requests each logical entry's status through
`shelly.getStatus()` / `shelly.getCoverStatus()` — the same methods `poll()`
already uses for HTTP devices — and applies the result through the same tracked
update path.

- *Alternative:* trigger a re-publish by re-subscribing. Rejected: not
  deterministic and still races the device.
- *Alternative:* poll MQTT devices on an interval. Rejected: discards the push
  design and the existing "MQTT devices are excluded from polling" requirement.

### D3 — Seed before the source reports started

Seeding is awaited (with per-device isolation) before `start()` resolves, so
`list()` returns complete descriptors from the first enumeration — matching the
existing rule that a device is not enumerated until its discovery resolves.
A device whose seed request fails or times out is logged and left with the state
it has; the failure does not fail the source or the other devices.

### D4 — No new dependency direction or shared contract

The change touches only `core` behaviour and a doc comment in
`packages/shared/src/types/shelly.ts`. No new tracked contract is introduced, so
`contract-inventory.json` is unchanged.

## Risks / Trade-offs

- [Seeding many MQTT devices serialises start on RPC round-trips] → Seed with
  bounded concurrency / `Promise.allSettled` per device, mirroring the existing
  per-device isolation in `start()`; a 5-second RPC timeout caps the worst case
  per device.
- [A device that does not answer `Switch.GetStatus` stays state-less] → Already
  the pre-change behaviour; the seed is additive and its failure is non-fatal.
- [A stale seeded value could be shown as current] → The seed is the device's
  own reported status at subscription time and the observation is stamped
  `Date.now()`; the existing freshness handling is unchanged.
- [Double application of a full status and a following partial] → Both merge
  onto last-known state via the existing path, so order does not matter.

## Migration Plan

No configuration or data migration. On restart, MQTT devices seed their status
at start. Rollback is reverting the source change; no persisted format changes.
