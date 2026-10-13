# Proposal

## Why

MQTT-transport Shelly switches and covers report their state incompletely: a
switch's `on` (and a cover's `position`/`state`) is absent from the backend
snapshot until the physical device next changes, so the dashboard renders every
such device as off/0 on load and only corrects after a user interaction. The
cause is that the source ingests only partial `NotifyStatus` deltas and ignores
`NotifyFullStatus`, the full component status Shelly publishes when its MQTT
connection is established.

Observed on a live instance: every `shelly` descriptor's `state` lacked the
`on` property its own capabilities declare — e.g. `{power, voltage, current,
energy}`, a single `{current}`, or `{}` — while `zigbee`, `nanoleaf`, and `state`
descriptors all carried their boolean. Because the JSON-RPC events topic is not
retained, the connect-time full status is lost whenever it precedes the engine's
subscription, and only later partial notifications repopulate whichever
attributes happen to change.

## What Changes

- Handle `NotifyFullStatus` on `<topicPrefix>/events/rpc` exactly as
  `NotifyStatus` is handled: dispatch each `switch:N` / `cover:N` component key
  present in the payload to its logical channel entry, so a full status seeds
  `on` (switch) and `position` / `state` (cover).
- Seed an MQTT-transport device's full status when the source starts (and when a
  device is registered after start), by requesting the component status over the
  existing RPC path, because `events/rpc` is not retained and the connect-time
  `NotifyFullStatus` may have been published before the source subscribed.
- Guarantee that a Shelly descriptor's `state` carries every readable property
  the transport reports from first enumeration, rather than only after a change.
- **Non-Goals**
  - No change to Zigbee or Nanoleaf state acquisition.
  - No client-side "unknown instead of off" rendering (tracked separately).
  - No durable cross-family state store or per-connection stream snapshot (a
    separate change: `device-state-authority-and-stream-snapshot`).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `device-sources`: the **Shelly Device Source** requirement is extended so an
  MQTT-transport device's full status is ingested and its descriptor carries its
  actuatable boolean (and cover position/state) from first enumeration.

## Impact

- `core`: `packages/core/src/device-sources/shelly-source.ts` (notification
  handling and initial seeding); existing Shelly source tests.
- `shared`: `packages/shared/src/types/shelly.ts` — the `ShellyMqttNotification`
  doc comment names both notification methods (no new tracked contract).
- `docs`: `docs/services/shelly.md` (MQTT notification behaviour).
- No dependency-direction change and no `contract-inventory.json` change: no new
  shared contract is introduced, only a doc comment and source behaviour.
