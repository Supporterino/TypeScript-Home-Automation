import { describe, it, expect } from "bun:test";
import { topicMatches } from "../src/core/mqtt-utils.js";

describe("topicMatches", () => {
  describe("exact matches", () => {
    it("matches identical topics", () => {
      expect(topicMatches("zigbee2mqtt/sensor", "zigbee2mqtt/sensor")).toBe(true);
    });

    it("matches multi-level identical topics", () => {
      expect(topicMatches("a/b/c/d", "a/b/c/d")).toBe(true);
    });

    it("rejects different topics", () => {
      expect(topicMatches("zigbee2mqtt/sensor_a", "zigbee2mqtt/sensor_b")).toBe(false);
    });

    it("rejects when pattern is shorter", () => {
      expect(topicMatches("a/b", "a/b/c")).toBe(false);
    });

    it("rejects when pattern is longer", () => {
      expect(topicMatches("a/b/c", "a/b")).toBe(false);
    });
  });

  describe("single-level wildcard (+)", () => {
    it("matches any single level", () => {
      expect(topicMatches("zigbee2mqtt/+", "zigbee2mqtt/sensor")).toBe(true);
    });

    it("matches any single level in the middle", () => {
      expect(topicMatches("zigbee2mqtt/+/set", "zigbee2mqtt/light/set")).toBe(true);
    });

    it("does not match across levels", () => {
      expect(topicMatches("zigbee2mqtt/+", "zigbee2mqtt/a/b")).toBe(false);
    });

    it("does not match empty level", () => {
      expect(topicMatches("a/+/c", "a/c")).toBe(false);
    });

    it("matches multiple single-level wildcards", () => {
      expect(topicMatches("+/+/+", "a/b/c")).toBe(true);
    });

    it("rejects when trailing levels differ", () => {
      expect(topicMatches("a/+/c", "a/b/d")).toBe(false);
    });
  });

  describe("multi-level wildcard (#)", () => {
    it("matches all remaining levels", () => {
      expect(topicMatches("zigbee2mqtt/#", "zigbee2mqtt/sensor")).toBe(true);
    });

    it("matches multiple remaining levels", () => {
      expect(topicMatches("zigbee2mqtt/#", "zigbee2mqtt/sensor/state")).toBe(true);
    });

    it("matches zero remaining levels", () => {
      expect(topicMatches("zigbee2mqtt/#", "zigbee2mqtt")).toBe(true);
    });

    it("matches everything with just #", () => {
      expect(topicMatches("#", "any/topic/here")).toBe(true);
    });

    it("works after fixed prefix", () => {
      expect(topicMatches("a/b/#", "a/b/c/d/e")).toBe(true);
    });
  });

  describe("combined wildcards", () => {
    it("handles + followed by #", () => {
      expect(topicMatches("zigbee2mqtt/+/#", "zigbee2mqtt/sensor/state")).toBe(true);
    });

    it("handles + before fixed and #", () => {
      expect(topicMatches("+/zigbee2mqtt/#", "home/zigbee2mqtt/a/b")).toBe(true);
    });
  });
});
