#!/usr/bin/env bun

import { DebugClient } from "./client.js";
import {
  getAutomation,
  getAutomationHistory,
  getAutomationRelationships,
  getAutomationSource,
  listAutomations,
  setAutomationEnabled,
  triggerAutomation,
} from "./commands/automations.js";
import { addConfig, listConfig, removeConfig, switchConfig } from "./commands/config.js";
import { runDashboard } from "./commands/dashboard.js";
import {
  assignDeviceRoom,
  getDevice,
  listDevices,
  sendDeviceCommand,
  setDeviceHidden,
  unassignDeviceRoom,
} from "./commands/devices.js";
import { showEnergy } from "./commands/energy.js";
import { getLogs } from "./commands/logs.js";
import { pairNanoleaf } from "./commands/nanoleaf.js";
import {
  assignRoom,
  createRoom,
  deleteRoom,
  getRoom,
  listRooms,
  renameRoom,
  sendRoomCommand,
  unassignRoom,
} from "./commands/rooms.js";
import { runCommand } from "./commands/run.js";
import { deleteState, getState, listState, setState } from "./commands/state.js";
import { createWall, deleteWall, getWall, listWalls, updateWall } from "./commands/walls.js";
import { showWeather } from "./commands/weather.js";
import { getActiveTarget } from "./config.js";
import { normalizeListSubcommand } from "./subcommand.js";
import { USAGE } from "./usage.js";

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
  automationsDir: string | undefined;
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
  let automationsDir: string | undefined;
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
    } else if (arg === "--automations") {
      automationsDir = argv[++i];
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
    automationsDir,
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
    // `run` boots a local engine and needs no remote client.
    if (command === "run") {
      await runCommand({ automationsDir: parsed.automationsDir });
      return;
    }

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
      const sub = normalizeListSubcommand(subcommand);
      if (sub === "list") {
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
      } else if (subcommand === "enable" || subcommand === "disable") {
        const name = args[0];
        if (!name) {
          console.error(`Usage: ts-ha automations ${subcommand} <name>`);
          process.exit(1);
        }
        await setAutomationEnabled(client, name, subcommand === "enable", json);
      } else if (subcommand === "source") {
        const name = args[0];
        if (!name) {
          console.error("Usage: ts-ha automations source <name>");
          process.exit(1);
        }
        await getAutomationSource(client, name, json);
      } else if (subcommand === "history") {
        const name = args[0];
        if (!name) {
          console.error("Usage: ts-ha automations history <name>");
          process.exit(1);
        }
        await getAutomationHistory(client, name, json);
      } else if (subcommand === "relationships") {
        const name = args[0];
        if (!name) {
          console.error("Usage: ts-ha automations relationships <name>");
          process.exit(1);
        }
        await getAutomationRelationships(client, name, json);
      } else {
        console.error(`Unknown subcommand: automations ${subcommand}`);
        console.error(
          "Available: list, get, trigger, enable, disable, source, history, relationships",
        );
        process.exit(1);
      }
    } else if (command === "devices" || command === "dv") {
      const sub = normalizeListSubcommand(subcommand);
      if (sub === "list") {
        await listDevices(client, json);
      } else if (subcommand === "get") {
        const query = args[0];
        if (!query) {
          console.error("Usage: ts-ha devices get <qualifiedId>");
          process.exit(1);
        }
        await getDevice(client, query, json);
      } else if (subcommand === "command") {
        const query = args[0];
        const property = args[1];
        const value = args[2];
        if (!query || !property || value === undefined) {
          console.error("Usage: ts-ha devices command <device> <property> <value>");
          process.exit(1);
        }
        await sendDeviceCommand(client, query, property, value, json);
      } else if (subcommand === "hide" || subcommand === "unhide") {
        const query = args[0];
        if (!query) {
          console.error(`Usage: ts-ha devices ${subcommand} <device>`);
          process.exit(1);
        }
        await setDeviceHidden(client, query, subcommand === "hide", json);
      } else if (subcommand === "assign") {
        const query = args[0];
        const roomId = args[1];
        if (!query || !roomId) {
          console.error("Usage: ts-ha devices assign <device> <roomId>");
          process.exit(1);
        }
        await assignDeviceRoom(client, query, roomId, json);
      } else if (subcommand === "unassign") {
        const query = args[0];
        if (!query) {
          console.error("Usage: ts-ha devices unassign <device>");
          process.exit(1);
        }
        await unassignDeviceRoom(client, query, json);
      } else {
        console.error(`Unknown subcommand: devices ${subcommand}`);
        console.error("Available: list, get, command, hide, unhide, assign, unassign");
        process.exit(1);
      }
    } else if (command === "rooms") {
      const sub = normalizeListSubcommand(subcommand);
      if (sub === "list") {
        await listRooms(client, json);
      } else if (subcommand === "get") {
        const id = args[0];
        if (!id) {
          console.error("Usage: ts-ha rooms get <id>");
          process.exit(1);
        }
        await getRoom(client, id, json);
      } else if (subcommand === "create") {
        const name = args[0];
        if (!name) {
          console.error("Usage: ts-ha rooms create <name>");
          process.exit(1);
        }
        await createRoom(client, name, json);
      } else if (subcommand === "rename") {
        const id = args[0];
        const name = args[1];
        if (!id || !name) {
          console.error("Usage: ts-ha rooms rename <id> <name>");
          process.exit(1);
        }
        await renameRoom(client, id, name, json);
      } else if (
        subcommand === "rm" ||
        subcommand === "remove" ||
        subcommand === "delete" ||
        subcommand === "del"
      ) {
        const id = args[0];
        if (!id) {
          console.error("Usage: ts-ha rooms rm <id>");
          process.exit(1);
        }
        await deleteRoom(client, id, json);
      } else if (subcommand === "command") {
        const id = args[0];
        const property = args[1];
        const value = args[2];
        if (!id || !property || value === undefined) {
          console.error("Usage: ts-ha rooms command <id> <property> <value>");
          process.exit(1);
        }
        await sendRoomCommand(client, id, property, value, json);
      } else if (subcommand === "assign") {
        const query = args[0];
        const roomId = args[1];
        if (!query || !roomId) {
          console.error("Usage: ts-ha rooms assign <device> <roomId>");
          process.exit(1);
        }
        await assignRoom(client, query, roomId, json);
      } else if (subcommand === "unassign") {
        const query = args[0];
        if (!query) {
          console.error("Usage: ts-ha rooms unassign <device>");
          process.exit(1);
        }
        await unassignRoom(client, query, json);
      } else {
        console.error(`Unknown subcommand: rooms ${subcommand}`);
        console.error("Available: list, get, create, rename, rm, command, assign, unassign");
        process.exit(1);
      }
    } else if (command === "walls") {
      const sub = normalizeListSubcommand(subcommand);
      if (sub === "list") {
        await listWalls(client, json);
      } else if (subcommand === "get") {
        const name = args[0];
        if (!name) {
          console.error("Usage: ts-ha walls get <name>");
          process.exit(1);
        }
        await getWall(client, name, json);
      } else if (subcommand === "create") {
        const name = args[0];
        const config = args[1];
        if (!name || !config) {
          console.error("Usage: ts-ha walls create <name> '<json config>'");
          process.exit(1);
        }
        await createWall(client, name, config, json);
      } else if (subcommand === "update") {
        const name = args[0];
        const config = args[1];
        if (!name || !config) {
          console.error("Usage: ts-ha walls update <name> '<json config>'");
          process.exit(1);
        }
        await updateWall(client, name, config, json);
      } else if (
        subcommand === "rm" ||
        subcommand === "remove" ||
        subcommand === "delete" ||
        subcommand === "del"
      ) {
        const name = args[0];
        if (!name) {
          console.error("Usage: ts-ha walls rm <name>");
          process.exit(1);
        }
        await deleteWall(client, name, json);
      } else {
        console.error(`Unknown subcommand: walls ${subcommand}`);
        console.error("Available: list, get, create, update, rm");
        process.exit(1);
      }
    } else if (command === "energy") {
      await showEnergy(client, json);
    } else if (command === "weather") {
      await showWeather(client, json);
    } else if (command === "state" || command === "s") {
      const sub = normalizeListSubcommand(subcommand);
      if (sub === "list") {
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
        "Available: run, automations (a), devices (dv), rooms, walls, energy, weather, state (s), logs (l), dashboard (d), nanoleaf, config (c)",
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
