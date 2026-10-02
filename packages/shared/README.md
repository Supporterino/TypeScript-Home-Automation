# @ts-ha/shared

Domain and wire contracts shared across the TypeScript Home Automation
workspace: capability vocabulary, device descriptors and observations, trigger
context, execution records, room shapes, log entries, stream events, contract
constants, and the pure capability helpers.

This package contains no engine, HTTP, or framework runtime. It is safe to
import from a browser bundle.

## Type subpaths

The type subpaths formerly exported from the root package now resolve from
`@ts-ha/shared`:

| Former root subpath | Replacement (`@ts-ha/shared/...`) |
|---|---|
| `types` | `types` (all Zigbee2MQTT types) |
| `types/shelly` | `types/shelly` |
| `types/nanoleaf` | `types/nanoleaf` |
| `types/weather` | `types/weather` |
| `types/notification` | `types/notification` |

The cross-cutting contracts (capability vocabulary, device descriptors and
observations, trigger context, execution records, room shapes, log entries,
the realtime event union, and the wire DTOs) are re-exported from the
`@ts-ha/shared` root. The Zigbee2MQTT `exposes` mapper (`mapZ2MExpose`,
`mapZ2MExposes`) is source-specific and stays in `@ts-ha/core`.

Part of the [TypeScript Home Automation](https://github.com/Supporterino/TypeScript-Home-Automation)
workspace. Licensed under GPL-3.0-only.
