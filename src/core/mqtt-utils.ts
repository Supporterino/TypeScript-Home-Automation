/**
 * Match MQTT topic patterns with wildcards.
 *
 * - `+` matches exactly one topic level
 * - `#` matches zero or more remaining levels (must be last)
 *
 * @param pattern The subscription pattern (may contain + and #)
 * @param topic The actual topic to match against
 * @returns true if the topic matches the pattern
 */
export function topicMatches(pattern: string, topic: string): boolean {
  const patternParts = pattern.split("/");
  const topicParts = topic.split("/");

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === "#") {
      return true;
    }
    if (patternParts[i] === "+") {
      if (i >= topicParts.length) return false;
      continue;
    }
    if (patternParts[i] !== topicParts[i]) {
      return false;
    }
  }

  return patternParts.length === topicParts.length;
}
