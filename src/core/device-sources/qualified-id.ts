/**
 * Qualified device identifier formatting and parsing (design.md D29).
 *
 * A qualified identifier joins a source identifier and a device identifier
 * with a single delimiter (`:`), and is parsed by splitting on the **first**
 * occurrence of that delimiter only — everything after it belongs to the
 * device identifier. A device identifier legitimately contains the
 * delimiter: a state toggle's identity is a state key, and state keys are
 * already colon-scoped as `<automation-name>:<key>`. A naive split on every
 * occurrence would corrupt that. A source identifier MUST NOT contain the
 * delimiter, which is what makes the first-occurrence split total rather
 * than heuristic.
 *
 * This module is pure and has no dependency on any device source, HTTP
 * layer, or transport — it exists solely to keep the join/split rule in one
 * place rather than reimplemented per call site.
 */

/** The single delimiter used to join a source identifier and a device identifier. */
export const QUALIFIED_ID_DELIMITER = ":";

/**
 * Join a source identifier and a device identifier into one qualified
 * identifier.
 *
 * @throws Error if `source` itself contains the delimiter, which would make
 *   the first-occurrence split ambiguous.
 */
export function formatQualifiedId(source: string, deviceId: string): string {
  if (source.includes(QUALIFIED_ID_DELIMITER)) {
    throw new Error(
      `Device source identifier "${source}" must not contain "${QUALIFIED_ID_DELIMITER}"`,
    );
  }
  return `${source}${QUALIFIED_ID_DELIMITER}${deviceId}`;
}

/** The result of parsing a qualified identifier back into its two parts. */
export interface ParsedQualifiedId {
  source: string;
  deviceId: string;
}

/**
 * Parse a qualified identifier back into its source and device identifier,
 * splitting on the first occurrence of the delimiter only.
 *
 * @throws Error if the identifier carries no delimiter at all.
 */
export function parseQualifiedId(qualifiedId: string): ParsedQualifiedId {
  const index = qualifiedId.indexOf(QUALIFIED_ID_DELIMITER);
  if (index === -1) {
    throw new Error(
      `Qualified identifier "${qualifiedId}" is missing a "${QUALIFIED_ID_DELIMITER}" delimiter`,
    );
  }
  return {
    source: qualifiedId.slice(0, index),
    deviceId: qualifiedId.slice(index + 1),
  };
}
