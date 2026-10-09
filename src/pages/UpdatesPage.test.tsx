import {
  fireEvent,
  render as testingRender,
  screen,
} from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { UpdateCheckRecord } from "../../domain/app-support";
import type { BusinessApi } from "../../shared/business";
import { ToastProvider } from "../features/toast/ToastProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import UpdatesPage from "./UpdatesPage";

function renderPage(): ReturnType<typeof testingRender> {
  return testingRender(
    <LocalizationProvider>
      <ToastProvider>
        <UpdatesPage />
      </ToastProvider>
    </LocalizationProvider>,
  );
}

function setup(options?: {
  lastCheck?: UpdateCheckRecord;
  getAppSupportInfo?: ReturnType<typeof vi.fn>;
  checkForUpdates?: ReturnType<typeof vi.fn>;
  openSupportLink?: ReturnType<typeof vi.fn>;
}) {
  const getAppSupportInfo =
    options?.getAppSupportInfo ??
    vi.fn().mockResolvedValue({
      currentVersion: "1.2.3",
      lastCheck: options?.lastCheck,
    });
  const checkForUpdates =
    options?.checkForUpdates ??
    vi.fn().mockResolvedValue({
      requestId: "check-new",
      currentVersion: "1.2.3",
      latestVersion: "1.2.3",
      status: "up_to_date",
      checkedAt: 2_000,
    });
  const openSupportLink =
    options?.openSupportLink ??
    vi.fn().mockResolvedValue({
      requestId: "link-1",
      target: "releases",
      status: "opened",
    });
  window.realmflow = {
    business: {
      getAppSupportInfo,
      checkForUpdates,
      openSupportLink,
    } as unknown as BusinessApi,
  } as typeof window.realmflow;
  return { getAppSupportInfo, checkForUpdates, openSupportLink };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("UpdatesPage", () => {
  afterEach(() => {
    delete window.realmflow;
    vi.restoreAllMocks();
  });

  it("loads the current version and persisted update-available snapshot", async () => {
    setup({
      lastCheck: {
        requestId: "check-previous",
        currentVersion: "1.2.3",
        latestVersion: "1.4.0",
        status: "update_available",
        checkedAt: Date.UTC(2026, 8, 28, 8, 0),
      },
    });

    renderPage();

    expect(await screen.findByText("1.2.3")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("发现新版本");
    expect(screen.getByText("1.4.0")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开发布页" }),
    ).toHaveClass(
      "ui-button",
      "ui-button--comfortable",
      "ui-button--primary",
    );
    expect(screen.getByRole("button", { name: "检查更新" })).toHaveClass(
      "ui-button",
      "ui-button--comfortable",
      "ui-button--primary",
    );
  });

  it("retries a failed support-info load through the shared alert", async () => {
    const retry = deferred<{
      currentVersion: string;
      lastCheck?: UpdateCheckRecord;
    }>();
    const getAppSupportInfo = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockReturnValueOnce(retry.promise);
    setup({ getAppSupportInfo });
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("ui-inline-alert", "ui-inline-alert--danger");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(getAppSupportInfo).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "重试" })).toBeDisabled();
    retry.resolve({ currentVersion: "1.2.3" });
    expect(await screen.findByText("1.2.3")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the action while checking and displays the committed result", async () => {
    const pending = deferred<UpdateCheckRecord>();
    const { checkForUpdates } = setup({
      checkForUpdates: vi.fn().mockReturnValue(pending.promise),
    });
    renderPage();
    await screen.findByText("1.2.3");

    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));

    expect(
      screen.getByRole("button", { name: "正在检查…" }),
    ).toBeDisabled();
    expect(checkForUpdates).toHaveBeenCalledWith({
      requestId: expect.any(String),
    });

    pending.resolve({
      requestId: "check-current",
      currentVersion: "1.2.3",
      latestVersion: "1.2.3",
      status: "up_to_date",
      checkedAt: 3_000,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "已是最新版本",
    );
  });

  it("shows a retryable localized failure result", async () => {
    setup({
      checkForUpdates: vi.fn().mockResolvedValue({
        requestId: "check-failed",
        currentVersion: "1.2.3",
        status: "failed",
        errorCode: "request_timeout",
        checkedAt: 3_000,
      }),
    });
    renderPage();
    await screen.findByText("1.2.3");

    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "检查超时，请重试",
    );
    expect(
      screen.getByRole("button", { name: "重新检查" }),
    ).toBeInTheDocument();
  });

  it("keeps the previous result when a new command is rejected", async () => {
    setup({
      lastCheck: {
        requestId: "check-previous",
        currentVersion: "1.2.3",
        latestVersion: "1.4.0",
        status: "update_available",
        checkedAt: 2_000,
      },
      checkForUpdates: vi
        .fn()
        .mockRejectedValue(new Error("token=secret /Users/private")),
    });
    renderPage();
    await screen.findByText("1.4.0");

    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "暂时无法检查更新，请重试",
    );
    expect(alert).toHaveAttribute("data-toast-level", "error");
    expect(document.querySelector(".support-error")).not.toBeInTheDocument();
    expect(screen.queryByText(/token=secret|Users\/private/)).not.toBeInTheDocument();
    expect(screen.getByText("1.4.0")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("发现新版本");
  });

  it("keeps the previous successful result when a committed check fails", async () => {
    setup({
      lastCheck: {
        requestId: "check-previous",
        currentVersion: "1.2.3",
        latestVersion: "1.4.0",
        status: "update_available",
        checkedAt: 2_000,
      },
      checkForUpdates: vi.fn().mockResolvedValue({
        requestId: "check-failed",
        currentVersion: "1.2.3",
        status: "failed",
        errorCode: "service_unavailable",
        checkedAt: 3_000,
      }),
    });
    renderPage();
    await screen.findByText("1.4.0");

    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "更新服务暂时不可用，请重试",
    );
    expect(alert).toHaveAttribute("data-toast-level", "error");
    expect(document.querySelector(".support-error")).not.toBeInTheDocument();
    expect(screen.getByText("1.4.0")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("发现新版本");
  });

  it("opens the fixed releases target and reports browser failures", async () => {
    const openSupportLink = vi
      .fn()
      .mockResolvedValueOnce({
        requestId: "link-failed",
        target: "releases",
        status: "failed",
        errorCode: "target_unavailable",
      })
      .mockResolvedValueOnce({
        requestId: "link-opened",
        target: "releases",
        status: "opened",
      });
    setup({
      lastCheck: {
        requestId: "check-previous",
        currentVersion: "1.2.3",
        latestVersion: "1.4.0",
        status: "update_available",
        checkedAt: 2_000,
      },
      openSupportLink,
    });
    renderPage();
    await screen.findByText("1.4.0");

    fireEvent.click(screen.getByRole("button", { name: "打开发布页" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "无法打开系统浏览器，请重试",
    );
    expect(alert).toHaveAttribute("data-toast-level", "error");
    expect(document.querySelector(".support-error")).not.toBeInTheDocument();
    expect(openSupportLink).toHaveBeenLastCalledWith({
      requestId: expect.any(String),
      target: "releases",
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "打开发布页" }));
    expect(await screen.findByRole("button", { name: "打开发布页" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
