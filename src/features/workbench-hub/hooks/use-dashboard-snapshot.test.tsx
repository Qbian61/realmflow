import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  DashboardInvalidatedEvent,
  DashboardSnapshotDto,
} from "../../../../shared/workbench-dashboard";
import type { WorkbenchHubApi } from "../../../../shared/workbench-hub";
import { useDashboardSnapshot } from "./use-dashboard-snapshot";

describe("useDashboardSnapshot", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("discards a stale response after the scope changes", async () => {
    const first = deferred<DashboardSnapshotDto>();
    const second = deferred<DashboardSnapshotDto>();
    const api = createDashboardApi();
    vi.mocked(api.getSnapshot)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ workspaceId }) =>
        useDashboardSnapshot({
          api,
          query: { workspaceId, rangeHours: 168 },
        }),
      { initialProps: { workspaceId: "space-a" } },
    );

    rerender({ workspaceId: "space-b" });
    await act(async () => second.resolve(snapshot(2_000, "space-b")));
    await waitFor(() =>
      expect(result.current.snapshot?.scope.workspaceId).toBe("space-b"),
    );
    await act(async () => first.resolve(snapshot(1_000, "space-a")));

    expect(result.current.snapshot?.scope.workspaceId).toBe("space-b");
  });

  it("merges invalidation bursts into one refresh after 500ms", async () => {
    vi.useFakeTimers();
    let invalidate: ((event: DashboardInvalidatedEvent) => void) | undefined;
    const api = createDashboardApi({
      onInvalidated: vi.fn((listener) => {
        invalidate = listener;
        return () => undefined;
      }),
    });
    vi.mocked(api.getSnapshot).mockResolvedValue(snapshot(1_000));
    renderHook(() =>
      useDashboardSnapshot({ api, query: { rangeHours: 168 } }),
    );
    await act(async () => Promise.resolve());

    act(() => {
      invalidate?.({ reason: "workflow", occurredAt: 1 });
      invalidate?.({ reason: "workflow", occurredAt: 2 });
      invalidate?.({ reason: "tasks", occurredAt: 3 });
      vi.advanceTimersByTime(499);
    });
    expect(api.getSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(api.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("polls only while visible and refreshes stale data on focus", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const api = createDashboardApi();
    vi.mocked(api.getSnapshot).mockResolvedValue(snapshot(1_000));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    renderHook(() =>
      useDashboardSnapshot({ api, query: { rangeHours: 168 } }),
    );
    await act(async () => Promise.resolve());

    await act(async () => {
      window.dispatchEvent(new FocusEvent("focus"));
      await Promise.resolve();
    });
    expect(api.getSnapshot).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => vi.advanceTimersByTime(30_000));
    expect(api.getSnapshot).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(api.getSnapshot).toHaveBeenCalledTimes(3);
  });
});

function createDashboardApi(
  overrides: Partial<WorkbenchHubApi["dashboard"]> = {},
): WorkbenchHubApi["dashboard"] {
  return {
    getSnapshot: vi.fn(),
    onInvalidated: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

function snapshot(
  asOf: number,
  workspaceId?: string,
): DashboardSnapshotDto {
  return {
    asOf,
    scope: {
      ...(workspaceId ? { workspaceId } : {}),
      rangeStart: asOf - 1_000,
      rangeEnd: asOf,
    },
    summary: {
      activeRequirements: 0,
      waitingForUser: 0,
      runtimeExceptions: 0,
      completedCount: 0,
      enteredExecutionCount: 0,
    },
    spaces: [],
    inProgress: [],
    exceptions: [],
    recentResults: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
