import { describe, expect, it } from "bun:test";
import { USAGE } from "../src/usage.js";

describe("USAGE", () => {
  it("lists the Phase 2 automations subcommands", () => {
    expect(USAGE).toContain("automations history <name>");
    expect(USAGE).toContain("Show the automation's execution history");
    expect(USAGE).toContain("automations relationships <name>");
    expect(USAGE).toContain("Show declared and observed relationships");
  });

  it("lists the energy and weather commands", () => {
    expect(USAGE).toContain("Show power and per-device energy breakdown");
    expect(USAGE).toContain("Show current conditions and daily forecast");
  });

  it("lists the Phase 3 device control subcommands", () => {
    expect(USAGE).toContain("devices command <device> <prop> <val>");
    expect(USAGE).toContain("devices hide <device>");
    expect(USAGE).toContain("devices assign <device> <roomId>");
  });

  it("lists the rooms and walls commands", () => {
    expect(USAGE).toContain("List rooms with their members");
    expect(USAGE).toContain("rooms command <id> <prop> <val>");
    expect(USAGE).toContain("List wall profiles");
    expect(USAGE).toContain("walls create <name> <config>");
  });

  it("presents the bare form as the listing command", () => {
    expect(USAGE).toContain("List all registered automations");
    expect(USAGE).toContain("List all devices known to the engine's sources");
    expect(USAGE).toContain("List all state keys and values");
    // The bare form, not a required `list` subcommand, is shown for each.
    expect(USAGE).not.toContain("automations list ");
    expect(USAGE).not.toContain("devices list ");
    expect(USAGE).not.toContain("state list ");
  });

  it("lists the dashboard tabs", () => {
    expect(USAGE).toContain("Overview, Automations, Devices, Rooms, State, Logs, HomeKit");
  });
});
