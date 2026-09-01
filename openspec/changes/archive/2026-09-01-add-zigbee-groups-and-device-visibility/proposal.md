## Why

A ceiling lamp with three Zigbee bulbs appears as three devices in the web UI and
three accessories in HomeKit, and has no single handle an automation can command.
Zigbee2MQTT already models this correctly — it publishes a group list on
`bridge/groups` and multicasts commands to group members — but the framework never
subscribes to that topic, so groups are invisible to every surface. Exposing groups
only helps if the member bulbs can also be pushed out of sight; otherwise the lamp
becomes a fourth entry rather than a replacement for three.

## What Changes

**Zigbee group discovery**

- `DeviceRegistry` subscribes `zigbee2mqtt/bridge/groups` and tracks the published
  group list (numeric id, friendly name, members) alongside its device list,
  reconciling additions and removals the same way it does for devices.
- Groups are persisted in the existing `device-registry.json` under a new `groups`
  key, governed by the existing `DEVICE_REGISTRY_PERSIST` setting, so a room
  assignment that references a group survives a restart.

**A fifth device source**

- New `zigbee-group` source exposing each group as a `DeviceDescriptor` with
  qualified id `zigbee-group:<numeric id>`.
- Group capabilities are the **intersection** of member capabilities, so a control
  the system offers is one every member can honour.
- Group state is **derived from member state**, not read from Zigbee2MQTT's
  optimistic group topic: booleans use any-on, numerics average across members that
  are on.
- Commands publish to the group's friendly name, letting the coordinator multicast.
- Groups are ordinary devices to everything above the source layer — roomable,
  commandable, streamed over SSE.

**Device visibility**

- New per-device hidden flag, persisted as one reserved state key per device
  (`$internal:hidden:<qualifiedId>`), mirroring how room assignment is stored.
- Hiding is **manual and explicit**, not derived from group membership: it works
  equally for a group's member bulbs and for a sensor the user never wants to see.
- `DeviceDescriptor` gains a `hidden` boolean. **BREAKING** for consumers that
  construct descriptors, though all in-tree sources are updated.
- `AggregateDeviceSource` gains `listVisible()`. `list()` stays total, so the SSE
  reconciler, room membership, and automations are unaffected by hiding.
- HomeKit exposure switches to `listVisible()` and re-reconciles when visibility
  changes, so hiding a bulb removes its accessory without a restart.
- The web UI hides hidden devices by default and offers a "Show hidden" toggle plus
  a per-device hide/unhide action, alongside the existing operable-only filter.
- New `device_visibility` SSE event carrying a single-device delta.

**Explicitly out of scope**

- Creating, renaming, deleting, or editing group membership from this framework;
  groups are managed in Zigbee2MQTT and read here.
- Source-neutral virtual devices spanning Zigbee, Shelly, and Nanoleaf.
- A name-based device resolver for automations (`devices.byName()`).
- Automatic hiding derived from group membership.

## Capabilities

### New Capabilities

- `zigbee-groups`: Discovery of Zigbee2MQTT groups from `bridge/groups`, their
  persistence, and their exposure as devices with intersected capabilities and
  derived state.
- `device-visibility`: A persisted, per-device hidden flag; which listing surfaces
  honour it and which deliberately do not; and how visibility changes propagate.

### Modified Capabilities

- `device-sources`: `DeviceDescriptor` gains `hidden`; `AggregateDeviceSource`
  gains `listVisible()` and stamps visibility onto descriptors; the source set
  grows from four to five.
- `device-registry`: A third bridge topic subscription and a third persistence
  slice for groups.
- `homekit`: Accessory exposure is driven by `listVisible()` and reacts to
  visibility changes at runtime.
- `http-server`: Device catalog responses carry `hidden`; new endpoints to hide and
  unhide a device.
- `realtime-events`: New `device_visibility` event category.
- `web-ui`: Hidden devices filtered by default with a reveal toggle and a
  hide/unhide action; group devices presented with their membership.

## Impact

- `src/core/zigbee/device-registry.ts` — new topic, group map, persistence slice.
- `src/types/zigbee/bridge.ts` — new `ZigbeeGroup` type.
- `src/core/device-sources/` — new `zigbee-group-source.ts`; `device-source.ts`
  descriptor shape; `aggregate.ts` gains a visibility dependency and
  `listVisible()`.
- `src/core/` — new device visibility manager, constructed between `StateManager`
  and `AggregateDeviceSource` in `createEngine()`.
- `src/core/services/homekit-sources/device-catalog-source.ts` — listing source and
  a visibility subscription.
- `src/core/http/http-server.ts` — visibility endpoints.
- `src/core/engine.ts` — SSE event emission and construction ordering.
- `src/core/web-ui/app/` — types, data store, device tiles, and device views.
- No new dependencies. No configuration changes; group persistence reuses
  `DEVICE_REGISTRY_PERSIST`.
