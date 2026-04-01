import { beforeEach, describe, expect, it } from "bun:test";
import {
  hasWildcard,
  splitPattern,
  topicMatches,
  topicMatchesParts,
} from "../src/core/mqtt-utils.js";

/**
 * Performance comparison tests for MQTT message dispatch.
 *
 * These tests measure the old O(n) approach (topicMatches on every subscription)
 * vs the new indexed approach (Map lookup for exact topics + pre-split wildcards).
 */

// Simulate a realistic set of subscriptions
function generateExactTopics(count: number): string[] {
  const topics: string[] = [];
  for (let i = 0; i < count; i++) {
    topics.push(`zigbee2mqtt/device_${i}`);
  }
  return topics;
}

function generateWildcardPatterns(count: number): string[] {
  const patterns: string[] = [];
  for (let i = 0; i < count; i++) {
    patterns.push(`zigbee2mqtt/+/group_${i}`);
  }
  return patterns;
}

describe("MQTT dispatch performance", () => {
  const EXACT_COUNT = 100;
  const WILDCARD_COUNT = 5;
  const MESSAGE_COUNT = 10_000;

  const exactTopics = generateExactTopics(EXACT_COUNT);
  const wildcardPatterns = generateWildcardPatterns(WILDCARD_COUNT);
  const allPatterns = [...exactTopics, ...wildcardPatterns];

  // Messages: half match an exact topic, half match nothing
  const matchingMessages = exactTopics.slice(0, 50);
  const nonMatchingMessages = Array.from({ length: 50 }, (_, i) => `zigbee2mqtt/unknown_${i}`);
  const testMessages = [...matchingMessages, ...nonMatchingMessages];

  describe("old approach: linear scan with topicMatches()", () => {
    it(`dispatches ${MESSAGE_COUNT} messages across ${allPatterns.length} subscriptions`, () => {
      let matchCount = 0;

      const start = performance.now();

      for (let m = 0; m < MESSAGE_COUNT; m++) {
        const topic = testMessages[m % testMessages.length];
        for (const pattern of allPatterns) {
          if (topicMatches(pattern, topic)) {
            matchCount++;
          }
        }
      }

      const elapsed = performance.now() - start;
      const opsPerSec = Math.floor(MESSAGE_COUNT / (elapsed / 1000));

      console.log(
        `  Old approach: ${elapsed.toFixed(2)}ms for ${MESSAGE_COUNT} messages (${opsPerSec} msgs/sec)`,
      );
      console.log(
        `    ${allPatterns.length} subscriptions per message, ${matchCount} total matches`,
      );

      expect(matchCount).toBeGreaterThan(0);
    });
  });

  describe("new approach: indexed exact + pre-split wildcards", () => {
    // Build the index (done once at subscribe time)
    const exactIndex = new Map<string, string[]>();
    const wildcardIndex: { pattern: string; parts: string[] }[] = [];

    beforeEach(() => {
      exactIndex.clear();
      wildcardIndex.length = 0;

      for (const topic of allPatterns) {
        if (hasWildcard(topic)) {
          wildcardIndex.push({ pattern: topic, parts: splitPattern(topic) });
        } else {
          const existing = exactIndex.get(topic);
          if (existing) {
            existing.push(topic);
          } else {
            exactIndex.set(topic, [topic]);
          }
        }
      }
    });

    it(`dispatches ${MESSAGE_COUNT} messages across ${allPatterns.length} subscriptions`, () => {
      let matchCount = 0;

      const start = performance.now();

      for (let m = 0; m < MESSAGE_COUNT; m++) {
        const topic = testMessages[m % testMessages.length];

        // O(1) exact lookup
        const exact = exactIndex.get(topic);
        if (exact) matchCount += exact.length;

        // O(w) wildcard scan with pre-split patterns
        for (const wc of wildcardIndex) {
          if (topicMatchesParts(wc.parts, topic)) {
            matchCount++;
          }
        }
      }

      const elapsed = performance.now() - start;
      const opsPerSec = Math.floor(MESSAGE_COUNT / (elapsed / 1000));

      console.log(
        `  New approach: ${elapsed.toFixed(2)}ms for ${MESSAGE_COUNT} messages (${opsPerSec} msgs/sec)`,
      );
      console.log(
        `    ${exactIndex.size} exact + ${wildcardIndex.length} wildcard, ${matchCount} total matches`,
      );

      expect(matchCount).toBeGreaterThan(0);
    });
  });

  describe("comparison", () => {
    it("new approach is significantly faster than old approach", () => {
      // Old approach
      let oldMatches = 0;
      const oldStart = performance.now();
      for (let m = 0; m < MESSAGE_COUNT; m++) {
        const topic = testMessages[m % testMessages.length];
        for (const pattern of allPatterns) {
          if (topicMatches(pattern, topic)) {
            oldMatches++;
          }
        }
      }
      const oldElapsed = performance.now() - oldStart;

      // New approach — build index
      const exactIndex = new Map<string, string[]>();
      const wildcardIndex: { parts: string[] }[] = [];
      for (const topic of allPatterns) {
        if (hasWildcard(topic)) {
          wildcardIndex.push({ parts: splitPattern(topic) });
        } else {
          const existing = exactIndex.get(topic);
          if (existing) existing.push(topic);
          else exactIndex.set(topic, [topic]);
        }
      }

      let newMatches = 0;
      const newStart = performance.now();
      for (let m = 0; m < MESSAGE_COUNT; m++) {
        const topic = testMessages[m % testMessages.length];
        const exact = exactIndex.get(topic);
        if (exact) newMatches += exact.length;
        for (const wc of wildcardIndex) {
          if (topicMatchesParts(wc.parts, topic)) {
            newMatches++;
          }
        }
      }
      const newElapsed = performance.now() - newStart;

      const speedup = oldElapsed / newElapsed;

      console.log(`\n  === MQTT Dispatch Performance Comparison ===`);
      console.log(`  Subscriptions: ${EXACT_COUNT} exact + ${WILDCARD_COUNT} wildcard`);
      console.log(`  Messages:      ${MESSAGE_COUNT} (50% matching, 50% non-matching)`);
      console.log(`  Old approach:  ${oldElapsed.toFixed(2)}ms`);
      console.log(`  New approach:  ${newElapsed.toFixed(2)}ms`);
      console.log(`  Speedup:       ${speedup.toFixed(1)}x faster`);
      console.log(`  Matches:       ${oldMatches} (old) vs ${newMatches} (new)`);

      // Both approaches should find the same number of matches
      expect(oldMatches).toBe(newMatches);

      // New approach should be at least 3x faster with 100+ subscriptions
      expect(speedup).toBeGreaterThan(3);
    });
  });
});
