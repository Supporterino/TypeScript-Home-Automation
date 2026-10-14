/**
 * Reporting attribution for an optimistic override (design.md D3; task 6.1).
 *
 * A `device_state` event carries no request token, so the only thing that can
 * tie a report to a request is the value it carries. A report therefore
 * confirms the newest request — and so may clear its optimistic override —
 * only when the value it carries equals the value that request asked for
 * (design.md D3). A report carrying any other value belongs to a superseded or
 * ignored command and MUST NOT move the control; the override's deadline
 * reverts it instead.
 *
 * Pure and DOM-free (design.md D23): the hook wires this predicate into its
 * confirmation listener, exactly as {@link computeRevertDeadlineMs} is wired
 * into its deadline.
 */

/** A non-array object with the `Object` prototype (or none) — a JSON-style value. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Whether `reported` confirms a request for the value `requested`.
 *
 * Both arguments are `unknown` because a report is untrusted wire data
 * (`event.properties[property]`) while a request carries the override's `T`.
 *
 * The rule (design.md D3): a report confirms the newest request only when the
 * value it carries equals the value that request asked for. The comparison is
 * exact — a primitive confirms only an identical primitive (via `Object.is`,
 * so `NaN` confirms `NaN`, while `-0` and `+0` are deliberately distinct),
 * arrays compare deeply element-by-element and in order, and plain objects
 * compare deeply by key with key order insignificant. A type mismatch — a
 * string against a boolean, say — is never a confirmation.
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
