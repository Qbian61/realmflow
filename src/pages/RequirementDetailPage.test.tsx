import {
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";
import type { NodeRunStatus, RequirementWorkflow } from "../../domain/workflow";
import type {
  NodeQuestionDto,
  NodeTodoDto,
  RequirementExecutionViewDto,
} from "../../shared/business";
import type { AiRunController } from "../app/hooks/use-ai-run-controller";
import { ToastProvider } from "../features/toast/ToastProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import RequirementDetailPage from "./RequirementDetailPage";

const { openRequirementArtifact } = vi.hoisted(() => ({
  openRequirementArtifact: vi.fn(),
}));

function render(ui: Parameters<typeof testingRender>[0]) {
  return testingRender(
    <LocalizationProvider>
      <ToastProvider>{ui}</ToastProvider>
    </LocalizationProvider>,
  );
}

vi.mock("../features/workbench/WorkbenchProvider", () => ({
  useWorkbench: () => ({ openRequirementArtifact }),
}));

vi.mock("../features/workflow/RequirementDagCanvas", () => ({
  RequirementDagCanvas: function MockRequirementDagCanvas({
    view,
    selectedNodeId,
    onSelectNode,
    onOpenNodeMenu,
  }: {
    view: RequirementExecutionViewDto;
    selectedNodeId?: string;
    onSelectNode: (nodeId: string) => void;
    onOpenNodeMenu: (nodeId: string, anchor: HTMLButtonElement) => void;
  }) {
    return (
    <div aria-label="需求详情 流程画板">
      {view.nodes.map((node) => (
        <div key={node.id}>
          <button
            type="button"
            aria-label={`打开${node.name}阶段`}
            aria-pressed={selectedNodeId === node.id}
            onClick={() => onSelectNode(node.id)}
          >
            {node.name}
            {node.active ? <span>活动</span> : null}
          </button>
          <button
            type="button"
            aria-label={`${node.name}操作`}
            onClick={(event) => onOpenNodeMenu(node.id, event.currentTarget)}
          >
            操作
          </button>
        </div>
      ))}
    </div>
    );
  },
}));

describe("RequirementDetailPage AI run controls", () => {
  afterEach(() => {
    delete window.realmflow;
    openRequirementArtifact.mockReset();
  });

  it("keeps a requirement deep link while navigation data is loading", () => {
    render(
      <MemoryRouter
        initialEntries={["/spaces/space-1/requirements/requirement-1"]}
      >
        <Routes>
          <Route
            path="/spaces/:spaceId/requirements/:requirementId"
            element={
              <RequirementDetailPage
                spaces={[]}
                requirementsBySpace={{}}
                aiRuns={emptyAiRuns()}
                loading
              />
            }
          />
          <Route path="/chat/new" element={<div>New conversation</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在加载需求");
    expect(screen.queryByText("New conversation")).not.toBeInTheDocument();
  });

  it("renders the loading state in Japanese", () => {
    render(
      <LocalizationProvider storage={storageWithLocale("ja")}>
        <MemoryRouter
          initialEntries={["/spaces/space-1/requirements/requirement-1"]}
        >
          <Routes>
            <Route
              path="/spaces/:spaceId/requirements/:requirementId"
              element={
                <RequirementDetailPage
                  spaces={[]}
                  requirementsBySpace={{}}
                  aiRuns={emptyAiRuns()}
                  loading
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </LocalizationProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("要件を読み込み中");
  });

  it("shows the requirement name as the selected header tab", () => {
    renderPage(emptyAiRuns());

    const tab = screen.getByRole("tab", { name: "Checkout" });
    const tablist = screen.getByRole("tablist", { name: "需求详情" });
    expect(
      document.querySelector(".requirement-page-header"),
    ).toHaveClass("ui-toolbar", "ui-toolbar--workspace-header");
    expect(tablist).toContainElement(tab);
    expect(tablist).toHaveClass("ui-tab-list", "ui-tab-list--page");
    expect(tablist.parentElement).toHaveClass("ui-tabs", "ui-tabs--page");
    tab.focus();
    fireEvent.keyDown(tab, { key: "ArrowRight" });
    expect(tab).toHaveFocus();
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(tab).toHaveAttribute("title", "Checkout");
    expect(
      screen.getByRole("heading", { level: 1, name: "Checkout" }),
    ).toBeInTheDocument();
  });

  it("starts the selected stage and displays streaming progress and content", () => {
    const start = vi.fn().mockResolvedValue("run-1");
    const aiRuns: AiRunController = {
      runs: {},
      start,
      attach: vi.fn(),
      cancel: vi.fn(),
      findRun: () => ({
        runId: "run-1",
        requirementId: "requirement-1",
        stageId: "analysis",
        status: "running",
        progress: 40,
        content: "# Scope",
        error: "",
      }),
    };

    renderPage(aiRuns);

    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("# Scope")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消生成" }));
    expect(aiRuns.cancel).toHaveBeenCalledWith("run-1");
  });

  it("starts generation through the application controller", () => {
    const start = vi.fn().mockResolvedValue("run-1");
    const aiRuns: AiRunController = {
      runs: {},
      start,
      attach: vi.fn(),
      cancel: vi.fn(),
      findRun: () => undefined,
    };

    renderPage(aiRuns);
    fireEvent.click(screen.getByRole("button", { name: "生成需求分析产物" }));

    expect(start).toHaveBeenCalledWith({
      requirementId: "requirement-1",
      stageId: "analysis",
    });
  });

  it("binds generation to the selected workflow node run", async () => {
    const startWorkflowNode = vi.fn().mockResolvedValue({
      outcome: "applied",
      action: "start",
      workflow: {
        requirementId: "requirement-1",
        templateVersionId: "builtin-sdlc-v1",
        revision: 4,
        maxParallelism: 1,
        nodes: [],
        edges: [],
      },
      execution: {
        id: "requirement-1:execution:1",
        requirementId: "requirement-1",
        status: "running",
        currentNodeId: "requirement-1:analysis",
        revision: 2,
        createdAt: 1,
        updatedAt: 2,
      },
      nodeRun: {
        id: "node-run-1",
        executionId: "requirement-1:execution:1",
        nodeId: "requirement-1:analysis",
        status: "running",
        attempt: 1,
        revision: 3,
        createdAt: 1,
        updatedAt: 2,
      },
    });
    installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
      startWorkflowNode,
    });

    const aiRuns = emptyAiRuns();
    renderPage(aiRuns);
    fireEvent.click(await screen.findByRole("button", { name: "启动节点" }));

    expect(startWorkflowNode).toHaveBeenCalledWith({
      requirementId: "requirement-1",
      nodeRunId: "node-run-1",
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 2,
    });
    expect(aiRuns.start).not.toHaveBeenCalled();
  });

  it("keeps persisted node state and safely toasts rejected controls", async () => {
    const startWorkflowNode = vi.fn().mockResolvedValue({
      outcome: "rejected",
      action: "start",
      error: {
        code: "revision_conflict",
        message: "Workflow control revision conflict",
      },
    });
    installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
      startWorkflowNode,
    });

    renderPage(emptyAiRuns());
    fireEvent.click(await screen.findByRole("button", { name: "启动节点" }));

    expect(
      await screen.findByText(
        "当前更改暂时无法保存，请检查本地存储权限或可用空间。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Workflow control revision conflict"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "启动节点" }),
    ).toBeInTheDocument();
  });

  it("pauses a node through its revisioned execution record", async () => {
    const pausedWorkflow = {
      requirementId: "requirement-1",
      templateVersionId: "builtin-sdlc-v1",
      revision: 4,
      maxParallelism: 1,
      nodes: [
        {
          id: "requirement-1:analysis",
          type: "ai_generate",
          name: "需求分析",
          description: "",
          order: 0,
          status: "paused",
          allowSkip: false,
        },
      ],
      edges: [],
    };
    const pauseWorkflowNode = vi.fn().mockResolvedValue({
      outcome: "applied",
      action: "pause",
      workflow: pausedWorkflow,
      execution: {
        id: "requirement-1:execution:1",
        requirementId: "requirement-1",
        status: "paused",
        currentNodeId: "requirement-1:analysis",
        revision: 2,
        createdAt: 1,
        updatedAt: 2,
      },
      nodeRun: {
        id: "requirement-1:node-run:analysis:1",
        executionId: "requirement-1:execution:1",
        nodeId: "requirement-1:analysis",
        status: "paused",
        attempt: 1,
        revision: 3,
        createdAt: 1,
        updatedAt: 2,
      },
    });
    window.realmflow = {
      business: {
        getRequirementWorkflow: vi.fn().mockResolvedValue({
          requirementId: "requirement-1",
          templateVersionId: "builtin-sdlc-v1",
          revision: 3,
          maxParallelism: 1,
          nodes: [
            {
              id: "requirement-1:analysis",
              type: "ai_generate",
              name: "需求分析",
              description: "",
              order: 0,
              status: "running",
              allowSkip: false,
            },
          ],
          edges: [],
        }),
        getWorkflowNodeExecution: vi.fn().mockResolvedValue({
          execution: {
            id: "requirement-1:execution:1",
            requirementId: "requirement-1",
            status: "created",
            currentNodeId: "requirement-1:analysis",
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          },
          nodeRun: {
            id: "requirement-1:node-run:analysis:1",
            executionId: "requirement-1:execution:1",
            nodeId: "requirement-1:analysis",
            status: "running",
            attempt: 1,
            revision: 2,
            createdAt: 1,
            updatedAt: 1,
          },
        }),
        pauseWorkflowNode,
      },
    } as unknown as typeof window.realmflow;

    renderPage({
      runs: {},
      start: vi.fn(),
      attach: vi.fn(),
      cancel: vi.fn(),
      findRun: () => undefined,
    });

    fireEvent.click(await screen.findByRole("button", { name: "暂停节点" }));
    await waitFor(() =>
      expect(pauseWorkflowNode).toHaveBeenCalledWith({
        requirementId: "requirement-1",
        nodeRunId: "requirement-1:node-run:analysis:1",
        expectedWorkflowRevision: 3,
        expectedExecutionRevision: 1,
        expectedNodeRunRevision: 2,
      }),
    );
  });

  it("resumes a node with the selected model profile", async () => {
    const resumedWorkflow = {
      requirementId: "requirement-1",
      templateVersionId: "builtin-sdlc-v1",
      revision: 4,
      maxParallelism: 1,
      nodes: [],
      edges: [],
    };
    const resumeWorkflowNode = vi.fn().mockResolvedValue({
      outcome: "applied",
      action: "resume",
      workflow: resumedWorkflow,
      execution: {
        id: "requirement-1:execution:1",
        requirementId: "requirement-1",
        status: "running",
        currentNodeId: "requirement-1:analysis",
        revision: 2,
        createdAt: 1,
        updatedAt: 2,
      },
      nodeRun: {
        id: "node-run-1",
        executionId: "requirement-1:execution:1",
        nodeId: "requirement-1:analysis",
        status: "running",
        attempt: 1,
        revision: 3,
        createdAt: 1,
        updatedAt: 2,
      },
    });
    window.realmflow = {
      business: {
        listModels: vi.fn().mockResolvedValue({
          providers: [
            {
              id: "provider-1",
              type: "local",
              name: "Local",
              baseUrl: "http://127.0.0.1",
              enabled: true,
              revision: 1,
            },
          ],
          profiles: [
            {
              id: "profile-1",
              providerId: "provider-1",
              displayName: "Primary model",
              enabled: true,
            },
          ],
        }),
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
        getRequirementWorkflow: vi.fn().mockResolvedValue({
          requirementId: "requirement-1",
          templateVersionId: "builtin-sdlc-v1",
          revision: 3,
          maxParallelism: 1,
          nodes: [
            {
              id: "requirement-1:analysis",
              type: "ai_generate",
              name: "需求分析",
              description: "",
              order: 0,
              status: "paused",
              allowSkip: false,
            },
          ],
          edges: [],
        }),
        getWorkflowNodeExecution: vi.fn().mockResolvedValue({
          execution: {
            id: "requirement-1:execution:1",
            requirementId: "requirement-1",
            status: "paused",
            currentNodeId: "requirement-1:analysis",
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          },
          nodeRun: {
            id: "node-run-1",
            executionId: "requirement-1:execution:1",
            nodeId: "requirement-1:analysis",
            status: "paused",
            attempt: 1,
            revision: 2,
            createdAt: 1,
            updatedAt: 1,
          },
        }),
        resumeWorkflowNode,
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    const modelSelector = await screen.findByRole("combobox", {
      name: "阶段生成模型",
    });
    fireEvent.click(modelSelector);
    fireEvent.click(
      await screen.findByRole("option", { name: "Primary model" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "启动节点" }));

    await waitFor(() =>
      expect(resumeWorkflowNode).toHaveBeenCalledWith({
        requirementId: "requirement-1",
        nodeRunId: "node-run-1",
        expectedWorkflowRevision: 3,
        expectedExecutionRevision: 1,
        expectedNodeRunRevision: 2,
        modelProfileId: "profile-1",
      }),
    );
  });

  it("approves a gated node through the revisioned business command", async () => {
    const completedWorkflow = {
      requirementId: "requirement-1",
      templateVersionId: "builtin-sdlc-v1",
      revision: 4,
      maxParallelism: 1,
      nodes: [
        {
          id: "requirement-1:release",
          type: "approval" as const,
          name: "发布审批",
          description: "",
          order: 0,
          status: "completed" as const,
          allowSkip: false,
          completionGate: { requireApproval: true },
        },
      ],
      edges: [],
    };
    const resolveWorkflowNodeGate = vi
      .fn()
      .mockResolvedValue(completedWorkflow);
    window.realmflow = {
      business: {
        getRequirementWorkflow: vi.fn().mockResolvedValue({
          ...completedWorkflow,
          revision: 3,
          nodes: [
            {
              ...completedWorkflow.nodes[0],
              status: "ready",
            },
          ],
        }),
        getWorkflowNodeExecution: vi.fn().mockResolvedValue({
          execution: {
            id: "execution-1",
            requirementId: "requirement-1",
            status: "running",
            currentNodeId: "requirement-1:release",
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          },
          nodeRun: {
            id: "node-run-release",
            executionId: "execution-1",
            nodeId: "requirement-1:release",
            status: "ready",
            attempt: 1,
            revision: 2,
            createdAt: 1,
            updatedAt: 1,
          },
        }),
        listNodeTodos: vi.fn().mockResolvedValue([]),
        listNodeQuestions: vi.fn().mockResolvedValue([]),
        resolveWorkflowNodeGate,
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(await screen.findByRole("button", { name: "批准节点" }));

    await waitFor(() =>
      expect(resolveWorkflowNodeGate).toHaveBeenCalledWith({
        requirementId: "requirement-1",
        nodeRunId: "node-run-release",
        expectedNodeRunRevision: 2,
        gate: {
          kind: "approval",
          decisionId: expect.any(String),
          expectedApprovalRevision: 0,
          result: "approved",
        },
      }),
    );
    expect(await screen.findByText("已完成")).toBeInTheDocument();
  });

  it("keeps persisted approval state and safely toasts command failure", async () => {
    const resolveWorkflowNodeGate = vi
      .fn()
      .mockRejectedValue(new Error("Node approval revision conflict"));
    window.realmflow = {
      business: {
        getRequirementWorkflow: vi.fn().mockResolvedValue({
          requirementId: "requirement-1",
          templateVersionId: "builtin-sdlc-v1",
          revision: 3,
          maxParallelism: 1,
          nodes: [
            {
              id: "requirement-1:release",
              type: "approval",
              name: "发布审批",
              description: "",
              order: 0,
              status: "ready",
              allowSkip: false,
              completionGate: { requireApproval: true },
            },
          ],
          edges: [],
        }),
        getWorkflowNodeExecution: vi.fn().mockResolvedValue({
          execution: {
            id: "execution-1",
            requirementId: "requirement-1",
            status: "running",
            currentNodeId: "requirement-1:release",
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          },
          nodeRun: {
            id: "node-run-release",
            executionId: "execution-1",
            nodeId: "requirement-1:release",
            status: "ready",
            attempt: 1,
            revision: 2,
            createdAt: 1,
            updatedAt: 1,
          },
          approval: {
            nodeRunId: "node-run-release",
            decisionId: "decision-previous",
            result: "rejected",
            actorType: "local_user",
            actorId: "local-user",
            note: "Missing evidence",
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
            decidedAt: 1,
          },
        }),
        listNodeTodos: vi.fn().mockResolvedValue([]),
        listNodeQuestions: vi.fn().mockResolvedValue([]),
        resolveWorkflowNodeGate,
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(await screen.findByRole("button", { name: "批准节点" }));

    expect(await screen.findByText("更新审批失败：未知错误")).toBeInTheDocument();
    expect(
      screen.queryByText("Node approval revision conflict"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("已驳回")).toBeInTheDocument();
    expect(screen.getByText("Missing evidence")).toBeInTheDocument();
    expect(screen.queryByText("已批准")).not.toBeInTheDocument();
  });

  it("creates a pending node todo without optimistic insertion", async () => {
    const saveNodeTodo = vi.fn().mockResolvedValue({
      id: "todo-created",
      nodeRunId: "node-run-1",
      title: "Review release notes",
      required: true,
      status: "pending",
      revision: 1,
      createdAt: 2,
      updatedAt: 2,
    });
    installNodeInteractionApi({
      todos: [],
      questions: [],
      saveNodeTodo,
      answerNodeQuestion: vi.fn(),
    });

    renderPage(emptyAiRuns());

    fireEvent.change(await screen.findByLabelText("新建节点待办"), {
      target: { value: "  Review release notes  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加待办" }));

    await waitFor(() =>
      expect(saveNodeTodo).toHaveBeenCalledWith({
        id: expect.any(String),
        nodeRunId: "node-run-1",
        title: "Review release notes",
        required: true,
        status: "pending",
        expectedRevision: 0,
      }),
    );
    expect(await screen.findByText("Review release notes")).toBeInTheDocument();
  });

  it("lists node todos and submits a revisioned status transition", async () => {
    const saveNodeTodo = vi.fn().mockResolvedValue({
      id: "todo-1",
      nodeRunId: "node-run-1",
      title: "Confirm acceptance criteria",
      required: true,
      status: "blocked",
      revision: 4,
      createdAt: 1,
      updatedAt: 2,
    });
    installNodeInteractionApi({
      saveNodeTodo,
      answerNodeQuestion: vi.fn(),
    });

    renderPage(emptyAiRuns());

    const status = await screen.findByRole("combobox", {
      name: "更新待办状态：Confirm acceptance criteria",
    });
    fireEvent.change(status, { target: { value: "blocked" } });

    await waitFor(() =>
      expect(saveNodeTodo).toHaveBeenCalledWith({
        id: "todo-1",
        nodeRunId: "node-run-1",
        title: "Confirm acceptance criteria",
        required: true,
        status: "blocked",
        expectedRevision: 3,
      }),
    );
    expect(status).toHaveValue("blocked");
  });

  it("keeps the confirmed todo state and safely toasts transition failure", async () => {
    const saveNodeTodo = vi
      .fn()
      .mockRejectedValue(new Error("Revision conflict"));
    installNodeInteractionApi({
      saveNodeTodo,
      answerNodeQuestion: vi.fn(),
    });

    renderPage(emptyAiRuns());

    const status = await screen.findByRole("combobox", {
      name: "更新待办状态：Confirm acceptance criteria",
    });
    fireEvent.change(status, { target: { value: "completed" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "更新待办失败：未知错误",
    );
    expect(screen.queryByText("Revision conflict")).not.toBeInTheDocument();
    expect(status).toHaveValue("pending");
  });

  it("renders terminal todos without a status control", async () => {
    installNodeInteractionApi({
      todos: [
        {
          id: "todo-1",
          nodeRunId: "node-run-1",
          title: "Confirm acceptance criteria",
          required: true,
          status: "completed",
          revision: 4,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
    });

    renderPage(emptyAiRuns());

    expect(await screen.findByText("已完成")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", {
        name: "更新待办状态：Confirm acceptance criteria",
      }),
    ).not.toBeInTheDocument();
  });

  it("lists open node questions and submits a revisioned answer", async () => {
    const answerNodeQuestion = vi.fn().mockResolvedValue({
      id: "question-1",
      nodeRunId: "node-run-1",
      prompt: "Which rollout strategy should be used?",
      required: true,
      status: "answered",
      answer: "Canary rollout",
      revision: 6,
      createdAt: 1,
      updatedAt: 2,
      answeredAt: 2,
    });
    const { getRequirementWorkflow, getWorkflowNodeExecution } =
      installNodeInteractionApi({
        saveNodeTodo: vi.fn(),
        answerNodeQuestion,
      });

    renderPage(emptyAiRuns());

    fireEvent.change(
      await screen.findByLabelText(
        "回答：Which rollout strategy should be used?",
      ),
      { target: { value: "Canary rollout" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "提交回答" }));

    await waitFor(() =>
      expect(answerNodeQuestion).toHaveBeenCalledWith({
        id: "question-1",
        requirementId: "requirement-1",
        nodeRunId: "node-run-1",
        answer: "Canary rollout",
        expectedRevision: 5,
      }),
    );
    expect(await screen.findByText("Canary rollout")).toBeInTheDocument();
    await waitFor(() => {
      expect(getRequirementWorkflow).toHaveBeenCalledTimes(2);
      expect(getWorkflowNodeExecution).toHaveBeenCalledTimes(2);
    });
  });

  it("creates a required node question without optimistic insertion", async () => {
    const openNodeQuestion = vi.fn().mockResolvedValue({
      id: "question-new",
      nodeRunId: "node-run-1",
      prompt: "Confirm the rollout owner",
      required: true,
      status: "open",
      revision: 1,
      createdAt: 2,
      updatedAt: 2,
    });
    installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
      openNodeQuestion,
      questions: [],
    });

    renderPage(emptyAiRuns());

    fireEvent.change(await screen.findByLabelText("新建节点问题"), {
      target: { value: "Confirm the rollout owner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加问题" }));

    await waitFor(() =>
      expect(openNodeQuestion).toHaveBeenCalledWith({
        id: expect.any(String),
        requirementId: "requirement-1",
        nodeRunId: "node-run-1",
        prompt: "Confirm the rollout owner",
        required: true,
        expectedRevision: 0,
      }),
    );
    expect(
      await screen.findByText("Confirm the rollout owner"),
    ).toBeInTheDocument();
  });

  it("safely toasts question failure and keeps confirmed state", async () => {
    const dismissNodeQuestion = vi
      .fn()
      .mockRejectedValue(new Error("Revision conflict"));
    installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
      dismissNodeQuestion,
      questions: [
        {
          id: "question-optional",
          nodeRunId: "node-run-1",
          prompt: "Add an optional note?",
          required: false,
          status: "open",
          revision: 3,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    renderPage(emptyAiRuns());

    fireEvent.click(
      await screen.findByRole("button", {
        name: "关闭问题：Add an optional note?",
      }),
    );

    expect(await screen.findByText("更新问题失败：未知错误")).toBeInTheDocument();
    expect(screen.queryByText("Revision conflict")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("回答：Add an optional note?"),
    ).toBeInTheDocument();
  });

  it("renders a dismissed optional question as a readable terminal state", async () => {
    const dismissNodeQuestion = vi.fn().mockResolvedValue({
      id: "question-optional",
      nodeRunId: "node-run-1",
      prompt: "Add an optional note?",
      required: false,
      status: "dismissed",
      revision: 4,
      createdAt: 1,
      updatedAt: 2,
    });
    installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
      dismissNodeQuestion,
      questions: [
        {
          id: "question-optional",
          nodeRunId: "node-run-1",
          prompt: "Add an optional note?",
          required: false,
          status: "open",
          revision: 3,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    renderPage(emptyAiRuns());

    fireEvent.click(
      await screen.findByRole("button", {
        name: "关闭问题：Add an optional note?",
      }),
    );

    expect(await screen.findByText("已关闭")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("回答：Add an optional note?"),
    ).not.toBeInTheDocument();
  });

  it("reattaches the persisted AI run when reopening a node", async () => {
    installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
      aiRunId: "run-restored",
    });
    const aiRuns = emptyAiRuns();

    renderPage(aiRuns);

    await waitFor(() =>
      expect(aiRuns.attach).toHaveBeenCalledWith("run-restored"),
    );
  });

  it("refreshes workflow and node execution after an AI run terminates", async () => {
    const business = installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
      aiRunId: "run-completed",
    });
    const aiRuns = emptyAiRuns();
    const completedRun = {
      runId: "run-completed",
      requirementId: "requirement-1",
      nodeId: "requirement-1:analysis",
      status: "completed" as const,
      progress: 100,
      content: "# Complete",
      error: "",
    };
    aiRuns.runs = { "run-completed": completedRun };
    aiRuns.findRun = () => completedRun;

    renderPage(aiRuns);

    await waitFor(() => {
      expect(business.getRequirementWorkflow).toHaveBeenCalledTimes(2);
      expect(business.getWorkflowNodeExecution).toHaveBeenCalledTimes(2);
    });
  });

  it("edits a ready workflow node and applies the persisted result", async () => {
    const updateWorkflowNode = vi.fn().mockResolvedValue({
      requirementId: "requirement-1",
      templateVersionId: "builtin-sdlc-v1",
      revision: 4,
      maxParallelism: 1,
      nodes: [
        {
          id: "requirement-1:analysis",
          type: "ai_generate",
          name: "需求澄清",
          description: "确认范围与验收标准",
          order: 0,
          status: "ready",
          allowSkip: true,
        },
      ],
      edges: [],
    });
    installWorkflowEditingApi({ updateWorkflowNode });
    renderPage(emptyAiRuns());

    fireEvent.click(
      await screen.findByRole("button", { name: "编辑需求分析节点" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "编辑节点名称" }), {
      target: { value: "  需求澄清  " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "节点描述" }), {
      target: { value: "确认范围与验收标准" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "允许跳过节点" }));
    fireEvent.click(screen.getByRole("button", { name: "保存节点" }));

    await waitFor(() =>
      expect(updateWorkflowNode).toHaveBeenCalledWith({
        requirementId: "requirement-1",
        expectedRevision: 3,
        nodeId: "requirement-1:analysis",
        changes: {
          name: "需求澄清",
          description: "确认范围与验收标准",
          allowSkip: true,
        },
      }),
    );
    expect((await screen.findAllByText("需求澄清")).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("textbox", { name: "编辑节点名称" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "删除需求分析节点" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the edit form and current node when persistence fails", async () => {
    const updateWorkflowNode = vi
      .fn()
      .mockRejectedValue(new Error("Database unavailable"));
    installWorkflowEditingApi({ updateWorkflowNode });
    renderPage(emptyAiRuns());

    fireEvent.click(
      await screen.findByRole("button", { name: "编辑需求分析节点" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "编辑节点名称" }), {
      target: { value: "未保存名称" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存节点" }));

    expect(
      await screen.findByText("保存节点失败：未知错误"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Database unavailable")).not.toBeInTheDocument();
    expect(screen.getAllByText("需求分析").length).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "编辑节点名称" })).toHaveValue(
      "未保存名称",
    );
  });

  it("updates an existing workflow edge and applies the persisted result", async () => {
    const current = editableWorkflow();
    const updateWorkflowEdge = vi.fn().mockResolvedValue({
      ...current,
      revision: 4,
      edges: [
        {
          id: "edge-1",
          sourceNodeId: "requirement-1:design",
          targetNodeId: "requirement-1:testing",
        },
      ],
    });
    installWorkflowEditingApi({ workflow: current, updateWorkflowEdge });
    renderPage(emptyAiRuns());

    fireEvent.click(
      await screen.findByRole("button", { name: "编辑流程连线" }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "连线起点" }), {
      target: { value: "requirement-1:design" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "连线终点" }), {
      target: { value: "requirement-1:testing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存连线" }));

    await waitFor(() =>
      expect(updateWorkflowEdge).toHaveBeenCalledWith({
        requirementId: "requirement-1",
        expectedRevision: 3,
        edgeId: "edge-1",
        edge: {
          id: "edge-1",
          sourceNodeId: "requirement-1:design",
          targetNodeId: "requirement-1:testing",
        },
      }),
    );
    expect(
      screen.queryByRole("combobox", { name: "连线起点" }),
    ).not.toBeInTheDocument();
  });

  it("moves an editable node and sends the complete stable order", async () => {
    const current = editableWorkflow();
    const reorderWorkflowNodes = vi.fn().mockResolvedValue({
      ...current,
      revision: 4,
      nodes: [current.nodes[0], current.nodes[2], current.nodes[1]].map(
        (node, order) => ({ ...node, order }),
      ),
    });
    installWorkflowEditingApi({ workflow: current, reorderWorkflowNodes });
    renderPage(emptyAiRuns());

    fireEvent.click(
      await screen.findByRole("button", { name: "后移技术方案节点" }),
    );

    await waitFor(() =>
      expect(reorderWorkflowNodes).toHaveBeenCalledWith({
        requirementId: "requirement-1",
        expectedRevision: 3,
        orderedNodeIds: [
          "requirement-1:analysis",
          "requirement-1:testing",
          "requirement-1:design",
        ],
      }),
    );
    expect(
      screen
        .getAllByRole("button", { name: /^打开.+阶段$/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["打开需求分析阶段", "打开测试验证阶段", "打开技术方案阶段"]);
  });

  it("does not move an editable node across a protected neighbor", async () => {
    const current = editableWorkflow();
    current.nodes[0].status = "completed";
    installWorkflowEditingApi({ workflow: current });
    renderPage(emptyAiRuns());

    expect(
      await screen.findByRole("button", { name: "前移技术方案节点" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "后移技术方案节点" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "前移需求分析节点" }),
    ).not.toBeInTheDocument();
  });

  it("hides every instance editing action for all started node states", async () => {
    const startedStatuses = [
      "running",
      "waiting_user",
      "paused",
      "blocked",
      "completed",
      "failed",
      "skipped",
      "cancelled",
      "interrupted",
    ] satisfies NodeRunStatus[];
    const current = editableWorkflow();
    current.nodes = [
      ...startedStatuses.map((status, order) => ({
        ...current.nodes[0],
        id: `requirement-1:${status}`,
        name: status,
        order,
        status,
      })),
      {
        ...current.nodes[1],
        id: "requirement-1:pending",
        name: "pending",
        order: startedStatuses.length,
        status: "pending" as const,
      },
    ];
    current.edges = [];
    installWorkflowEditingApi({ workflow: current });
    renderPage(emptyAiRuns());

    await screen.findByRole("button", { name: "编辑pending节点" });
    for (const status of startedStatuses) {
      expect(
        screen.queryByRole("button", { name: `编辑${status}节点` }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: `删除${status}节点` }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: `前移${status}节点` }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: `后移${status}节点` }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "编辑流程连线" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the persisted order when reordering fails", async () => {
    const current = editableWorkflow();
    const reorderWorkflowNodes = vi
      .fn()
      .mockRejectedValue(new Error("Revision conflict"));
    installWorkflowEditingApi({ workflow: current, reorderWorkflowNodes });
    renderPage(emptyAiRuns());

    fireEvent.click(
      await screen.findByRole("button", { name: "后移技术方案节点" }),
    );

    expect(
      await screen.findByText("调整顺序失败：未知错误"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Revision conflict")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", { name: /^打开.+阶段$/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["打开需求分析阶段", "打开技术方案阶段", "打开测试验证阶段"]);
  });

  it("opens template migration and refreshes authoritative state after success", async () => {
    const current = editableWorkflow();
    const migrated = {
      ...current,
      templateVersionId: "template-v2",
      revision: 4,
      maxParallelism: 1,
      nodes: [
        current.nodes[0],
        {
          ...current.nodes[2],
          id: "requirement-1:review",
          name: "迁移评审",
          order: 1,
        },
      ],
      edges: [],
    };
    const getRequirementWorkflow = vi
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValue(migrated);
    const getWorkflowNodeExecution = vi.fn().mockResolvedValue(undefined);
    const applyTemplateMigration = vi.fn().mockResolvedValue({
      outcome: "applied",
      migrationRecordId: "migration-1",
      requirementRevision: 2,
      executionRevision: 2,
      targetVersion: {
        id: "template-v2",
        version: 2,
        checksum: "checksum-v2",
        nodeCount: 2,
        edgeCount: 0,
      },
      workflow: migrated,
      diff: {
        addedNodes: [{ id: "requirement-1:review", name: "迁移评审" }],
        removedNodes: [],
        updatedNodes: [],
        reorderedNodes: [],
        addedEdges: [],
        removedEdges: [],
        targetWorkflow: migrated,
      },
    });
    window.realmflow = {
      business: {
        getRequirementWorkflow,
        getWorkflowNodeExecution,
        listTemplateMigrationCandidates: vi.fn().mockResolvedValue({
          currentVersion: {
            id: "template-v1",
            version: 1,
            checksum: "checksum-v1",
            nodeCount: 3,
            edgeCount: 1,
          },
          candidates: [
            {
              id: "template-v2",
              version: 2,
              checksum: "checksum-v2",
              nodeCount: 2,
              edgeCount: 0,
            },
          ],
        }),
        previewTemplateMigration: vi.fn().mockResolvedValue({
          requirementId: "requirement-1",
          sourceVersion: {
            id: "template-v1",
            version: 1,
            checksum: "checksum-v1",
            nodeCount: 3,
            edgeCount: 1,
          },
          targetVersion: {
            id: "template-v2",
            version: 2,
            checksum: "checksum-v2",
            nodeCount: 2,
            edgeCount: 0,
          },
          requirementRevision: 1,
          workflowRevision: 3,
          executionRevision: 1,
          diff: {
            addedNodes: [{ id: "requirement-1:review", name: "迁移评审" }],
            removedNodes: [],
            updatedNodes: [],
            reorderedNodes: [],
            addedEdges: [],
            removedEdges: [],
            targetWorkflow: migrated,
          },
        }),
        applyTemplateMigration,
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(
      await screen.findByRole("button", { name: "迁移模板" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "确认迁移" }),
    );

    await waitFor(() => expect(applyTemplateMigration).toHaveBeenCalledOnce());
    await waitFor(() => expect(getRequirementWorkflow).toHaveBeenCalledTimes(2));
    expect((await screen.findAllByText("迁移评审")).length).toBeGreaterThan(0);
  });

  it("keeps context details out of the workbench while retaining formal artifacts", async () => {
    const getRequirementExecutionView = vi
      .fn()
      .mockResolvedValue(executionViewFixture());
    window.realmflow = {
      business: { getRequirementExecutionView },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());

    expect(await screen.findByText("artifacts/implementation.md")).toBeInTheDocument();
    expect(screen.queryByText("上下文来源")).not.toBeInTheDocument();
    expect(screen.queryByText("需求正文")).not.toBeInTheDocument();
    expect(screen.queryByText("requirements/checkout.md")).not.toBeInTheDocument();
    expect(screen.queryByText("sha256:snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("Assembled context body")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "生成上下文预览" }),
    ).toBeInTheDocument();
    expect(getRequirementExecutionView).toHaveBeenCalledWith({
      requirementId: "requirement-1",
    });
  });

  it("composes the authoritative DAG directly above the node workbench", async () => {
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi
          .fn()
          .mockResolvedValue(executionViewFixture()),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());

    expect(
      await screen.findByLabelText("需求详情 流程画板"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("toolbar", { name: "需求 DAG 工具栏" }),
    ).toBeNull();
    expect(document.querySelector(".requirement-dag-summary")).toBeNull();
    expect(
      screen.getByRole("region", { name: "开发实现" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".development-flow-track")).toBeNull();
    expect(screen.queryByText("需求概述")).not.toBeInTheDocument();
    expect(
      screen.queryByText("待补充本需求的目标、范围与验收标准。"),
    ).not.toBeInTheDocument();
  });

  it("resizes the DAG and node workbench with pointer and keyboard input", async () => {
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi
          .fn()
          .mockResolvedValue(executionViewFixture()),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());

    await screen.findByLabelText("需求详情 流程画板");
    const workbench = document.querySelector(
      ".requirement-execution-workbench",
    ) as HTMLElement;
    const separator = screen.getByRole("separator", {
      name: "调整流程图与节点工作台高度",
    });
    Object.defineProperty(workbench, "getBoundingClientRect", {
      value: () => ({ top: 100, height: 700 }),
    });
    Object.defineProperty(separator, "setPointerCapture", {
      value: vi.fn(),
    });
    Object.defineProperty(separator, "releasePointerCapture", {
      value: vi.fn(),
    });

    fireEvent.pointerDown(separator, { pointerId: 3 });
    fireEvent(
      separator,
      new MouseEvent("pointermove", { bubbles: true, clientY: 340 }),
    );
    fireEvent.pointerUp(separator, { pointerId: 3 });

    expect(
      workbench.style.getPropertyValue("--requirement-dag-height"),
    ).toBe("240px");
    fireEvent.keyDown(separator, { key: "ArrowDown" });
    expect(
      workbench.style.getPropertyValue("--requirement-dag-height"),
    ).toBe("248px");
  });

  it("does not expose infinite-canvas navigation actions", async () => {
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi
          .fn()
          .mockResolvedValue(executionViewFixture()),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());

    await screen.findByLabelText("需求详情 流程画板");
    for (const name of ["适应画布", "放大", "缩小", "定位当前节点"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("opens a formal artifact by its exact relative path", async () => {
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi
          .fn()
          .mockResolvedValue(executionViewFixture()),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(
      await screen.findByRole("button", {
        name: "打开 implementation.md",
      }),
    );

    expect(openRequirementArtifact).toHaveBeenCalledWith(
      "requirement-1",
      "artifacts/implementation.md",
      "implementation.md",
    );
  });

  it("retries from the DAG menu and reloads the full selected-node view", async () => {
    const failed = executionViewFixture();
    failed.workflow.nodes[2].status = "failed";
    failed.nodes[2].status = "failed";
    failed.selectedNode.nodeRun = {
      ...failed.selectedNode.nodeRun!,
      status: "failed",
    };
    const refreshed = executionViewFixture();
    refreshed.workflow.nodes[2].status = "ready";
    refreshed.nodes[2].status = "ready";
    const getRequirementExecutionView = vi
      .fn()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(refreshed);
    const retryWorkflowNode = vi.fn().mockResolvedValue({
      outcome: "applied",
      action: "retry",
      workflow: refreshed.workflow,
      execution: refreshed.execution,
      nodeRun: refreshed.selectedNode.nodeRun,
    });
    window.realmflow = {
      business: { getRequirementExecutionView, retryWorkflowNode },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(
      await screen.findByRole("button", { name: "开发实现操作" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "重试" }));

    expect(retryWorkflowNode).toHaveBeenCalledWith({
      requirementId: "requirement-1",
      nodeRunId: "node-run-implementation",
      expectedWorkflowRevision: 4,
      expectedExecutionRevision: 3,
      expectedNodeRunRevision: 2,
    });
    await waitFor(() =>
      expect(getRequirementExecutionView).toHaveBeenLastCalledWith({
        requirementId: "requirement-1",
        nodeId: "implementation",
      }),
    );
  });

  it("safely toasts a rejected DAG command without rendering its message inline", async () => {
    const failed = executionViewFixture();
    failed.workflow.nodes[2].status = "failed";
    failed.nodes[2].status = "failed";
    failed.selectedNode.nodeRun = {
      ...failed.selectedNode.nodeRun!,
      status: "failed",
    };
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi.fn().mockResolvedValue(failed),
        retryWorkflowNode: vi.fn().mockResolvedValue({
          outcome: "rejected",
          action: "retry",
          error: {
            code: "revision_conflict",
            message: "Sensitive retry failure /Users/private/token",
          },
        }),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(
      await screen.findByRole("button", { name: "开发实现操作" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "重试" }));

    expect(
      await screen.findByText(
        "当前更改暂时无法保存，请检查本地存储权限或可用空间。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Sensitive retry failure /Users/private/token"),
    ).not.toBeInTheDocument();
  });

  it("closes a node menu with Escape and can open the same menu again", async () => {
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi
          .fn()
          .mockResolvedValue(executionViewFixture()),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    const trigger = await screen.findByRole("button", {
      name: "开发实现操作",
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeVisible();
  });

  it("confirms rollback in an application dialog and refreshes the target node", async () => {
    const view = executionViewFixture();
    const getRequirementExecutionView = vi.fn().mockResolvedValue(view);
    const rollbackWorkflowToNode = vi.fn().mockResolvedValue({
      outcome: "idempotent",
      operation: {
        id: "rollback-1",
        requestId: "request-1",
        requirementId: "requirement-1",
        executionId: "execution-1",
        targetNodeId: "implementation",
        affectedNodeIds: ["implementation", "testing"],
        createdNodeRunIds: [],
        pendingAiRunIds: [],
        knowledgeSyncPending: false,
        status: "completed",
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      },
      warnings: [],
    });
    window.realmflow = {
      business: { getRequirementExecutionView, rollbackWorkflowToNode },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(
      await screen.findByRole("button", { name: "开发实现操作" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "回退到此节点" }),
    );

    expect(
      screen.getByRole("dialog", { name: "回退到开发实现" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认回退" }));

    await waitFor(() =>
      expect(rollbackWorkflowToNode).toHaveBeenCalledWith({
        requestId: expect.any(String),
        requirementId: "requirement-1",
        executionId: "execution-1",
        targetNodeId: "implementation",
        expectedRequirementRevision: 0,
        expectedWorkflowRevision: 4,
        expectedExecutionRevision: 3,
        expectedNodeRunRevision: 2,
      }),
    );
    expect(getRequirementExecutionView).toHaveBeenLastCalledWith({
      requirementId: "requirement-1",
      nodeId: "implementation",
    });
  });

  it("marks every active node separately from selection", async () => {
    const view = executionViewFixture();
    view.maxParallelism = 2;
    view.workflow.maxParallelism = 2;
    view.activeNodeIds = ["implementation", "testing"];
    view.nodes = view.nodes.map((node) =>
      node.id === "testing"
        ? {
            ...node,
            status: "ready",
            active: true,
            focused: false,
            nodeRunId: "node-run-testing",
            attempt: 1,
            updatedAt: 3,
          }
        : node,
    );
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi.fn().mockResolvedValue(view),
        setWorkflowParallelism: vi.fn(),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());

    expect(await screen.findAllByText("活动")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "打开开发实现阶段" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "打开测试验证阶段" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("safely toasts node control errors in the new execution workbench", async () => {
    const view = executionViewFixture();
    view.workflow.nodes = view.workflow.nodes.map((node) =>
      node.id === "implementation" ? { ...node, status: "running" } : node,
    );
    view.nodes = view.nodes.map((node) =>
      node.id === "implementation" ? { ...node, status: "running" } : node,
    );
    if (view.selectedNode.nodeRun) {
      view.selectedNode.nodeRun.status = "running";
    }
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi.fn().mockResolvedValue(view),
        pauseWorkflowNode: vi.fn().mockResolvedValue({
          outcome: "rejected",
          action: "pause",
          error: {
            code: "revision_conflict",
            message: "Node changed elsewhere",
          },
        }),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(await screen.findByRole("button", { name: "暂停节点" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "当前更改暂时无法保存，请检查本地存储权限或可用空间。",
    );
    expect(screen.queryByText("Node changed elsewhere")).not.toBeInTheDocument();
  });

  it("reports a restart-required error when the loaded preload cannot delete todos", async () => {
    const view = executionViewFixture();
    view.selectedNode.todos = [
      {
        id: "todo-1",
        nodeRunId: "node-run-implementation",
        title: "Review release",
        required: true,
        status: "pending",
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi.fn().mockResolvedValue(view),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(
      await screen.findByRole("button", {
        name: "删除待办：Review release",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(screen.queryByRole("dialog", { name: "删除待办" })).toBeNull();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "删除待办接口已更新，请重启 RealmFlow 后重试",
    );
    expect(screen.getByText("Review release")).toBeInTheDocument();
  });

  it("renders the selected node conversation inside the execution detail", async () => {
    const view = executionViewFixture();
    view.selectedNode.conversation = {
      id: "conversation-node",
      kind: "requirement_node",
      workspaceId: "workspace-1",
      requirementId: "requirement-1",
      nodeRunId: "node-run-implementation",
      title: "开发实现",
      sortOrder: 1,
      revision: 2,
      messages: [
        {
          id: "message-1",
          role: "assistant",
          status: "completed",
          content: "节点对话已恢复",
          sortOrder: 0,
          createdAt: 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi.fn().mockResolvedValue(view),
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());

    expect(await screen.findByText("节点对话已恢复")).toBeInTheDocument();
    expect(screen.getByLabelText("节点对话内容")).toBeInTheDocument();
  });

  it("prepares a context snapshot with current revisions and reloads the view", async () => {
    const view = executionViewFixture();
    const getRequirementExecutionView = vi.fn().mockResolvedValue(view);
    const prepareWorkflowNodeContext = vi
      .fn()
      .mockResolvedValue(view.selectedNode.contextSnapshot);
    window.realmflow = {
      business: {
        getRequirementExecutionView,
        prepareWorkflowNodeContext,
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(
      await screen.findByRole("button", { name: "生成上下文预览" }),
    );

    await waitFor(() =>
      expect(prepareWorkflowNodeContext).toHaveBeenCalledWith({
        requirementId: "requirement-1",
        nodeRunId: "node-run-implementation",
        expectedWorkflowRevision: 4,
        expectedExecutionRevision: 3,
        expectedNodeRunRevision: 2,
      }),
    );
    expect(getRequirementExecutionView).toHaveBeenCalledTimes(2);
  });

  it("shows a concise context preview failure without changing the loaded view", async () => {
    const getRequirementExecutionView = vi
      .fn()
      .mockResolvedValue(executionViewFixture());
    const prepareWorkflowNodeContext = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'workflow-node:preview-context': PrepareNodeContextSnapshotError: No enabled model",
        ),
      );
    window.realmflow = {
      business: {
        getRequirementExecutionView,
        prepareWorkflowNodeContext,
      },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());
    fireEvent.click(
      await screen.findByRole("button", { name: "生成上下文预览" }),
    );

    expect(
      await screen.findByText("生成上下文预览失败：No enabled model"),
    ).toBeInTheDocument();
    expect(getRequirementExecutionView).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable execution-view error and recovers without reloading the page", async () => {
    const getRequirementExecutionView = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(executionViewFixture());
    window.realmflow = {
      business: { getRequirementExecutionView },
    } as unknown as typeof window.realmflow;

    renderPage(emptyAiRuns());

    expect(
      await screen.findByText("加载执行视图失败：database unavailable"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试执行视图" }));

    expect(
      await screen.findByLabelText("需求详情 流程画板"),
    ).toBeInTheDocument();
    expect(getRequirementExecutionView).toHaveBeenCalledTimes(2);
  });
});

function emptyAiRuns(): AiRunController {
  return {
    runs: {},
    start: vi.fn(),
    attach: vi.fn(),
    cancel: vi.fn(),
    findRun: () => undefined,
  };
}

function executionViewFixture(): RequirementExecutionViewDto {
  const workflow = {
    requirementId: "requirement-1",
    templateVersionId: "builtin-sdlc-v1",
    revision: 4,
    maxParallelism: 1,
    nodes: [
      {
        id: "analysis",
        type: "ai_generate" as const,
        name: "需求分析",
        description: "",
        order: 0,
        status: "completed" as const,
        allowSkip: false,
      },
      {
        id: "design",
        type: "approval" as const,
        name: "技术方案",
        description: "",
        order: 1,
        status: "skipped" as const,
        allowSkip: true,
      },
      {
        id: "implementation",
        type: "ai_generate" as const,
        name: "开发实现",
        description: "",
        order: 2,
        status: "ready" as const,
        allowSkip: false,
      },
      {
        id: "testing",
        type: "tool" as const,
        name: "测试验证",
        description: "",
        order: 3,
        status: "pending" as const,
        allowSkip: false,
      },
    ],
    edges: [],
  };
  return {
    workflow,
    execution: {
      id: "execution-1",
      requirementId: "requirement-1",
      status: "running" as const,
      currentNodeId: "implementation",
      revision: 3,
      createdAt: 1,
      updatedAt: 3,
    },
    maxParallelism: 1,
    activeNodeIds: ["implementation"],
    focusedNodeId: "implementation",
    progress: {
      completedNodes: 2,
      totalNodes: 4,
      percent: 50,
    },
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      status: node.status,
      current: node.id === "implementation",
      active: node.id === "implementation",
      focused: node.id === "implementation",
      ...(node.id === "implementation"
        ? {
            nodeRunId: "node-run-implementation",
            nodeRunRevision: 2,
            attempt: 1,
            updatedAt: 3,
            todoCounts: {
              required: { completed: 0, total: 0 },
              optional: { completed: 0, total: 0 },
            },
            openQuestionCount: 0,
            approvalStatus: "not_required" as const,
            artifactCount: 1,
            capabilities: {
              retry: { enabled: true as const },
              skip: { enabled: true as const },
              delete: { enabled: true as const },
              rollback: { enabled: true as const },
            },
          }
        : {}),
    })),
    selectedNode: {
      id: "implementation",
      nodeRun: {
        id: "node-run-implementation",
        executionId: "execution-1",
        nodeId: "implementation",
        status: "ready" as const,
        attempt: 1,
        revision: 2,
        createdAt: 1,
        updatedAt: 3,
      },
      contextSnapshot: {
        id: "snapshot-1",
        providerId: "provider-1",
        modelProfileId: "profile-1",
        modelId: "example-model",
        modelParameters: {
          timeoutMs: 120_000,
          maxRetries: 2,
          maxConcurrency: 4,
        },
        policyVersion: 3,
        content: "Assembled context body",
        sources: [],
        plan: {
          totalTokenBudget: 6,
          allocations: { fixed: 6, knowledge: 0 },
        },
        insufficientKnowledge: false,
        characterCount: 22,
        estimatedTokens: 6,
        checksum: "sha256:snapshot",
        createdAt: 3,
      },
      contextSources: [
        {
          kind: "requirement" as const,
          id: "requirements/checkout.md",
          version: 1,
          characterCount: 120,
          includedCharacters: 120,
          estimatedTokens: 30,
          status: "included" as const,
          truncated: false,
          summarized: false,
          redacted: false,
          preview: "Checkout",
        },
      ],
      todos: [],
      questions: [],
      artifacts: [
        {
          id: "artifact-1",
          nodeId: "implementation",
          relativePath: "artifacts/implementation.md",
          kind: "markdown",
          version: 1,
          byteSize: 240,
          isPrimary: true as const,
          updatedAt: 3,
        },
      ],
    },
  };
}

function installNodeInteractionApi(input: {
  saveNodeTodo: ReturnType<typeof vi.fn>;
  answerNodeQuestion: ReturnType<typeof vi.fn>;
  openNodeQuestion?: ReturnType<typeof vi.fn>;
  dismissNodeQuestion?: ReturnType<typeof vi.fn>;
  startWorkflowNode?: ReturnType<typeof vi.fn>;
  aiRunId?: string;
  todos?: NodeTodoDto[];
  questions?: NodeQuestionDto[];
}) {
  const getRequirementWorkflow = vi.fn().mockResolvedValue({
    requirementId: "requirement-1",
    templateVersionId: "builtin-sdlc-v1",
    revision: 3,
    maxParallelism: 1,
    nodes: [
      {
        id: "requirement-1:analysis",
        type: "ai_generate",
        name: "需求分析",
        description: "",
        order: 0,
        status: "ready",
        allowSkip: false,
        executor: {
          kind: "ai_generate",
          prompt: "Analyze the requirement.",
          artifact: {
            relativePath: "analysis/analysis.md",
            kind: "analysis",
          },
          legacyStageId: "analysis",
        },
      },
    ],
    edges: [],
  });
  const getWorkflowNodeExecution = vi.fn().mockResolvedValue({
    execution: {
      id: "requirement-1:execution:1",
      requirementId: "requirement-1",
      status: "created",
      currentNodeId: "requirement-1:analysis",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    },
    nodeRun: {
      id: "node-run-1",
      executionId: "requirement-1:execution:1",
      nodeId: "requirement-1:analysis",
      ...(input.aiRunId ? { aiRunId: input.aiRunId } : {}),
      status: "ready",
      attempt: 1,
      revision: 2,
      createdAt: 1,
      updatedAt: 1,
    },
  });
  window.realmflow = {
    business: {
      getRequirementWorkflow,
      getWorkflowNodeExecution,
      startWorkflowNode: input.startWorkflowNode ?? vi.fn(),
      listNodeTodos: vi.fn().mockResolvedValue(
        input.todos ?? [
          {
            id: "todo-1",
            nodeRunId: "node-run-1",
            title: "Confirm acceptance criteria",
            required: true,
            status: "pending",
            revision: 3,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      ),
      saveNodeTodo: input.saveNodeTodo,
      listNodeQuestions: vi.fn().mockResolvedValue(
        input.questions ?? [
          {
            id: "question-1",
            nodeRunId: "node-run-1",
            prompt: "Which rollout strategy should be used?",
            required: true,
            status: "open",
            revision: 5,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      ),
      openNodeQuestion: input.openNodeQuestion ?? vi.fn(),
      answerNodeQuestion: input.answerNodeQuestion,
      dismissNodeQuestion: input.dismissNodeQuestion ?? vi.fn(),
    },
  } as unknown as typeof window.realmflow;
  return { getRequirementWorkflow, getWorkflowNodeExecution };
}

function installWorkflowEditingApi(input: {
  workflow?: RequirementWorkflow;
  updateWorkflowNode?: ReturnType<typeof vi.fn>;
  updateWorkflowEdge?: ReturnType<typeof vi.fn>;
  reorderWorkflowNodes?: ReturnType<typeof vi.fn>;
}) {
  window.realmflow = {
    business: {
      getRequirementWorkflow: vi.fn().mockResolvedValue(
        input.workflow ?? {
          requirementId: "requirement-1",
          templateVersionId: "builtin-sdlc-v1",
          revision: 3,
          maxParallelism: 1,
          nodes: [
            {
              id: "requirement-1:analysis",
              type: "ai_generate",
              name: "需求分析",
              description: "",
              order: 0,
              status: "ready",
              allowSkip: false,
            },
          ],
          edges: [],
        },
      ),
      getWorkflowNodeExecution: vi.fn().mockResolvedValue(undefined),
      updateWorkflowNode: input.updateWorkflowNode ?? vi.fn(),
      updateWorkflowEdge: input.updateWorkflowEdge ?? vi.fn(),
      reorderWorkflowNodes: input.reorderWorkflowNodes ?? vi.fn(),
    },
  } as unknown as typeof window.realmflow;
}

function editableWorkflow(): RequirementWorkflow {
  return {
    requirementId: "requirement-1",
    templateVersionId: "builtin-sdlc-v1",
    revision: 3,
    maxParallelism: 1,
    nodes: [
      {
        id: "requirement-1:analysis",
        type: "ai_generate",
        name: "需求分析",
        description: "",
        order: 0,
        status: "ready",
        allowSkip: false,
      },
      {
        id: "requirement-1:design",
        type: "ai_generate",
        name: "技术方案",
        description: "",
        order: 1,
        status: "pending",
        allowSkip: false,
      },
      {
        id: "requirement-1:testing",
        type: "tool",
        name: "测试验证",
        description: "",
        order: 2,
        status: "pending",
        allowSkip: false,
      },
    ],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "requirement-1:analysis",
        targetNodeId: "requirement-1:design",
      },
    ],
  };
}

function renderPage(aiRuns: AiRunController): void {
  render(
    <MemoryRouter
      initialEntries={["/spaces/space-1/requirements/requirement-1"]}
    >
      <Routes>
        <Route
          path="/spaces/:spaceId/requirements/:requirementId"
          element={
            <RequirementDetailPage
              spaces={[
                {
                  path: "/spaces/space-1",
                  label: "Store",
                  description: "Store workspace",
                },
              ]}
              requirementsBySpace={{
                "/spaces/space-1": [{ id: "requirement-1", title: "Checkout" }],
              }}
              aiRuns={aiRuns}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function storageWithLocale(locale: "en" | "ja"): Storage {
  return {
    getItem: vi.fn(() => JSON.stringify({ version: 1, locale })),
    setItem: vi.fn(),
  } as unknown as Storage;
}
