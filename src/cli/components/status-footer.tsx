import { useEffect, useState } from "react";
import { COLORS } from "./theme.js";

const SPINNER_FRAMES = ["●", "○"];

function timeSince(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function StatusFooter({
  connected,
  lastRefresh,
  interval,
}: {
  connected: boolean;
  lastRefresh: number;
  interval: number;
}) {
  const [frame, setFrame] = useState(0);
  const [refreshLabel, setRefreshLabel] = useState("just now");

  // Animate status indicator
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      setRefreshLabel(timeSince(lastRefresh));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastRefresh]);

  const dot = connected ? SPINNER_FRAMES[frame] : "●";
  const dotColor = connected ? COLORS.green : COLORS.red;

  return (
    <box flexDirection="row" justifyContent="space-between" paddingX={1}>
      <text>
        <span fg={dotColor}>{dot}</span>{" "}
        <span fg={COLORS.comment}>
          {refreshLabel} · {interval}s refresh
        </span>
      </text>
      <text fg={COLORS.comment}>1-4 tabs · ? help · q quit</text>
    </box>
  );
}
