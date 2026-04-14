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

  constructor(capacity = 1000) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Write a log line (called by pino's stream).
   * Parses the JSON line and stores it in the ring buffer.
   */
  write(line: string): boolean {
    try {
      const entry = JSON.parse(line) as LogEntry;
      this.buffer[this.writeIndex] = entry;
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
      if (this.count < this.capacity) this.count++;
    } catch {
      // Ignore unparseable lines
    }
    return true;
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
