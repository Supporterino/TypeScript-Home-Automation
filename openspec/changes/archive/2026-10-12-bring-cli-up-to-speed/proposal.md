## Why

The engine was rebuilt around source-neutral device sources, rooms, walls,
energy, weather, execution history, and a realtime event stream. The web UI
tracks all of it; the CLI does not. The CLI still speaks the pre-redesign,
Zigbee-only `/api/devices` API, which the engine now answers with `410 Gone` —
so `ts-ha devices` is broken and the dashboard's Devices tab silently lies
("No devices tracked yet."). The existing `cli` spec records this degradation as
deliberate and defers realignment to a follow-up. This change is that follow-up.

## What Changes

- **Breaks**: remove the legacy wire DTOs `SerializedDevice`, `DeviceInfo`, and
  `AutomationInfo` from `@ts-ha/shared`, once the CLI stops consuming them.
- **Repairs**: migrate `DebugClient` and the dashboard from the removed Zigbee-only
  device endpoints to the unified `/api/device-catalog` API, addressed by
  `qualifiedId` (with a display-name fallback for `devices get`).
- **Adds device control**: `devices command <qid> <property> <value>`,
  `devices hide|unhide`, `devices assign|unassign`, and inline controls in the
  dashboard's Devices tab projected from each device's `Capability` vocabulary.
- **Adds rooms**: `rooms ls|get|create|rename|rm|command|assign|unassign` and a
  dashboard Rooms tab with batch toggling.
- **Adds read surfaces**: `automations history|relationships`, `energy show`,
  `weather show`.
- **Adds wall administration**: `walls ls|get|create|update|rm` (admin only — no
  terminal wall rendering).
- **Adds a live dashboard**: replaces interval-only polling with a
  snapshot-plus-stream model over `GET /api/events` (fetch-streaming, since Bearer
  auth cannot ride an `EventSource`), with `fell_behind` triggering a re-snapshot
  and a slow poll retained for the non-streamed HomeKit, energy, and weather data.

## Capabilities

### New Capabilities

<!-- None: all behavior lands in the existing `cli` capability. -->

### Modified Capabilities

- `cli`: replaces the specified device degradation with the unified device-catalog
  surface; adds device/room control, history/relationships, energy/weather, wall
  administration, and a live (stream-backed) dashboard; retires the legacy-DTO
  contract.
- `packaging`: the shared-contract inventory no longer owns `SerializedDevice`,
  `DeviceInfo`, or `AutomationInfo`; the CLI imports `DeviceDescriptor`,
  `Automation`, and the capability vocabulary instead.

## Impact

- **`@ts-ha/cli`**: `client.ts` (new endpoints + SSE reader), `commands/*`
  (devices, new rooms/energy/weather/walls/automations subcommands), `index.ts`
  (usage + dispatch), `commands/dashboard.tsx` and `components/*` (catalog-shaped
  device data, new tabs, inline controls, stream wiring), `format.ts` (descriptor
  formatting).
- **`@ts-ha/shared`**: `wire.ts` loses the three legacy DTOs (a removal — the only
  remaining consumers are the CLI).
- **No engine changes**: every endpoint the CLI needs already exists and is
  consumed by the web UI.
- **Tests**: CLI unit tests for the new client methods, command formatting, and
  SSE parsing; verification gate `bun run typecheck && bun run check && bun run test`.
