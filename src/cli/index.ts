#!/usr/bin/env bun

import { DebugClient } from "./client.js";
import { getAutomation, listAutomations, triggerAutomation } from "./commands/automations.js";
import { addConfig, listConfig, removeConfig, switchConfig } from "./commands/config.js";
import { runDashboard } from "./commands/dashboard.js";
import { getLogs } from "./commands/logs.js";
import { pairNanoleaf } from "./commands/nanoleaf.js";
import { runNew } from "./commands/new.js";
import { deleteState, getState, listState, setState } from "./commands/state.js";
import { getActiveTarget } from "./config.js";

const USAGE = `
ts-ha — CLI for managing a running ts-home-automation instance

Usage:
  ts-ha [options] <command> <subcommand> [args]

Commands:
  automations list                    List all registered automations
  automations get <name>              Get details for a specific automation
  automations trigger <name> <ctx>    Manually trigger an automation

  state list                          List all state keys and values
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

  config list                         List saved targets
  config add <name> <host> [token]    Add or update a target
  config use <name>                   Set the active target
  config remove <name>                Remove a saved target

Options:
  --host <host:port>                  Override target host (default: from active config)
  --token <token>                     Override auth token
  --json                              Output raw JSON
  --help                              Show this help message

Short aliases:
  a = automations, s = state, l = logs, d = dashboard, c = config
  ls = list, rm/del = delete

Trigger examples:
  ts-ha a trigger my-auto '{"type":"mqtt","topic":"z2m/sensor","payload":{"occupancy":true}}'
  ts-ha a trigger my-auto '{"type":"cron"}'
  ts-ha a trigger my-auto '{"type":"state","key":"night_mode","newValue":true}'

Examples:
  ts-ha state list
  ts-ha state set night_mode true
  ts-ha automations get motion-light-schedule
  ts-ha logs --automation contact-sensor-alarm --level warn
  ts-ha config add prod 192.168.1.100:8080 my-secret-token
  ts-ha --json a ls
`.trim();

interface ParsedArgs {
  host: string | undefined;
  token: string | undefined;
  json: boolean;
  command: string;
  subcommand: string;
  args: string[];
  logAutomation: string | undefined;
  logLevel: string | undefined;
  logLimit: number | undefined;
  logFollow: boolean;
  interval: number;
  // Scaffold flags
  trigger: string | undefined;
  topic: string | undefined;
  expression: string | undefined;
  stateKey: string | undefined;
  webhookPath: string | undefined;
  filter: string | undefined;
  remote: string | undefined;
  sensor: string | undefined;
  light: string | undefined;
  lux: string | undefined;
  force: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  let host: string | undefined;
  let token: string | undefined;
  let json = false;
  let logAutomation: string | undefined;
  let logLevel: string | undefined;
  let logLimit: number | undefined;
  let logFollow = false;
  let interval = 5;
  let trigger: string | undefined;
  let topic: string | undefined;
  let expression: string | undefined;
  let stateKey: string | undefined;
  let webhookPath: string | undefined;
  let filter: string | undefined;
  let remote: string | undefined;
  let sensor: string | undefined;
  let light: string | undefined;
  let lux: string | undefined;
  let force = false;
  const positional: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--host") {
      host = argv[++i];
    } else if (arg === "--token") {
      token = argv[++i];
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--automation") {
      logAutomation = argv[++i];
    } else if (arg === "--level") {
      logLevel = argv[++i];
    } else if (arg === "--limit") {
      logLimit = Number.parseInt(argv[++i], 10);
    } else if (arg === "--follow" || arg === "-f") {
      logFollow = true;
    } else if (arg === "--interval") {
      interval = Number.parseInt(argv[++i], 10);
    } else if (arg === "--trigger") {
      trigger = argv[++i];
    } else if (arg === "--topic") {
      topic = argv[++i];
    } else if (arg === "--expression") {
      expression = argv[++i];
    } else if (arg === "--key") {
      stateKey = argv[++i];
    } else if (arg === "--path") {
      webhookPath = argv[++i];
    } else if (arg === "--filter") {
      filter = argv[++i];
    } else if (arg === "--remote") {
      remote = argv[++i];
    } else if (arg === "--sensor") {
      sensor = argv[++i];
    } else if (arg === "--light") {
      light = argv[++i];
    } else if (arg === "--lux") {
      lux = argv[++i];
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      console.error('Run "ts-ha --help" for usage.');
      process.exit(1);
    } else {
      positional.push(arg);
    }
    i++;
  }

  const [command = "", subcommand = "", ...args] = positional;
  return {
    host,
    token,
    json,
    command,
    subcommand,
    args,
    logAutomation,
    logLevel,
    logLimit,
    logFollow,
    interval,
    trigger,
    topic,
    expression,
    stateKey,
    webhookPath,
    filter,
    remote,
    sensor,
    light,
    lux,
    force,
  };
}

async function resolveClient(
  hostOverride: string | undefined,
  tokenOverride: string | undefined,
): Promise<DebugClient> {
  if (hostOverride) {
    return new DebugClient(hostOverride, tokenOverride);
  }

  const target = await getActiveTarget();
  return new DebugClient(target.host, tokenOverride ?? (target.token || undefined));
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const { host, token, json, command, subcommand, args } = parsed;

  if (!command) {
    console.log(USAGE);
    process.exit(0);
  }

  try {
    // Config commands don't need a client
    if (command === "config" || command === "c") {
      if (subcommand === "list" || subcommand === "ls") {
        await listConfig(json);
      } else if (subcommand === "add") {
        const name = args[0];
        const targetHost = args[1];
        const targetToken = args[2] ?? "";
        if (!name || !targetHost) {
          console.error("Usage: ts-ha config add <name> <host> [token]");
          process.exit(1);
        }
        await addConfig(name, targetHost, targetToken);
      } else if (subcommand === "use") {
        const name = args[0];
        if (!name) {
          console.error("Usage: ts-ha config use <name>");
          process.exit(1);
        }
        await switchConfig(name);
      } else if (subcommand === "remove" || subcommand === "rm" || subcommand === "del") {
        const name = args[0];
        if (!name) {
          console.error("Usage: ts-ha config remove <name>");
          process.exit(1);
        }
        await removeConfig(name);
      } else {
        console.error(`Unknown subcommand: config ${subcommand}`);
        console.error("Available: list, add, use, remove");
        process.exit(1);
      }
      return;
    }

    // Scaffold command doesn't need a client
    if (command === "new" || command === "n") {
      const scaffoldType = subcommand;
      const scaffoldName = args[0];
      if (!scaffoldType || !scaffoldName) {
        console.error("Usage: ts-ha new <type> <name>");
        console.error("Types: automation, aqara-h1, styrbar, rodret, motion-light");
        process.exit(1);
      }
      await runNew(scaffoldType, scaffoldName, {
        trigger: parsed.trigger,
        topic: parsed.topic,
        expression: parsed.expression,
        key: parsed.stateKey,
        path: parsed.webhookPath,
        filter: parsed.filter,
        remote: parsed.remote,
        sensor: parsed.sensor,
        light: parsed.light,
        lux: parsed.lux,
        force: parsed.force,
      });
      return;
    }

    // Nanoleaf pairing doesn't need a client
    if (command === "nanoleaf") {
      if (subcommand === "pair") {
        const deviceHost = args[0];
        if (!deviceHost) {
          console.error("Usage: ts-ha nanoleaf pair <host>");
          process.exit(1);
        }
        await pairNanoleaf(deviceHost);
      } else {
        console.error(`Unknown subcommand: nanoleaf ${subcommand}`);
        console.error("Available: pair");
        process.exit(1);
      }
      return;
    }

    // All other commands need a client
    const client = await resolveClient(host, token);

    if (command === "automations" || command === "a") {
      if (subcommand === "list" || subcommand === "ls") {
        await listAutomations(client, json);
      } else if (subcommand === "get") {
        const name = args[0];
        if (!name) {
          console.error("Usage: ts-ha automations get <name>");
          process.exit(1);
        }
        await getAutomation(client, name, json);
      } else if (subcommand === "trigger" || subcommand === "t") {
        const name = args[0];
        const contextJson = args[1];
        if (!name || !contextJson) {
          console.error("Usage: ts-ha automations trigger <name> '<json context>'");
          console.error("");
          console.error("Examples:");
          console.error(
            '  ts-ha a trigger my-auto \'{"type":"mqtt","topic":"zigbee2mqtt/sensor","payload":{"occupancy":true}}\'',
          );
          console.error('  ts-ha a trigger my-auto \'{"type":"cron"}\'');
          console.error(
            '  ts-ha a trigger my-auto \'{"type":"state","key":"night_mode","newValue":true}\'',
          );
          process.exit(1);
        }
        await triggerAutomation(client, name, contextJson, json);
      } else {
        console.error(`Unknown subcommand: automations ${subcommand}`);
        console.error("Available: list, get, trigger");
        process.exit(1);
      }
    } else if (command === "state" || command === "s") {
      if (subcommand === "list" || subcommand === "ls") {
        await listState(client, json);
      } else if (subcommand === "get") {
        const key = args[0];
        if (!key) {
          console.error("Usage: ts-ha state get <key>");
          process.exit(1);
        }
        await getState(client, key, json);
      } else if (subcommand === "set") {
        const key = args[0];
        const value = args[1];
        if (!key || value === undefined) {
          console.error("Usage: ts-ha state set <key> <value>");
          process.exit(1);
        }
        await setState(client, key, value, json);
      } else if (subcommand === "delete" || subcommand === "del" || subcommand === "rm") {
        const key = args[0];
        if (!key) {
          console.error("Usage: ts-ha state delete <key>");
          process.exit(1);
        }
        await deleteState(client, key, json);
      } else {
        console.error(`Unknown subcommand: state ${subcommand}`);
        console.error("Available: list, get, set, delete");
        process.exit(1);
      }
    } else if (command === "logs" || command === "l") {
      await getLogs(
        client,
        {
          automation: parsed.logAutomation,
          level: parsed.logLevel,
          limit: parsed.logLimit,
          follow: parsed.logFollow,
          interval: parsed.interval,
        },
        json,
      );
    } else if (command === "dashboard" || command === "d") {
      const resolvedHost = host ?? (await getActiveTarget()).host;
      await runDashboard(client, resolvedHost, parsed.interval);
    } else {
      console.error(`Unknown command: ${command}`);
      console.error(
        "Available: automations (a), state (s), logs (l), dashboard (d), new (n), nanoleaf, config (c)",
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
