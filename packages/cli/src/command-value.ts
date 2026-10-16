/** Parse a CLI command value as JSON when valid, otherwise the raw string. */
export function parseCommandValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
