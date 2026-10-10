import {
  act,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealmFlowApi } from "../../shared/types";
import type { ChatSession } from "../domain/chat-session";
import { ToastProvider } from "../features/toast/ToastProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import ChatSessionPage, {
  artifactOpenFailureMessageKey,
} from "./ChatSessionPage";
import { NewChatPage } from "./NewChatPage";

function render(ui: Parameters<typeof testingRender>[0]) {
  return testingRender(
    <LocalizationProvider>
      <ToastProvider>{ui}</ToastProvider>
    </LocalizationProvider>,
  );
}

describe("general conversation pages", () => {
  beforeEach(() => {
    window.realmflow = {
      business: {
        listEffectiveModels: vi.fn().mockResolvedValue({
          groups: [
            {
              providerId: "provider-1",
              providerName: "Local",
              providerType: "local",
              readiness: "ready",
              models: [
                {
                  profileId: "profile-1",
                  modelId: "model-1",
                  displayName: "Primary model",
                  capabilities: {
                    text: true,
                    vision: false,
                    toolCalling: false,
                    structuredOutput: false,
                  },
                  contextWindow: 128_000,
                },
              ],
            },
          ],
        }),
        getApplicationModelDefault: vi
          .fn()
          .mockResolvedValue({ mode: "auto", revision: 1 }),
      },
    } as unknown as typeof window.realmflow;
  });

  afterEach(() => {
    delete window.realmflow;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the new-chat prompt disabled until creation succeeds", async () => {
    const creation = deferred<void>();
    const onCreateSession = vi.fn(() => creation.promise);
    render(<NewChatPage onCreateSession={onCreateSession} />);
    const textarea = screen.getByRole("textbox", { name: "对话内容" });
    const submit = screen.getByRole("button", { name: "发送消息" });

    fireEvent.change(textarea, { target: { value: "Keep this prompt" } });
    fireEvent.click(submit);

    expect(textarea).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(textarea).toHaveValue("Keep this prompt");

    await act(async () => creation.resolve());
    expect(textarea).toHaveValue("");
    expect(textarea).not.toBeDisabled();
  });

  it("does not advertise unsupported voice input", () => {
    render(<NewChatPage onCreateSession={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: "语音输入" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "发送消息" }),
    ).toBeInTheDocument();
  });

  it("uses an upward arrow icon for the submit action", () => {
    render(<NewChatPage onCreateSession={vi.fn()} />);

    const submit = screen.getByRole("button", { name: "发送消息" });
    expect(submit.querySelector("svg")).toHaveClass("lucide-arrow-up");
  });

  it("registers image attachments in Main and requires explicit model egress consent", async () => {
    const pick = vi.fn().mockResolvedValue({
      accepted: [
        {
          id: "attachment-1",
          ownerId: "draft-1",
          fileName: "architecture.png",
          mimeType: "image/png",
          mediaKind: "image",
          sizeBytes: 128,
          checksumSha256: "a".repeat(64),
          source: "picker",
          status: "registered",
          createdAt: 1,
        },
      ],
      rejected: [],
    });
    window.realmflow = {
      ...window.realmflow,
      conversationAttachments: {
        pick,
        remove: vi.fn().mockResolvedValue(undefined),
      },
    } as typeof window.realmflow;
    const onCreateSession = vi.fn().mockResolvedValue(undefined);
    render(<NewChatPage onCreateSession={onCreateSession} />);

    fireEvent.click(screen.getByRole("button", { name: "打开添加菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "添加文件" }));

    expect(await screen.findByText("architecture.png")).toBeVisible();
    const consent = screen.getByRole("checkbox", {
      name: "允许向模型发送 1 张图片",
    });
    expect(consent).not.toBeChecked();
    fireEvent.click(consent);
    fireEvent.change(screen.getByRole("textbox", { name: "对话内容" }), {
      target: { value: "分析这张架构图" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() =>
      expect(onCreateSession).toHaveBeenCalledWith(
        "none",
        "分析这张架构图",
        undefined,
        "auto",
        expect.objectContaining({
          attachmentIds: ["attachment-1"],
          allowImageEgress: true,
          draftId: expect.any(String),
        }),
      ),
    );
  });

  it("renders the new conversation controls in Japanese", async () => {
    render(
      <LocalizationProvider storage={storageWithLocale("ja")}>
        <NewChatPage onCreateSession={vi.fn()} />
      </LocalizationProvider>,
    );

    expect(
      screen.getByRole("textbox", { name: "会話内容" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "メッセージを送信" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "テンプレートを検索" }),
    ).toBeInTheDocument();
  });

  it("renders an existing conversation in Japanese", () => {
    render(
      <LocalizationProvider storage={storageWithLocale("ja")}>
        <MemoryRouter initialEntries={["/sessions/session-1"]}>
          <Routes>
            <Route
              path="/sessions/:sessionId"
              element={
                <ChatSessionPage
                  sessions={[
                    {
                      id: "session-1",
                      kind: "general",
                      title: "General conversation",
                      spacePath: "",
                      messages: [],
                      revision: 2,
                      createdAt: 1,
                      updatedAt: 1,
                    },
                  ]}
                  spaces={[]}
                  onAppendMessage={vi.fn()}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </LocalizationProvider>,
    );

    expect(screen.getByLabelText("会話を続ける")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "会話メッセージを送信" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("おすすめの質問")).not.toBeInTheDocument();
  });

  it("adds a follow-up to the Composer and sends it through the revisioned command", async () => {
    const sendFollowUpSuggestion = vi.fn().mockResolvedValue(undefined);
    const onAppendMessage = vi.fn();
    renderSession(
      [
        completedMessage(),
        {
          id: "assistant-1",
          role: "assistant",
          status: "completed",
          content: "实现已完成。",
          createdAt: 2,
          completedAt: 3,
          followUp: {
            suggestionSetId: "set-1",
            revision: 2,
            suggestions: [
              {
                id: "suggestion-1",
                label: "验证结果",
                prompt: "请运行验证并总结结果。",
                intent: "verify",
              },
            ],
          },
        },
      ],
      onAppendMessage,
      { kind: "none" },
      sendFollowUpSuggestion,
    );
    const composer = screen.getByRole("textbox", { name: "继续对话" });
    fireEvent.change(composer, { target: { value: "保留我的草稿" } });

    fireEvent.click(
      screen.getByRole("button", { name: "添加到对话：验证结果" }),
    );
    expect(composer).toHaveValue("保留我的草稿\n\n请运行验证并总结结果。");

    fireEvent.click(
      screen.getByRole("button", { name: "发送建议：验证结果" }),
    );
    await waitFor(() =>
      expect(sendFollowUpSuggestion).toHaveBeenCalledWith({
        sessionId: "session-1",
        suggestionSetId: "set-1",
        suggestionId: "suggestion-1",
        expectedSessionRevision: 2,
        expectedSuggestionRevision: 2,
        applicationLocale: "zh-CN",
      }),
    );
    expect(onAppendMessage).not.toHaveBeenCalled();
  });

  it("renders conversation identity outside the page body for the workspace toolbar", () => {
    const view = renderSession([completedMessage()]);

    const heading = screen.getByRole("heading", {
      name: "General conversation",
    });
    expect(heading).toBeInTheDocument();
    expect(heading.closest(".chat-session-header")).toHaveClass(
      "ui-toolbar",
      "ui-toolbar--workspace-header",
    );
    expect(heading).toHaveClass("chat-session-title-text");
    expect(
      heading.closest(".chat-session-header")?.querySelector("p"),
    ).toHaveTextContent("不使用空间知识 · AI 生成内容请核实");
    expect(
      heading.closest(".chat-session-header")?.querySelector("p"),
    ).toHaveClass("chat-session-subtitle-text");
    expect(screen.getByText(/AI 生成内容请核实/)).not.toHaveClass("sr-only");
    expect(
      view.container.querySelector(".chat-session-page > .chat-session-header"),
    ).not.toBeInTheDocument();
  });

  it("shows the persisted all-workspaces knowledge scope in history", () => {
    renderSession(
      [completedMessage()],
      vi.fn(),
      { kind: "all_workspaces" },
    );

    expect(screen.getByText(/全部空间知识/)).not.toHaveClass("sr-only");
  });

  it("uses the compact composer variant for continuing a conversation", () => {
    const view = renderSession([completedMessage()]);

    expect(
      view.container.querySelector(".chat-session-composer .composer"),
    ).toHaveClass("compact");
    expect(
      view.container.querySelector(".chat-session-composer .composer-toolbar"),
    ).toHaveAttribute("role", "toolbar");
  });

  it("exposes the new-chat context controls as a stable composer surface", () => {
    const view = render(<NewChatPage onCreateSession={vi.fn()} />);

    expect(view.container.querySelector(".composer-toolbar")).toHaveAttribute(
      "role",
      "toolbar",
    );
    expect(
      view.container.querySelector(".composer-context-surface"),
    ).toHaveClass("composer-context");
  });

  it("keeps the new-chat prompt and publishes a safe Toast after rejection", async () => {
    const onCreateSession = vi
      .fn()
      .mockRejectedValue(new Error("No text model available"));
    render(<NewChatPage onCreateSession={onCreateSession} />);
    const textarea = screen.getByRole("textbox", { name: "对话内容" });

    fireEvent.change(textarea, { target: { value: "Retry this prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText("创建对话失败，请重试")).toBeVisible();
    expect(screen.queryByText("No text model available")).not.toBeInTheDocument();
    expect(document.querySelector(".conversation-command-error")).toBeNull();
    expect(textarea).toHaveValue("Retry this prompt");
    expect(textarea).not.toBeDisabled();
  });

  it("submits an opaque folder binding while only displaying its name", async () => {
    const onCreateSession = vi.fn().mockResolvedValue(undefined);
    stubFolderPicker({
      requirementId: "folder-binding-1",
      rootName: "task-folder",
      rootPath: "/private/tmp/task-folder",
    });
    render(<NewChatPage onCreateSession={onCreateSession} />);
    const workspace = screen.getByRole("combobox", { name: "工作空间" });

    fireEvent.change(workspace, { target: { value: "local-folder" } });
    await screen.findByRole("option", { name: "task-folder" });
    expect(workspace).toHaveValue("folder:folder-binding-1");

    fireEvent.change(screen.getByRole("textbox", { name: "对话内容" }), {
      target: { value: "Inspect this folder" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await act(async () => undefined);
    expect(onCreateSession).toHaveBeenCalledWith(
      "folder:folder-binding-1",
      "Inspect this folder",
      undefined,
      "auto",
    );
    expect(onCreateSession.mock.calls[0][0]).not.toContain("/private/tmp");
  });

  it("offers all workspaces as an explicit knowledge scope", async () => {
    const onCreateSession = vi.fn().mockResolvedValue(undefined);
    render(<NewChatPage onCreateSession={onCreateSession} />);
    const workspace = screen.getByRole("combobox", { name: "工作空间" });

    expect(
      screen.getByRole("option", { name: "全部空间" }),
    ).toBeInTheDocument();
    fireEvent.change(workspace, { target: { value: "all-workspaces" } });
    fireEvent.change(screen.getByRole("textbox", { name: "对话内容" }), {
      target: { value: "Compare release rules" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() =>
      expect(onCreateSession).toHaveBeenCalledWith(
        "all-workspaces",
        "Compare release rules",
        undefined,
        "auto",
      ),
    );
  });

  it("returns to no binding when folder selection is cancelled", async () => {
    const chooseFolder = stubFolderPicker(null);
    const onCreateSession = vi.fn();
    render(<NewChatPage onCreateSession={onCreateSession} />);
    const workspace = screen.getByRole("combobox", { name: "工作空间" });

    fireEvent.change(workspace, { target: { value: "local-folder" } });

    await act(async () => undefined);
    expect(chooseFolder).toHaveBeenCalledOnce();
    expect(workspace).toHaveValue("none");
    expect(onCreateSession).not.toHaveBeenCalled();
  });

  it("keeps the selected folder and prompt when creation fails", async () => {
    const onCreateSession = vi
      .fn()
      .mockRejectedValue(new Error("文件夹授权已失效，请重新选择"));
    stubFolderPicker({
      requirementId: "folder-binding-retry",
      rootName: "retry-folder",
      rootPath: "/private/tmp/retry-folder",
    });
    render(<NewChatPage onCreateSession={onCreateSession} />);
    const workspace = screen.getByRole("combobox", { name: "工作空间" });
    const textarea = screen.getByRole("textbox", { name: "对话内容" });

    fireEvent.change(workspace, { target: { value: "local-folder" } });
    await screen.findByRole("option", { name: "retry-folder" });
    fireEvent.change(textarea, { target: { value: "Retry safely" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText("创建对话失败，请重试")).toBeVisible();
    expect(
      screen.queryByText("文件夹授权已失效，请重新选择"),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".conversation-command-error")).toBeNull();
    expect(workspace).toHaveValue("folder:folder-binding-retry");
    expect(textarea).toHaveValue("Retry safely");
  });

  it("keeps an append prompt and disables duplicate sends until the command settles", async () => {
    const append = deferred<void>();
    const onAppendMessage = vi.fn(() => append.promise);
    renderSession([completedMessage()], onAppendMessage);
    const textarea = screen.getByRole("textbox", { name: "继续对话" });
    const submit = screen.getByRole("button", { name: "发送对话消息" });

    fireEvent.change(textarea, { target: { value: "Continue safely" } });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onAppendMessage).toHaveBeenCalledOnce();
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveValue("Continue safely");

    await act(async () => append.reject(new Error("Database unavailable")));
    expect(await screen.findByText("发送消息失败，请重试")).toBeVisible();
    expect(screen.queryByText("Database unavailable")).not.toBeInTheDocument();
    expect(document.querySelector(".conversation-command-error")).toBeNull();
    expect(textarea).toHaveValue("Continue safely");
  });

  it("classifies missing generated artifact files separately from retryable open failures", () => {
    expect(
      artifactOpenFailureMessageKey(
        new Error(
          "Error invoking remote method 'workspace:open-session-files': Error: ENOENT: no such file or directory, realpath '/workspace/report.pdf'",
        ),
      ),
    ).toBe("chat.openArtifactMissing");
    expect(
      artifactOpenFailureMessageKey(new Error("Binary files are read-only")),
    ).toBe("chat.openArtifactFailed");
  });

  it("renders pending, tool, completed, and failed message states distinctly", () => {
    renderSession([
      completedMessage(),
      {
        id: "pending",
        role: "assistant",
        status: "pending",
        content: "",
        createdAt: 2,
      },
      {
        id: "tool",
        role: "tool",
        status: "completed",
        content: "Read package.json",
        createdAt: 3,
      },
      {
        id: "failed",
        role: "assistant",
        status: "failed",
        content: "Partial answer",
        error: "Provider stream interrupted",
        createdAt: 4,
      },
    ]);

    expect(screen.getByText("正在生成回答…")).toBeInTheDocument();
    expect(screen.getByText("工具")).toBeInTheDocument();
    expect(screen.getByText("Read package.json")).toBeInTheDocument();
    expect(screen.getByText("Partial answer")).toBeInTheDocument();
    expect(screen.getByText("Provider stream interrupted")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("reveals a pending SSE snapshot progressively instead of painting the full delta", () => {
    vi.useFakeTimers();
    const content = "This entire sentence arrived in one provider delta.";

    const view = renderSession([
      {
        id: "assistant-stream",
        role: "assistant",
        status: "pending",
        content,
        createdAt: 2,
      },
    ]);
    const message = view.container.querySelector(".chat-message-content");

    expect(message?.textContent).not.toBe(content);
    act(() => vi.advanceTimersByTime(32));
    expect(message?.textContent?.length).toBeGreaterThan(0);
    expect(message?.textContent?.length).toBeLessThan(content.length);
    const partialContent = message?.textContent;
    view.rerender(
      <LocalizationProvider>
        <ToastProvider>
          {sessionView([
            {
              id: "assistant-stream",
              role: "assistant",
              status: "completed",
              content,
              createdAt: 2,
            },
          ])}
        </ToastProvider>
      </LocalizationProvider>,
    );
    expect(message?.textContent).toBe(partialContent);
    for (let index = 0; index < content.length; index += 1) {
      act(() => vi.advanceTimersByTime(16));
    }
    expect(message).toHaveTextContent(content);
  });

  it("renders completed assistant GFM as semantic content with safe links", () => {
    const view = renderSession([
      {
        id: "assistant-markdown",
        role: "assistant",
        status: "completed",
        content: [
          "# Java example",
          "",
          "- Parse input",
          "- Return output",
          "",
          "```java",
          "public class Demo {}",
          "```",
          "",
          "[Reference](https://example.com/docs)",
          "",
          "| Runtime | Stable |",
          "| --- | --- |",
          "| Java | Yes |",
          "",
          '<img src="invalid" onerror="alert(1)">',
        ].join("\n"),
        createdAt: 2,
      },
    ]);

    expect(
      screen.getByRole("heading", { level: 1, name: "Java example" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(view.container.querySelector("pre")).toHaveTextContent(
      "public class Demo {}",
    );
    expect(screen.getByRole("link", { name: "Reference" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "Reference" })).toHaveAttribute(
      "rel",
      "noreferrer noopener",
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("table").parentElement).toHaveClass(
      "markdown-table-scroll",
    );
    expect(
      view.container.querySelector(".chat-message-markdown img"),
    ).not.toBeInTheDocument();
    expect(
      view.container.querySelector(".chat-message-markdown"),
    ).toBeInTheDocument();
  });

  it("keeps user-authored Markdown as plain text", () => {
    const view = renderSession([
      {
        id: "user-markdown",
        role: "user",
        status: "completed",
        content: "# Literal heading\n\n- Literal item",
        createdAt: 1,
      },
    ]);

    expect(
      screen.queryByRole("heading", { name: "Literal heading" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      view.container.querySelector(".chat-message.user p"),
    ).toHaveTextContent("# Literal heading - Literal item");
  });

  it("keeps rendering while a streamed Markdown code fence is incomplete", () => {
    vi.useFakeTimers();
    const content = "```java\npublic class Demo {";
    const view = renderSession([
      {
        id: "assistant-incomplete-markdown",
        role: "assistant",
        status: "pending",
        content,
        createdAt: 2,
      },
    ]);

    for (let index = 0; index < content.length; index += 1) {
      act(() => vi.advanceTimersByTime(16));
    }

    const markdown = view.container.querySelector(".chat-message-markdown");
    expect(markdown).toHaveTextContent("public class Demo {");
    expect(markdown?.querySelector("pre code")).toBeInTheDocument();
  });

  it("renders a clarification turn and the deterministic follow-up result", () => {
    renderSession([
      {
        id: "ambiguous-request",
        role: "user",
        status: "completed",
        content: "处理一下这个文件",
        createdAt: 1,
      },
      {
        id: "clarification",
        role: "assistant",
        status: "completed",
        content: "请确认：仅分析该文件，还是允许修改或覆盖该文件？",
        createdAt: 2,
        completedAt: 2,
      },
      {
        id: "clarified-request",
        role: "user",
        status: "completed",
        content: "只分析，不修改文件",
        createdAt: 3,
      },
      {
        id: "deterministic-result",
        role: "assistant",
        status: "completed",
        content: "只读分析完成：未修改任何文件。",
        modelName: "确定性模型模拟",
        createdAt: 4,
        completedAt: 4,
      },
    ]);

    expect(
      screen.getByText("请确认：仅分析该文件，还是允许修改或覆盖该文件？"),
    ).toBeVisible();
    expect(screen.getByText("只分析，不修改文件")).toBeVisible();
    expect(screen.getByText("只读分析完成：未修改任何文件。")).toBeVisible();
    expect(screen.getByText("确定性模型模拟")).toBeVisible();
  });

  it("shows the model and completion time for each assistant response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 20, 0));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });
    const onAppendMessage = vi.fn().mockResolvedValue(undefined);
    const sentAt = new Date(2026, 8, 30, 16, 14).getTime();
    const completedAt = new Date(2026, 8, 30, 16, 15).getTime();
    renderSession(
      [
        {
          id: "question",
          role: "user",
          status: "completed",
          content: "Retry this question",
          createdAt: sentAt,
        },
        {
          id: "answer",
          role: "assistant",
          status: "completed",
          content: "Generated answer",
          modelName: "DeepSeek V4 Pro",
          createdAt: sentAt,
          completedAt,
        } as ChatSession["messages"][number] & {
          modelName: string;
          completedAt: number;
        },
      ],
      onAppendMessage,
    );

    expect(screen.queryByLabelText("推荐追问")).not.toBeInTheDocument();
    expect(screen.queryByText("由 AI 生成")).not.toBeInTheDocument();
    expect(screen.getByText("DeepSeek V4 Pro")).toHaveClass(
      "chat-message-model",
    );
    expect(screen.getByText("今天 16:14:00")).toHaveAttribute(
      "datetime",
      new Date(sentAt).toISOString(),
    );
    expect(screen.getByText("今天 16:15:00")).toHaveAttribute(
      "datetime",
      new Date(completedAt).toISOString(),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制回答" }));
    });
    expect(writeText).toHaveBeenCalledWith("Generated answer");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制消息" }));
    });
    expect(writeText).toHaveBeenCalledWith("Retry this question");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "重新生成回答" }));
    });
    expect(onAppendMessage).toHaveBeenCalledWith(
      "session-1",
      "Retry this question",
      undefined,
      "auto",
    );
    expect(screen.getByText("Generated answer")).toBeInTheDocument();
  });

  it("formats relative message dates and disables retry on historical answers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 20, 0));
    renderSession([
      {
        id: "old-question",
        role: "user",
        status: "completed",
        content: "Old question",
        createdAt: new Date(2026, 8, 18, 14, 18).getTime(),
      },
      {
        id: "old-answer",
        role: "assistant",
        status: "completed",
        content: "Old answer",
        createdAt: new Date(2026, 8, 18, 14, 19, 10).getTime(),
      },
      {
        id: "yesterday-question",
        role: "user",
        status: "completed",
        content: "Yesterday question",
        createdAt: new Date(2026, 8, 29, 14, 18).getTime(),
      },
      {
        id: "yesterday-answer",
        role: "assistant",
        status: "completed",
        content: "Yesterday answer",
        createdAt: new Date(2026, 8, 29, 14, 19, 29).getTime(),
      },
      {
        id: "today-question",
        role: "user",
        status: "completed",
        content: "Today question",
        createdAt: new Date(2026, 8, 30, 14, 18).getTime(),
      },
      {
        id: "today-answer",
        role: "assistant",
        status: "completed",
        content: "Today answer",
        createdAt: new Date(2026, 8, 30, 14, 19, 30).getTime(),
      },
    ]);

    expect(screen.getByText("2026/09/18 14:19:10")).toBeInTheDocument();
    expect(screen.getByText("昨天 14:19:29")).toBeInTheDocument();
    expect(screen.getByText("今天 14:19:30")).toBeInTheDocument();

    const retryButtons = screen.getAllByRole("button", {
      name: "重新生成回答",
    });
    expect(retryButtons).toHaveLength(3);
    expect(retryButtons[0]).toBeDisabled();
    expect(retryButtons[1]).toBeDisabled();
    expect(retryButtons[2]).toBeEnabled();
  });

  it("keeps the RealmFlow identity without task duration metadata", () => {
    renderSession([
      {
        id: "answer",
        role: "assistant",
        status: "completed",
        content: "Generated answer",
        createdAt: 2,
      },
    ]);

    expect(screen.getByText("RealmFlow")).toBeInTheDocument();
    expect(screen.queryByText(/任务耗时/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("RealmFlow 执行信息"),
    ).not.toBeInTheDocument();
  });

  it("scrolls the conversation to the latest content", () => {
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(640);

    const view = renderSession([completedMessage()]);

    expect(
      view.container.querySelector<HTMLElement>(".chat-session-scroll")
        ?.scrollTop,
    ).toBe(640);
    scrollHeight.mockRestore();
  });

  it("rechecks the latest content after the message layout settles", () => {
    let height = 640;
    let scheduledFrame: FrameRequestCallback | undefined;
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(() => height);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        scheduledFrame = callback;
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const view = renderSession([completedMessage()]);
    const scroll = view.container.querySelector<HTMLElement>(
      ".chat-session-scroll",
    );
    expect(scroll?.scrollTop).toBe(640);

    height = 720;
    expect(scheduledFrame).toBeDefined();
    act(() => scheduledFrame?.(0));
    expect(scroll?.scrollTop).toBe(720);

    scrollHeight.mockRestore();
  });

  it("renders a quick index for user messages only", () => {
    const view = renderSession([
      {
        id: "question-1",
        role: "user",
        status: "completed",
        content: "First question",
        createdAt: 1,
      },
      {
        id: "answer-1",
        role: "assistant",
        status: "completed",
        content: "First answer",
        createdAt: 2,
      },
      {
        id: "tool-1",
        role: "tool",
        status: "completed",
        content: "Read package.json",
        createdAt: 3,
      },
      {
        id: "question-2",
        role: "user",
        status: "completed",
        content: "Second question",
        createdAt: 4,
      },
    ]);

    expect(
      view.container.querySelector(".conversation-message-list"),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "用户消息索引" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", {
          name: "定位到第 1 条用户消息：First question",
        })
        .querySelector(".chat-message-index-preview"),
    ).toHaveAttribute("data-preview", "First question");
    expect(
      screen.getByRole("button", {
        name: "定位到第 2 条用户消息：Second question",
      }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getAllByRole("button", { name: /定位到第 \d+ 条用户消息/ }),
    ).toHaveLength(2);
  });

  it("saves selected completed user and assistant messages as confirmed knowledge", async () => {
    const createKnowledgeNote = vi.fn().mockResolvedValue({
      id: "note-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      kind: "decision",
      title: "Storage decision",
      content: "Question\n\nAnswer",
      sourceMessageIds: ["question-1", "answer-1"],
      version: 1,
      status: "active",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    Object.assign(window.realmflow?.business ?? {}, { createKnowledgeNote });
    renderSession([
      {
        id: "question-1",
        role: "user",
        status: "completed",
        content: "Question",
        createdAt: 1,
      },
      {
        id: "answer-1",
        role: "assistant",
        status: "completed",
        content: "Answer",
        createdAt: 2,
      },
      {
        id: "tool-1",
        role: "tool",
        status: "completed",
        content: "Hidden tool output",
        createdAt: 3,
      },
      {
        id: "pending-1",
        role: "assistant",
        status: "pending",
        content: "Pending",
        createdAt: 4,
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "沉淀为知识" }));
    const selectable = screen.getAllByRole("checkbox");
    expect(selectable).toHaveLength(2);
    fireEvent.click(selectable[0]);
    fireEvent.click(selectable[1]);
    fireEvent.click(screen.getByRole("button", { name: "确认消息范围" }));

    const dialog = screen.getByRole("dialog", { name: "沉淀为知识" });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "知识类型" }),
      { target: { value: "decision" } },
    );
    fireEvent.change(within(dialog).getByRole("textbox", { name: "标题" }), {
      target: { value: "Storage decision" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "正文" }), {
      target: { value: "Question\n\nAnswer" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存知识" }),
    );

    await waitFor(() => {
      expect(createKnowledgeNote).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "workspace-1",
          sessionId: "session-1",
          kind: "decision",
          sourceMessageIds: ["question-1", "answer-1"],
          title: "Storage decision",
          content: "Question\n\nAnswer",
        }),
      );
    });
  });

  it("smoothly jumps to an indexed user message", () => {
    const previousScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    renderSession([
      {
        id: "question-1",
        role: "user",
        status: "completed",
        content: "First question",
        createdAt: 1,
      },
      {
        id: "answer-1",
        role: "assistant",
        status: "completed",
        content: "First answer",
        createdAt: 2,
      },
      {
        id: "question-2",
        role: "user",
        status: "completed",
        content: "Second question",
        createdAt: 3,
      },
    ]);

    const firstIndex = screen.getByRole("button", {
      name: "定位到第 1 条用户消息：First question",
    });
    fireEvent.click(firstIndex);

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(firstIndex).toHaveAttribute("aria-current", "true");

    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: previousScrollIntoView,
    });
  });

  it("jumps immediately when reduced motion is preferred", () => {
    const previousScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }) as MediaQueryList),
    );

    renderSession([
      {
        id: "question-1",
        role: "user",
        status: "completed",
        content: "First question",
        createdAt: 1,
      },
      {
        id: "answer-1",
        role: "assistant",
        status: "completed",
        content: "First answer",
        createdAt: 2,
      },
      {
        id: "question-2",
        role: "user",
        status: "completed",
        content: "Second question",
        createdAt: 3,
      },
    ]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "定位到第 1 条用户消息：First question",
      }),
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });

    vi.unstubAllGlobals();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: previousScrollIntoView,
    });
  });

  it("updates the active user-message index while scrolling", () => {
    const view = renderSession([
      {
        id: "question-1",
        role: "user",
        status: "completed",
        content: "First question",
        createdAt: 1,
      },
      {
        id: "answer-1",
        role: "assistant",
        status: "completed",
        content: "First answer",
        createdAt: 2,
      },
      {
        id: "question-2",
        role: "user",
        status: "completed",
        content: "Second question",
        createdAt: 3,
      },
    ]);
    const scroll = view.container.querySelector<HTMLElement>(
      ".chat-session-scroll",
    );
    const userMessages =
      view.container.querySelectorAll<HTMLElement>(".chat-message.user");
    Object.defineProperty(scroll, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(userMessages[0], "offsetTop", {
      configurable: true,
      value: 20,
    });
    Object.defineProperty(userMessages[1], "offsetTop", {
      configurable: true,
      value: 300,
    });

    if (!scroll) throw new Error("Expected the conversation scroll container");
    scroll.scrollTop = 0;
    fireEvent.scroll(scroll);
    expect(
      screen.getByRole("button", {
        name: "定位到第 1 条用户消息：First question",
      }),
    ).toHaveAttribute("aria-current", "true");

    scroll.scrollTop = 250;
    fireEvent.scroll(scroll);
    expect(
      screen.getByRole("button", {
        name: "定位到第 2 条用户消息：Second question",
      }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("preserves a session deep link while conversations are loading", () => {
    render(
      <MemoryRouter initialEntries={["/sessions/session-loading"]}>
        <Routes>
          <Route
            path="/sessions/:sessionId"
            element={
              <ChatSessionPage
                sessions={[]}
                spaces={[]}
                loading
                onAppendMessage={vi.fn()}
              />
            }
          />
          <Route path="/chat/new" element={<div>New conversation</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("正在加载对话")).toBeInTheDocument();
    expect(screen.queryByText("New conversation")).not.toBeInTheDocument();
  });
});

function renderSession(
  messages: ChatSession["messages"],
  onAppendMessage = vi.fn(),
  knowledgeScope: ChatSession["knowledgeScope"] = { kind: "none" },
  onSendFollowUpSuggestion?: Parameters<
    typeof ChatSessionPage
  >[0]["onSendFollowUpSuggestion"],
) {
  return render(
    sessionView(
      messages,
      onAppendMessage,
      knowledgeScope,
      onSendFollowUpSuggestion,
    ),
  );
}

function sessionView(
  messages: ChatSession["messages"],
  onAppendMessage = vi.fn(),
  knowledgeScope: ChatSession["knowledgeScope"] = { kind: "none" },
  onSendFollowUpSuggestion?: Parameters<
    typeof ChatSessionPage
  >[0]["onSendFollowUpSuggestion"],
) {
  return (
    <MemoryRouter initialEntries={["/sessions/session-1"]}>
      <Routes>
        <Route
          path="/sessions/:sessionId"
          element={
            <ChatSessionPage
              sessions={[
                {
                  id: "session-1",
                  kind: "general",
                  knowledgeScope,
                  workspaceId: "workspace-1",
                  title: "General conversation",
                  spacePath: "",
                  messages,
                  revision: 2,
                  createdAt: 1,
                  updatedAt: 1,
                },
              ]}
              spaces={[]}
              onAppendMessage={onAppendMessage}
              onSendFollowUpSuggestion={onSendFollowUpSuggestion}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function completedMessage(): ChatSession["messages"][number] {
  return {
    id: "user",
    role: "user",
    status: "completed",
    content: "Hello",
    createdAt: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function storageWithLocale(locale: "en" | "ja"): Storage {
  return {
    getItem: vi.fn(() => JSON.stringify({ version: 1, locale })),
    setItem: vi.fn(),
  } as unknown as Storage;
}

function stubFolderPicker(
  result: Awaited<ReturnType<RealmFlowApi["workspace"]["chooseFolder"]>>,
) {
  const chooseFolder = vi.fn().mockResolvedValue(result);
  vi.stubGlobal("realmflow", {
    ...window.realmflow,
    workspace: { chooseFolder },
  } as unknown as RealmFlowApi);
  return chooseFolder;
}
