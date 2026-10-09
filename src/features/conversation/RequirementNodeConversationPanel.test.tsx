import {
  act,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationDto,
  NodeQuestionDto,
} from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { RequirementNodeConversationPanel } from "./RequirementNodeConversationPanel";

function render(ui: Parameters<typeof testingRender>[0]) {
  return testingRender(
    <LocalizationProvider>
      <ToastProvider>{ui}</ToastProvider>
    </LocalizationProvider>,
  );
}

const openQuestion: NodeQuestionDto = {
  id: "question-1",
  nodeRunId: "node-run-1",
  prompt: "Which rollout strategy?",
  required: true,
  status: "open",
  revision: 2,
  createdAt: 1,
  updatedAt: 1,
};

const conversation: ConversationDto = {
  id: "conversation-1",
  kind: "requirement_node",
  workspaceId: "workspace-1",
  requirementId: "requirement-1",
  nodeRunId: "node-run-1",
  title: "Build",
  sortOrder: 1,
  revision: 3,
  messages: [
    {
      id: "message-0",
      role: "user",
      status: "completed",
      content: "Explain the node",
      sortOrder: 0,
      createdAt: 1,
    },
    {
      id: "message-1",
      role: "assistant",
      status: "completed",
      content: "**Existing answer**",
      modelName: "DeepSeek V4 Pro",
      sortOrder: 1,
      createdAt: 1,
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RequirementNodeConversationPanel", () => {
  it("renders committed turn snapshots before the append command completes", async () => {
    let publish:
      | ((event: { conversation: ConversationDto }) => void)
      | undefined;
    let resolveAppend: (() => void) | undefined;
    const appendConversationMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAppend = resolve;
        }),
    );
    const onConversationEvent = vi.fn(
      (listener: (event: { conversation: ConversationDto }) => void) => {
        publish = listener;
        return () => undefined;
      },
    );
    vi.stubGlobal("realmflow", {
      business: { appendConversationMessage, onConversationEvent },
    });
    const onResponseActiveChange = vi.fn();

    const { container } = render(
      <RequirementNodeConversationPanel
        requirementId="requirement-1"
        nodeId="node-1"
        nodeName="Build"
        nodeRunId="node-run-1"
        conversation={conversation}
        interactive
        questions={[]}
        onReload={vi.fn()}
        onResponseActiveChange={onResponseActiveChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("节点对话内容"), {
      target: { value: "Continue now" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送节点消息" }));

    act(() => {
      publish?.({
        conversation: {
          ...conversation,
          revision: 4,
          messages: [
            ...conversation.messages,
            {
              id: "message-2",
              role: "user",
              status: "completed",
              content: "Continue now",
              sortOrder: 2,
              createdAt: 2,
            },
            {
              id: "message-3",
              role: "assistant",
              status: "pending",
              content: "",
              sortOrder: 3,
              createdAt: 2,
            },
          ],
        },
      });
    });

    const userMessages = container.querySelectorAll(".chat-message.user");
    expect(userMessages[userMessages.length - 1]).toHaveTextContent(
      "Continue now",
    );
    expect(
      container.querySelector(".chat-message.assistant.pending"),
    ).toBeVisible();
    expect(onResponseActiveChange).toHaveBeenLastCalledWith(true);

    act(() => {
      publish?.({
        conversation: {
          ...conversation,
          revision: 5,
          messages: [
            ...conversation.messages,
            {
              id: "message-2",
              role: "user",
              status: "completed",
              content: "Continue now",
              sortOrder: 2,
              createdAt: 2,
            },
            {
              id: "message-3",
              role: "assistant",
              status: "completed",
              content: "Done",
              sortOrder: 3,
              createdAt: 2,
            },
          ],
        },
      });
    });

    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
    expect(onResponseActiveChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      resolveAppend?.();
    });
  });

  it("reuses the chat detail message and compact composer presentation", () => {
    vi.stubGlobal("realmflow", { business: {} });

    const { container } = render(
      <RequirementNodeConversationPanel
        requirementId="requirement-1"
        nodeId="node-1"
        nodeName="Build"
        nodeRunId="node-run-1"
        conversation={conversation}
        interactive
        questions={[]}
        onReload={vi.fn()}
      />,
    );

    expect(container.querySelector(".conversation-message-list")).toBeVisible();
    expect(container.querySelector(".chat-session-messages")).toBeVisible();
    expect(container.querySelector(".chat-message.user")).toHaveTextContent(
      "Explain the node",
    );
    expect(
      screen.getByRole("button", {
        name: "定位到第 1 条用户消息：Explain the node",
      }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      container.querySelector(".chat-message.assistant .chat-execution-brand"),
    ).toHaveTextContent("RealmFlow");
    const assistantBody = container.querySelector(
      ".chat-message-assistant-body",
    );
    expect(assistantBody).toContainElement(
      container.querySelector(".chat-message-markdown"),
    );
    expect(assistantBody).toContainElement(
      container.querySelector(".chat-message-footer.assistant"),
    );
    expect(
      container.querySelector(".chat-message-markdown strong"),
    ).toHaveTextContent("Existing answer");
    expect(container.querySelector(".composer.compact")).toBeVisible();
    expect(screen.queryByText("你")).not.toBeInTheDocument();
  });

  it("renders shared message actions and timestamps", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });
    vi.stubGlobal("realmflow", { business: {} });

    const { container } = render(
      <RequirementNodeConversationPanel
        requirementId="requirement-1"
        nodeId="node-1"
        nodeName="Build"
        nodeRunId="node-run-1"
        conversation={conversation}
        interactive
        questions={[]}
        onReload={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".chat-message-time")).toHaveLength(2);
    expect(screen.getByText("DeepSeek V4 Pro")).toHaveClass(
      "chat-message-model",
    );
    expect(
      screen.getByRole("button", { name: "复制消息" }),
    ).toBeInTheDocument();
    const userActions = screen
      .getByRole("button", { name: "复制消息" })
      .closest(".chat-message-actions");
    expect(
      [...(userActions?.querySelectorAll("button") ?? [])].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(["复制消息", "分享回答"]);
    const assistantActions = screen
      .getByRole("button", { name: "复制回答" })
      .closest(".chat-message-actions");
    expect(
      [...(assistantActions?.querySelectorAll("button") ?? [])].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(["复制回答", "分享回答", "重新生成回答"]);
    fireEvent.click(screen.getByRole("button", { name: "复制回答" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("**Existing answer**"),
    );
    expect(
      screen.getByRole("button", { name: "重新生成回答" }),
    ).toBeInTheDocument();
  });

  it("opens the shared Knowledge Note flow for completed node messages", () => {
    vi.stubGlobal("realmflow", {
      business: { createKnowledgeNote: vi.fn() },
    });
    render(
      <RequirementNodeConversationPanel
        requirementId="requirement-1"
        nodeId="node-1"
        nodeName="Build"
        nodeRunId="node-run-1"
        conversation={conversation}
        interactive
        questions={[]}
        onReload={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "沉淀为知识" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "确认消息范围" }));
    expect(
      screen.getByRole("dialog", { name: "沉淀为知识" }),
    ).toBeInTheDocument();
  });

  it("retries the latest assistant answer with its preceding user message", async () => {
    const appendConversationMessage = vi.fn().mockResolvedValue(undefined);
    const onReload = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("realmflow", {
      business: { appendConversationMessage },
    });

    render(
      <RequirementNodeConversationPanel
        requirementId="requirement-1"
        nodeId="node-1"
        nodeName="Build"
        nodeRunId="node-run-1"
        conversation={conversation}
        interactive
        questions={[]}
        onReload={onReload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重新生成回答" }));

    await waitFor(() =>
      expect(appendConversationMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: conversation.id,
          content: "Explain the node",
          expectedRevision: conversation.revision,
        }),
      ),
    );
    expect(onReload).toHaveBeenCalledWith("node-1");
  });

  it("keeps the newest message visible after the conversation reloads", async () => {
    vi.stubGlobal("realmflow", { business: {} });
    const result = render(
      <RequirementNodeConversationPanel
        requirementId="requirement-1"
        nodeId="node-1"
        nodeName="Build"
        nodeRunId="node-run-1"
        conversation={conversation}
        interactive
        questions={[]}
        onReload={vi.fn()}
      />,
    );
    const messages = screen.getByLabelText("节点对话消息");
    Object.defineProperty(messages, "scrollHeight", {
      configurable: true,
      value: 480,
    });

    result.rerender(
      <LocalizationProvider>
        <ToastProvider>
          <RequirementNodeConversationPanel
            requirementId="requirement-1"
            nodeId="node-1"
            nodeName="Build"
            nodeRunId="node-run-1"
            conversation={{
              ...conversation,
              revision: 4,
              messages: [
                ...conversation.messages,
                {
                  id: "message-2",
                  role: "assistant",
                  status: "completed",
                  content: "Newest answer",
                  sortOrder: 2,
                  createdAt: 2,
                },
              ],
            }}
            interactive
            questions={[]}
            onReload={vi.fn()}
          />
        </ToastProvider>
      </LocalizationProvider>,
    );

    await waitFor(() => expect(messages.scrollTop).toBe(480));
  });

  it("renders node conversation controls in Japanese", () => {
    vi.stubGlobal("realmflow", { business: {} });

    render(
      <LocalizationProvider storage={storageWithLocale("ja")}>
        <RequirementNodeConversationPanel
          requirementId="requirement-1"
          nodeId="node-1"
          nodeName="Build"
          nodeRunId="node-run-1"
          interactive
          questions={[openQuestion]}
          modelControl={
            <button type="button" data-testid="stage-model-control">
              Stage model
            </button>
          }
          onReload={vi.fn()}
        />
      </LocalizationProvider>,
    );

    expect(screen.queryByText("ノード会話")).not.toBeInTheDocument();
    expect(screen.queryByText("Build")).not.toBeInTheDocument();
    expect(screen.getByTestId("stage-model-control")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "ノード会話モデル" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("ノード会話の内容")).toBeInTheDocument();
    expect(
      screen.getByLabelText("確認待ちの質問に関連付ける"),
    ).toBeInTheDocument();
  });

  it("creates the node conversation with a selected question answer", async () => {
    const createConversation = vi.fn().mockResolvedValue(conversation);
    const onReload = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("realmflow", {
      business: { createConversation },
    });

    render(
      <RequirementNodeConversationPanel
        requirementId="requirement-1"
        nodeId="node-1"
        nodeName="Build"
        nodeRunId="node-run-1"
        interactive
        questions={[openQuestion]}
        onReload={onReload}
      />,
    );

    fireEvent.change(screen.getByLabelText("关联待确认问题"), {
      target: { value: "question-1" },
    });
    fireEvent.change(screen.getByLabelText("节点对话内容"), {
      target: { value: "Canary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送节点消息" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledOnce());
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "requirement_node",
        requirementId: "requirement-1",
        nodeRunId: "node-run-1",
        title: "Build",
        prompt: "Canary",
        references: {
          questionId: "question-1",
          expectedQuestionRevision: 2,
        },
      }),
    );
    expect(onReload).toHaveBeenCalledWith("node-1");
    expect(screen.getByLabelText("节点对话内容")).toHaveValue("");
  });

  it("publishes a safe Toast and retains input when append fails", async () => {
    const appendConversationMessage = vi
      .fn()
      .mockRejectedValue(new Error("/Users/private/conversation.db is locked"));
    vi.stubGlobal("realmflow", {
      business: { appendConversationMessage },
    });

    render(
      <RequirementNodeConversationPanel
        requirementId="requirement-1"
        nodeId="node-1"
        nodeName="Build"
        nodeRunId="node-run-1"
        conversation={conversation}
        interactive
        questions={[]}
        onReload={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("节点对话内容"), {
      target: { value: "Continue" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送节点消息" }));

    expect(await screen.findByText("发送节点消息失败，请重试")).toBeVisible();
    expect(
      screen.queryByText("/Users/private/conversation.db is locked"),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".conversation-command-error")).toBeNull();
    expect(appendConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "conversation-1",
        content: "Continue",
        expectedRevision: 3,
      }),
    );
    expect(screen.getByLabelText("节点对话内容")).toHaveValue("Continue");
  });

  it("shows persisted history without a composer for a terminal node", () => {
    vi.stubGlobal("realmflow", { business: {} });

    render(
      <RequirementNodeConversationPanel
        requirementId="requirement-1"
        nodeId="node-1"
        nodeName="Build"
        nodeRunId="node-run-1"
        conversation={conversation}
        interactive={false}
        questions={[]}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getByText("Existing answer")).toBeInTheDocument();
    expect(screen.queryByLabelText("节点对话内容")).not.toBeInTheDocument();
  });
});

function storageWithLocale(locale: "en" | "ja"): Storage {
  return {
    getItem: vi.fn(() => JSON.stringify({ version: 1, locale })),
    setItem: vi.fn(),
  } as unknown as Storage;
}
