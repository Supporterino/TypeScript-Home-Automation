#!/usr/bin/env bun

import { DebugClient } from "./client.js";
import { getAutomation, listAutomations } from "./commands/automations.js";
import { addConfig, listConfig, removeConfig, useConfig } from "./commands/config.js";
import { deleteState, getState, listState, setState } from "./commands/state.js";
import { getActiveTarget } from "./config.js";

const USAGE = `
ts-ha — CLI for managing a running ts-home-automation instance

Usage:
  ts-ha [options] <command> <subcommand> [args]

Commands:
  automations list                    List all registered automations
  automations get <name>              Get details for a specific automation

  state list                          List all state keys and values
  state get <key>                     Get a single state value
  state set <key> <value>             Set a state value (JSON-parsed)
  state delete <key>                  Delete a state key

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
  a = automations, s = state, c = config
  ls = list, rm/del = delete

Examples:
  ts-ha state list
  ts-ha state set night_mode true
  ts-ha automations get motion-light-schedule
  ts-ha config add prod 192.168.1.100:8080 my-secret-token
  ts-ha config use prod
  ts-ha --host 192.168.1.100:8080 --token secret s ls
  ts-ha --json a ls
`.trim();

interface ParsedArgs {
  host: string | undefined;
  token: string | undefined;
  json: boolean;
  command: string;
  subcommand: string;
  args: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  let host: string | undefined;
  let token: string | undefined;
  let json = false;
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
  return { host, token, json, command, subcommand, args };
}

async function resolveClient(
  hostOverride: string | undefined,
  tokenOverride: string | undefined,
): Promise<DebugClient> {
  // CLI flags take priority over saved config
  if (hostOverride) {
    return new DebugClient(hostOverride, tokenOverride);
  }

  // Fall back to the active saved target
  const target = await getActiveTarget();
  return new DebugClient(target.host, tokenOverride ?? (target.token || undefined));
}

async function main(): Promise<void> {
  const { host, token, json, command, subcommand, args } = parseArgs(process.argv.slice(2));

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
        await useConfig(name);
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
      } else {
        console.error(`Unknown subcommand: automations ${subcommand}`);
        console.error("Available: list, get");
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
    } else {
      console.error(`Unknown command: ${command}`);
      console.error("Available: automations (a), state (s), config (c)");
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
