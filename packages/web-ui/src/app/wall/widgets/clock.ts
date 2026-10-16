/**
 * Clock/date derivation for the wall clock widget, from the client clock alone so
 * it keeps showing local time while the engine is unreachable.
 */

export interface ClockDisplay {
  /** Local wall-clock time, e.g. `14:30`. */
  time: string;
  /** Local date, e.g. `Sunday, October 11`. */
  date: string;
}

/**
 * Formats an instant for the wall clock, pinning the hour cycle to `h23` so every
 * locale renders a stable 24-hour `HH:mm`.
 */
export function formatClock(now: number): ClockDisplay {
  const instant = new Date(now);
  return {
    time: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant),
    date: new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(instant),
  };
}
