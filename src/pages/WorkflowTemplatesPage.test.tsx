import {
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type {
  BusinessApi,
  SkillCatalogDto,
  WorkflowTemplateDraftDto,
  WorkflowTemplateLibraryItemDto,
} from "../../shared/business";
import { ToastProvider } from "../features/toast/ToastProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import WorkflowTemplatesPage from "./WorkflowTemplatesPage";

function render(
  ui: Parameters<typeof testingRender>[0],
  storage?: Storage,
  initialEntry = "/workflows",
): ReturnType<typeof testingRender> {
  return testingRender(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocalizationProvider storage={storage}>
        <ToastProvider>{ui}</ToastProvider>
      </LocalizationProvider>
    </MemoryRouter>,
  );
}

const draft: WorkflowTemplateLibraryItemDto = {
  id: "template-draft",
  name: "产品交付",
  description: "适用于产品迭代",
  status: "draft",
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
  currentVersion: {
    id: "template-draft-v1",
    version: 1,
    status: "draft",
    checksum: "draft",
    nodeCount: 3,
    edgeCount: 1,
  },
};

const published: WorkflowTemplateLibraryItemDto = {
  ...draft,
  id: "template-published",
  name: "软件交付",
  status: "published",
  revision: 2,
  currentVersion: {
    ...draft.currentVersion,
    id: "template-published-v1",
    status: "published",
    publishedAt: 2,
  },
};

const archived: WorkflowTemplateLibraryItemDto = {
  ...published,
  id: "template-archived",
  name: "历史交付",
  status: "archived",
  revision: 3,
  currentVersion: {
    ...published.currentVersion,
    id: "template-archived-v1",
    status: "archived",
  },
};

const draftDefinition: WorkflowTemplateDraftDto = {
  ...draft,
  currentVersion: {
    ...draft.currentVersion,
    nodes: [
      {
        id: "template-draft-v1-node-analysis",
        stableKey: "analysis",
        type: "ai_generate",
        name: "需求分析",
        description: "明确范围",
        order: 0,
        allowSkip: false,
      },
      {
        id: "template-draft-v1-node-design",
        stableKey: "design",
        type: "human_input",
        name: "方案设计",
        description: "",
        order: 1,
        allowSkip: false,
      },
      {
        id: "template-draft-v1-node-review",
        stableKey: "review",
        type: "approval",
        name: "交付验收",
        description: "",
        order: 2,
        allowSkip: false,
      },
    ],
    edges: [
      {
        id: "analysis-design",
        sourceNodeId: "template-draft-v1-node-analysis",
        targetNodeId: "template-draft-v1-node-design",
      },
    ],
  },
};

function createSkill(
  versionId: string,
  skillId: string,
  name: string,
): SkillCatalogDto {
  return {
    skill: {
      id: skillId,
      enabled: true,
      currentVersionId: versionId,
      revision: 1,
      createdAt: 10,
      updatedAt: 10,
    },
    versions: [
      {
        id: versionId,
        skillId,
        version: "1.0.0",
        name,
        description: `${name} Skill`,
        entry: { kind: "prompt", path: "prompt.md" },
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        permissions: [],
        network: { required: false, services: [] },
        resources: {
          timeoutMs: 120_000,
          maxMemoryMb: 256,
          maxOutputBytes: 1_048_576,
        },
        source: { type: "local_directory", displayName: name.toLowerCase() },
        checksum: "a".repeat(64),
        byteSize: 128,
        fileCount: 2,
        installedAt: 10,
        integrity: {
          status: "verified",
          checkedAt: 10,
          message: "Skill package integrity verified",
        },
      },
    ],
  };
}

const skills: SkillCatalogDto[] = [
  createSkill("skill-version-planning", "com.example.planning", "Planning"),
  createSkill("skill-version-review", "com.example.review", "Review"),
];

function createBusiness(
  templates: WorkflowTemplateLibraryItemDto[] = [draft, published],
): BusinessApi {
  return {
    listWorkflowTemplateLibrary: vi.fn().mockResolvedValue(templates),
    listWorkflowTemplateVersions: vi.fn().mockResolvedValue([
      {
        id: "template-published-v1",
        templateId: "template-published",
        version: 1,
        status: "published",
        checksum: "1234567890abcdef",
        nodeCount: 2,
        edgeCount: 1,
        createdAt: 1,
        publishedAt: 2,
      },
    ]),
    getWorkflowTemplateDraft: vi.fn().mockResolvedValue(draftDefinition),
    listSkills: vi.fn().mockResolvedValue(skills),
    createWorkflowTemplate: vi.fn().mockImplementation(async (command) => ({
      ...draft,
      id: command.id,
      name: command.name,
      description: command.description ?? "",
    })),
    copyWorkflowTemplate: vi.fn().mockImplementation(async (command) => ({
      ...draft,
      id: command.id,
      name: command.name,
      description: command.description ?? "",
    })),
    updateWorkflowTemplate: vi.fn().mockImplementation(async (command) => ({
      ...draft,
      ...command,
      revision: command.expectedRevision + 1,
    })),
    createWorkflowTemplateVersion: vi.fn().mockResolvedValue({
      ...published,
      status: "draft",
      revision: 3,
      currentVersion: {
        ...published.currentVersion,
        id: "template-published-v2",
        version: 2,
        status: "draft",
        checksum: "draft-v2",
        createdAt: 3,
        publishedAt: undefined,
      },
    }),
    publishWorkflowTemplate: vi.fn().mockResolvedValue({
      ...draft,
      status: "published",
      revision: 2,
      currentVersion: { ...draft.currentVersion, status: "published" },
    }),
    archiveWorkflowTemplate: vi.fn().mockResolvedValue({
      ...published,
      status: "archived",
      revision: 3,
      currentVersion: { ...published.currentVersion, status: "archived" },
    }),
    addWorkflowTemplateNode: vi.fn().mockImplementation(async (command) => ({
      ...draftDefinition,
      revision: command.expectedRevision + 1,
      currentVersion: {
        ...draftDefinition.currentVersion,
        nodeCount: 3,
        nodes: [
          ...draftDefinition.currentVersion.nodes,
          {
            id: `template-draft-v1-node-${command.node.stableKey}`,
            ...command.node,
            order: 3,
          },
        ],
      },
    })),
    copyWorkflowTemplateNode: vi.fn(),
    updateWorkflowTemplateNode: vi.fn(),
    configureWorkflowTemplateNode: vi
      .fn()
      .mockImplementation(async (command) => ({
        ...draftDefinition,
        revision: command.expectedRevision + 1,
        currentVersion: {
          ...draftDefinition.currentVersion,
          nodes: draftDefinition.currentVersion.nodes.map((node) =>
            node.id === command.nodeId
              ? { ...node, configuration: command.configuration }
              : node,
          ),
        },
      })),
    removeWorkflowTemplateNode: vi.fn().mockResolvedValue({
      ...draftDefinition,
      revision: 2,
      currentVersion: {
        ...draftDefinition.currentVersion,
        nodeCount: 1,
        edgeCount: 0,
        nodes: [draftDefinition.currentVersion.nodes[1]],
        edges: [],
      },
    }),
    reorderWorkflowTemplateNodes: vi.fn(),
    addWorkflowTemplateEdge: vi.fn().mockResolvedValue({
      ...draftDefinition,
      revision: 2,
      currentVersion: {
        ...draftDefinition.currentVersion,
        edgeCount: 2,
        edges: [
          ...draftDefinition.currentVersion.edges,
          {
            id: "design-review",
            sourceNodeId: "template-draft-v1-node-design",
            targetNodeId: "template-draft-v1-node-review",
          },
        ],
      },
    }),
    removeWorkflowTemplateEdge: vi.fn().mockResolvedValue({
      ...draftDefinition,
      revision: 2,
      currentVersion: {
        ...draftDefinition.currentVersion,
        edgeCount: 0,
        edges: [],
      },
    }),
  } as unknown as BusinessApi;
}

async function showDraftTemplates(tabName = "编辑中 (1)"): Promise<void> {
  fireEvent.click(await screen.findByRole("tab", { name: tabName }));
}

describe("WorkflowTemplatesPage", () => {
  it("restores the active tab from a deep link and rejects invalid values", async () => {
    window.realmflow = {
      business: createBusiness([draft, published]),
    } as typeof window.realmflow;

    const page = render(
      <WorkflowTemplatesPage />,
      undefined,
      "/workflows?tab=draft",
    );

    expect(
      await screen.findByRole("tab", { name: "编辑中 (1)" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("产品交付")).toBeVisible();

    page.unmount();
    render(
      <WorkflowTemplatesPage />,
      undefined,
      "/workflows?tab=unknown",
    );

    expect(
      await screen.findByRole("tab", { name: "已发布 (1)" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("uses the same page tabs as the schedule workspace header", async () => {
    window.realmflow = {
      business: createBusiness(),
    } as typeof window.realmflow;

    const { container } = render(<WorkflowTemplatesPage />);

    await screen.findByText("软件交付");
    expect(
      screen.getByRole("toolbar", { name: "流程模板视图" }),
    ).toHaveClass("ui-toolbar", "ui-toolbar--workspace-header");
    expect(container.querySelector(".ui-document-tabs")).toBeNull();
    expect(screen.getByRole("tablist")).toHaveClass(
      "ui-tab-list",
      "ui-tab-list--page",
      "workflow-templates-tabs",
    );
    expect(screen.getByRole("tablist").parentElement).toHaveClass(
      "ui-tabs",
      "ui-tabs--page",
    );
  });

  afterEach(() => {
    delete window.realmflow;
    vi.restoreAllMocks();
  });

  it("shows counted published and editing tabs in the workspace header", async () => {
    const business = createBusiness([draft, published, archived]);
    window.realmflow = { business } as typeof window.realmflow;

    render(<WorkflowTemplatesPage />);

    const publishedTab = await screen.findByRole("tab", {
      name: "已发布 (1)",
    });
    const draftTab = screen.getByRole("tab", { name: "编辑中 (1)" });
    expect(screen.getByRole("tablist")).toHaveClass(
      "ui-tab-list",
      "ui-tab-list--page",
    );
    expect(screen.getByRole("tablist").parentElement).toHaveClass(
      "ui-tabs",
      "ui-tabs--page",
    );
    publishedTab.focus();
    fireEvent.keyDown(publishedTab, { key: "ArrowRight" });
    expect(draftTab).toHaveFocus();
    expect(publishedTab).toHaveAttribute("aria-selected", "true");
    expect(publishedTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "新建模板" })).toBeVisible();
    expect(screen.getByText("软件交付").closest("article")).toHaveClass(
      "ui-card",
      "ui-card--default",
    );
    expect(screen.queryByText("产品交付")).not.toBeInTheDocument();
    expect(screen.queryByText("历史交付")).not.toBeInTheDocument();

    fireEvent.click(draftTab);

    expect(draftTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("产品交付")).toBeVisible();
    expect(screen.queryByText("软件交付")).not.toBeInTheDocument();
    expect(screen.queryByText("历史交付")).not.toBeInTheDocument();
  });

  it("loads all templates and exposes state-appropriate actions", async () => {
    const business = createBusiness();
    window.realmflow = { business } as typeof window.realmflow;

    render(<WorkflowTemplatesPage />);

    expect(await screen.findByText("软件交付")).toBeVisible();
    expect(screen.getByRole("button", { name: "停用 软件交付" })).toBeVisible();

    await showDraftTemplates();

    expect(screen.getByText("产品交付")).toBeVisible();
    expect(screen.getByRole("button", { name: "编辑 产品交付" })).toBeVisible();
    expect(screen.getByRole("button", { name: "发布 产品交付" })).toBeVisible();
    expect(business.listWorkflowTemplateLibrary).toHaveBeenCalledOnce();
  });

  it("opens draft node editing in the dedicated canvas route", async () => {
    const business = createBusiness();
    window.realmflow = { business } as typeof window.realmflow;
    window.location.hash = "#/workflows";
    render(<WorkflowTemplatesPage />);
    await showDraftTemplates();

    fireEvent.click(
      await screen.findByRole("button", { name: "编辑 产品交付" }),
    );

    expect(window.location.hash).toBe("#/templates/template-draft/edit");
    expect(business.getWorkflowTemplateDraft).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "编辑节点 产品交付" }),
    ).toBeNull();
  });

  it("renders workflow template controls in Japanese without a duplicate introduction", async () => {
    const business = createBusiness();
    window.realmflow = { business } as typeof window.realmflow;

    render(<WorkflowTemplatesPage />, storageWithLocale("ja"));

    await screen.findByRole("tab", { name: "公開済み (1)" });
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "ワークフローテンプレート",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("REALMFLOW / WORKFLOWS")).not.toBeInTheDocument();
    await showDraftTemplates("編集中 (1)");
    expect(await screen.findByText("下書き")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "产品交付を公開" }),
    ).toBeVisible();
    expect(screen.getByText("产品交付")).toBeVisible();
  });

  it("creates and copies templates through the editor dialog", async () => {
    const business = createBusiness();
    window.realmflow = { business } as typeof window.realmflow;
    render(<WorkflowTemplatesPage />);
    await screen.findByRole("tab", { name: "已发布 (1)" });

    fireEvent.click(screen.getByRole("button", { name: "新建模板" }));
    const dialog = screen.getByRole("dialog", { name: "新建流程模板" });
    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--default");
    expect(dialog.querySelectorAll(".ui-field")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "创建模板" })).toHaveClass(
      "ui-button",
      "ui-button--primary",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "模板名称" }), {
      target: { value: "发布流程" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建模板" }));

    await waitFor(() =>
      expect(business.createWorkflowTemplate).toHaveBeenCalledWith({
        id: expect.any(String),
        name: "发布流程",
        description: "",
      }),
    );
    expect(await screen.findByText("发布流程")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "复制 产品交付" }));
    expect(screen.getByRole("textbox", { name: "模板名称" })).toHaveValue(
      "产品交付 副本",
    );
    fireEvent.click(screen.getByRole("button", { name: "复制模板" }));

    await waitFor(() =>
      expect(business.copyWorkflowTemplate).toHaveBeenCalledWith({
        id: expect.any(String),
        sourceTemplateId: draft.id,
        name: "产品交付 副本",
        description: draft.description,
      }),
    );
  });

  it("keeps the current state and toasts a safe failed publish", async () => {
    const business = createBusiness();
    vi.mocked(business.publishWorkflowTemplate).mockRejectedValue(
      new Error("/private/templates.db revision conflict"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    render(<WorkflowTemplatesPage />);
    await showDraftTemplates();
    await screen.findByText("产品交付");

    fireEvent.click(screen.getByRole("button", { name: "发布 产品交付" }));
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    const alert = await findToast();
    expect(alert).toHaveTextContent("模板发布失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("/private/templates.db");
    expect(screen.getByText("草稿")).toBeVisible();
    expect(screen.getByRole("button", { name: "发布 产品交付" })).toBeVisible();
  });

  it("toasts a safe template create failure and keeps the editor open", async () => {
    const business = createBusiness();
    vi.mocked(business.createWorkflowTemplate).mockRejectedValueOnce(
      new Error("token=secret create failed"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    render(<WorkflowTemplatesPage />);
    await screen.findByRole("tab", { name: "已发布 (1)" });

    fireEvent.click(screen.getByRole("button", { name: "新建模板" }));
    fireEvent.change(screen.getByRole("textbox", { name: "模板名称" }), {
      target: { value: "发布流程" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建模板" }));

    const alert = await findToast();
    expect(alert).toHaveTextContent("模板保存失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("token=secret");
    expect(
      screen.getByRole("textbox", { name: "模板名称" }),
    ).toHaveValue("发布流程");
  });

  it("toasts a safe archive failure and preserves the published template", async () => {
    const business = createBusiness();
    vi.mocked(business.archiveWorkflowTemplate).mockRejectedValueOnce(
      new Error("database archive details"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    render(<WorkflowTemplatesPage />);
    await screen.findByText("软件交付");

    fireEvent.click(screen.getByRole("button", { name: "停用 软件交付" }));
    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    const alert = await findToast();
    expect(alert).toHaveTextContent("模板停用失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("database archive details");
    expect(screen.getByText("软件交付")).toBeVisible();
  });

  it("toasts a safe new-version failure and preserves the published template", async () => {
    const business = createBusiness();
    vi.mocked(business.createWorkflowTemplateVersion).mockRejectedValueOnce(
      new Error("/private/version.json"),
    );
    window.realmflow = { business } as typeof window.realmflow;
    render(<WorkflowTemplatesPage />);
    await screen.findByText("软件交付");

    fireEvent.click(
      screen.getByRole("button", { name: "创建新版本 软件交付" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "创建新版本" }));

    const alert = await findToast();
    expect(alert).toHaveTextContent("新版本创建失败");
    expect(alert).toHaveClass("toast-message");
    expect(alert).not.toHaveTextContent("/private/version.json");
    expect(screen.getByText("已发布")).toBeVisible();
  });

  it("shows every located publication validation issue", async () => {
    const business = createBusiness();
    vi.mocked(business.publishWorkflowTemplate).mockResolvedValue({
      outcome: "invalid",
      validation: {
        valid: false,
        issues: [
          {
            code: "missing_node_configuration",
            message: "节点“需求分析”缺少完整配置",
            scope: "node",
            nodeId: "template-draft-v1-node-analysis",
          },
          {
            code: "invalid_edge_reference",
            message: "连线 analysis-review 引用了不存在的节点",
            scope: "edge",
            edgeId: "analysis-review",
          },
        ],
      },
    } as never);
    window.realmflow = { business } as typeof window.realmflow;
    render(<WorkflowTemplatesPage />);
    await showDraftTemplates();
    await screen.findByText("产品交付");

    fireEvent.click(screen.getByRole("button", { name: "发布 产品交付" }));
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("模板发布校验失败");
    expect(alert).toHaveTextContent("节点“需求分析”缺少完整配置");
    expect(alert).toHaveTextContent("连线 analysis-review 引用了不存在的节点");
    expect(screen.getByText("草稿")).toBeVisible();
    expect(screen.getByRole("button", { name: "发布 产品交付" })).toBeVisible();
  });

  it("shows immutable version history and creates the next draft", async () => {
    const business = createBusiness();
    window.realmflow = { business } as typeof window.realmflow;
    render(<WorkflowTemplatesPage />);
    await screen.findByText("软件交付");

    fireEvent.click(
      screen.getByRole("button", { name: "查看版本历史 软件交付" }),
    );
    expect(business.listWorkflowTemplateVersions).toHaveBeenCalledWith({
      templateId: published.id,
    });
    expect(await screen.findByText("12345678")).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "创建新版本 软件交付" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "创建新版本" }));
    await waitFor(() =>
      expect(business.createWorkflowTemplateVersion).toHaveBeenCalledWith({
        id: published.id,
        sourceVersionId: published.currentVersion.id,
        expectedRevision: published.revision,
      }),
    );
    expect(
      await screen.findByRole("button", { name: "编辑 软件交付" }),
    ).toBeVisible();
    expect(screen.getByText(/版本 2/)).toBeVisible();
  });

});

async function findToast(): Promise<HTMLElement> {
  const alerts = await screen.findAllByRole("alert");
  const toast = alerts.find((candidate) =>
    candidate.classList.contains("toast-message"),
  );
  if (!toast) throw new Error("Expected an error toast");
  return toast;
}

function storageWithLocale(locale: "en" | "ja"): Storage {
  return {
    getItem: vi.fn(() => JSON.stringify({ version: 1, locale })),
    setItem: vi.fn(),
  } as unknown as Storage;
}
