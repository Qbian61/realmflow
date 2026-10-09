import { fireEvent, render, screen } from "@testing-library/react";
import type { SystemStatusApi } from "../../../../shared/system-status";
import { LocalizationProvider } from "../../../localization/LocalizationProvider";
import { SystemStatusPage } from "./SystemStatusPage";

function snapshot(asOf = 1_000) {
  return {
    asOf,
    resources: {
      cpuPercent: 25,
      memoryUsedBytes: 512,
      memoryTotalBytes: 1_024,
      memoryPercent: 50,
      diskUsedBytes: 750,
      diskTotalBytes: 1_000,
      diskPercent: 75,
    },
    services: [
      { id: "sidecar" as const, status: "ready" as const, detail: "ready" as const },
      { id: "vector_store" as const, status: "degraded" as const, detail: "unavailable" as const },
      { id: "embedding" as const, status: "starting" as const, detail: "starting" as const },
      { id: "sqlite" as const, status: "ready" as const, detail: "ready" as const },
      {
        id: "background_jobs" as const,
        status: "ready" as const,
        detail: { running: 2, pending: 3 },
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("SystemStatusPage", () => {
  it("renders resource metrics, service states, refresh, and timestamp", async () => {
    const api: SystemStatusApi = {
      getStatus: vi.fn().mockResolvedValue(snapshot()),
    };
    render(
      <LocalizationProvider>
        <SystemStatusPage api={api} />
      </LocalizationProvider>,
    );

    expect(
      await screen.findByRole("region", { name: "系统状态" }),
    ).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "服务状态" })).toHaveClass(
      "ui-data-table",
      "ui-data-table--default",
    );
    expect(
      screen.getByRole("row", { name: /向量索引.*降级/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("运行 2 · 等待 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新系统状态" }));
    expect(api.getStatus).toHaveBeenCalledTimes(2);
  });

  it("keeps stale data visible and locks the shared retry while refreshing", async () => {
    const retry = deferred<ReturnType<typeof snapshot>>();
    const api: SystemStatusApi = {
      getStatus: vi
        .fn()
        .mockResolvedValueOnce(snapshot())
        .mockRejectedValueOnce(new Error("offline"))
        .mockReturnValueOnce(retry.promise),
    };
    render(
      <LocalizationProvider>
        <SystemStatusPage api={api} />
      </LocalizationProvider>,
    );
    await screen.findByText("25%");

    fireEvent.click(screen.getByRole("button", { name: "刷新系统状态" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("ui-inline-alert", "ui-inline-alert--danger");
    expect(alert).toHaveTextContent("当前显示上次成功数据");
    expect(screen.getByText("25%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(screen.getByRole("button", { name: "重试" })).toBeDisabled();
    retry.resolve(snapshot(2_000));
    expect(await screen.findByText(/更新于/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
