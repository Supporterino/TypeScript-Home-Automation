# Nanoleaf Service

## Purpose

Controls Nanoleaf devices (Light Panels, Canvas, Shapes, Elements, Lines) over their local HTTP OpenAPI. Supports power control, brightness, color (hue/saturation, color temperature), effects, and device info queries.

## Requirements

### Requirement: Device Registration

`register(name, config)` MUST:
- Accept `NanoleafDeviceConfig`: `{ host: string; token: string; port?: number }`
- Normalize host: strip scheme, trailing slashes, default port 16021
- Construct base URL: `http://{host}:{port}/api/v1/{token}`
- Log device registration
- Because the token is part of the URL path, the system MUST rely on the shared HTTP client's log sanitization to mask token-like path segments so the token is not written to logs in plaintext (see `http-client` capability). The service MUST NOT log the full base URL (including token) at info level.

#### Scenario: Token is not leaked in logs

- **WHEN** a Nanoleaf request is made and the HTTP client logs the request
- **THEN** the token embedded in the URL path is masked in the log output

`registerMany(devices: Record<string, NanoleafDeviceConfig>)` MUST:
- Call `register()` for each entry

### Requirement: Response Validation

Before dereferencing fields of a parsed Nanoleaf response, the system MUST validate that the response body is a non-null object with the expected shape for the operation (e.g. a state query returns a `state` object with `on.value`, `brightness`, etc.). If the body is missing or malformed, the system MUST throw a descriptive `Error` (including the device name) rather than dereferencing `undefined` (which would throw an opaque `TypeError`).

#### Scenario: Malformed state response is rejected

- **WHEN** a Nanoleaf device returns a response lacking the expected `state`/`on` structure
- **THEN** the system throws a descriptive error naming the device rather than throwing an opaque `TypeError`

#### Scenario: toggle handles missing state safely

- **WHEN** `toggle()` reads a state response whose `on.value` is absent
- **THEN** the system throws a descriptive error instead of a `cannot read property 'value' of undefined` crash

### Requirement: Power Control

**`turnOn(name)`** — Set `on.value = true`

**`turnOff(name)`** — Set `on.value = false`

**`toggle(name)`** — Read current state, invert `on.value`

### Requirement: Brightness

**`setBrightness(name, value, duration?)`** — Set brightness 0–100. Optional duration (seconds) for smooth transition. Clamped to valid range with warning.

### Requirement: Color

**`setColor(name, hue, saturation)`** — Set hue (0–360) and saturation (0–100). Both clamped.

**`setColorTemp(name, value)`** — Set color temperature in Kelvin (1200–6500). Clamped.

### Requirement: State

**`setState(name, state: NanoleafStateSet)`** — Set arbitrary state properties via PUT `/state`.

**`getState(name)`** — Get full device state including power, brightness, hue, sat, ct, colorMode.

### Requirement: Effects

**`getEffects(name)`** — List available effect names. Returns `string[]`.

**`getCurrentEffect(name)`** — Get currently active effect name.

**`setEffect(name, effectName)`** — Activate an effect by name.

### Requirement: Device Info

**`getDeviceInfo(name)`** — Full device info (name, serialNo, manufacturer, model, firmware, effects list, panelLayout).

**`getPanelLayout(name)`** — Panel layout with positions and IDs of all panels.

**`identify(name)`** — Flash the panels for physical identification.

### Requirement: Communication

All requests use the Nanoleaf OpenAPI:
- **State changes**: `PUT /api/v1/{token}/state`
- **Effect selection**: `PUT /api/v1/{token}/effects`
- **Data queries**: `GET /api/v1/{token}/*`

The system MUST throw `Error` on non-OK responses with device name, path, and HTTP status.

### Requirement: Error Handling

- Unregistered device → throw: `Nanoleaf device "X" is not registered. Call nanoleaf.register("X", { host, token }) first.`
- HTTP failure → throw with device name, path, and status

### Requirement: Types

The service uses typed interfaces from `src/types/nanoleaf.ts`:
- `NanoleafState` — on, brightness, hue, sat, ct, colorMode
- `NanoleafStateSet` — Partial state for updates (all fields optional with value/duration)
- `NanoleafDeviceInfo` — name, serialNo, manufacturer, model, firmware, effects, panelLayout, state
- `NanoleafPanelLayout` — numPanels, sideLength, positionData
- `NanoleafEffect` — name, animation type, palette, etc.
- `NanoleafColorMode` — "effect" | "ct" | "hs"
