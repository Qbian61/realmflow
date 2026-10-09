import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DashboardSnapshotDto,
  DashboardSnapshotQuery,
} from "../../../../shared/workbench-dashboard";
import type { WorkbenchHubApi } from "../../../../shared/workbench-hub";

const INVALIDATION_DEBOUNCE_MS = 500;
const POLL_INTERVAL_MS = 30_000;
const FOCUS_STALE_MS = 15_000;

type DashboardSnapshotState = {
  snapshot?: DashboardSnapshotDto;
  loading: boolean;
  refreshing: boolean;
  error?: string;
  refresh: () => Promise<void>;
};

export function useDashboardSnapshot({
  api,
  query,
}: {
  api?: WorkbenchHubApi["dashboard"];
  query: DashboardSnapshotQuery;
}): DashboardSnapshotState {
  const [snapshot, setSnapshot] = useState<DashboardSnapshotDto>();
  const [loading, setLoading] = useState(Boolean(api));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const sequenceRef = useRef(0);
  const snapshotRef = useRef<DashboardSnapshotDto>();
  const inFlightRef = useRef<{
    signature: string;
    promise: Promise<void>;
  }>();
  const querySignature = `${query.workspaceId ?? ""}:${query.rangeHours ?? 168}`;

  const refresh = useCallback((): Promise<void> => {
    if (!api) {
      setLoading(false);
      return Promise.resolve();
    }
    if (inFlightRef.current?.signature === querySignature) {
      return inFlightRef.current.promise;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    setRefreshing(true);
    const request = api
      .getSnapshot(query)
      .then((nextSnapshot) => {
        if (sequence !== sequenceRef.current) return;
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
        setError(undefined);
      })
      .catch(() => {
        if (sequence === sequenceRef.current) {
          setError("dashboard_load_failed");
        }
      })
      .finally(() => {
        if (sequence !== sequenceRef.current) return;
        if (inFlightRef.current?.promise === request) {
          inFlightRef.current = undefined;
        }
        setLoading(false);
        setRefreshing(false);
      });
    inFlightRef.current = { signature: querySignature, promise: request };
    return request;
  }, [api, querySignature, query.workspaceId, query.rangeHours]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!api) return;
    let timeout: number | undefined;
    const unsubscribe = api.onInvalidated(() => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        timeout = undefined;
        void refresh();
      }, INVALIDATION_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [api, refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const onFocus = (): void => {
      const current = snapshotRef.current;
      if (current && Date.now() - current.asOf >= FOCUS_STALE_MS) {
        void refresh();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return { snapshot, loading, refreshing, error, refresh };
}
