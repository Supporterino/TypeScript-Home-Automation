---
"@ts-ha/core": patch
"@ts-ha/web-ui": patch
"@ts-ha/cli": patch
---

Internal cleanup with no public API or behaviour change.

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
