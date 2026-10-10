import {
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";
import type { ModelProfile } from "../../domain/model";
import { SpaceConversationComposer } from "../features/conversation/SpaceConversationComposer";
import { ToastProvider } from "../features/toast/ToastProvider";
import ChatSessionPage from "./ChatSessionPage";
import { NewChatPage } from "./NewChatPage";
import { LocalizationProvider } from "../localization/LocalizationProvider";

function render(ui: Parameters<typeof testingRender>[0]) {
  return testingRender(
    <LocalizationProvider>
      <ToastProvider>{ui}</ToastProvider>
    </LocalizationProvider>,
  );
}

const enabledProfile: ModelProfile & { revision: number } = {
  id: "profile-fast",
  providerId: "provider-local",
  modelId: "fast-model",
  displayName: "Fast Model",
  enabled: true,
  capabilities: {
    text: true,
    vision: false,
    toolCalling: true,
    structuredOutput: true,
  },
  contextWindow: 32_000,
  timeoutMs: 60_000,
  maxRetries: 1,
  maxConcurrency: 2,
  inputCostPerMillionTokens: 0,
  outputCostPerMillionTokens: 0,
  revision: 1,
};

describe("conversation model selection", () => {
  afterEach(() => {
    delete window.realmflow;
  });

  it("passes the selected enabled profile when creating a conversation", async () => {
    installModelPool();
    const onCreateSession = vi.fn();
    render(<NewChatPage onCreateSession={onCreateSession} />);

    fireEvent.click(await screen.findByRole("combobox", { name: "对话模型" }));
    expect(
      screen.queryByRole("combobox", { name: "推理模式" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Fast Model" }));
    fireEvent.change(screen.getByLabelText("对话内容"), {
      target: { value: "Plan the rollout" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onCreateSession).toHaveBeenCalledWith(
      "none",
      "Plan the rollout",
      "profile-fast",
      "auto",
    );
  });

  it("passes the selected enabled profile when continuing a conversation", async () => {
    installModelPool();
    const onAppendMessage = vi.fn();
    render(
      <MemoryRouter initialEntries={["/sessions/session-1"]}>
        <Routes>
          <Route
            path="/sessions/:sessionId"
            element={
              <ChatSessionPage
                sessions={[
                  {
                    id: "session-1",
                    title: "Rollout",
                    spacePath: "/spaces/store",
                    messages: [],
                    createdAt: 1,
                    updatedAt: 1,
                  },
                ]}
                spaces={[]}
                onAppendMessage={onAppendMessage}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("combobox", { name: "对话模型" }));
    expect(
      screen.queryByRole("combobox", { name: "推理模式" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Fast Model" }));
    fireEvent.change(screen.getByLabelText("继续对话"), {
      target: { value: "Use a canary release" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送对话消息" }));

    await waitFor(() =>
      expect(onAppendMessage).toHaveBeenCalledWith(
        "session-1",
        "Use a canary release",
        "profile-fast",
        "auto",
      ),
    );
  });

  it("shows a stop control for an active conversation run and cancels its trusted run", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    window.realmflow = {
      agentRuntime: { get: vi.fn(), updateGoal: vi.fn(), steer: vi.fn(), cancel },
    } as never;
    render(
      <MemoryRouter initialEntries={["/sessions/session-1"]}>
        <Routes>
          <Route
            path="/sessions/:sessionId"
            element={
              <ChatSessionPage
                sessions={[{
                  id: "session-1", title: "Active", spacePath: "", messages: [{
                    id: "assistant-1", role: "assistant", status: "pending",
                    content: "", runId: "run-1", createdAt: 1,
                  }], createdAt: 1, updatedAt: 1,
                }]}
                spaces={[]}
                onAppendMessage={vi.fn()}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    const stop = screen.getByRole("button", { name: "停止生成" });
    expect(stop.querySelector("svg")).toHaveClass("lucide-square");
    expect(stop.querySelector("svg")).toHaveAttribute("fill", "currentColor");
    fireEvent.click(stop);
    await waitFor(() => expect(cancel).toHaveBeenCalledWith({
      runId: "run-1", sessionId: "session-1",
    }));
    expect(screen.getByRole("button", { name: "正在停止" })).toBeDisabled();
  });

  it("hides profiles whose provider is disabled", async () => {
    installModelPool(false);
    render(<NewChatPage onCreateSession={vi.fn()} />);

    fireEvent.click(await screen.findByRole("combobox", { name: "对话模型" }));
    expect(
      screen.queryByRole("option", { name: "Fast Model" }),
    ).not.toBeInTheDocument();
  });

  it("keeps automatic capability routing selected by default", async () => {
    installModelPool();
    const onCreateSession = vi.fn();
    render(<NewChatPage onCreateSession={onCreateSession} />);

    const selector = await screen.findByRole("combobox", { name: "对话模型" });
    expect(selector).toHaveTextContent("自动选择");
    fireEvent.change(screen.getByLabelText("对话内容"), {
      target: { value: "Choose a model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onCreateSession).toHaveBeenCalledWith(
      "none",
      "Choose a model",
      undefined,
      "auto",
    );
  });

  it("keeps reasoning automatic without exposing a new-conversation control", async () => {
    installModelPool();
    const onCreateSession = vi.fn();
    render(<NewChatPage onCreateSession={onCreateSession} />);

    expect(
      screen.queryByRole("combobox", { name: "推理模式" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("对话内容"), {
      target: { value: "Verify all affected files" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onCreateSession).toHaveBeenCalledWith(
      "none",
      "Verify all affected files",
      undefined,
      "auto",
    );
  });

  it("does not expose provider reasoning support in the composer", async () => {
    installModelPool();
    render(<NewChatPage onCreateSession={vi.fn()} />);

    expect(
      screen.queryByText("当前模型不支持推理，将使用快速回答"),
    ).not.toBeInTheDocument();
  });

  it("uses automatic routing in a space without exposing a reasoning control", async () => {
    installModelPool();
    const onCreateSession = vi.fn();
    render(
      <SpaceConversationComposer
        spacePath="/spaces/product"
        inputId="space-attachment"
        onCreateSession={onCreateSession}
      />,
    );

    const selector = await screen.findByRole("combobox", {
      name: "空间对话模型",
    });
    expect(selector).toHaveTextContent("自动选择");
    expect(
      screen.queryByRole("combobox", { name: "推理模式" }),
    ).not.toBeInTheDocument();

    fireEvent.click(selector);
    fireEvent.click(
      await screen.findByRole("option", { name: "Fast Model" }),
    );
    fireEvent.change(screen.getByLabelText("空间对话内容"), {
      target: { value: "Review this space" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送空间消息" }));

    await waitFor(() =>
      expect(onCreateSession).toHaveBeenCalledWith(
        "/spaces/product",
        "Review this space",
        "profile-fast",
        "auto",
      ),
    );
  });

  it("keeps the space prompt and publishes a safe Toast when creation fails", async () => {
    installModelPool();
    const onCreateSession = vi
      .fn()
      .mockRejectedValue(new Error("/Users/private/space.db is locked"));
    render(
      <SpaceConversationComposer
        spacePath="/spaces/product"
        inputId="space-attachment"
        onCreateSession={onCreateSession}
      />,
    );

    const textarea = screen.getByLabelText("空间对话内容");
    fireEvent.change(textarea, {
      target: { value: "Retry this space conversation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送空间消息" }));

    expect(await screen.findByText("创建空间对话失败，请重试")).toBeVisible();
    expect(
      screen.queryByText("/Users/private/space.db is locked"),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".conversation-command-error")).toBeNull();
    expect(textarea).toHaveValue("Retry this space conversation");
  });
});

function installModelPool(providerEnabled = true): void {
  window.realmflow = {
    business: {
      listEffectiveModels: vi.fn().mockResolvedValue({
        groups: [
          {
            providerId: enabledProfile.providerId,
            providerName: "Local",
            providerType: "local",
            readiness: providerEnabled ? "ready" : "provider_disabled",
            models: providerEnabled
              ? [
                  {
                    profileId: enabledProfile.id,
                    modelId: enabledProfile.modelId,
                    displayName: enabledProfile.displayName,
                    capabilities: enabledProfile.capabilities,
                    reasoningSupported: false,
                    contextWindow: enabledProfile.contextWindow,
                  },
                ]
              : [],
          },
        ],
      }),
      getApplicationModelDefault: vi.fn().mockResolvedValue({
        mode: "auto",
        revision: 0,
      }),
    },
  } as unknown as typeof window.realmflow;
}
