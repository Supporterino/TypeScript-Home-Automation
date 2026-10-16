/**
 * Reporting attribution for an optimistic override: a report confirms the
 * newest request only when the value it carries equals what that request asked.
 */

/** A non-array object with the `Object` prototype (or none) — a JSON-style value. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Whether `reported` confirms a request for the value `requested`, comparing
 * primitives exactly, arrays element-by-element, and plain objects by key.
 */
export function reportedValueConfirms(requested: unknown, reported: unknown): boolean {
  if (Object.is(requested, reported)) return true;

  if (Array.isArray(requested) || Array.isArray(reported)) {
    if (!Array.isArray(requested) || !Array.isArray(reported)) return false;
    if (requested.length !== reported.length) return false;
    return requested.every((element, index) => reportedValueConfirms(element, reported[index]));
  }

  if (isPlainObject(requested) || isPlainObject(reported)) {
    if (!isPlainObject(requested) || !isPlainObject(reported)) return false;
    const requestedKeys = Object.keys(requested);
    if (requestedKeys.length !== Object.keys(reported).length) return false;
    return requestedKeys.every(
      (key) => Object.hasOwn(reported, key) && reportedValueConfirms(requested[key], reported[key]),
    );
  }

  return false;
}
