import {
  fireEvent,
  render as testingRender,
  screen,
} from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { BusinessApi } from "../../shared/business";
import { ToastProvider } from "../features/toast/ToastProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import HelpPage from "./HelpPage";

function renderPage(): ReturnType<typeof testingRender> {
  return testingRender(
    <LocalizationProvider>
      <ToastProvider>
        <HelpPage />
      </ToastProvider>
    </LocalizationProvider>,
  );
}

describe("HelpPage", () => {
  afterEach(() => {
    delete window.realmflow;
    vi.restoreAllMocks();
  });

  it("renders complete local help without the desktop API or network access", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "帮助与反馈" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "从空间开始" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "运行与审批" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "数据与隐私" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/工作数据默认保存在本机/)).toBeInTheDocument();
    const onlineHelp = screen.getByRole("button", { name: "打开在线帮助" });
    expect(onlineHelp).toBeDisabled();
    expect(onlineHelp).toHaveClass(
      "ui-button",
      "ui-button--comfortable",
      "ui-button--primary",
    );
    const feedback = screen.getByRole("button", { name: "提交反馈" });
    expect(feedback).toBeDisabled();
    expect(feedback).toHaveClass(
      "ui-button",
      "ui-button--comfortable",
      "ui-button--neutral",
    );
  });

  it("opens only the typed online-help and feedback targets", async () => {
    const openSupportLink = vi.fn().mockImplementation(({ target }) =>
      Promise.resolve({
        requestId: `opened-${target}`,
        target,
        status: "opened",
      }),
    );
    window.realmflow = {
      business: { openSupportLink } as unknown as BusinessApi,
    } as typeof window.realmflow;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "打开在线帮助" }));
    expect(await screen.findByText("已在系统浏览器中打开")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(openSupportLink).toHaveBeenCalledWith({
      requestId: expect.any(String),
      target: "online_help",
    });
    expect(openSupportLink).toHaveBeenCalledWith({
      requestId: expect.any(String),
      target: "feedback",
    });
    expect(await screen.findByText("已在系统浏览器中打开")).toBeInTheDocument();
  });

  it("toasts localized errors while keeping bundled help available", async () => {
    const openSupportLink = vi.fn().mockResolvedValue({
      requestId: "link-failed",
      target: "online_help",
      status: "failed",
      errorCode: "audit_unavailable",
    });
    window.realmflow = {
      business: { openSupportLink } as unknown as BusinessApi,
    } as typeof window.realmflow;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "打开在线帮助" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "无法记录安全审计，未打开外部页面",
    );
    expect(alert).toHaveAttribute("data-toast-level", "error");
    expect(document.querySelector(".support-error")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "数据与隐私" }),
    ).toBeInTheDocument();
  });

  it("does not expose a rejected support-link error message", async () => {
    const openSupportLink = vi
      .fn()
      .mockRejectedValue(new Error("token=secret /Users/private"));
    window.realmflow = {
      business: { openSupportLink } as unknown as BusinessApi,
    } as typeof window.realmflow;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("无法打开系统浏览器，请重试");
    expect(alert).toHaveAttribute("data-toast-level", "error");
    expect(screen.queryByText(/token=secret|Users\/private/)).not.toBeInTheDocument();
  });
});
