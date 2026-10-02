/**
 * A log entry stored in the ring buffer and delivered over the wire.
 *
 * The single definition site for the log contract consumed by core's
 * `LogBuffer`, the web UI app, and the CLI (design.md D1).
 */
export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  automation?: string;
  service?: string;
  [key: string]: unknown;
}
