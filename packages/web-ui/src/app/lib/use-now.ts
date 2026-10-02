/** Ticks every `intervalMs` so a component displaying a relative age re-renders as time passes. */
import { useEffect, useState } from "react";

export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
