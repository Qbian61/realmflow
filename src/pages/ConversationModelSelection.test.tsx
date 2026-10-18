import {
  act,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
  within,
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
  it("initializes a new conversation from the Main approval default", async () => {
    installModelPool()
    window.realmflow!.toolPermissions = {
      ...window.realmflow!.toolPermissions,
      getDefault: vi.fn().mockResolvedValue({ approvalProfileId: 'cautious', revision: 1 })
    }
    render(<NewChatPage onCreateSession={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: '权限模式' })).toHaveTextContent('谨慎确认'))
  })

  it("initializes a new space conversation from the Main approval default", async () => {
    installModelPool()
    window.realmflow!.toolPermissions = {
      ...window.realmflow!.toolPermissions,
      getDefault: vi.fn().mockResolvedValue({ approvalProfileId: 'cautious', revision: 1 })
    }
    render(<SpaceConversationComposer spacePath="/workspace" inputId="default-space" onCreateSession={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: '空间权限模式' })).toHaveTextContent('谨慎确认'))
  })

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
      undefined,
      "protected",
    );
  });

  it("opens the skill picker and binds the selected Skill to one new-chat submission", async () => {
    installModelPool();
    window.realmflow = {
      ...window.realmflow,
      toolCatalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [
            {
              kind: "skill",
              id: "builtin.skill.code_review",
              version: "1.0.2",
              definitionDigest: "c".repeat(64),
              status: "enabled",
              definition: {
                name: "Code review",
                description: "Review code changes",
              },
              display: {
                name: "代码审查",
                description: "查找缺陷、回归风险和缺失测试",
              },
            },
          ],
        }),
      } as never,
      conversationAttachments: {
        pick: vi.fn().mockResolvedValue({
          accepted: [
            {
              id: "attachment-scope",
              ownerId: "draft-scope",
              fileName: "scope.md",
              mimeType: "text/markdown",
              mediaKind: "document",
              sizeBytes: 256,
              checksumSha256: "b".repeat(64),
              source: "picker",
              status: "registered",
              createdAt: 1,
            },
          ],
          rejected: [],
        }),
        remove: vi.fn().mockResolvedValue(undefined),
        readImage: vi.fn().mockResolvedValue(""),
        open: vi.fn(),
      },
    } as typeof window.realmflow;
    const onCreateSession = vi.fn().mockResolvedValue(undefined);
    render(
      <NewChatPage
        spaces={[
          {
            id: "space-product",
            path: "/spaces/product",
            label: "产品空间",
            description: "Product workspace",
          },
        ]}
        onCreateSession={onCreateSession}
      />,
    );

    fireEvent.click(await screen.findByRole("combobox", { name: "工作空间" }));
    fireEvent.click(screen.getByRole("option", { name: "产品空间" }));
    fireEvent.click(screen.getByRole("combobox", { name: "对话模型" }));
    fireEvent.click(screen.getByRole("option", { name: "Fast Model" }));
    fireEvent.click(screen.getByRole("combobox", { name: "权限模式" }));
    fireEvent.click(screen.getByRole("option", { name: "受信任执行" }));
    fireEvent.click(screen.getByRole("button", { name: "打开添加菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "添加文件" }));
    expect(await screen.findByText("scope.md")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "打开添加菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "技能" }));
    const skillDialog = await screen.findByRole("dialog", {
      name: "选择技能",
    });
    expect(skillDialog).toBeVisible();
    fireEvent.click(
      within(skillDialog).getByRole("button", { name: "代码审查" }),
    );
    expect(
      within(screen.getByLabelText("已选技能")).getByText("代码审查"),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("对话内容"), {
      target: { value: "Review current changes" },
    });

    expect(screen.getByLabelText("对话内容")).toHaveValue(
      "Review current changes",
    );
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() =>
      expect(onCreateSession).toHaveBeenCalledWith(
        "/spaces/product",
        "Review current changes",
        "profile-fast",
        "auto",
        expect.objectContaining({
          attachmentIds: ["attachment-scope"],
          allowImageEgress: false,
          draftId: expect.any(String),
        }),
        "trusted",
        {
          skill: {
            kind: "skill",
            id: "builtin.skill.code_review",
            version: "1.0.2",
            digest: "c".repeat(64),
          },
        },
      ),
    );
  });

  it("shows an explicit connector empty state without inserting prompt text", async () => {
    installModelPool();
    window.realmflow = {
      ...window.realmflow,
      business: {
        ...window.realmflow!.business,
        listConnectors: vi.fn().mockResolvedValue([]),
      },
      toolCatalog: {
        listMcpServers: vi.fn().mockResolvedValue([]),
      } as never,
    } as typeof window.realmflow;
    render(<NewChatPage onCreateSession={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "打开添加菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "连接器" }));

    const dialog = await screen.findByRole("dialog", { name: "选择连接器" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText("当前没有已配置的连接器或 MCP")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "配置连接器" }),
    ).toBeVisible();
    expect(screen.getByLabelText("对话内容")).toHaveValue("");
  });

  it("binds one selected MCP server to a new-chat submission", async () => {
    installModelPool();
    window.realmflow = {
      ...window.realmflow,
      business: {
        ...window.realmflow!.business,
        listConnectors: vi.fn().mockResolvedValue([]),
      },
      toolCatalog: {
        listMcpServers: vi.fn().mockResolvedValue([
          {
            id: "mcp.tc-p1-local",
            name: "本地 Mock MCP",
            identity: "a".repeat(64),
            enabled: true,
            transport: {
              kind: "stdio",
              command: "/usr/bin/node",
              arguments: ["/test-space/scripts/mock-mcp-server.mjs"],
              credentialNames: [],
            },
            revision: 1,
            hasCredentials: {},
          },
        ]),
      } as never,
    } as typeof window.realmflow;
    const onCreateSession = vi.fn().mockResolvedValue(undefined);
    render(<NewChatPage onCreateSession={onCreateSession} />);

    fireEvent.click(screen.getByRole("button", { name: "打开添加菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "连接器" }));
    const dialog = await screen.findByRole("dialog", { name: "选择连接器" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "本地 Mock MCP" }),
    );
    fireEvent.change(screen.getByLabelText("对话内容"), {
      target: { value: "Call MCP ping" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() =>
      expect(onCreateSession).toHaveBeenCalledWith(
        "none",
        "Call MCP ping",
        undefined,
        "auto",
        undefined,
        "protected",
        { mcpServerIds: ["mcp.tc-p1-local"] },
      ),
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
                    turns: [],
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
        undefined,
        "protected",
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
                  id: "session-1", title: "Active", spacePath: "",
                  turns: [{
                    id: "turn-1", sessionId: "session-1", index: 0,
                    userMessageId: "user-1", assistantMessageId: "assistant-1",
                    status: "running", createdAt: 1,
                  }],
                  messages: [
                    {
                      id: "user-1", turnId: "turn-1", role: "user",
                      status: "completed", content: "Start", createdAt: 1,
                    },
                    {
                      id: "assistant-1", turnId: "turn-1", role: "assistant",
                      status: "pending", content: "", runId: "run-1", createdAt: 1,
                    },
                  ], createdAt: 1, updatedAt: 1,
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

  it("does not render the no-model setup guide below the new-chat composer", async () => {
    installModelPool(false);
    render(<NewChatPage onCreateSession={vi.fn()} />);

    await act(async () => undefined);

    expect(
      screen.queryByText("配置模型后即可开始对话"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "配置模型…" }),
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
      undefined,
      "protected",
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
      undefined,
      "protected",
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
        undefined,
        "protected",
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
