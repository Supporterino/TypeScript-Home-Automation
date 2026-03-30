import { describe, expect, it } from "bun:test";
import {
  formatLogEntry,
  formatTable,
  formatTrigger,
  formatValue,
  summarizeTriggers,
} from "../src/cli/format.js";

describe("formatTable", () => {
  it("aligns columns with padding", () => {
    const result = formatTable(
      ["A", "BB"],
      [
        ["x", "yy"],
        ["zzz", "w"],
      ],
    );
    const lines = result.split("\n");
    expect(lines[0]).toBe("A    BB");
    expect(lines[2]).toBe("x    yy");
    expect(lines[3]).toBe("zzz  w ");
  });

  it("handles empty rows", () => {
    const result = formatTable(["COL"], []);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2); // header + separator
  });
});

describe("formatValue", () => {
  it("formats null", () => {
    expect(formatValue(null)).toBe("null");
  });

  it("formats undefined", () => {
    expect(formatValue(undefined)).toBe("null");
  });

  it("formats booleans", () => {
    expect(formatValue(true)).toBe("true");
    expect(formatValue(false)).toBe("false");
  });

  it("formats numbers", () => {
    expect(formatValue(42)).toBe("42");
  });

  it("formats strings directly", () => {
    expect(formatValue("hello")).toBe("hello");
  });

  it("formats short arrays inline", () => {
    expect(formatValue([1, 2, 3])).toBe("[1,2,3]");
  });

  it("formats short objects inline", () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe("summarizeTriggers", () => {
  it("counts trigger types", () => {
    const triggers = [
      { type: "mqtt", topic: "a" },
      { type: "mqtt", topic: "b" },
      { type: "cron", expression: "0 * * * *" },
    ];
    expect(summarizeTriggers(triggers)).toBe("mqtt(2), cron(1)");
  });

  it("handles single trigger", () => {
    expect(summarizeTriggers([{ type: "webhook", path: "x" }])).toBe("webhook(1)");
  });

  it("handles empty array", () => {
    expect(summarizeTriggers([])).toBe("");
  });
});

describe("formatTrigger", () => {
  it("formats mqtt trigger without filter", () => {
    const result = formatTrigger({ type: "mqtt", topic: "zigbee2mqtt/sensor", hasFilter: false });
    expect(result).toBe("mqtt     zigbee2mqtt/sensor");
  });

  it("formats mqtt trigger with filter source", () => {
    const result = formatTrigger({
      type: "mqtt",
      topic: "zigbee2mqtt/sensor",
      hasFilter: true,
      filterSource: "(p) => p.occupancy === true",
    });
    expect(result).toContain("mqtt     zigbee2mqtt/sensor");
    expect(result).toContain("filter: (p) => p.occupancy === true");
  });

  it("formats cron trigger", () => {
    expect(formatTrigger({ type: "cron", expression: "0 7 * * *" })).toBe("cron     0 7 * * *");
  });

  it("formats state trigger without filter", () => {
    const result = formatTrigger({ type: "state", key: "night_mode", hasFilter: false });
    expect(result).toBe("state    night_mode");
  });

  it("formats state trigger with filter source", () => {
    const result = formatTrigger({
      type: "state",
      key: "night_mode",
      hasFilter: true,
      filterSource: "(v) => v === true",
    });
    expect(result).toContain("state    night_mode");
    expect(result).toContain("filter: (v) => v === true");
  });

  it("formats webhook trigger with methods", () => {
    const result = formatTrigger({ type: "webhook", path: "deploy", methods: ["POST", "PUT"] });
    expect(result).toBe("webhook  /deploy  [POST, PUT]");
  });

  it("defaults webhook methods to POST", () => {
    const result = formatTrigger({ type: "webhook", path: "hook" });
    expect(result).toBe("webhook  /hook  [POST]");
  });
});

describe("formatLogEntry", () => {
  it("formats a basic log entry", () => {
    const result = formatLogEntry({
      level: 30,
      time: new Date("2026-03-30T07:04:17.033Z").getTime(),
      msg: "Something happened",
    });
    expect(result).toContain("07:04:17.033");
    expect(result).toContain("INFO");
    expect(result).toContain("Something happened");
  });

  it("includes automation name when present", () => {
    const result = formatLogEntry({
      level: 40,
      time: Date.now(),
      msg: "Warning",
      automation: "motion-light",
    });
    expect(result).toContain("[motion-light]");
    expect(result).toContain("WARN");
  });

  it("includes service name when present", () => {
    const result = formatLogEntry({
      level: 50,
      time: Date.now(),
      msg: "Connection lost",
      service: "mqtt",
    });
    expect(result).toContain("(mqtt)");
    expect(result).toContain("ERROR");
  });

  it("maps all pino levels correctly", () => {
    expect(formatLogEntry({ level: 10, time: 0, msg: "" })).toContain("TRACE");
    expect(formatLogEntry({ level: 20, time: 0, msg: "" })).toContain("DEBUG");
    expect(formatLogEntry({ level: 30, time: 0, msg: "" })).toContain("INFO");
    expect(formatLogEntry({ level: 40, time: 0, msg: "" })).toContain("WARN");
    expect(formatLogEntry({ level: 50, time: 0, msg: "" })).toContain("ERROR");
    expect(formatLogEntry({ level: 60, time: 0, msg: "" })).toContain("FATAL");
  });
});
