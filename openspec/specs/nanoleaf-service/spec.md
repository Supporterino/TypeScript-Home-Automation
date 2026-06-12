# Nanoleaf Service

## Purpose

Controls Nanoleaf devices (Light Panels, Canvas, Shapes, Elements, Lines) over their local HTTP OpenAPI. Supports power control, brightness, color (hue/saturation, color temperature), effects, and device info queries.

## Requirements

### Device Registration

`register(name, config)` MUST:
- Accept `NanoleafDeviceConfig`: `{ host: string; token: string; port?: number }`
- Normalize host: strip scheme, trailing slashes, default port 16021
- Construct base URL: `http://{host}:{port}/api/v1/{token}`
- Log device registration

`registerMany(devices: Record<string, NanoleafDeviceConfig>)` MUST:
- Call `register()` for each entry

### Power Control

**`turnOn(name)`** — Set `on.value = true`

**`turnOff(name)`** — Set `on.value = false`

**`toggle(name)`** — Read current state, invert `on.value`

### Brightness

**`setBrightness(name, value, duration?)`** — Set brightness 0–100. Optional duration (seconds) for smooth transition. Clamped to valid range with warning.

### Color

**`setColor(name, hue, saturation)`** — Set hue (0–360) and saturation (0–100). Both clamped.

**`setColorTemp(name, value)`** — Set color temperature in Kelvin (1200–6500). Clamped.

### State

**`setState(name, state: NanoleafStateSet)`** — Set arbitrary state properties via PUT `/state`.

**`getState(name)`** — Get full device state including power, brightness, hue, sat, ct, colorMode.

### Effects

**`getEffects(name)`** — List available effect names. Returns `string[]`.

**`getCurrentEffect(name)`** — Get currently active effect name.

**`setEffect(name, effectName)`** — Activate an effect by name.

### Device Info

**`getDeviceInfo(name)`** — Full device info (name, serialNo, manufacturer, model, firmware, effects list, panelLayout).

**`getPanelLayout(name)`** — Panel layout with positions and IDs of all panels.

**`identify(name)`** — Flash the panels for physical identification.

### Communication

All requests use the Nanoleaf OpenAPI:
- **State changes**: `PUT /api/v1/{token}/state`
- **Effect selection**: `PUT /api/v1/{token}/effects`
- **Data queries**: `GET /api/v1/{token}/*`

The system MUST throw `Error` on non-OK responses with device name, path, and HTTP status.

### Error Handling

- Unregistered device → throw: `Nanoleaf device "X" is not registered. Call nanoleaf.register("X", { host, token }) first.`
- HTTP failure → throw with device name, path, and status

### Types

The service uses typed interfaces from `src/types/nanoleaf.ts`:
- `NanoleafState` — on, brightness, hue, sat, ct, colorMode
- `NanoleafStateSet` — Partial state for updates (all fields optional with value/duration)
- `NanoleafDeviceInfo` — name, serialNo, manufacturer, model, firmware, effects, panelLayout, state
- `NanoleafPanelLayout` — numPanels, sideLength, positionData
- `NanoleafEffect` — name, animation type, palette, etc.
- `NanoleafColorMode` — "effect" | "ct" | "hs"
