/**
 * Per-device-and-property command coalescing (design.md D31; task 10.12c).
 *
 * A continuous control (a brightness or position slider being dragged) must
 * not issue one command per intermediate value: at most one command per
 * device and property may be outstanding at a time, and once it settles the
 * latest requested value — not every intermediate one — is sent. Only the
 * most recent request for a key ever owns reconciliation and the D21 revert
 * deadline, so a confirmation for a superseded intermediate value must never
 * be allowed to move the control backwards.
 *
 * Pure and DOM-free (design.md D23): keyed by an opaque string (callers use
 * `${qualifiedId}:${property}`, keeping one device's adjustment from ever
 * delaying a command to another), with no dependency on React or the fetch
 * layer — `send` is supplied by the caller.
 */

/** The outcome delivered to a request's `onSettle` callback. */
export type CoalescedOutcome<TResult> =
  | { status: "sent"; result: TResult }
  | { status: "sent_error"; error: unknown }
  /** A later request for the same key arrived before this one was ever sent. */
  | { status: "superseded" };

interface PendingEntry<TValue, TResult> {
  token: symbol;
  value: TValue;
  onSettle: (outcome: CoalescedOutcome<TResult>) => void;
}

/**
 * Coalesces requests per key so that at most one is ever in flight, with the
 * most recently requested value winning once the in-flight one settles.
 */
export class CommandCoalescer<TValue, TResult> {
  private readonly outstandingToken = new Map<string, symbol>();
  private readonly pendingByKey = new Map<string, PendingEntry<TValue, TResult>>();
  /**
   * The most recent token requested for each key, never deleted. Unlike
   * {@link outstandingToken} (cleared once a send settles), it remembers the
   * newest request so a settled request can still be told apart from a
   * superseded one (design.md D3).
   */
  private readonly latestTokenByKey = new Map<string, symbol>();

  constructor(private readonly send: (key: string, value: TValue) => Promise<TResult>) {}

  /**
   * Requests that `value` be sent for `key`.
   *
   * If nothing is currently outstanding for `key`, `send` is invoked
   * immediately. If something is already outstanding, this call becomes the
   * (single) queued follow-up — superseding, and immediately notifying, any
   * previously queued follow-up for the same key — and is issued once the
   * outstanding command settles.
   *
   * `onSettle` is called exactly once: with the send outcome if this request
   * is the one actually issued, or synchronously with `{status:
   * "superseded"}` if a later call for the same key arrives before this one
   * is ever sent.
   *
   * Returns a token identifying this request; compare it against
   * {@link isSuperseded} (or {@link isLatest}) before reconciling anything
   * against a later response, since a response can arrive after this request
   * has already been superseded.
   */
  request(
    key: string,
    value: TValue,
    onSettle: (outcome: CoalescedOutcome<TResult>) => void,
  ): symbol {
    const token = Symbol(key);
    this.latestTokenByKey.set(key, token);

    if (!this.outstandingToken.has(key)) {
      this.outstandingToken.set(key, token);
      this.issue(key, token, value, onSettle);
      return token;
    }

    const previouslyQueued = this.pendingByKey.get(key);
    if (previouslyQueued) previouslyQueued.onSettle({ status: "superseded" });
    this.pendingByKey.set(key, { token, value, onSettle });
    return token;
  }

  /**
   * Whether `token` is the request that currently *owns* `key` — the queued
   * follow-up if one exists, else the in-flight one — and so is `false` once its
   * send settles and `advance()` deletes its token.
   *
   * Retained per design.md D3 as the "what it already serves" companion to
   * {@link isSuperseded}: the two answer different questions, and this one's
   * answer is deliberately history-dependent. After the optimistic layer moved
   * to {@link isSuperseded} it is exercised by tests in
   * `command-coalescing.test.ts` rather than by that hook — kept honest here so
   * a future reader knows why both predicates exist.
   */
  isLatest(key: string, token: symbol): boolean {
    const queued = this.pendingByKey.get(key);
    if (queued) return queued.token === token;
    return this.outstandingToken.get(key) === token;
  }

  /**
   * Whether a newer request for `key` has arrived than `token` — that is,
   * whether this request has been superseded, whether or not it was ever sent.
   *
   * This answers a different question from {@link isLatest}. `isLatest` reports
   * which request currently *owns* the key (the queued follow-up, else the
   * in-flight one) and is `false` for a request once its send settles and
   * `advance()` deletes its token. This predicate asks only whether some later
   * request for the same key exists, so it does **not** become `false` merely
   * because the send settled. The optimistic layer needs that history-stable
   * question: a command that has already settled must still own its revert
   * deadline and still yield to a device report (design.md D3).
   */
  isSuperseded(key: string, token: symbol): boolean {
    const latest = this.latestTokenByKey.get(key);
    return latest !== undefined && latest !== token;
  }

  /** Whether any request for `key` is currently in flight. */
  isOutstanding(key: string): boolean {
    return this.outstandingToken.has(key);
  }

  private issue(
    key: string,
    token: symbol,
    value: TValue,
    onSettle: (outcome: CoalescedOutcome<TResult>) => void,
  ): void {
    this.send(key, value).then(
      (result) => {
        onSettle({ status: "sent", result });
        this.advance(key);
      },
      (error: unknown) => {
        onSettle({ status: "sent_error", error });
        this.advance(key);
      },
    );
  }

  private advance(key: string): void {
    this.outstandingToken.delete(key);
    const next = this.pendingByKey.get(key);
    if (!next) return;
    this.pendingByKey.delete(key);
    this.outstandingToken.set(key, next.token);
    this.issue(key, next.token, next.value, next.onSettle);
  }
}

/** Builds the coalescing key for a device and property, per design.md D31. */
export function coalescingKey(qualifiedId: string, property: string): string {
  return `${qualifiedId}:${property}`;
}
