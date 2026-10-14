# @ts-ha/cli

## 0.2.4

### Patch Changes

- Updated dependencies [1293ec4]
- Updated dependencies [a2ac4ae]
- Updated dependencies [a2ac4ae]
  - @ts-ha/core@0.5.0
  - @ts-ha/shared@0.5.0
  - @ts-ha/web-ui@0.7.0

## 0.2.3

### Patch Changes

- Updated dependencies [7c06d1f]
- Updated dependencies [5371c54]
  - @ts-ha/core@0.4.0
  - @ts-ha/web-ui@0.6.0

## 0.2.2

### Patch Changes

- Updated dependencies [d939550]
  - @ts-ha/web-ui@0.5.0

## 0.2.1

### Patch Changes

- Updated dependencies [62407e3]
  - @ts-ha/web-ui@0.4.0

## 0.2.0

### Minor Changes

- 63816ad: Bring the CLI up to the redesigned engine: the unified device catalog, rooms,
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

### Patch Changes

- Updated dependencies [63816ad]
  - @ts-ha/shared@0.4.0
  - @ts-ha/core@0.3.1
  - @ts-ha/web-ui@0.3.1

## 0.1.2

### Patch Changes

- Updated dependencies [548a704]
- Updated dependencies [62a39e2]
  - @ts-ha/core@0.3.0
  - @ts-ha/shared@0.3.0
  - @ts-ha/web-ui@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [dc4afe7]
  - @ts-ha/core@0.2.0
  - @ts-ha/shared@0.2.0
  - @ts-ha/web-ui@0.2.0
