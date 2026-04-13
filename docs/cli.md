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

# Add a remote target
ts-ha config add prod 192.168.1.100:8080 my-secret-token

# Switch to a target
ts-ha config use prod

# Remove a target
ts-ha config remove prod
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
# MQTT trigger
ts-ha a trigger motion-light '{"type":"mqtt","topic":"zigbee2mqtt/sensor","payload":{"occupancy":true}}'

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

## Dashboard

Interactive terminal dashboard (TUI) showing all four tabs in real time:

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
| State | `3` | List with inline edit, add, delete |
| Logs | `4` | Scrollable viewer with level + automation filter |

### Keyboard shortcuts

| Key | Action |
|---|---|
| `1`–`4` | Switch tabs |
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
