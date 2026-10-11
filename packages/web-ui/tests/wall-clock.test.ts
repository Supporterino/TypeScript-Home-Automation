import { describe, expect, it } from "bun:test";
import { formatClock } from "../src/app/wall/widgets/clock.js";

describe("formatClock", () => {
  it("renders the local time for a fixed instant", () => {
    const now = new Date(2026, 0, 15, 14, 30, 0).getTime();
    const { time } = formatClock(now);

    expect(time).toMatch(/^\d{2}:\d{2}$/);
    const [hour, minute] = time.split(":").map((part) => Number.parseInt(part, 10));
    expect(hour).toBe(14);
    expect(minute).toBe(30);
  });

  it("renders a non-empty local date", () => {
    const now = new Date(2026, 0, 15, 14, 30, 0).getTime();
    expect(formatClock(now).date.length).toBeGreaterThan(0);
  });

  it("advances the time with the instant", () => {
    const before = new Date(2026, 0, 15, 14, 30, 0).getTime();
    const after = new Date(2026, 0, 15, 14, 31, 0).getTime();
    expect(formatClock(after).time).toBe("14:31");
    expect(formatClock(after).time).not.toBe(formatClock(before).time);
  });

  it("derives entirely from its argument — no server data or clock access", () => {
    const day = new Date(2026, 0, 15, 14, 30, 0).getTime();
    const nextDay = new Date(2026, 0, 16, 14, 30, 0).getTime();

    expect(formatClock(day)).toEqual(formatClock(day));
    expect(formatClock(nextDay).date).not.toBe(formatClock(day).date);
  });
});
