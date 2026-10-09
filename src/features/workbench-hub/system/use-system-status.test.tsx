import { act, renderHook } from "@testing-library/react";
import type { SystemStatusApi } from "../../../../shared/system-status";
import { useSystemStatus } from "./use-system-status";

describe("useSystemStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("samples every five seconds only while the page is visible", async () => {
    vi.useFakeTimers();
    const api: SystemStatusApi = {
      getStatus: vi.fn().mockResolvedValue(snapshot(1_000)),
    };
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    const { result } = renderHook(() => useSystemStatus(api));
    await act(async () => Promise.resolve());

    act(() => vi.advanceTimersByTime(5_000));
    await act(async () => Promise.resolve());
    expect(api.getStatus).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => vi.advanceTimersByTime(10_000));
    expect(api.getStatus).toHaveBeenCalledTimes(2);

    await act(async () => result.current.refresh());
    expect(api.getStatus).toHaveBeenCalledTimes(3);
  });
});

function snapshot(asOf: number) {
  return {
    asOf,
    resources: {
      cpuPercent: 10,
      memoryUsedBytes: 50,
      memoryTotalBytes: 100,
      memoryPercent: 50,
      diskUsedBytes: 75,
      diskTotalBytes: 100,
      diskPercent: 75,
    },
    services: [],
  };
}
