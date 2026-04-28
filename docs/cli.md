# CLI Reference

The `ts-ha` CLI inspects and manages a running engine instance via its debug API. It is included as a binary in the `ts-home-automation` package.

```bash
ts-ha [options] <command> <subcommand> [args]
```

---

## Global options

| Option | Description |
|---|---|
| `--host <host:port>` | Override the target host (default: from saved config) |
| `--token <token>` | Override the auth token (default: from saved config) |
| `--json` | Output raw JSON instead of formatted text |
| `--help` | Show help |

---

## Saved targets

Target configurations (host + token pairs) are stored in `~/.config/ts-ha/config.json`. A `local` target pointing to `localhost:8080` is created by default.

```bash
# List all saved targets (* = active)
ts-ha config list
ts-ha c list                        # short alias

# Add a remote target
ts-ha config add prod 192.168.1.100:8080 my-secret-token

# Switch to a target
ts-ha config use prod

# Remove a target
ts-ha config remove prod
ts-ha config rm prod                # rm / del also accepted
```

### Override for a single command

```bash
ts-ha --host 192.168.1.200:8080 --token secret state list
```

---

## Automations

```bash
# List all registered automations
ts-ha automations list
ts-ha a ls                          # short alias

# Get details for a specific automation
ts-ha automations get motion-light-schedule
```

Example output:

```
NAME                        TRIGGERS
motion-light-schedule       mqtt(2)
contact-sensor-alarm        mqtt(3)
shortcut-button-timer       mqtt(1)

3 automation(s)
```

---

## Trigger

Manually fire an automation with a synthetic context — useful for testing:

```bash
# MQTT trigger (trigger / t both accepted)
ts-ha a trigger motion-light '{"type":"mqtt","topic":"zigbee2mqtt/sensor","payload":{"occupancy":true}}'
ts-ha a t motion-light '{"type":"mqtt","topic":"zigbee2mqtt/sensor","payload":{"occupancy":true}}'

# Cron trigger (defaults filled automatically)
ts-ha a trigger scheduled-report '{"type":"cron"}'

# State trigger
ts-ha a trigger night-reaction '{"type":"state","key":"night_mode","newValue":true,"oldValue":false}'

# Webhook trigger
ts-ha a trigger deploy-hook '{"type":"webhook","method":"POST","body":{"service":"api"}}'
```

---

## Logs

```bash
# Last 50 entries (default)
ts-ha logs

# Filter by automation name
ts-ha logs --automation motion-light-schedule

# Filter by minimum level
ts-ha logs --level error

# Combine filters
ts-ha logs --automation contact-sensor-alarm --level warn --limit 20

# JSON output for scripting
ts-ha --json logs | jq '.entries[] | select(.msg | contains("ALARM"))'
```

Example output:

```
07:04:17.033 INFO  [motion-light-schedule] Motion detected
07:04:17.035 INFO  [motion-light-schedule] Turning on lamps
07:09:17.040 INFO  [motion-light-schedule] No recent motion, turning off
```

### Follow mode

Stream new log entries continuously (like `tail -f`):

```bash
ts-ha logs -f
ts-ha logs --follow --automation contact-sensor-alarm
ts-ha logs -f --level error --interval 1       # poll every 1s
ts-ha --json logs -f | jq .msg                 # JSON per line
```

Press `Ctrl+C` to stop.

---

## State

```bash
# List all state keys and values
ts-ha state list
ts-ha s ls                          # short alias

# Read a single value
ts-ha state get night_mode

# Write a value (JSON-parsed: booleans, numbers, strings, objects)
ts-ha state set night_mode true
ts-ha state set motion_count 42
ts-ha state set config '{"threshold": 30}'

# Delete a key
ts-ha state delete temporary_flag
ts-ha s rm old_key                  # short alias
```

Setting state via the CLI fires `state` triggers in the running engine — it is equivalent to calling `this.state.set()` inside an automation.

---

## Devices

Inspect Zigbee2MQTT devices tracked by the device registry. Requires `DEVICE_REGISTRY_ENABLED=true` on the running engine.

```bash
# List all tracked devices
ts-ha devices list
ts-ha dv ls                          # short alias

# Get full detail for a single device
ts-ha devices get living_room_bulb
ts-ha dv get living_room_bulb        # short alias
```

Example output for `ts-ha devices list`:

```
NICE NAME                TYPE       INTERVIEW    STATE KEYS
Living Room Lamp         Router     SUCCESSFUL   8
Kitchen Motion Sensor    EndDevice  SUCCESSFUL   3
Hallway Plug             Router     SUCCESSFUL   5

3 devices
```

Example output for `ts-ha devices get living_room_bulb`:

```
Nice Name:      Living Room Lamp
Friendly:       living_room_bulb
IEEE:           0x00158d0001ab1234
Type:           Router
Supported:      true
Interview:      SUCCESSFUL
Power:          Mains
Model:          LCA001  (Philips, Hue White and color ambiance)

State (8 keys):
  state                   ON
  brightness              200
  color_temp              4000
  color_mode              color_temp
  linkquality             92
  update_available        false
```

When the registry is disabled, both commands print a clear message and exit with code 1. Use `--json` to output raw JSON for scripting.

---

## Dashboard

Interactive terminal dashboard (TUI) showing all tabs in real time:

```bash
ts-ha dashboard              # 5s refresh interval
ts-ha d                      # short alias
ts-ha d --interval 2         # refresh every 2s
```

### Tabs

| Tab | Key | Features |
|---|---|---|
| Overview | `1` | Engine/MQTT status, uptime, automation + state summary, recent logs |
| Automations | `2` | List with expand (trigger details) and manual trigger |
| Devices | `3` | Tracked Zigbee devices — expand for state + metadata (`DEVICE_REGISTRY_ENABLED=true`) |
| State | `4` | List with inline edit, add, delete |
| Logs | `5` | Scrollable viewer with level + automation filter |

### Keyboard shortcuts

| Key | Action |
|---|---|
| `1`–`5` | Switch tabs |
| `q` / `Esc` | Quit |
| `r` | Force refresh |
| `?` | Toggle help modal |
| `Enter` | Expand row / edit state value |
| `t` | Trigger selected automation |
| `n` / `d` | New / delete state key |
| `↑` / `↓` | Navigate log entries |
| `l` | Cycle log level filter |
| `f` | Free-text filter |
| `c` | Clear log filters |

---

## Nanoleaf

Pair a Nanoleaf device to generate an auth token for use with the `NanoleafService`:

```bash
ts-ha nanoleaf pair 192.168.1.60          # by IP address
ts-ha nanoleaf pair nanoleaf-panels.local  # by mDNS hostname
```

1. Run the command — it will prompt you to press and hold the power button on the Nanoleaf device until the LEDs start flashing, then press Enter
2. The command retries up to 5 times with a 2-second delay between attempts
3. On success it prints the auth token and a ready-to-use registration snippet:

```ts
const nanoleaf = engine.services.getOrThrow("nanoleaf");
nanoleaf.register("panels", {
  host: "192.168.1.60",
  token: "<printed-token>",
});
```

Save the token in your `.env` or config file — it does not expire.

---

## Authentication

When `HTTP_TOKEN` is set on the engine, the CLI must supply the same token:

```bash
# Save token with the target
ts-ha config add prod 192.168.1.100:8080 my-secret-token
ts-ha config use prod

# Or pass it per command
ts-ha --host 192.168.1.100:8080 --token my-secret-token state list
```

Health probe endpoints (`/healthz`, `/readyz`) are always unauthenticated.
