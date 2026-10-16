# @ts-ha/cli

## 0.2.8

### Patch Changes

- Updated dependencies [7c99c17]
  - @ts-ha/web-ui@0.11.0

## 0.2.7

### Patch Changes

- e7f5a0b: Internal cleanup with no public API or behaviour change.
  
  **`@ts-ha/core`** — the superseded per-family HomeKit factories
  (`homekit-shelly-factory.ts`, `homekit-state-factory.ts`, and the dead
  `createAccessory` path in `homekit-accessory-factory.ts`) are deleted; the live
  `createAccessoryFromDescriptor` and its frozen UUID seeds are unchanged.
  `StateManager` and `DeviceStateStore` now share the JSON-file persistence
  primitives (`state/json-persistence.ts`); log output is unchanged.
  
  **`@ts-ha/web-ui`** — unused API wrappers and `ui/` barrel re-exports and stale
  `eslint-disable` comments are removed; the shared text-input treatment moves to
  `ui/input-classes.ts`; `app/utils/` folds into `app/lib/`. No rendered output or
  asset change.
  
  **`@ts-ha/cli`** — module-local-only symbols lose their `export` (the CLI's
  public surface is unchanged), and `levelName` / `parseCommandValue` gain a
  single definition.
  
  **All packages** — source and test comments are shortened to a short
  description of what each declaration does, dropping internal design/task/spec
  references and long rationale. Comment-only: no code, type, or emitted value
  changes (comments are still emitted into `dist`, so the published files change
  textually but no consumer behaviour does).
- Updated dependencies [3e8b7a2]
- Updated dependencies [e7f5a0b]
  - @ts-ha/shared@0.8.0
  - @ts-ha/core@0.7.0
  - @ts-ha/web-ui@0.10.0

## 0.2.6

### Patch Changes

- Updated dependencies [2bb0b82]
- Updated dependencies [76f076d]
- Updated dependencies [e311100]
  - @ts-ha/shared@0.7.0
  - @ts-ha/core@0.6.0
  - @ts-ha/web-ui@0.9.0

## 0.2.5

### Patch Changes

- Updated dependencies [d9d2f64]
  - @ts-ha/shared@0.6.0
  - @ts-ha/web-ui@0.8.0
  - @ts-ha/core@0.5.1

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
