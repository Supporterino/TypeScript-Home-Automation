---
"@ts-ha/cli": minor
"@ts-ha/shared": minor
---

Bring the CLI up to the redesigned engine: the unified device catalog, rooms,
energy, weather, wall administration, automation history/relationships, and a
live stream-backed dashboard.

- `@ts-ha/shared`: **breaking removal** of the legacy Zigbee-only wire DTOs
  `SerializedDevice`, `DeviceInfo`, and `AutomationInfo` — they had no consumer
  once the CLI stopped addressing the removed `/api/devices` endpoints
  (pre-1.0; the CLI now consumes `DeviceDescriptor`, `Automation`, and the
  capability vocabulary)
- `@ts-ha/cli`: migrates `DebugClient` and the dashboard to
  `/api/device-catalog` (addressed by `qualifiedId`, with a case-insensitive
  display-name fallback), adds device/room control, `automations
  history|relationships`, `energy`, `weather`, and `walls` administration, and
  replaces interval-only polling with a snapshot-plus-stream model over
  `GET /api/events` (re-snapshotting on `fell_behind`)
