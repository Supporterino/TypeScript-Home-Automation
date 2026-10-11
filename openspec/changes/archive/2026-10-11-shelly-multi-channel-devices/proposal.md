## Why

The Shelly model assumes "one registered name = one device = one component, always
channel 0". Shelly Pro-series appliances (Pro 4PM, Pro 2PM, Pro 2) are
multi-component devices: a single Pro 4PM exposes four independent `switch:0`
through `switch:3` channels. Today only channel 0 is reachable — commands
hardcode `id: 0`, and MQTT status handling drops every `switch:1..3`
notification. Users with Pro hardware can control at most one of four circuits.

## What Changes

- Register one physical Shelly once; the source enumerates the device's
  switch/cover components and materializes one logical Shelly device per
  channel, each independently addressable and controllable over HTTP or MQTT.
  Single-component devices keep their existing identity; multi-component
  channels take their component's configured name (with a numeric fallback).
- **BREAKING** (MQTT status): `Switch.GetStatus` / `Cover.GetStatus` now accept
  an `id` (channel), and every switch/cover command is parameterized by the
  target channel instead of hardcoding `0`.
- MQTT `NotifyStatus` handling is keyed by the notification's actual component
  (`switch:N` / `cover:N`) rather than a fixed `switch:0`/`cover:0`, so
  non-zero channels produce state updates.
- Device discovery becomes a startup step that enumerates components
  (`Shelly.GetComponents`) and materializes one channel-scoped record per
  component through an internal registration path — the public `register()`
  API is unchanged. Discovery is awaited at source start; a failure falls back
  to a single channel-0 component.
- The HomeKit bridge projects each channel as a separate accessory
  (Switch/Outlet/WindowCovering), so a Pro 4PM appears as four switches.
- Single-channel devices (Plus 1PM, Plus Plug S, Plus 2PM) keep their current
  behavior: one channel, stable IDs unchanged.

## Capabilities

### New Capabilities

- `shelly-multi-channel`: Component discovery and per-channel enumeration for
  multi-component Shelly devices, including stable per-channel identity and
  per-channel capability descriptions.

### Modified Capabilities

- `shelly-service`: Registration accepts multi-component devices and channel
  addressing; switch/cover/status methods target a specific channel; MQTT
  status notifications are dispatched per component key; type definitions gain
  a channel field.
- `device-sources`: The Shelly Device Source Requirement enumerates one
  descriptor per component of a multi-component device, wires MQTT push status
  per channel, and polls each HTTP channel independently.

## Impact

- `packages/shared/src/types/shelly.ts` — new component-enumeration response
  types (`ShellyComponentsStatus` and the per-component key/kind shape).
- `packages/core/src/services/shelly-service.ts` — the service's internal
  `ShellyDevice` record gains a `channel` field and an effective component
  `type`, held in a separate internal channel map so the public `getDevices()`
  view stays registration-only; all switch/cover/status methods and RPC
  dispatch gain channel threading (channel in params and topic).
- `packages/core/src/device-sources/shelly-source.ts` — component enumeration,
  per-channel MQTT subscriptions and state tracking, per-channel polling and
  descriptors.
- `packages/core/src/device-sources/shelly-capabilities.ts` — per-channel
  descriptor capability composition.
- `packages/core/src/services/homekit-descriptor-factory.ts` and
  `packages/core/src/services/homekit-sources/device-catalog-source.ts` — one
  accessory per channel; a component rename changes the identity and thus
  requires a re-pair.
- `docs/services/shelly.md` and the `shelly-service` / `device-sources` specs.
- No new runtime dependencies. Single-channel device behavior is preserved.
