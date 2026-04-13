import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll, initApi } from "../api";
import type { DashboardData } from "../types";

export interface PollState {
  data: DashboardData | null;
  connected: boolean;
  lastRefresh: Date | null;
  error: string | null;
  refresh: () => void;
}

/**
 * Single top-level hook that fetches all 4 API endpoints in parallel and
 * re-fetches on the given interval. Pass data down as props to child tabs.
 */
export function useApiPoller(basePath: string, token: string, intervalMs = 5000): PollState {
  const [data, setData] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, intervalMs]);

  return { data, connected, lastRefresh, error, refresh };
}
