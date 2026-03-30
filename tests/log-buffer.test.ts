import { beforeEach, describe, expect, it } from "bun:test";
import { LogBuffer } from "../src/core/log-buffer.js";

function entry(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    level: 30,
    time: Date.now(),
    msg: "test message",
    ...overrides,
  });
}

describe("LogBuffer", () => {
  let buffer: LogBuffer;

  beforeEach(() => {
    buffer = new LogBuffer(10);
  });

  describe("write", () => {
    it("stores a valid JSON log line", () => {
      buffer.write(entry({ msg: "hello" }));
      const result = buffer.query();
      expect(result).toHaveLength(1);
      expect(result[0].msg).toBe("hello");
    });

    it("ignores invalid JSON lines", () => {
      buffer.write("not json");
      const result = buffer.query();
      expect(result).toHaveLength(0);
    });

    it("always returns true", () => {
      expect(buffer.write(entry())).toBe(true);
      expect(buffer.write("bad")).toBe(true);
    });

    it("stores multiple entries", () => {
      buffer.write(entry({ msg: "first" }));
      buffer.write(entry({ msg: "second" }));
      buffer.write(entry({ msg: "third" }));
      const result = buffer.query();
      expect(result).toHaveLength(3);
      expect(result[0].msg).toBe("first");
      expect(result[2].msg).toBe("third");
    });
  });

  describe("ring buffer behavior", () => {
    it("overwrites oldest entries when capacity is exceeded", () => {
      const small = new LogBuffer(3);
      small.write(entry({ msg: "a" }));
      small.write(entry({ msg: "b" }));
      small.write(entry({ msg: "c" }));
      small.write(entry({ msg: "d" }));

      const result = small.query({ limit: 10 });
      expect(result).toHaveLength(3);
      expect(result[0].msg).toBe("b");
      expect(result[1].msg).toBe("c");
      expect(result[2].msg).toBe("d");
    });

    it("maintains chronological order after wraparound", () => {
      const small = new LogBuffer(3);
      for (let i = 0; i < 7; i++) {
        small.write(entry({ msg: `msg-${i}` }));
      }

      const result = small.query({ limit: 10 });
      expect(result).toHaveLength(3);
      expect(result[0].msg).toBe("msg-4");
      expect(result[1].msg).toBe("msg-5");
      expect(result[2].msg).toBe("msg-6");
    });
  });

  describe("query filtering", () => {
    beforeEach(() => {
      buffer.write(entry({ msg: "info from auto-a", level: 30, automation: "auto-a" }));
      buffer.write(entry({ msg: "warn from auto-a", level: 40, automation: "auto-a" }));
      buffer.write(entry({ msg: "error from auto-b", level: 50, automation: "auto-b" }));
      buffer.write(entry({ msg: "debug from mqtt", level: 20, service: "mqtt" }));
      buffer.write(entry({ msg: "info no automation", level: 30 }));
    });

    it("filters by automation name", () => {
      const result = buffer.query({ automation: "auto-a" });
      expect(result).toHaveLength(2);
      expect(result[0].msg).toBe("info from auto-a");
      expect(result[1].msg).toBe("warn from auto-a");
    });

    it("filters by minimum level", () => {
      const result = buffer.query({ level: 40 });
      expect(result).toHaveLength(2);
      expect(result[0].msg).toBe("warn from auto-a");
      expect(result[1].msg).toBe("error from auto-b");
    });

    it("combines automation and level filters", () => {
      const result = buffer.query({ automation: "auto-a", level: 40 });
      expect(result).toHaveLength(1);
      expect(result[0].msg).toBe("warn from auto-a");
    });

    it("returns empty array when no entries match", () => {
      const result = buffer.query({ automation: "nonexistent" });
      expect(result).toHaveLength(0);
    });
  });

  describe("query limit", () => {
    it("defaults to 50 entries", () => {
      const big = new LogBuffer(100);
      for (let i = 0; i < 80; i++) {
        big.write(entry({ msg: `msg-${i}` }));
      }
      const result = big.query();
      expect(result).toHaveLength(50);
      // Should be the last 50
      expect(result[0].msg).toBe("msg-30");
      expect(result[49].msg).toBe("msg-79");
    });

    it("respects custom limit", () => {
      for (let i = 0; i < 10; i++) {
        buffer.write(entry({ msg: `msg-${i}` }));
      }
      const result = buffer.query({ limit: 3 });
      expect(result).toHaveLength(3);
      expect(result[0].msg).toBe("msg-7");
      expect(result[2].msg).toBe("msg-9");
    });

    it("returns all entries when limit exceeds count", () => {
      buffer.write(entry({ msg: "only" }));
      const result = buffer.query({ limit: 100 });
      expect(result).toHaveLength(1);
    });
  });

  describe("empty buffer", () => {
    it("returns empty array on empty buffer", () => {
      expect(buffer.query()).toHaveLength(0);
    });

    it("returns empty with filters on empty buffer", () => {
      expect(buffer.query({ automation: "test", level: 30, limit: 10 })).toHaveLength(0);
    });
  });
});
