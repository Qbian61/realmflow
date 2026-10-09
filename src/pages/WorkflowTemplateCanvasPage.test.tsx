import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BusinessApi,
  WorkflowTemplateDraftDto,
} from "../../shared/business";
import { ToastProvider } from "../features/toast/ToastProvider";
import { UnsavedChangesProvider } from "../features/unsaved-changes/UnsavedChangesProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import WorkflowTemplateCanvasPage from "./WorkflowTemplateCanvasPage";

describe("WorkflowTemplateCanvasPage", () => {
  afterEach(() => {
    delete window.realmflow;
    vi.restoreAllMocks();
  });

  it("loads the draft and renders an empty canvas entry", async () => {
    const business = createBusiness(emptyTemplate());
    window.realmflow = { business } as typeof window.realmflow;

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Delivery" }),
    ).toBeVisible();
    expect(screen.getByText("版本 1")).toBeVisible();
    expect(screen.getByRole("button", { name: "添加节点" })).toBeVisible();
    expect(business.getWorkflowTemplateDraft).toHaveBeenCalledWith({
      templateId: "template-1",
    });
    const publish = screen.getByRole("button", { name: "发布" });
    expect(publish.closest(".workflow-canvas-page-header")).toBeNull();
    expect(publish.closest(".workflow-node-inspector-actions")).not.toBeNull();
  });

  it("composes the canvas from shared workspace primitives", async () => {
    const template = templateWithGraph();
    window.realmflow = {
      business: createBusiness(template),
    } as typeof window.realmflow;

    const { container } = renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));

    expect(container.querySelector(".workflow-canvas-page")).not.toBeNull();
    expect(container.querySelector(".workflow-canvas-page.ui-page")).toBeNull();
    expect(
      container.querySelector(
        ".workflow-canvas-shell.ui-page__body--workspace",
      ),
    ).not.toBeNull();
    expect(screen.getByRole("toolbar", { name: "画板工具" })).toHaveClass(
      "ui-toolbar",
    );
    expect(
      screen.getByLabelText("节点名称").closest(".ui-field"),
    ).not.toBeNull();
  });

  it("renders service and load failures", async () => {
    const unavailable = renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "流程模板服务当前不可用",
    );
    unavailable.unmount();

    const business = createBusiness(emptyTemplate());
    vi.mocked(business.getWorkflowTemplateDraft).mockRejectedValue(
      new Error("database unavailable"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "database unavailable",
    );
  });

  it("shows published templates in read-only mode", async () => {
    const template = emptyTemplate();
    template.status = "published";
    template.currentVersion.status = "published";
    window.realmflow = {
      business: createBusiness(template),
    } as typeof window.realmflow;

    renderPage();

    expect(await screen.findByText("只读")).toHaveClass("ui-badge");
    expect(screen.queryByRole("button", { name: "添加节点" })).toBeNull();
  });

  it("renders nodes and accessible canvas navigation controls", async () => {
    const template = emptyTemplate();
    template.currentVersion.nodes = [
      {
        id: "analysis",
        stableKey: "analysis",
        type: "ai_generate",
        name: "需求分析",
        description: "",
        order: 0,
        allowSkip: false,
        position: { x: 0, y: 0 },
      },
    ];
    template.currentVersion.nodeCount = 1;
    window.realmflow = {
      business: createBusiness(template),
    } as typeof window.realmflow;

    renderPage();

    expect(
      await screen.findByLabelText("需求分析，AI 生成"),
    ).toBeInTheDocument();
    expect(screen.queryByText("React Flow")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "放大" })).toBeVisible();
    expect(screen.getByRole("button", { name: "缩小" })).toBeVisible();
    expect(screen.getByRole("button", { name: "适应画布" })).toBeVisible();
    expect(screen.getByRole("button", { name: "添加节点" })).toBeVisible();
  });

  it("adds a typed node to the right of the selected node", async () => {
    const template = templateWithGraph();
    const saved = structuredClone(template);
    saved.revision = 2;
    saved.currentVersion.nodes.push({
      id: "template-1-v1-node",
      stableKey: "node",
      type: "ai_generate",
      name: "AI 生成",
      description: "",
      order: 3,
      allowSkip: false,
      position: { x: 344, y: 80 },
    });
    saved.currentVersion.nodeCount = 4;
    const business = createBusiness(template);
    vi.mocked(business.addWorkflowTemplateNode).mockResolvedValue(saved);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.click(screen.getByRole("button", { name: "添加节点" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "AI 生成" }));
    const createDialog = screen.getByRole("dialog", { name: "创建节点" });
    fireEvent.change(within(createDialog).getByLabelText("节点名称"), {
      target: { value: "AI 生成" },
    });
    fireEvent.click(
      within(createDialog).getByRole("button", { name: "创建节点" }),
    );

    await waitFor(() =>
      expect(business.addWorkflowTemplateNode).toHaveBeenCalledWith({
        id: "template-1",
        expectedRevision: 1,
        node: expect.objectContaining({
          stableKey: "node",
          type: "ai_generate",
          position: { x: 344, y: 80 },
        }),
      }),
    );
    expect(await screen.findByLabelText("AI 生成，AI 生成")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("copies the selected node and persists a fixed position offset", async () => {
    const template = templateWithGraph();
    const copied = structuredClone(template);
    copied.revision = 2;
    copied.currentVersion.nodes.push({
      ...copied.currentVersion.nodes[0],
      id: "template-1-v1-analysis-copy",
      stableKey: "analysis-copy",
      name: "analysis 副本",
      order: 3,
    });
    copied.currentVersion.nodeCount = 4;
    const positioned = structuredClone(copied);
    positioned.revision = 3;
    positioned.currentVersion.nodes[3].position = { x: 72, y: 112 };
    const business = createBusiness(template);
    vi.mocked(business.copyWorkflowTemplateNode).mockResolvedValue(copied);
    vi.mocked(business.updateWorkflowTemplateNodePositions).mockResolvedValue(
      positioned,
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.click(screen.getByRole("button", { name: "复制节点" }));

    await waitFor(() =>
      expect(business.updateWorkflowTemplateNodePositions).toHaveBeenCalledWith(
        {
          id: "template-1",
          expectedRevision: 2,
          positions: [
            {
              nodeId: "template-1-v1-analysis-copy",
              position: { x: 72, y: 112 },
            },
          ],
        },
      ),
    );
  });

  it("shows edge impact before deleting the selected node", async () => {
    const template = templateWithGraph();
    const saved = structuredClone(template);
    saved.revision = 2;
    saved.currentVersion.nodes = saved.currentVersion.nodes.filter(
      ({ id }) => id !== "review",
    );
    saved.currentVersion.edges = [];
    saved.currentVersion.nodeCount = 2;
    saved.currentVersion.edgeCount = 0;
    const business = createBusiness(template);
    vi.mocked(business.removeWorkflowTemplateNode).mockResolvedValue(saved);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("review，AI 生成"));
    fireEvent.click(screen.getByRole("button", { name: "删除节点" }));

    const dialog = screen.getByRole("dialog", { name: "删除节点" });
    expect(dialog).toHaveTextContent(
      "删除“review”将同时删除 1 条入边和 1 条出边。确认删除？",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(business.removeWorkflowTemplateNode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "删除节点" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "删除节点" })).getByRole(
        "button",
        { name: "删除" },
      ),
    );
    await waitFor(() =>
      expect(business.removeWorkflowTemplateNode).toHaveBeenCalledWith({
        id: "template-1",
        expectedRevision: 1,
        nodeId: "review",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("review，AI 生成")).toBeNull(),
    );
  });

  it("undoes deleting a node with one atomic restore command", async () => {
    const template = templateWithGraph();
    const deleted = structuredClone(template);
    deleted.revision = 2;
    deleted.currentVersion.nodes = deleted.currentVersion.nodes.filter(
      ({ id }) => id !== "review",
    );
    deleted.currentVersion.edges = [];
    deleted.currentVersion.nodeCount = 2;
    deleted.currentVersion.edgeCount = 0;
    const restored = structuredClone(template);
    restored.revision = 3;
    const business = createBusiness(template);
    vi.mocked(business.removeWorkflowTemplateNode).mockResolvedValue(deleted);
    vi.mocked(business.restoreWorkflowTemplateNode).mockResolvedValue(restored);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("review，AI 生成"));
    fireEvent.click(screen.getByRole("button", { name: "删除节点" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "删除节点" })).getByRole(
        "button",
        { name: "删除" },
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() =>
      expect(business.restoreWorkflowTemplateNode).toHaveBeenCalledWith({
        id: "template-1",
        expectedRevision: 2,
        node: template.currentVersion.nodes[1],
        edges: template.currentVersion.edges,
      }),
    );
  });

  it("confirms deletion of the selected edge", async () => {
    const template = templateWithGraph();
    const saved = structuredClone(template);
    saved.revision = 2;
    saved.currentVersion.edges = saved.currentVersion.edges.filter(
      ({ id }) => id !== "analysis-review",
    );
    saved.currentVersion.edgeCount = 1;
    const business = createBusiness(template);
    vi.mocked(business.removeWorkflowTemplateEdge).mockResolvedValue(saved);
    vi.mocked(business.publishWorkflowTemplate).mockResolvedValue({
      outcome: "invalid",
      validation: {
        valid: false,
        issues: [
          {
            code: "invalid_edge_reference",
            scope: "edge",
            message: "Review this edge",
            edgeId: "analysis-review",
          },
        ],
      },
    });
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "发布" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Review this edge" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除节点" }));

    const dialog = screen.getByRole("dialog", { name: "删除连线" });
    expect(dialog).toHaveTextContent(
      "确认删除“analysis”到“review”的连线？",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(business.removeWorkflowTemplateEdge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "删除节点" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "删除连线" })).getByRole(
        "button",
        { name: "删除" },
      ),
    );

    await waitFor(() =>
      expect(business.removeWorkflowTemplateEdge).toHaveBeenCalledWith({
        id: "template-1",
        expectedRevision: 1,
        edgeId: "analysis-review",
      }),
    );
  });

  it("persists deterministic auto-layout without changing node order", async () => {
    const template = templateWithGraph();
    const saved = structuredClone(template);
    saved.revision = 2;
    const business = createBusiness(template);
    vi.mocked(business.updateWorkflowTemplateNodePositions).mockResolvedValue(
      saved,
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "自动布局" }));

    await waitFor(() =>
      expect(
        business.updateWorkflowTemplateNodePositions,
      ).toHaveBeenCalledTimes(1),
    );
    expect(
      vi.mocked(business.updateWorkflowTemplateNodePositions).mock.calls[0][0]
        .positions,
    ).toHaveLength(3);
    expect(business.reorderWorkflowTemplateNodes).not.toHaveBeenCalled();
  });

  it("rolls back optimistic layout and toasts a safe persistence failure", async () => {
    const template = templateWithGraph();
    const business = createBusiness(template);
    vi.mocked(business.updateWorkflowTemplateNodePositions).mockRejectedValue(
      new Error("/private/workflow.db unavailable"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    await screen.findByLabelText("analysis，AI 生成");
    fireEvent.click(screen.getByRole("button", { name: "自动布局" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("画板保存失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("/private/workflow.db");
    expect(screen.getByTestId("rf__node-analysis")).toHaveStyle({
      transform: "translate(40px,80px)",
    });
  });

  it("undoes auto-layout through a second Main position command", async () => {
    const template = templateWithGraph();
    const business = createBusiness(template);
    let latest = structuredClone(template);
    vi.mocked(business.updateWorkflowTemplateNodePositions).mockImplementation(
      async (command) => {
        latest = structuredClone(latest);
        latest.revision += 1;
        const positions = new Map(
          command.positions.map(({ nodeId, position }) => [nodeId, position]),
        );
        latest.currentVersion.nodes = latest.currentVersion.nodes.map(
          (node) => ({
            ...node,
            position: positions.get(node.id) ?? node.position,
          }),
        );
        return structuredClone(latest);
      },
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "自动布局" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() =>
      expect(
        business.updateWorkflowTemplateNodePositions,
      ).toHaveBeenCalledTimes(2),
    );
    expect(
      vi.mocked(business.updateWorkflowTemplateNodePositions).mock.calls[1][0],
    ).toEqual({
      id: "template-1",
      expectedRevision: 2,
      positions: [
        { nodeId: "analysis", position: { x: 40, y: 80 } },
        { nodeId: "review", position: { x: 360, y: 80 } },
        { nodeId: "release", position: { x: 680, y: 80 } },
      ],
    });
  });

  it("undoes and redoes adding a node through inverse Main commands", async () => {
    const template = templateWithGraph();
    const added = structuredClone(template);
    added.revision = 2;
    added.currentVersion.nodes.push({
      id: "template-1-v1-node",
      stableKey: "node",
      type: "ai_generate",
      name: "AI 生成",
      description: "",
      order: 3,
      allowSkip: false,
      position: { x: 344, y: 80 },
    });
    added.currentVersion.nodeCount = 4;
    const removed = structuredClone(template);
    removed.revision = 3;
    const readded = structuredClone(added);
    readded.revision = 4;
    const business = createBusiness(template);
    vi.mocked(business.addWorkflowTemplateNode)
      .mockResolvedValueOnce(added)
      .mockResolvedValueOnce(readded);
    vi.mocked(business.removeWorkflowTemplateNode).mockResolvedValue(removed);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "添加节点" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "AI 生成" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "创建节点" })).getByRole(
        "button",
        { name: "创建节点" },
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() =>
      expect(business.removeWorkflowTemplateNode).toHaveBeenCalledWith({
        id: "template-1",
        expectedRevision: 2,
        nodeId: "template-1-v1-node",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    await waitFor(() =>
      expect(business.addWorkflowTemplateNode).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: "template-1",
          expectedRevision: 3,
          node: expect.objectContaining({ stableKey: "node" }),
        }),
      ),
    );
  });

  it("undoes copying a node through a remove command", async () => {
    const template = templateWithGraph();
    const copied = structuredClone(template);
    copied.revision = 2;
    copied.currentVersion.nodes.push({
      ...copied.currentVersion.nodes[0],
      id: "template-1-v1-analysis-copy",
      stableKey: "analysis-copy",
      name: "analysis 副本",
      order: 3,
    });
    copied.currentVersion.nodeCount = 4;
    const positioned = structuredClone(copied);
    positioned.revision = 3;
    positioned.currentVersion.nodes[3].position = { x: 72, y: 112 };
    const removed = structuredClone(template);
    removed.revision = 4;
    const business = createBusiness(template);
    vi.mocked(business.copyWorkflowTemplateNode).mockResolvedValue(copied);
    vi.mocked(business.updateWorkflowTemplateNodePositions).mockResolvedValue(
      positioned,
    );
    vi.mocked(business.removeWorkflowTemplateNode).mockResolvedValue(removed);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.click(screen.getByRole("button", { name: "复制节点" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() =>
      expect(business.removeWorkflowTemplateNode).toHaveBeenCalledWith({
        id: "template-1",
        expectedRevision: 3,
        nodeId: "template-1-v1-analysis-copy",
      }),
    );
  });

  it("undoes adding an edge through a remove command", async () => {
    const template = templateWithGraph();
    template.currentVersion.edges = [];
    template.currentVersion.edgeCount = 0;
    const added = structuredClone(template);
    added.revision = 2;
    added.currentVersion.edges = [
      {
        id: "analysis-review",
        sourceNodeId: "analysis",
        targetNodeId: "review",
      },
    ];
    added.currentVersion.edgeCount = 1;
    const removed = structuredClone(template);
    removed.revision = 3;
    const business = createBusiness(template);
    vi.mocked(business.addWorkflowTemplateEdge).mockResolvedValue(added);
    vi.mocked(business.removeWorkflowTemplateEdge).mockResolvedValue(removed);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.click(screen.getByRole("button", { name: "添加连线" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "连接到 review" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() =>
      expect(business.removeWorkflowTemplateEdge).toHaveBeenCalledWith({
        id: "template-1",
        expectedRevision: 2,
        edgeId: "analysis-review",
      }),
    );
  });

  it("creates an edge from the keyboard-accessible target menu", async () => {
    const template = templateWithGraph();
    template.currentVersion.edges = [];
    template.currentVersion.edgeCount = 0;
    const saved = structuredClone(template);
    saved.revision = 2;
    saved.currentVersion.edges = [
      {
        id: "analysis-review",
        sourceNodeId: "analysis",
        targetNodeId: "review",
      },
    ];
    saved.currentVersion.edgeCount = 1;
    const business = createBusiness(template);
    vi.mocked(business.addWorkflowTemplateEdge).mockResolvedValue(saved);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.click(screen.getByRole("button", { name: "添加连线" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "连接到 review" }));

    await waitFor(() =>
      expect(business.addWorkflowTemplateEdge).toHaveBeenCalledWith({
        id: "template-1",
        expectedRevision: 1,
        sourceNodeId: "analysis",
        targetNodeId: "review",
      }),
    );
  });

  it("keeps the graph unchanged and toasts a rejected connection", async () => {
    const template = templateWithGraph();
    const business = createBusiness(template);
    vi.mocked(business.addWorkflowTemplateEdge).mockRejectedValue(
      new Error("internal edge validation details"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("release，AI 生成"));
    fireEvent.click(screen.getByRole("button", { name: "添加连线" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "连接到 analysis" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("画板保存失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("internal edge validation details");
    expect(template.currentVersion.edges).toHaveLength(2);
  });

  it("opens a node inspector and saves the initial prompt", async () => {
    const template = templateWithGraph();
    template.currentVersion.nodes[0].configuration = nodeConfiguration(
      "Analyze the requirement",
    );
    const saved = structuredClone(template);
    saved.revision = 2;
    saved.currentVersion.nodes[0].configuration = nodeConfiguration(
      "Produce a concise analysis",
    );
    const business = createBusiness(template);
    vi.mocked(business.configureWorkflowTemplateNode).mockResolvedValue(saved);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    const prompt = screen.getByLabelText("初始提示词");
    expect(prompt).toHaveValue("Analyze the requirement");
    fireEvent.change(prompt, {
      target: { value: "Produce a concise analysis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));

    await waitFor(() =>
      expect(business.configureWorkflowTemplateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "template-1",
          expectedRevision: 1,
          nodeId: "analysis",
          configuration: expect.objectContaining({
            prompt: "Produce a concise analysis",
          }),
        }),
      ),
    );
  });

  it("saves node information and configuration from one bottom action", async () => {
    const template = templateWithGraph();
    template.currentVersion.nodes[0].configuration =
      nodeConfiguration("Original prompt");
    const updated = structuredClone(template);
    updated.revision = 2;
    updated.currentVersion.nodes[0].name = "Renamed analysis";
    const configured = structuredClone(updated);
    configured.revision = 3;
    configured.currentVersion.nodes[0].configuration =
      nodeConfiguration("Updated prompt");
    const business = createBusiness(template);
    vi.mocked(business.updateWorkflowTemplateNode).mockResolvedValue(updated);
    vi.mocked(business.configureWorkflowTemplateNode).mockResolvedValue(
      configured,
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.change(screen.getByLabelText("节点名称"), {
      target: { value: "Renamed analysis" },
    });
    fireEvent.change(screen.getByLabelText("初始提示词"), {
      target: { value: "Updated prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));

    await waitFor(() =>
      expect(business.updateWorkflowTemplateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedRevision: 1,
          nodeId: "analysis",
          name: "Renamed analysis",
        }),
      ),
    );
    await waitFor(() =>
      expect(business.configureWorkflowTemplateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedRevision: 2,
          nodeId: "analysis",
          configuration: expect.objectContaining({
            prompt: "Updated prompt",
          }),
        }),
      ),
    );
  });

  it("edits template metadata from the empty inspector", async () => {
    const template = templateWithGraph();
    const saved = structuredClone(template);
    saved.name = "Release workflow";
    saved.description = "Coordinates the release";
    saved.revision = 2;
    const business = createBusiness(template);
    vi.mocked(business.updateWorkflowTemplate).mockResolvedValue(saved);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    const name = await screen.findByLabelText("模板名称");
    fireEvent.change(name, { target: { value: "Release workflow" } });
    fireEvent.change(screen.getByLabelText("模板描述"), {
      target: { value: "Coordinates the release" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));

    await waitFor(() =>
      expect(business.updateWorkflowTemplate).toHaveBeenCalledWith({
        id: "template-1",
        expectedRevision: 1,
        name: "Release workflow",
        description: "Coordinates the release",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Release workflow" }),
    ).toBeVisible();
  });

  it("keeps the current node selected when unsaved changes are kept", async () => {
    const template = templateWithGraph();
    template.currentVersion.nodes[0].configuration =
      nodeConfiguration("Original prompt");
    const business = createBusiness(template);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.change(screen.getByLabelText("初始提示词"), {
      target: { value: "Unsaved prompt" },
    });
    fireEvent.click(screen.getByLabelText("review，AI 生成"));

    expect(screen.getByRole("dialog", { name: "未保存的更改" })).toHaveClass(
      "ui-dialog",
      "ui-dialog--compact",
    );
    fireEvent.click(screen.getByRole("button", { name: "留在当前页" }));

    expect(screen.getByLabelText("analysis，AI 生成")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("初始提示词")).toHaveValue("Unsaved prompt");
  });

  it("orders the protected inspector actions across the bottom bar", async () => {
    const template = templateWithGraph();
    template.currentVersion.nodes[0].configuration =
      nodeConfiguration("Original prompt");
    const business = createBusiness(template);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    const close = screen.getByRole("button", {
      name: "关闭",
    });
    const actions = close.closest(".workflow-node-inspector-actions");
    expect(actions).not.toBeNull();
    expect(
      Array.from(actions?.querySelectorAll("button") ?? []).map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["保存更改", "发布", "关闭"]);
    expect(screen.getByRole("button", { name: "保存更改" }).parentElement).toBe(
      actions,
    );
    expect(close.parentElement).toHaveClass(
      "workflow-node-inspector-end-actions",
    );
    expect(screen.getByRole("button", { name: "发布" }).parentElement).toBe(
      close.parentElement,
    );
    expect(screen.queryByRole("button", { name: "取消" })).toBeNull();
    fireEvent.change(screen.getByLabelText("初始提示词"), {
      target: { value: "Protected prompt" },
    });
    fireEvent.click(close);

    expect(screen.getByRole("dialog", { name: "未保存的更改" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "留在当前页" }));
    expect(screen.getByLabelText("初始提示词")).toHaveValue("Protected prompt");
  });

  it("saves unsaved node changes before switching nodes", async () => {
    const template = templateWithGraph();
    template.currentVersion.nodes[0].configuration =
      nodeConfiguration("Original prompt");
    const saved = structuredClone(template);
    saved.revision = 2;
    saved.currentVersion.nodes[0].configuration =
      nodeConfiguration("Saved prompt");
    const business = createBusiness(template);
    vi.mocked(business.configureWorkflowTemplateNode).mockResolvedValue(saved);
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.change(screen.getByLabelText("初始提示词"), {
      target: { value: "Saved prompt" },
    });
    fireEvent.click(screen.getByLabelText("review，AI 生成"));
    fireEvent.click(screen.getByRole("button", { name: "保存并继续" }));

    await waitFor(() =>
      expect(business.configureWorkflowTemplateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "template-1",
          expectedRevision: 1,
          nodeId: "analysis",
          configuration: expect.objectContaining({ prompt: "Saved prompt" }),
        }),
      ),
    );
    expect(screen.getByLabelText("review，AI 生成")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("discards unsaved changes before leaving the canvas", async () => {
    const template = templateWithGraph();
    template.currentVersion.nodes[0].configuration =
      nodeConfiguration("Original prompt");
    const business = createBusiness(template);
    window.realmflow = { business } as typeof window.realmflow;
    window.location.hash = "/templates/template-1/edit";
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.change(screen.getByLabelText("初始提示词"), {
      target: { value: "Unsaved prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "返回流程模板" }));

    expect(screen.getByRole("dialog", { name: "未保存的更改" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "放弃更改" }));

    expect(window.location.hash).toBe("#/workflows");
    expect(business.configureWorkflowTemplateNode).not.toHaveBeenCalled();
  });

  it("keeps an unsaved initial prompt visible after a safe save toast", async () => {
    const template = templateWithGraph();
    template.currentVersion.nodes[0].configuration = nodeConfiguration("");
    const business = createBusiness(template);
    vi.mocked(business.configureWorkflowTemplateNode).mockRejectedValue(
      new Error("/private/workflow.db revision conflict"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    const prompt = screen.getByLabelText("初始提示词");
    fireEvent.change(prompt, { target: { value: "Keep this prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));

    const toastText = await screen.findByText("画板保存失败", {
      selector: ".toast-message__text",
    });
    const toastMessage = toastText.closest(".toast-message");
    expect(toastMessage).not.toBeNull();
    expect(toastMessage).not.toHaveTextContent("/private/workflow.db");
    expect(screen.getByRole("button", { name: "加载最新草稿" })).toBeVisible();
    expect(prompt).toHaveValue("Keep this prompt");
  });

  it("toasts a safe publish command failure and keeps the draft editable", async () => {
    const template = templateWithGraph();
    const business = createBusiness(template);
    vi.mocked(business.publishWorkflowTemplate).mockRejectedValueOnce(
      new Error("token=secret publish failed"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "发布" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("模板发布失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("token=secret");
    expect(screen.getByRole("button", { name: "添加节点" })).toBeVisible();
  });

  it("toasts a safe undo failure", async () => {
    const template = templateWithGraph();
    const added = structuredClone(template);
    added.revision = 2;
    added.currentVersion.nodes.push({
      id: "template-1-v1-node",
      stableKey: "node",
      type: "ai_generate",
      name: "AI 生成",
      description: "",
      order: 3,
      allowSkip: false,
      position: { x: 344, y: 80 },
    });
    added.currentVersion.nodeCount = 4;
    const business = createBusiness(template);
    vi.mocked(business.addWorkflowTemplateNode).mockResolvedValueOnce(added);
    vi.mocked(business.removeWorkflowTemplateNode).mockRejectedValueOnce(
      new Error("/private/undo.log"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "添加节点" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "AI 生成" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "创建节点" })).getByRole(
        "button",
        { name: "创建节点" },
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("画板保存失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("/private/undo.log");
  });

  it("toasts a safe redo failure", async () => {
    const template = templateWithGraph();
    const added = structuredClone(template);
    added.revision = 2;
    added.currentVersion.nodes.push({
      id: "template-1-v1-node",
      stableKey: "node",
      type: "ai_generate",
      name: "AI 生成",
      description: "",
      order: 3,
      allowSkip: false,
      position: { x: 344, y: 80 },
    });
    added.currentVersion.nodeCount = 4;
    const removed = structuredClone(template);
    removed.revision = 3;
    const business = createBusiness(template);
    vi.mocked(business.addWorkflowTemplateNode)
      .mockResolvedValueOnce(added)
      .mockRejectedValueOnce(new Error("redo stack trace"));
    vi.mocked(business.removeWorkflowTemplateNode).mockResolvedValueOnce(
      removed,
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "添加节点" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "AI 生成" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "创建节点" })).getByRole(
        "button",
        { name: "创建节点" },
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "重做" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "重做" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("画板保存失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("redo stack trace");
  });

  it("reloads the latest draft after a revision conflict and preserves recovery text", async () => {
    const template = templateWithGraph();
    template.currentVersion.nodes[0].configuration = nodeConfiguration("");
    const latest = structuredClone(template);
    latest.revision = 2;
    latest.currentVersion.nodes[0].configuration =
      nodeConfiguration("Server prompt");
    const business = createBusiness(template);
    vi.mocked(business.getWorkflowTemplateDraft)
      .mockResolvedValueOnce(template)
      .mockResolvedValueOnce(latest);
    vi.mocked(business.configureWorkflowTemplateNode).mockRejectedValue(
      new Error("Workflow template revision conflict"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    fireEvent.change(screen.getByLabelText("初始提示词"), {
      target: { value: "Keep this prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));
    const reload = await screen.findByRole("button", { name: "加载最新草稿" });
    expect(reload.closest(".ui-inline-alert")).not.toBeNull();
    fireEvent.click(reload);

    await waitFor(() =>
      expect(business.getWorkflowTemplateDraft).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByLabelText("初始提示词")).toHaveValue("Keep this prompt");
    expect(
      (screen.getByLabelText("冲突恢复内容") as HTMLTextAreaElement).value,
    ).toContain("Keep this prompt");
  });

  it("focuses the node selected from publication issues", async () => {
    const template = templateWithGraph();
    const business = createBusiness(template);
    vi.mocked(business.publishWorkflowTemplate).mockResolvedValue({
      outcome: "invalid",
      validation: {
        valid: false,
        issues: [
          {
            code: "missing_node_configuration",
            scope: "node",
            message: "Node configuration is required",
            nodeId: "review",
          },
        ],
      },
    });
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "发布" }));
    const issue = await screen.findByRole("button", {
      name: "Node configuration is required",
    });
    expect(issue.closest(".ui-inline-alert")).not.toBeNull();
    fireEvent.click(issue);

    expect(screen.getByLabelText("review，AI 生成，发布问题")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("初始提示词")).toBeVisible();
  });

  it("switches to read-only after a successful publish", async () => {
    const template = templateWithGraph();
    const business = createBusiness(template);
    vi.mocked(business.publishWorkflowTemplate).mockResolvedValue({
      ...template,
      status: "published",
      revision: 2,
      currentVersion: {
        ...template.currentVersion,
        status: "published",
      },
    });
    window.realmflow = { business } as typeof window.realmflow;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "发布" }));

    expect(await screen.findByText("只读")).toBeVisible();
    expect(screen.queryByRole("button", { name: "添加节点" })).toBeNull();
  });

  it("loads a historical version through the full version query", async () => {
    const template = templateWithGraph();
    template.status = "published";
    template.currentVersion.status = "published";
    const business = createBusiness(template);
    window.realmflow = { business } as typeof window.realmflow;

    renderPage("/templates/template-1/versions/template-1-v1");

    expect(await screen.findByText("只读")).toBeVisible();
    expect(business.getWorkflowTemplateVersion).toHaveBeenCalledWith({
      templateId: "template-1",
      versionId: "template-1-v1",
    });
    expect(business.getWorkflowTemplateDraft).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByLabelText("analysis，AI 生成"));
    expect(screen.getByLabelText("初始提示词")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "需要审批" })).toBeDisabled();
  });

  it("copies or derives a draft from the historical version being previewed", async () => {
    const template = templateWithGraph();
    template.status = "published";
    template.currentVersion.status = "published";
    const copied = {
      ...template,
      id: "template-copy",
      status: "draft" as const,
    };
    const derived = { ...template, status: "draft" as const, revision: 2 };
    const business = createBusiness(template);
    vi.mocked(business.copyWorkflowTemplate).mockResolvedValue(copied);
    vi.mocked(business.createWorkflowTemplateVersion).mockResolvedValue(
      derived,
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage("/templates/template-1/versions/template-1-v1");

    const copyVersion = await screen.findByRole("button", {
      name: "复制此版本为新模板",
    });
    expect(
      copyVersion.closest(".workflow-canvas-detached-actions"),
    ).not.toBeNull();
    fireEvent.click(copyVersion);
    await waitFor(() =>
      expect(business.copyWorkflowTemplate).toHaveBeenCalledWith({
        id: expect.any(String),
        sourceTemplateId: "template-1",
        sourceVersionId: "template-1-v1",
        name: "Delivery 副本",
        description: "",
      }),
    );

    window.location.hash = "";
    fireEvent.click(screen.getByRole("button", { name: "从此版本创建新版本" }));
    await waitFor(() =>
      expect(business.createWorkflowTemplateVersion).toHaveBeenCalledWith({
        id: "template-1",
        sourceVersionId: "template-1-v1",
        expectedRevision: 1,
      }),
    );
    expect(window.location.hash).toBe("#/templates/template-1/edit");
  });

  it("reports historical version command failures as a safe Toast", async () => {
    const template = templateWithGraph();
    template.status = "published";
    template.currentVersion.status = "published";
    const business = createBusiness(template);
    vi.mocked(business.copyWorkflowTemplate).mockRejectedValue(
      new Error("/private/template.db"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    renderPage("/templates/template-1/versions/template-1-v1");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "复制此版本为新模板",
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("toast-message");
    expect(alert).toHaveTextContent("新版本创建失败");
    expect(alert).not.toHaveTextContent("/private/template.db");
    expect(document.querySelector(".workflow-canvas-error")).toBeNull();
  });

  it("renders and selects nodes in a 100-node 150-edge canvas", async () => {
    const template = emptyTemplate();
    template.currentVersion.nodes = Array.from({ length: 100 }, (_, index) =>
      canvasNode(`node-${index}`, index, {
        x: (index % 10) * 320,
        y: Math.floor(index / 10) * 180,
      }),
    );
    template.currentVersion.edges = [
      ...Array.from({ length: 99 }, (_, index) => ({
        id: `edge-${index}-${index + 1}`,
        sourceNodeId: `node-${index}`,
        targetNodeId: `node-${index + 1}`,
      })),
      ...Array.from({ length: 51 }, (_, index) => ({
        id: `edge-${index}-${index + 2}`,
        sourceNodeId: `node-${index}`,
        targetNodeId: `node-${index + 2}`,
      })),
    ];
    template.currentVersion.nodeCount = 100;
    template.currentVersion.edgeCount = 150;
    window.realmflow = {
      business: createBusiness(template),
    } as typeof window.realmflow;

    renderPage();

    const lastNode = await screen.findByLabelText("node-99，AI 生成");
    expect(screen.getAllByTestId(/^rf__node-/)).toHaveLength(100);
    fireEvent.click(lastNode);
    expect(lastNode).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("节点名称")).toHaveValue("node-99");
  }, 10_000);
});

function renderPage(
  path = "/templates/template-1/edit",
): ReturnType<typeof render> {
  const router = createMemoryRouter(
    [
      {
        path: "/templates/:templateId/edit",
        element: (
          <UnsavedChangesProvider>
            <WorkflowTemplateCanvasPage />
          </UnsavedChangesProvider>
        ),
      },
      {
        path: "/templates/:templateId/versions/:versionId",
        element: (
          <UnsavedChangesProvider>
            <WorkflowTemplateCanvasPage />
          </UnsavedChangesProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  return render(
    <LocalizationProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </LocalizationProvider>,
  );
}

function createBusiness(template: WorkflowTemplateDraftDto): BusinessApi {
  return {
    getWorkflowTemplateDraft: vi.fn().mockResolvedValue(template),
    getWorkflowTemplateVersion: vi.fn().mockResolvedValue(template),
    copyWorkflowTemplate: vi.fn(),
    createWorkflowTemplateVersion: vi.fn(),
    addWorkflowTemplateNode: vi.fn(),
    copyWorkflowTemplateNode: vi.fn(),
    removeWorkflowTemplateNode: vi.fn(),
    restoreWorkflowTemplateNode: vi.fn(),
    reorderWorkflowTemplateNodes: vi.fn(),
    updateWorkflowTemplateNodePositions: vi.fn(),
    addWorkflowTemplateEdge: vi.fn(),
    removeWorkflowTemplateEdge: vi.fn(),
    configureWorkflowTemplateNode: vi.fn(),
    updateWorkflowTemplate: vi.fn(),
    updateWorkflowTemplateNode: vi.fn(),
    publishWorkflowTemplate: vi.fn(),
    listSkills: vi.fn().mockResolvedValue([]),
    listModels: vi.fn().mockResolvedValue({ providers: [], profiles: [] }),
    listConnectors: vi.fn().mockResolvedValue([]),
  } as unknown as BusinessApi;
}

function emptyTemplate(): WorkflowTemplateDraftDto {
  return {
    id: "template-1",
    name: "Delivery",
    description: "",
    status: "draft",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    currentVersion: {
      id: "template-1-v1",
      version: 1,
      status: "draft",
      checksum: "checksum",
      nodeCount: 0,
      edgeCount: 0,
      nodes: [],
      edges: [],
    },
  };
}

function templateWithGraph(): WorkflowTemplateDraftDto {
  const value = emptyTemplate();
  value.currentVersion.nodes = [
    canvasNode("analysis", 0, { x: 40, y: 80 }),
    canvasNode("review", 1, { x: 360, y: 80 }),
    canvasNode("release", 2, { x: 680, y: 80 }),
  ];
  value.currentVersion.edges = [
    {
      id: "analysis-review",
      sourceNodeId: "analysis",
      targetNodeId: "review",
    },
    {
      id: "review-release",
      sourceNodeId: "review",
      targetNodeId: "release",
    },
  ];
  value.currentVersion.nodeCount = 3;
  value.currentVersion.edgeCount = 2;
  return value;
}

function canvasNode(
  id: string,
  order: number,
  position: { x: number; y: number },
) {
  return {
    id,
    stableKey: id,
    type: "ai_generate" as const,
    name: id,
    description: "",
    order,
    allowSkip: false,
    position,
  };
}

function nodeConfiguration(prompt: string) {
  return {
    input: {
      includeRequirementBody: true,
      predecessorArtifacts: "direct" as const,
      includeSpaceKnowledge: false,
      attachments: [],
    },
    prompt,
    model: { strategy: "inherit" as const },
    connectorIds: [],
    permissions: [],
    artifact: {
      required: true,
      relativePath: "artifacts/analysis.md",
      kind: "markdown",
    },
    todos: [],
    completionGate: { requireApproval: false },
    retry: { maxAttempts: 1, backoffMs: 0 },
    skip: { allowed: false, requireReason: false },
  };
}
