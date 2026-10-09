import {
  act,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../features/toast/ToastProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import ChatSessionPage from "./ChatSessionPage";

const imageMocks = vi.hoisted(() => ({
  renderCanvas: vi.fn(),
}));

vi.mock("html2canvas", () => ({
  default: imageMocks.renderCanvas,
}));

function renderPage(): void {
  window.realmflow = { business: {} } as typeof window.realmflow;
  testingRender(
    <LocalizationProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={["/sessions/session-share"]}>
          <Routes>
            <Route
              path="/sessions/:sessionId"
              element={
                <ChatSessionPage
                  sessions={[
                    {
                      id: "session-share",
                      title: "Release plan",
                      spacePath: "/spaces/product",
                      messages: [
                        {
                          id: "message-user",
                          role: "user",
                          status: "completed",
                          content: "Plan the release",
                          createdAt: 1,
                        },
                        {
                          id: "message-assistant",
                          role: "assistant",
                          status: "completed",
                          content: "Use a canary rollout.",
                          modelName: "DeepSeek V4 Pro",
                          createdAt: 2,
                        },
                      ],
                      createdAt: 1,
                      updatedAt: 2,
                    },
                  ]}
                  spaces={[]}
                  onAppendMessage={vi.fn()}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </LocalizationProvider>,
  );
}

function getAssistantShareButton(): HTMLElement {
  const actions = screen
    .getByRole("button", { name: "复制回答" })
    .closest(".chat-message-actions");
  if (!(actions instanceof HTMLElement)) {
    throw new Error("Assistant message actions are missing");
  }
  return within(actions).getByRole("button", { name: "分享回答" });
}

afterEach(() => {
  delete window.realmflow;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  imageMocks.renderCanvas.mockReset();
  vi.useRealTimers();
});

describe("conversation image sharing", () => {
  it("places share after copy for user messages and selects the clicked message", () => {
    renderPage();

    const actions = screen
      .getByRole("button", { name: "复制消息" })
      .closest(".chat-message-actions");
    expect(
      [...(actions?.querySelectorAll("button") ?? [])].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(["复制消息", "分享回答"]);

    fireEvent.click(
      actions?.querySelector('button[aria-label="分享回答"]') as HTMLElement,
    );

    expect(
      screen.getByRole("checkbox", { name: "选择消息：Plan the release" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "选择消息：Use a canary rollout.",
      }),
    ).not.toBeChecked();
  });

  it("places share after copy and opens with the clicked response selected", () => {
    renderPage();

    const actions = screen
      .getByRole("button", { name: "复制回答" })
      .closest(".chat-message-actions");
    expect(
      [...(actions?.querySelectorAll("button") ?? [])].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(["复制回答", "分享回答", "重新生成回答"]);

    fireEvent.click(getAssistantShareButton());

    const dialog = screen.getByRole("dialog", { name: "对话分享" });
    const scrollBody = dialog.querySelector('[data-dialog-scroll="true"]');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--workspace");
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(dialog.parentElement).toHaveClass("ui-dialog-backdrop");
    expect(dialog.parentElement).not.toHaveClass("conversation-share-backdrop");
    expect(scrollBody).toHaveClass(
      "ui-dialog__body",
      "conversation-share-selection",
    );
    expect(dialog.querySelectorAll('[data-dialog-scroll="true"]')).toHaveLength(
      1,
    );
    expect(scrollBody?.previousElementSibling).toHaveClass(
      "ui-dialog__header",
    );
    expect(scrollBody?.nextElementSibling).toHaveClass("ui-dialog__footer");
    expect(
      screen.getByRole("checkbox", { name: "选择消息：Plan the release" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "选择消息：Use a canary rollout.",
      }),
    ).toBeChecked();
    expect(
      screen
        .getByRole("checkbox", {
          name: "选择消息：Use a canary rollout.",
        })
        .closest(".chat-message"),
    ).toHaveClass("is-selected");
    expect(
      screen
        .getByRole("checkbox", { name: "选择消息：Plan the release" })
        .closest(".chat-message"),
    ).not.toHaveClass("is-selected");
    expect(
      screen.getByRole("button", { name: "生成图片" }),
    ).toHaveClass(
      "ui-button",
      "ui-button--primary",
      "ui-button--default",
    );
    expect(
      screen.getByRole("button", { name: "取消分享" }),
    ).toHaveClass(
      "ui-button",
      "ui-icon-button",
      "ui-button--ghost",
      "ui-button--compact",
    );
  });

  it("supports selecting all messages and closes on pointer press", () => {
    renderPage();
    fireEvent.click(getAssistantShareButton());

    fireEvent.click(screen.getByRole("checkbox", { name: "全选消息" }));
    expect(
      screen.getByRole("checkbox", { name: "选择消息：Plan the release" }),
    ).toBeChecked();
    fireEvent.pointerDown(screen.getByRole("button", { name: "取消分享" }));

    expect(
      screen.queryByRole("dialog", { name: "对话分享" }),
    ).not.toBeInTheDocument();
  });

  it("closes the sharing dialog with Escape", () => {
    renderPage();
    fireEvent.click(getAssistantShareButton());

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "对话分享" }),
    ).not.toBeInTheDocument();
  });

  it("generates a local PNG preview from the selected messages", async () => {
    const dataUrl = "data:image/png;base64,cG5n";
    imageMocks.renderCanvas.mockResolvedValue({
      toDataURL: () => dataUrl,
      width: 1140,
      height: 720,
    });
    renderPage();
    fireEvent.click(getAssistantShareButton());

    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    const preview = await screen.findByRole("img", {
      name: "分享图片预览",
    });
    expect(preview).toHaveAttribute("src", "data:image/png;base64,cG5n");
    expect(preview).toHaveAttribute("width", "1140");
    expect(preview).toHaveAttribute("height", "720");
    expect(preview).toHaveAttribute("loading", "eager");
    expect(preview).toHaveAttribute("decoding", "async");
    expect(imageMocks.renderCanvas).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        backgroundColor: "#ffffff",
        logging: false,
        scale: 1.5,
        useCORS: true,
      }),
    );
  });

  it("replaces a failed PNG decode with the recoverable generation error", async () => {
    imageMocks.renderCanvas.mockResolvedValue({
      toDataURL: () => "data:image/png;base64,cG5n",
      width: 1140,
      height: 720,
    });
    renderPage();
    fireEvent.click(getAssistantShareButton());
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    fireEvent.error(
      await screen.findByRole("img", { name: "分享图片预览" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "图片生成失败，请重试",
    );
    expect(
      screen.getByRole("button", { name: "重试生成图片" }),
    ).toBeEnabled();
  });

  it("starts image generation when animation frames are paused", async () => {
    const dataUrl = "data:image/png;base64,cG5n";
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    imageMocks.renderCanvas.mockResolvedValue({
      toDataURL: () => dataUrl,
    });
    renderPage();
    fireEvent.click(getAssistantShareButton());

    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    await waitFor(() => expect(imageMocks.renderCanvas).toHaveBeenCalledOnce());
  });

  it("copies and downloads the generated PNG", async () => {
    const dataUrl = "data:image/png;base64,cG5n";
    imageMocks.renderCanvas.mockResolvedValue({
      toDataURL: () => dataUrl,
    });
    const write = vi.fn().mockResolvedValue(undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("image data URLs must not use fetch");
    }));
    vi.stubGlobal("ClipboardItem", class {
      constructor(readonly items: Record<string, Blob>) {}
    });
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { write, writeText: vi.fn() },
    });
    renderPage();
    fireEvent.click(getAssistantShareButton());
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));
    await screen.findByRole("img", { name: "分享图片预览" });

    fireEvent.click(screen.getByRole("button", { name: "复制图片" }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "下载图片" }));

    expect(click).toHaveBeenCalledOnce();
  });

  it("publishes a Toast when copying the generated PNG fails", async () => {
    imageMocks.renderCanvas.mockResolvedValue({
      toDataURL: () => "data:image/png;base64,cG5n",
    });
    const write = vi
      .fn()
      .mockRejectedValue(new Error("token=secret path=/Users/private"));
    vi.stubGlobal("ClipboardItem", class {
      constructor(readonly items: Record<string, Blob>) {}
    });
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { write, writeText: vi.fn() },
    });
    renderPage();
    fireEvent.click(getAssistantShareButton());
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));
    await screen.findByRole("img", { name: "分享图片预览" });

    fireEvent.click(screen.getByRole("button", { name: "复制图片" }));

    expect(await screen.findByText("无法复制图片，请使用下载")).toHaveClass(
      "toast-message__text",
    );
    expect(screen.queryByText(/token=secret/)).not.toBeInTheDocument();
    expect(
      document.querySelector(".conversation-share-actions [role='alert']"),
    ).toBeNull();
  });

  it("shows a recoverable error when image generation fails", async () => {
    imageMocks.renderCanvas.mockRejectedValue(new Error("canvas failed"));
    renderPage();
    fireEvent.click(getAssistantShareButton());
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    expect(await screen.findByRole("alert")).toHaveClass(
      "ui-inline-alert",
      "ui-inline-alert--danger",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "图片生成失败，请重试",
    );
    expect(
      screen.getByRole("button", { name: "重试生成图片" }),
    ).toBeEnabled();
  });

  it("stops waiting when image generation does not settle", async () => {
    vi.useFakeTimers();
    imageMocks.renderCanvas.mockReturnValue(new Promise(() => undefined));
    renderPage();
    fireEvent.click(getAssistantShareButton());
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "图片生成失败，请重试",
    );
  });
});
