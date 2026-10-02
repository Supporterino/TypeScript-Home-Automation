/**
 * Cross-package runtime constants that encode a wire contract two or more
 * packages must agree on (design.md D9).
 */

/** Cookie name used to store the session token in the browser. */
export const SESSION_COOKIE = "ts-ha-session";

/**
 * Sigil prefix for the reserved internal state namespace (design.md D20).
 *
 * Automation-scoped keys are `<automation-name>:<key>`, and automation names
 * derive from kebab-case filenames — they can never begin with `$`. A public
 * caller can therefore never produce a key inside this namespace, which is
 * what makes the reservation enforceable rather than merely conventional.
 *
 * Both the server-side guard (core's `isReservedStateKey`) and the browser
 * bundle's client predicate derive from this one literal.
 */
export const INTERNAL_STATE_PREFIX = "$internal:";
