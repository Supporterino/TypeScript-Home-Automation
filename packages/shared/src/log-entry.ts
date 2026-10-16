/** A log entry stored in the ring buffer and delivered over the wire. */
export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  automation?: string;
  service?: string;
  [key: string]: unknown;
}
