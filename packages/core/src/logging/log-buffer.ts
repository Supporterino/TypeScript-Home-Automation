import type { LogEntry } from "@ts-ha/shared";

export type { LogEntry } from "@ts-ha/shared";

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
 * In-memory ring buffer of recent log entries, implementing a pino-compatible writable
 * stream with filtered queries.
 *
 * @internal
 */
export class LogBuffer {
  private readonly buffer: LogEntry[];
  private writeIndex = 0;
  private count = 0;
  private readonly capacity: number;
  /** Subscribers notified of each newly-stored entry. */
  private readonly listeners: Set<LogBufferListener> = new Set();

  constructor(capacity = 1000) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Write a pino log chunk; each newline-delimited JSON line is stored independently, and
   * subscribers are notified asynchronously after `write()` returns.
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
   * Subscribe to newly-stored log entries; returns an unsubscribe function. A throwing
   * listener does not stop the remaining listeners.
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
        // A throwing listener must not prevent storage or stop delivery to the others.
        // Deliberately not logged: LogBuffer has no logger, and giving it one would risk
        // reopening the log-feeds-itself cycle the delivery path exists to cut.
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
