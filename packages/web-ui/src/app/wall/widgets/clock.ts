/**
 * Clock/date derivation for the wall clock widget (specs/wall-display "Widget
 * Catalog", "Always-On Operation"; design.md D11).
 *
 * Derived entirely from the client clock with no server data, so the widget
 * keeps showing the correct local time while the engine is unreachable. Pure
 * and DOM-free so it is reachable by `bun test` (design.md D23).
 */

export interface ClockDisplay {
  /** Local wall-clock time, e.g. `14:30`. */
  time: string;
  /** Local date, e.g. `Sunday, October 11`. */
  date: string;
}

/**
 * Formats an instant for the wall clock. The hour cycle is pinned to `h23` so
 * every locale renders a stable 24-hour `HH:mm` (never a locale-dependent
 * 12-hour form), matching a glanceable always-on panel.
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
