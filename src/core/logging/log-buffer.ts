/**
 * A log entry stored in the ring buffer.
 * @internal
 */
export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  [key: string]: unknown;
}

/**
 * Callback for newly-stored log entries. See {@link LogBuffer.subscribe}.
 * @internal
 */
export type LogBufferListener = (entry: LogEntry) => void;

/**
 * Query options for filtering log entries.
 * @internal
 */
export interface LogQuery {
  /** Filter by automation name. */
  automation?: string;
  /** Filter by minimum log level (pino numeric: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal). */
  level?: number;
  /** Maximum number of entries to return (default: 50). */
  limit?: number;
}

/**
 * In-memory ring buffer for storing recent log entries.
 *
 * Implements a writable stream interface compatible with pino's
 * multistream destination. Stores the last N log entries and supports
 * filtered queries by automation name and log level.
 *
 * @internal
 */
export class LogBuffer {
  private readonly buffer: LogEntry[];
  private writeIndex = 0;
  private count = 0;
  private readonly capacity: number;
  /** Subscribers notified of each newly-stored entry (design.md D32; task 5.0). */
  private readonly listeners: Set<LogBufferListener> = new Set();

  constructor(capacity = 1000) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Write a log chunk (called by pino's stream).
   *
   * A single chunk may contain multiple newline-delimited JSON objects (as pino
   * may deliver batched writes). Each non-empty line is parsed independently and
   * stored; a single malformed line is skipped without dropping the others.
   *
   * Newly-stored entries are announced to subscribers (see {@link subscribe}),
   * but never synchronously: notification is deferred to a later turn of the
   * event loop (design.md D32, R9; task 5.0a), so `write()` — which every
   * `logger.*` call in the engine reaches via pino's sink — always returns
   * before any listener runs. This keeps whatever a listener does (including
   * fanning out to network connections) off the hot, synchronous logging path.
   */
  write(chunk: string): boolean {
    const newEntries: LogEntry[] = [];
    for (const line of chunk.split("\n")) {
      if (line.length === 0) continue;
      try {
        const entry = JSON.parse(line) as LogEntry;
        this.buffer[this.writeIndex] = entry;
        this.writeIndex = (this.writeIndex + 1) % this.capacity;
        if (this.count < this.capacity) this.count++;
        newEntries.push(entry);
      } catch {
        // Ignore unparseable lines; other valid lines in the chunk still store.
      }
    }

    if (newEntries.length > 0 && this.listeners.size > 0) {
      setImmediate(() => {
        for (const entry of newEntries) {
          this.notify(entry);
        }
      });
    }

    return true;
  }

  /**
   * Subscribe to newly-stored log entries.
   *
   * Returns an unsubscribe function that releases the listener and retains no
   * reference to it. A listener that throws does not prevent storage (storage
   * already happened by the time listeners run) and does not stop the
   * remaining listeners from being notified.
   */
  subscribe(listener: LogBufferListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Notify every subscriber of one entry, isolating a throwing listener. */
  private notify(entry: LogEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // A throwing listener must not prevent storage (already done above)
        // or stop delivery to the other listeners. Deliberately not logged
        // here: LogBuffer has no logger, and giving it one would risk
        // reopening exactly the log-feeds-itself cycle design.md D32 exists
        // to cut — that boundary belongs to the delivery path that consumes
        // this subscription, not to the buffer itself.
      }
    }
  }

  /**
   * Query log entries with optional filters.
   *
   * Returns entries in chronological order (oldest first).
   */
  query(options: LogQuery = {}): LogEntry[] {
    const { automation, level, limit = 50 } = options;

    // Read entries in chronological order
    const entries: LogEntry[] = [];
    const start = this.count < this.capacity ? 0 : this.writeIndex;

    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      const entry = this.buffer[idx];
      if (!entry) continue;

      // Apply filters
      if (automation && entry.automation !== automation) continue;
      if (level !== undefined && entry.level < level) continue;

      entries.push(entry);
    }

    // Return the last `limit` entries
    return entries.slice(-limit);
  }
}
