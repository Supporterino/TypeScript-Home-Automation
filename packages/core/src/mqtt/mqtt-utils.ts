/**
 * Check if an MQTT topic pattern contains wildcards (+ or #).
 */
export function hasWildcard(pattern: string): boolean {
  return pattern.includes("+") || pattern.includes("#");
}

/**
 * Pre-split a wildcard pattern for reuse in matching.
 * Call this once at subscription time, then pass the result to `topicMatchesParts`.
 */
export function splitPattern(pattern: string): string[] {
  return pattern.split("/");
}

/**
 * Match an MQTT topic against a pre-split wildcard pattern, avoiding a re-split on
 * every call.
 */
export function topicMatchesParts(patternParts: string[], topic: string): boolean {
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

/**
 * Match MQTT topic patterns with wildcards: `+` matches one level, `#` zero or more
 * remaining levels (must be last).
 */
export function topicMatches(pattern: string, topic: string): boolean {
  return topicMatchesParts(pattern.split("/"), topic);
}
