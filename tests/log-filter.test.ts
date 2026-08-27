import { describe, expect, it } from "bun:test";
import {
  EMPTY_LOG_FILTER,
  filterLogEntries,
  isLogFilterActive,
  matchesLogFilter,
} from "../src/core/web-ui/app/lib/log-filter.js";
import type { LogEntry } from "../src/core/web-ui/app/types.js";

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { level: 30, time: 1000, msg: "hello world", ...overrides };
}

describe("isLogFilterActive", () => {
  it("is false for the empty filter", () => {
    expect(isLogFilterActive(EMPTY_LOG_FILTER)).toBe(false);
  });

  it("is true when any field is set", () => {
    expect(isLogFilterActive({ ...EMPTY_LOG_FILTER, minLevel: 40 })).toBe(true);
    expect(isLogFilterActive({ ...EMPTY_LOG_FILTER, automation: "x" })).toBe(true);
    expect(isLogFilterActive({ ...EMPTY_LOG_FILTER, text: "x" })).toBe(true);
  });
});

describe("matchesLogFilter", () => {
  it("matches everything under the empty filter", () => {
    expect(matchesLogFilter(entry(), EMPTY_LOG_FILTER)).toBe(true);
  });

  it("filters by minimum level", () => {
    const filter = { ...EMPTY_LOG_FILTER, minLevel: 40 };
    expect(matchesLogFilter(entry({ level: 30 }), filter)).toBe(false);
    expect(matchesLogFilter(entry({ level: 50 }), filter)).toBe(true);
  });

  it("filters by automation name, case-insensitively", () => {
    const filter = { ...EMPTY_LOG_FILTER, automation: "MOTION" };
    expect(matchesLogFilter(entry({ automation: "motion-light" }), filter)).toBe(true);
    expect(matchesLogFilter(entry({ automation: "tv-plug" }), filter)).toBe(false);
    expect(matchesLogFilter(entry({}), filter)).toBe(false);
  });

  it("filters by free text against the message", () => {
    const filter = { ...EMPTY_LOG_FILTER, text: "WORLD" };
    expect(matchesLogFilter(entry({ msg: "hello world" }), filter)).toBe(true);
    expect(matchesLogFilter(entry({ msg: "goodbye" }), filter)).toBe(false);
  });

  it("filters by free text against any field, not only the message", () => {
    const filter = { ...EMPTY_LOG_FILTER, text: "0xabc123" };
    expect(matchesLogFilter(entry({ msg: "state changed", device: "0xabc123" }), filter)).toBe(
      true,
    );
  });
});

describe("filterLogEntries", () => {
  it("preserves order while filtering", () => {
    const entries = [entry({ level: 30, msg: "a" }), entry({ level: 50, msg: "b" })];
    const filtered = filterLogEntries(entries, { ...EMPTY_LOG_FILTER, minLevel: 40 });
    expect(filtered.map((e) => e.msg)).toEqual(["b"]);
  });

  it("returns every entry when the filter is empty", () => {
    const entries = [entry({ msg: "a" }), entry({ msg: "b" })];
    expect(filterLogEntries(entries, EMPTY_LOG_FILTER)).toHaveLength(2);
  });
});
