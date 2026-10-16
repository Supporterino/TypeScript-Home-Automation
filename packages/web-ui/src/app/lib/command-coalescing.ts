/**
 * Per-device-and-property command coalescing: at most one outstanding command
 * per key, with the latest requested value sent once it settles.
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
   * The most recent token requested for each key, never deleted, so a settled
   * request can still be told apart from a superseded one.
   */
  private readonly latestTokenByKey = new Map<string, symbol>();

  constructor(private readonly send: (key: string, value: TValue) => Promise<TResult>) {}

  /**
   * Requests that `value` be sent for `key`, queueing it as the single follow-up
   * when a send is already outstanding. Returns a token identifying this request.
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
   * Whether `token` currently owns `key` — the queued follow-up, else the
   * in-flight one. Unlike {@link isSuperseded}, it becomes `false` once settled.
   */
  isLatest(key: string, token: symbol): boolean {
    const queued = this.pendingByKey.get(key);
    if (queued) return queued.token === token;
    return this.outstandingToken.get(key) === token;
  }

  /**
   * Whether a newer request for `key` has arrived than `token`. Unlike
   * {@link isLatest}, it stays `true` after the request settles.
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

/** Builds the coalescing key for a device and property. */
export function coalescingKey(qualifiedId: string, property: string): string {
  return `${qualifiedId}:${property}`;
}
