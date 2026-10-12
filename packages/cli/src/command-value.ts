/**
 * Parse a CLI command value (specs/cli "Command Surface"): a JSON literal when
 * the argument is valid JSON, otherwise the raw string — mirroring `state set`.
 */
export function parseCommandValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
