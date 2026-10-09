import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SystemStatusApi,
  SystemStatusSnapshot,
} from "../../../../shared/system-status";

const SAMPLE_INTERVAL_MS = 5_000;

export function useSystemStatus(api?: SystemStatusApi): {
  snapshot?: SystemStatusSnapshot;
  loading: boolean;
  refreshing: boolean;
  error?: string;
  refresh: () => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<SystemStatusSnapshot>();
  const [loading, setLoading] = useState(Boolean(api));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const sequenceRef = useRef(0);
  const inFlightRef = useRef<Promise<void>>();

  const refresh = useCallback((): Promise<void> => {
    if (!api) {
      setLoading(false);
      return Promise.resolve();
    }
    if (inFlightRef.current) return inFlightRef.current;
    const sequence = ++sequenceRef.current;
    setRefreshing(true);
    const request = api
      .getStatus()
      .then((nextSnapshot) => {
        if (sequence !== sequenceRef.current) return;
        setSnapshot(nextSnapshot);
        setError(undefined);
      })
      .catch(() => {
        if (sequence === sequenceRef.current) {
          setError("system_status_load_failed");
        }
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = undefined;
        if (sequence === sequenceRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    inFlightRef.current = request;
    return request;
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { snapshot, loading, refreshing, error, refresh };
}
