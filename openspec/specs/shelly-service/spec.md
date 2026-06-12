# Shelly Service

## Purpose

Controls Shelly Gen 2 devices (Plus, Pro series) over their local HTTP RPC API. Supports switch control (on/off/toggle), cover/shutter control (open/close/stop/position/calibrate), and device status queries (power metering, system info).

## Requirements

### Device Registration

`register(name, host)` MUST:
- Store the device in an internal `Map<string, ShellyDevice>`
- Normalize the host: strip scheme (`http://`, `https://`), strip trailing slashes
- Accept IPs, hostnames, mDNS names, URLs, custom ports (`host:port`)
- Log device registration

`registerMany(devices)` MUST:
- Accept `ShellyDevice[]` or `Record<string, string>`
- Call `register()` for each entry

### Switch Control

All switch methods operate on component `id: "0"`.

**`turnOn(name, toggleAfter?)`** — Turn switch on. Optional `toggleAfter` seconds auto-reverts.

**`turnOff(name, toggleAfter?)`** — Turn switch off. Optional `toggleAfter` seconds auto-reverts.

**`toggle(name)`** — Toggle the switch state.

All switch methods return `ShellySwitchSetResult` (contains the state BEFORE the command).

### Cover/Shutter Control

All cover methods operate on component `id: "0"`.

**`coverOpen(name, duration?)`** — Open the cover. Optional `duration` (seconds) for partial open.

**`coverClose(name, duration?)`** — Close the cover. Optional `duration` for partial close.

**`coverStop(name)`** — Stop cover movement.

**`coverGoToPosition(name, position)`** — Move to absolute position 0–100. Clamped to valid range. Logs warning if clamping occurs.

**`coverMoveRelative(name, offset)`** — Move by relative offset (-100 to 100). Clamped. Logs warning if clamping occurs.

**`getCoverStatus(name)`** — Get current cover status (position, state, power).

**`getCoverConfig(name)`** — Get cover configuration.

**`coverCalibrate(name)`** — Start calibration. Logs warning.

**`getCoverPosition(name)`** — Get position 0–100 (null if uncalibrated).

**`getCoverState(name)`** — Get current state enum.

### Status and Info

**`getStatus(name)`** — Get switch status including power metering (W, V, A, energy counters).

**`getConfig(name)`** — Get switch configuration.

**`getDeviceInfo(name)`** — Get device identification (model, firmware, MAC).

**`getSysStatus(name)`** — Get system status (uptime, RAM, available updates).

**`isOn(name)`** — Returns `true` if the switch output is on.

**`getPower(name)`** — Returns current power draw in Watts.

**`reboot(name, delayMs?)`** — Reboot the device. Optional delay in ms. Logs warning.

### RPC Communication

The system MUST construct RPC URLs as `http://{host}/rpc/{Method}?{params}`.

All RPC calls use HTTP GET with URL-encoded query parameters.

The system MUST throw an `Error` with a descriptive message on non-OK responses, including the device name, host, RPC method, and HTTP status.

### Error Handling

- Unregistered device → throw `Error`: `Shelly device "X" is not registered. Call shelly.register("X", "<ip>") first.`
- HTTP failure → throw `Error`: `Shelly RPC {method} failed for "{name}" ({host}): HTTP {status}`
- All operational errors are logged via the child logger

### Types

The service uses typed response interfaces from `src/types/shelly.ts`:
- `ShellySwitchStatus` — output, apower, voltage, current, energy counters
- `ShellySwitchConfig` — name, initial state, auto-on/off timers
- `ShellySwitchSetResult` — state before command
- `ShellyCoverStatus` — state, current_pos, power, source
- `ShellyCoverConfig` — name, obverse/reverse limits, positioning
- `ShellyCoverState` — enum: "open", "closed", "opening", "closing", "stopped", "calibrating"
- `ShellyDeviceInfo` — model, fw_id, mac, gen
- `ShellySysStatus` — uptime, ram, fs, available_updates
- `ShellyTemperature` — tC, tF
