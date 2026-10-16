/**
 * CLI help text, extracted so it can be asserted without running the dispatcher.
 */
export const USAGE = `
ts-ha — CLI for managing a running TypeScript Home Automation engine

Usage:
  ts-ha [options] <command> <subcommand> [args]

Commands:
  run [--automations <dir>]           Run a local engine (default: ./automations)
  automations                         List all registered automations
  automations get <name>              Get details for a specific automation
  automations trigger <name> <ctx>    Manually trigger an automation
  automations enable <name>           Enable a disabled automation
  automations disable <name>          Disable an automation (full stop)
  automations source <name>           Print the automation's source file
  automations history <name>          Show the automation's execution history
  automations relationships <name>    Show declared and observed relationships

  devices                             List all devices known to the engine's sources
  devices get <qualifiedId>           Get full detail for a single device (or name substring)
  devices command <device> <prop> <val>  Issue a command to one device
  devices hide <device>               Hide a device
  devices unhide <device>             Unhide a device
  devices assign <device> <roomId>    Assign a device to a room
  devices unassign <device>           Clear a device's room assignment

  rooms                               List rooms with their members
  rooms get <id>                      Show one room's membership
  rooms create <name>                 Create a room
  rooms rename <id> <name>            Rename a room
  rooms rm <id>                       Delete a room
  rooms command <id> <prop> <val>     Batch-command a room's capable members
  rooms assign <device> <roomId>      Assign a device to a room
  rooms unassign <device>             Clear a device's room assignment

  walls                               List wall profiles
  walls get <name>                    Print a wall profile's configuration
  walls create <name> <config>        Create a wall profile (JSON config)
  walls update <name> <config>        Update a wall profile (JSON config)
  walls rm <name>                     Delete a wall profile

  energy                              Show power and per-device energy breakdown
  weather                             Show current conditions and daily forecast

  state                               List all state keys and values
  state get <key>                     Get a single state value
  state set <key> <value>             Set a state value (JSON-parsed)
  state delete <key>                  Delete a state key

  logs [options]                      View recent log entries
    --automation <name>               Filter by automation name
    --level <level>                   Filter by min level (trace/debug/info/warn/error/fatal)
    --limit <n>                       Number of entries (default: 50)
    -f, --follow                      Stream new log entries continuously

  dashboard                            Live status dashboard
    --interval <seconds>              Refresh interval (default: 5)
    tabs: Overview, Automations, Devices, Rooms, State, Logs, HomeKit

  config list                         List saved targets
  config add <name> <host> [token]    Add or update a target
  config use <name>                   Set the active target
  config remove <name>                Remove a saved target

Options:
  --host <host:port>                  Override target host (default: from active config)
  --token <token>                     Override auth token
  --automations <dir>                 Automations directory for "run" (default: ./automations)
  --json                              Output raw JSON
  --help                              Show this help message

Short aliases:
  a = automations, dv = devices, s = state, l = logs, d = dashboard, c = config
  ls = list, rm/del = delete

Trigger examples:
  ts-ha a trigger my-auto '{"type":"mqtt","topic":"z2m/sensor","payload":{"occupancy":true}}'
  ts-ha a trigger my-auto '{"type":"cron"}'
  ts-ha a trigger my-auto '{"type":"state","key":"night_mode","newValue":true}'

Examples:
  ts-ha state list
  ts-ha state set night_mode true
  ts-ha automations get motion-light-schedule
  ts-ha automations history motion-light-schedule
  ts-ha automations relationships motion-light-schedule
  ts-ha devices command kitchen-light state ON
  ts-ha devices hide zigbee:0x00124b0024c0ffee
  ts-ha rooms create "Living Room"
  ts-ha rooms command living state OFF
  ts-ha rooms assign shelly:tv living
  ts-ha walls ls
  ts-ha energy
  ts-ha weather
  ts-ha logs --automation contact-sensor-alarm --level warn
  ts-ha config add prod 192.168.1.100:8080 my-secret-token
  ts-ha --json a ls
`.trim();
