import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll, initApi } from "../api";
import type { DashboardData } from "../types";

export interface PollState {
  data: DashboardData | null;
  connected: boolean;
  lastRefresh: Date | null;
  error: string | null;
  paused: boolean;
  refresh: () => void;
  togglePause: () => void;
}

/**
 * Single top-level hook that fetches all 4 API endpoints in parallel and
 * re-fetches on the given interval. Pass data down as props to child tabs.
 *
 * When paused the interval is cleared; the last fetched data remains visible.
 * Manual refresh via refresh() still works even while paused.
 */
export function useApiPoller(basePath: string, token: string, intervalMs = 5000): PollState {
  const [data, setData] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Initialise the API module with base path + token whenever they change
  useEffect(() => {
    initApi(basePath, token);
  }, [basePath, token]);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchAll();
      setData(result);
      setConnected(true);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  // Start/stop interval whenever paused changes
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!paused) {
      refresh();
      timerRef.current = setInterval(refresh, intervalMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, refresh, intervalMs]);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  return { data, connected, lastRefresh, error, paused, refresh, togglePause };
}
