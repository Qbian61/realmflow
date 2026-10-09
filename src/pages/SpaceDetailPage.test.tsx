import {
  act,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import type { RealmFlowApi } from "../../shared/types";
import type {
  BusinessApi,
  RepositorySnapshotViewDto,
} from "../../shared/business";
import type { ProductAnalyticsResult } from "../../shared/product-analytics";
import { ToastProvider } from "../features/toast/ToastProvider";
import { WorkbenchProvider } from "../features/workbench/WorkbenchProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import SpaceDetailPage from "./SpaceDetailPage";

function render(ui: Parameters<typeof testingRender>[0]) {
  return testingRender(
    <LocalizationProvider>
      <ToastProvider>{ui}</ToastProvider>
    </LocalizationProvider>,
  );
}

vi.mock("../features/artifacts/ArtifactWorkbench", () => ({
  default: () => <div>本地文件预览</div>,
}));

function createApi(): RealmFlowApi {
  return {
    platform: "darwin",
    getSidecarStatus: vi.fn().mockResolvedValue("ready"),
    quitApp: vi.fn().mockResolvedValue(undefined),
    workbenchHub: {
      layout: {
        get: vi.fn(),
        update: vi.fn(),
      },
      dashboard: {
        getSnapshot: vi.fn(),
        onInvalidated: vi.fn().mockReturnValue(() => undefined),
      },
      attachments: {} as never,
      memos: {} as never,
      sites: {} as never,
      tasks: {} as never,
      system: {
        getStatus: vi.fn(),
      },
    },
    aiRuns: {
      start: vi.fn(),
      cancel: vi.fn(),
      get: vi.fn(),
      attach: vi.fn(),
      listEvents: vi.fn(),
      recover: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => undefined),
    },
    business: {} as never,
    toolCatalog: {} as never,
    toolPermissions: {} as never,
    persistence: {
      load: vi.fn().mockResolvedValue({
        status: "loaded",
        snapshot: { revision: 0, value: null },
      }),
      onChanged: vi.fn().mockReturnValue(() => undefined),
    },
    workspace: {
      chooseFiles: vi.fn().mockResolvedValue({
        binding: {
          requirementId: "session-space-files",
          rootName: "docs",
          rootPath: "/tmp/docs",
        },
        files: [
          {
            name: "architecture.md",
            path: "architecture.md",
            content: "# Architecture",
            kind: "markdown",
            language: "markdown",
            size: 14,
            modifiedAt: 1,
            version: "1:14",
          },
        ],
      }),
      openSessionFiles: vi.fn().mockResolvedValue({
        binding: {
          requirementId: "session-space-files",
          rootName: "docs",
          rootPath: "/tmp/docs",
        },
        files: [],
      }),
      chooseFolder: vi.fn().mockResolvedValue(null),
      chooseDirectory: vi.fn().mockResolvedValue(null),
      getBinding: vi.fn().mockResolvedValue(null),
      listDirectory: vi.fn().mockResolvedValue([]),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readManifest: vi.fn().mockResolvedValue({
        version: 1,
        requirementId: "session-space-files",
        stages: {},
      }),
      writeManifest: vi.fn(),
      getPreviewUrl: vi.fn(),
      showItem: vi.fn(),
    },
    webWorkbench: {
      create: vi.fn(),
      show: vi.fn().mockResolvedValue(undefined),
      hideAll: vi.fn().mockResolvedValue(undefined),
      setBounds: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      destroy: vi.fn(),
      openExternal: vi.fn(),
      onStateChange: vi.fn().mockReturnValue(() => undefined),
    },
    terminal: {
      create: vi.fn(),
      createHome: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => undefined),
    },
  };
}

describe("SpaceDetailPage", () => {
  it("restores the active tab from a deep link and rejects invalid values", () => {
    const page = renderSpaceDetailHeader(
      "Product Space",
      undefined,
      undefined,
      "/spaces/space-1?tab=resources",
    );

    expect(
      screen.getByRole("tab", { name: "空间知识库 (0)" }),
    ).toHaveAttribute("aria-selected", "true");

    page.unmount();
    renderSpaceDetailHeader(
      "Product Space",
      undefined,
      undefined,
      "/spaces/space-1?tab=unknown",
    );

    expect(
      screen.getByRole("tab", { name: "Product Space (0)" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("uses the space name as the selected overview tab", () => {
    const spaceName = "A long product workspace name";
    renderSpaceDetailHeader(spaceName);

    const tablist = screen.getByRole("tablist", { name: "空间详情" });
    const nameTab = screen.getByRole("tab", {
      name: `${spaceName} (0)`,
    });
    const knowledgeTab = screen.getByRole("tab", {
      name: "空间知识库 (0)",
    });
    expect(tablist).toHaveClass("ui-tab-list", "ui-tab-list--page");
    expect(tablist.parentElement).toHaveClass("ui-tabs", "ui-tabs--page");
    knowledgeTab.focus();
    fireEvent.keyDown(knowledgeTab, { key: "ArrowRight" });
    expect(nameTab).toHaveFocus();
    expect(nameTab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "概览" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "统计" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(tablist.lastElementChild).toBe(nameTab);
    expect(nameTab).toHaveAttribute("aria-selected", "true");
  });

  it("returns to the combined overview from the space name tab", () => {
    const spaceName = "Product Space";
    renderSpaceDetailHeader(spaceName);

    fireEvent.click(screen.getByRole("tab", { name: "空间知识库 (0)" }));
    expect(
      screen.queryByRole("textbox", { name: "空间对话内容" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: `${spaceName} (0)` }));
    expect(
      screen.getByRole("textbox", { name: "空间对话内容" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: `${spaceName} (0)` })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("region", { name: "需求统计" }),
    ).toBeInTheDocument();
  });

  it("exposes the complete current space name as a separate header title", () => {
    const spaceName = "A long product workspace name";
    renderSpaceDetailHeader(spaceName);

    const spaceNameTab = screen.getByRole("tab", {
      name: `${spaceName} (0)`,
    });
    expect(
      screen.getByRole("toolbar", { name: "空间详情" }),
    ).toHaveClass(
      "ui-toolbar",
      "ui-toolbar--workspace-header",
    );
    expect(spaceNameTab).toHaveAttribute("title", spaceName);
    expect(
      spaceNameTab.querySelector(".space-detail-name-label"),
    ).toHaveTextContent(`${spaceName} (0)`);
    expect(
      document.querySelectorAll(".space-statistics-summary .ui-metric"),
    ).toHaveLength(4);
    expect(
      document.querySelector(".space-empty-block"),
    ).toHaveClass("ui-empty-state");
  });

  it("requires a published workflow template when creating a requirement", async () => {
    const onCreateRequirement = vi.fn();
    const business = {
      listKnowledgeSources: vi.fn().mockResolvedValue([]),
      listWorkflowTemplates: vi.fn().mockResolvedValue([
        {
          id: "template-version-2",
          templateId: "template-1",
          version: 2,
          status: "published",
          checksum: "checksum",
          nodes: [],
          edges: [],
        },
      ]),
      listWorkflowTemplateLibrary: vi.fn().mockResolvedValue([
        {
          id: "template-1",
          name: "Product delivery",
          description: "",
          status: "published",
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
          currentVersion: {
            id: "template-version-2",
            version: 2,
            status: "published",
            checksum: "checksum",
            nodeCount: 0,
            edgeCount: 0,
          },
        },
      ]),
    } as unknown as BusinessApi;
    renderSpaceDetailHeader("Product Space", onCreateRequirement, business);

    fireEvent.click(screen.getByRole("button", { name: "新建需求" }));
    const dialog = screen.getByRole("dialog", { name: "新建需求" });
    const confirm = within(dialog).getByRole("button", {
      name: "确认新建需求",
    });
    expect(confirm).toBeDisabled();
    expect(
      await within(dialog).findByRole("option", {
        name: "Product delivery · v2",
      }),
    ).toBeInTheDocument();
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "需求名称" }),
      { target: { value: "Checkout optimization" } },
    );
    expect(confirm).toBeDisabled();
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "流程模板" }),
      { target: { value: "template-version-2" } },
    );
    fireEvent.click(confirm);

    expect(onCreateRequirement).toHaveBeenCalledWith(
      "/spaces/space-1",
      "Checkout optimization",
      "template-version-2",
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "新建需求" }),
      ).not.toBeInTheDocument();
    });
  });

  it("renders the overview in Japanese", () => {
    const api = createApi();
    render(
      <LocalizationProvider storage={storageWithLocale("ja")}>
        <MemoryRouter initialEntries={["/spaces/space-1"]}>
          <WorkbenchProvider api={api}>
            <Routes>
              <Route
                path="/spaces/:spaceId"
                element={
                  <SpaceDetailPage
                    api={api}
                    spaces={[
                      {
                        id: "space-1",
                        path: "/spaces/space-1",
                        label: "Product Space",
                        description: "",
                        revision: 1,
                      },
                    ]}
                    requirementsBySpace={{ "/spaces/space-1": [] }}
                  />
                }
              />
            </Routes>
          </WorkbenchProvider>
        </MemoryRouter>
      </LocalizationProvider>,
    );

    expect(
      screen.getByRole("tablist", { name: "スペース詳細" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "スペースナレッジ (0)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("すべての要件")).toBeInTheDocument();
    expect(
      screen.getByText("現在のスペースに要件はありません"),
    ).toBeInTheDocument();
  });

  it("queries product analytics for the current space from its name tab", async () => {
    const api = createApi();
    const analytics: ProductAnalyticsResult = {
      scope: { workspaceId: "space-1", workspaces: [] },
      summary: {
        workspaces: 1,
        requirements: 0,
        workflows: 0,
        executions: 0,
        nodeRuns: 0,
      },
      requirements: [
        { status: "pending", count: 0 },
        { status: "active", count: 0 },
        { status: "completed", count: 0 },
      ],
      workflows: [],
      executionStatuses: [
        { status: "created", count: 0 },
        { status: "running", count: 0 },
        { status: "waiting_user", count: 0 },
        { status: "paused", count: 0 },
        { status: "completed", count: 0 },
        { status: "failed", count: 0 },
        { status: "cancelled", count: 0 },
        { status: "interrupted", count: 0 },
      ],
      nodeRunStatuses: [
        { status: "pending", count: 0 },
        { status: "ready", count: 0 },
        { status: "running", count: 0 },
        { status: "waiting_user", count: 0 },
        { status: "paused", count: 0 },
        { status: "blocked", count: 0 },
        { status: "completed", count: 0 },
        { status: "failed", count: 0 },
        { status: "skipped", count: 0 },
        { status: "cancelled", count: 0 },
        { status: "interrupted", count: 0 },
      ],
      recentActivity: [],
    };
    const business = {
      listKnowledgeSources: vi.fn().mockResolvedValue([]),
      queryProductAnalytics: vi.fn().mockResolvedValue(analytics),
    } as unknown as RealmFlowApi["business"];
    render(
      <MemoryRouter initialEntries={["/spaces/space-1"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  business={business}
                  spaces={[
                    {
                      id: "space-1",
                      path: "/spaces/space-1",
                      label: "Product Space",
                      description: "",
                    },
                  ]}
                  requirementsBySpace={{ "/spaces/space-1": [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("tab", { name: "统计" })).not.toBeInTheDocument();
    expect(
      await screen.findByRole("region", { name: "产品活动总览" }),
    ).toBeInTheDocument();
    expect(business.queryProductAnalytics).toHaveBeenCalledWith({
      workspaceId: "space-1",
      activityLimit: 12,
    });
    expect(screen.queryByLabelText("空间范围")).not.toBeInTheDocument();
  });

  it("disables the space composer while conversation creation is pending", async () => {
    const pending = deferred<void>();
    renderSpaceConversationEntry(vi.fn(() => pending.promise));
    const textarea = screen.getByRole("textbox", { name: "空间对话内容" });

    fireEvent.change(textarea, { target: { value: "Use workspace context" } });
    fireEvent.click(screen.getByRole("button", { name: "发送空间消息" }));

    expect(textarea).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送空间消息" })).toBeDisabled();
    await act(async () => pending.resolve());
    expect(textarea).toHaveValue("");
  });

  it("keeps the prompt and shows the command error when space creation fails", async () => {
    renderSpaceConversationEntry(
      vi.fn().mockRejectedValue(new Error("Workspace not found: space-1")),
    );
    const textarea = screen.getByRole("textbox", { name: "空间对话内容" });

    fireEvent.change(textarea, { target: { value: "Retry with workspace" } });
    fireEvent.click(screen.getByRole("button", { name: "发送空间消息" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("创建空间对话失败，请重试");
    expect(alert).not.toHaveTextContent("Workspace not found: space-1");
    expect(textarea).toHaveValue("Retry with workspace");
    expect(textarea).not.toBeDisabled();
  });

  it("ingests managed local files and reopens them through Main", async () => {
    const api = createApi();
    const persistedSelection = await api.workspace.chooseFiles();
    vi.mocked(api.workspace.chooseFiles).mockClear();
    const business = {
      listKnowledgeSources: vi.fn(async () => []),
      ingestLocalFiles: vi.fn(async () => [
        {
          id: "file-source-1",
          workspaceId: "space-1",
          name: "architecture.md",
          type: "file" as const,
          locator:
            "managed:.realmflow/knowledge/files/file-source-1/architecture.md",
          detail: "受管副本",
          sortOrder: 0,
          status: "registered" as const,
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      openLocalFileSource: vi.fn(async () => persistedSelection),
    } as unknown as RealmFlowApi["business"];
    render(
      <MemoryRouter initialEntries={["/spaces/xxx"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  business={business}
                  spaces={[
                    {
                      id: "space-1",
                      path: "/spaces/xxx",
                      label: "xxx 空间",
                      description: "测试空间",
                    },
                  ]}
                  requirementsBySpace={{ "/spaces/xxx": [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("tab", { name: "概览" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "xxx 空间 (0)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "空间知识库 (0)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "xxx 空间" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("0 个需求 · 0 项资源")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "空间知识库 (0)" }));
    expect(
      screen.queryByRole("heading", { name: "空间资源" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "上传本地文件" }));

    await waitFor(() => {
      expect(business.ingestLocalFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "space-1",
          selectionId: "session-space-files",
          filePaths: ["architecture.md"],
          storageMode: "managed_copy",
        }),
      );
    });
    expect(
      screen.getByRole("tab", { name: "空间知识库 (1)" }),
    ).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "打开 architecture.md" }),
    );

    expect(business.openLocalFileSource).toHaveBeenCalledWith({
      sourceId: "file-source-1",
    });
    expect(
      await screen.findByRole("complementary", { name: "全局工作区" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "docs" })).toBeInTheDocument();
  });

  it("can ingest a local file as an external reference", async () => {
    const api = createApi();
    const business = {
      listKnowledgeSources: vi.fn(async () => []),
      ingestLocalFiles: vi.fn(async () => []),
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (0)" }));
    fireEvent.click(screen.getByRole("button", { name: "引用本地文件" }));

    await waitFor(() => {
      expect(business.ingestLocalFiles).toHaveBeenCalledWith(
        expect.objectContaining({ storageMode: "external_reference" }),
      );
    });
  });

  it("creates an online document from an enabled Connector without optimistic UI", async () => {
    const api = createApi();
    const pending = deferred<{
      source: {
        id: string;
        workspaceId: string;
        name: string;
        type: "document";
        locator: string;
        detail: string;
        sortOrder: number;
        status: "indexed";
        revision: number;
        createdAt: number;
        updatedAt: number;
      };
    }>();
    const createOnlineDocumentSource = vi.fn(() => pending.promise);
    const business = {
      listKnowledgeSources: vi.fn(async () => []),
      listConnectors: vi.fn(async () => [
        {
          connector: {
            id: "connector-docs",
            name: "Docs",
            type: "http" as const,
            baseUrl: "https://docs.example.com",
            authentication: { type: "none" as const },
            enabled: true,
            timeoutMs: 1000,
            maxRetries: 0,
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          },
          hasCredential: false,
        },
        {
          connector: {
            id: "connector-disabled",
            name: "Disabled",
            type: "http" as const,
            baseUrl: "https://disabled.example.com",
            authentication: { type: "none" as const },
            enabled: false,
            timeoutMs: 1000,
            maxRetries: 0,
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          },
          hasCredential: false,
        },
      ]),
      createOnlineDocumentSource,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (0)" }));
    fireEvent.click(screen.getByRole("button", { name: "添加在线文档" }));
    expect(
      await screen.findByRole("option", { name: "Docs" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Disabled" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "资源名称" }), {
      target: { value: "Product brief" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "连接器" }), {
      target: { value: "connector-docs" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "文档路径" }), {
      target: { value: "/documents/brief" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认添加" }));

    await waitFor(() =>
      expect(createOnlineDocumentSource).toHaveBeenCalledWith({
        id: expect.any(String),
        workspaceId: "space-1",
        name: "Product brief",
        connectorId: "connector-docs",
        path: "/documents/brief",
        sortOrder: 0,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(
      screen.getByRole("tab", { name: "空间知识库 (0)" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Product brief")).not.toBeInTheDocument();

    await act(async () =>
      pending.resolve({
        source: {
          id: "source-online",
          workspaceId: "space-1",
          name: "Product brief",
          type: "document",
          locator: "connector:connector-docs/documents/brief",
          detail: "connector-docs",
          sortOrder: 0,
          status: "indexed",
          revision: 3,
          createdAt: 1,
          updatedAt: 2,
        },
      }),
    );
    expect(
      await screen.findByRole("tab", { name: "空间知识库 (1)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Product brief")).toBeInTheDocument();
  });

  it("refreshes online documents through the unified refresh command", async () => {
    const api = createApi();
    const source = onlineDocumentSource();
    const refreshKnowledgeSource = vi.fn(async () => ({
      id: "refresh-1",
      sourceId: source.id,
    }));
    const business = {
      listKnowledgeSources: vi.fn(async () => [source]),
      refreshKnowledgeSource,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "刷新 Product brief" }));

    await waitFor(() =>
      expect(refreshKnowledgeSource).toHaveBeenCalledWith({
        sourceId: "source-online",
        idempotencyKey: expect.any(String),
      }),
    );
    await waitFor(() =>
      expect(business.listKnowledgeSources).toHaveBeenCalledTimes(2),
    );
  });

  it("shows local knowledge health, source timestamps, and refresh policy", async () => {
    const api = createApi();
    const source = {
      ...onlineDocumentSource(),
      refresh: {
        enabled: true,
        preset: "30m" as const,
        revision: 7,
        nextDueAt: Date.now() + 30 * 60_000,
        lastCheckedAt: Date.now() - 60_000,
        lastChangedAt: Date.now() - 2 * 60_000,
      },
      index: {
        health: "ready" as const,
        profileId: "gte-multilingual-base-v1",
        generationId: "generation-1",
        sourceVersion: "sha256:source",
        indexedAt: Date.now() - 3 * 60_000,
      },
    };
    const business = {
      listKnowledgeSources: vi.fn(async () => [source]),
      getKnowledgeRuntimeHealth: vi.fn(async () => ({
        status: "ready" as const,
        components: {
          vectorStore: "ready" as const,
          embeddings: "ready" as const,
        },
      })),
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));

    expect(
      await screen.findByRole("status", { name: "本地知识运行时" }),
    ).toHaveTextContent("本地知识可用");
    expect(screen.getByText("上次检查")).toBeInTheDocument();
    expect(screen.getByText("上次变化")).toBeInTheDocument();
    expect(screen.getByText("上次索引")).toBeInTheDocument();
    expect(screen.getByText("索引就绪")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Product brief 的自动刷新周期" }),
    ).toHaveValue("30m");
  });

  it("updates refresh policy through Main and reloads the source row", async () => {
    const api = createApi();
    const source = {
      ...onlineDocumentSource(),
      refresh: {
        enabled: true,
        preset: "30m" as const,
        revision: 7,
        nextDueAt: 100,
        lastCheckedAt: null,
        lastChangedAt: null,
      },
    };
    const setKnowledgeRefreshPolicy = vi.fn(async () => ({
      ...source.refresh,
      enabled: false,
      preset: "manual" as const,
      revision: 8,
    }));
    const business = {
      listKnowledgeSources: vi.fn(async () => [source]),
      setKnowledgeRefreshPolicy,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Product brief 的自动刷新周期",
      }),
      { target: { value: "manual" } },
    );

    await waitFor(() =>
      expect(setKnowledgeRefreshPolicy).toHaveBeenCalledWith({
        sourceId: source.id,
        expectedRevision: 7,
        preset: "manual",
        timeZone: expect.any(String),
      }),
    );
    await waitFor(() =>
      expect(business.listKnowledgeSources).toHaveBeenCalledTimes(2),
    );
  });

  it("opens online documents from the local snapshot without external navigation", async () => {
    const api = createApi();
    const source = onlineDocumentSource();
    const business = {
      listKnowledgeSources: vi.fn(async () => [source]),
      getOnlineDocumentSnapshot: vi.fn(async () => ({
        document: {
          sourceId: "source-online",
          workspaceId: "space-1",
          connectorId: "connector-docs",
          path: "/documents/brief",
          locator: source.locator,
          mediaType: "text/markdown",
          etag: '"revision-1"',
          lastFetchedAt: 2,
          createdAt: 1,
          updatedAt: 2,
        },
        snapshot: {
          id: "snapshot-1",
          sourceId: "source-online",
          version: 1,
          content: "# Product brief\n\nLocal content",
          mediaType: "text/markdown",
          contentChecksum: "sha256:brief",
          byteSize: 30,
          etag: '"revision-1"',
          fetchedAt: 2,
        },
      })),
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "打开 Product brief" }));

    expect(
      await screen.findByRole("dialog", { name: "Product brief" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Local content", { exact: false }),
    ).toBeInTheDocument();
    expect(api.webWorkbench.openExternal).not.toHaveBeenCalled();
    expect(api.webWorkbench.navigate).not.toHaveBeenCalled();
  });

  it("ingests a selected local repository without exposing its path or updating optimistically", async () => {
    const api = createApi();
    const pending = deferred<ReturnType<typeof repositorySyncResult>>();
    vi.mocked(api.workspace.chooseFolder).mockResolvedValue({
      requirementId: "repository-selection-1",
      rootName: "realmflow",
      rootPath: "/Users/private/realmflow",
    });
    const ingestLocalRepository = vi.fn(() => pending.promise);
    const business = {
      listKnowledgeSources: vi.fn(async () => []),
      listConnectors: vi.fn(async () => []),
      listRepositoryBranches: vi.fn(async () => [
        { name: "main", current: true },
        { name: "feature/docs", current: false },
      ]),
      ingestLocalRepository,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (0)" }));
    fireEvent.click(screen.getByRole("button", { name: "关联代码仓库" }));
    fireEvent.click(screen.getByRole("button", { name: "选择仓库文件夹" }));
    expect(await screen.findByText("realmflow")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "仓库名称" }), {
      target: { value: "RealmFlow" },
    });
    await screen.findByRole("option", { name: "main" });
    expect(screen.getByRole("combobox", { name: "分支" })).toHaveValue("main");
    fireEvent.click(screen.getByRole("button", { name: "确认关联" }));

    expect(ingestLocalRepository).toHaveBeenCalledWith({
      id: expect.any(String),
      workspaceId: "space-1",
      selectionId: "repository-selection-1",
      selectedBranch: "main",
      name: "RealmFlow",
      sortOrder: 0,
      idempotencyKey: expect.any(String),
    });
    expect(
      screen.getByRole("tab", { name: "空间知识库 (0)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "关联代码仓库" }),
    ).not.toBeInTheDocument();
    expect(JSON.stringify(ingestLocalRepository.mock.calls)).not.toContain(
      "/Users/private/realmflow",
    );

    await act(async () => pending.resolve(repositorySyncResult()));
    expect(
      await screen.findByRole("tab", { name: "空间知识库 (1)" }),
    ).toBeInTheDocument();
  });

  it("does not create a local repository when folder selection is cancelled", async () => {
    const api = createApi();
    const ingestLocalRepository = vi.fn();
    const business = {
      listKnowledgeSources: vi.fn(async () => []),
      listConnectors: vi.fn(async () => []),
      ingestLocalRepository,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (0)" }));
    fireEvent.click(screen.getByRole("button", { name: "关联代码仓库" }));
    fireEvent.click(screen.getByRole("button", { name: "选择仓库文件夹" }));

    expect(api.workspace.chooseFolder).toHaveBeenCalledOnce();
    expect(ingestLocalRepository).not.toHaveBeenCalled();
  });

  it("closes the repository form and keeps existing rows after ingestion fails", async () => {
    const api = createApi();
    const existing = repositorySource();
    const ingestRemoteRepository = vi
      .fn()
      .mockRejectedValue(new Error("Connector unavailable"));
    const business = {
      listKnowledgeSources: vi.fn(async () => [existing]),
      listConnectors: vi.fn(async () => [
        {
          connector: {
            id: "connector-git",
            name: "Git source",
            type: "http" as const,
            baseUrl: "https://git.example.com",
            authentication: { type: "none" as const },
            enabled: true,
            timeoutMs: 1000,
            maxRetries: 0,
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          },
          hasCredential: false,
        },
      ]),
      listRepositoryBranches: vi.fn(async () => [
        { name: "main", current: true },
      ]),
      ingestRemoteRepository,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "关联代码仓库" }));
    fireEvent.click(screen.getByRole("button", { name: "远程仓库" }));
    expect(
      await screen.findByRole("option", { name: "Git source" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "仓库名称" }), {
      target: { value: "Docs repository" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "仓库路径" }), {
      target: { value: "/repositories/docs" },
    });
    await screen.findByRole("option", { name: "main" });
    expect(screen.getByRole("combobox", { name: "分支" })).toHaveValue("main");
    fireEvent.click(screen.getByRole("button", { name: "确认关联" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "代码仓库同步失败",
    );
    expect(
      screen.queryByRole("dialog", { name: "关联代码仓库" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(existing.name)).toBeInTheDocument();
  });

  it("refreshes and previews repository snapshots through Main", async () => {
    const api = createApi();
    const source = repositorySource();
    const refreshKnowledgeSource = vi.fn(async () => ({
      id: "refresh-1",
      sourceId: source.id,
    }));
    const getRepositorySnapshot = vi.fn(async () => repositorySnapshotView());
    const business = {
      listKnowledgeSources: vi.fn(async () => [source]),
      refreshKnowledgeSource,
      getRepositorySnapshot,
      listRepositoryBranches: vi.fn(async () => [
        { name: "main", current: true },
      ]),
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.click(
      screen.getByRole("button", { name: `刷新 ${source.name}` }),
    );
    await waitFor(() =>
      expect(refreshKnowledgeSource).toHaveBeenCalledWith({
        sourceId: source.id,
        idempotencyKey: expect.any(String),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `打开 ${source.name}` }),
    );

    expect(
      await screen.findByRole("dialog", { name: source.name }),
    ).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getAllByText("8 B")).toHaveLength(2);
    expect(screen.getByLabelText("索引成功")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索文件名" }), {
      target: { value: "missing.ts" },
    });
    expect(screen.getByText("没有匹配的文件")).toBeInTheDocument();
    expect(api.webWorkbench.openExternal).not.toHaveBeenCalled();
  });

  it("retries only a failed repository file and reloads its Main projection", async () => {
    const api = createApi();
    const source = repositorySource();
    const failedView = repositorySnapshotView() as RepositorySnapshotViewDto;
    failedView.snapshot!.files[0]!.indexStatus = {
      status: "failed",
      errorCode: "indexing_failed",
      updatedAt: 2,
    };
    const pendingView = repositorySnapshotView() as RepositorySnapshotViewDto;
    pendingView.snapshot!.files[0]!.indexStatus = {
      status: "pending",
      updatedAt: 3,
    };
    const getRepositorySnapshot = vi
      .fn()
      .mockResolvedValueOnce(failedView)
      .mockResolvedValueOnce(pendingView);
    const retryRepositoryFileIndex = vi.fn().mockResolvedValue({
      status: "enqueued",
      jobId: "job-retry-1",
    });
    const business = {
      listKnowledgeSources: vi.fn(async () => [source]),
      getRepositorySnapshot,
      listRepositoryBranches: vi.fn(async () => [
        { name: "main", current: true },
      ]),
      retryRepositoryFileIndex,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.click(
      screen.getByRole("button", { name: `打开 ${source.name}` }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "重新索引此文件" }),
    );

    await waitFor(() =>
      expect(retryRepositoryFileIndex).toHaveBeenCalledWith({
        sourceId: source.id,
        documentKey: "README.md",
        expectedSourceRevision: source.revision,
        expectedSnapshotVersion: 1,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(await screen.findByLabelText("等待索引")).toBeInTheDocument();
  });

  it("retries failed repositories through unified refresh", async () => {
    const api = createApi();
    const source = {
      ...repositorySource(),
      status: "failed" as const,
      errorMessage: "Connector unavailable",
    };
    const refreshKnowledgeSource = vi.fn(async () => ({
      id: "refresh-1",
      sourceId: source.id,
    }));
    const business = {
      listKnowledgeSources: vi.fn(async () => [source]),
      refreshKnowledgeSource,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.click(
      screen.getByRole("button", { name: `刷新 ${source.name}` }),
    );

    await waitFor(() =>
      expect(refreshKnowledgeSource).toHaveBeenCalledWith({
        sourceId: source.id,
        idempotencyKey: expect.any(String),
      }),
    );
  });

  it("checks an indexed local file for changes without optimistic state", async () => {
    const api = createApi();
    const indexed = {
      id: "file-source-1",
      workspaceId: "space-1",
      name: "architecture.md",
      type: "file" as const,
      locator:
        "managed:.realmflow/knowledge/files/file-source-1/architecture.md",
      detail: "受管副本",
      sortOrder: 0,
      status: "indexed" as const,
      revision: 3,
      createdAt: 1,
      updatedAt: 1,
    };
    const refreshed = {
      ...indexed,
      status: "stale" as const,
      revision: 4,
      updatedAt: 2,
    };
    const listKnowledgeSources = vi
      .fn()
      .mockResolvedValueOnce([indexed])
      .mockResolvedValue([refreshed]);
    const refreshKnowledgeSource = vi.fn(async () => ({
      id: "refresh-1",
      sourceId: indexed.id,
    }));
    const business = {
      listKnowledgeSources,
      refreshKnowledgeSource,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.click(
      screen.getByRole("button", { name: "刷新 architecture.md" }),
    );

    await waitFor(() =>
      expect(refreshKnowledgeSource).toHaveBeenCalledWith({
        sourceId: "file-source-1",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(screen.getByText("待更新")).toBeInTheDocument();
  });

  it("loads knowledge sources from Main without writing them back", async () => {
    const api = createApi();
    const registerKnowledgeSource = vi.fn();
    const business = {
      listKnowledgeSources: vi.fn(async () => [
        {
          id: "remote-doc",
          workspaceId: "space-1",
          name: "远端文档",
          type: "document" as const,
          locator: "https://example.com/remote",
          detail: "example.com",
          sortOrder: 0,
          status: "indexed" as const,
          revision: 3,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      registerKnowledgeSource,
    } as unknown as RealmFlowApi["business"];

    render(
      <MemoryRouter initialEntries={["/spaces/xxx"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  business={business}
                  spaces={[
                    {
                      id: "space-1",
                      path: "/spaces/xxx",
                      label: "xxx 空间",
                      description: "测试空间",
                    },
                  ]}
                  requirementsBySpace={{ "/spaces/xxx": [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    expect(screen.getByText("远端文档")).toBeInTheDocument();
    expect(registerKnowledgeSource).not.toHaveBeenCalled();
  });

  it("does not expose a resource when Main rejects its save command", async () => {
    const api = createApi();
    const business = {
      listKnowledgeSources: vi.fn(async () => []),
      ingestLocalFiles: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    } as unknown as RealmFlowApi["business"];

    render(
      <MemoryRouter initialEntries={["/spaces/space-1"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  business={business}
                  spaces={[
                    {
                      id: "space-1",
                      path: "/spaces/space-1",
                      label: "Product Space",
                      description: "",
                      revision: 1,
                    },
                  ]}
                  requirementsBySpace={{ "/spaces/space-1": [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(business.listKnowledgeSources).toHaveBeenCalled(),
    );
    fireEvent.click(screen.getByRole("tab", { name: "空间知识库 (0)" }));
    fireEvent.click(screen.getByRole("button", { name: "上传本地文件" }));

    expect(
      await screen.findByRole("status", { name: "空间资源存储状态" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开 architecture.md" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "空间知识库 (0)" }),
    ).toBeInTheDocument();
  });

  it("keeps a resource visible when Main rejects its delete command", async () => {
    const api = createApi();
    const business = {
      listKnowledgeSources: vi.fn(async () => [
        {
          id: "resource-1",
          workspaceId: "space-1",
          name: "Product brief",
          type: "document" as const,
          locator: "https://example.com/brief",
          detail: "example.com",
          sortOrder: 0,
          status: "indexed" as const,
          revision: 2,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      removeKnowledgeSource: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    } as unknown as RealmFlowApi["business"];

    render(
      <MemoryRouter initialEntries={["/spaces/space-1"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  business={business}
                  spaces={[
                    {
                      id: "space-1",
                      path: "/spaces/space-1",
                      label: "Product Space",
                      description: "",
                      revision: 1,
                    },
                  ]}
                  requirementsBySpace={{ "/spaces/space-1": [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "删除 Product brief" }));

    expect(
      await screen.findByRole("status", { name: "空间资源存储状态" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Product brief")).toBeInTheDocument();
  });

  it("loads and displays the latest index job on demand", async () => {
    const api = createApi();
    const source = {
      id: "resource-1",
      workspaceId: "space-1",
      name: "Product brief",
      type: "document" as const,
      locator: "https://example.com/brief",
      detail: "example.com",
      sortOrder: 0,
      status: "indexed" as const,
      revision: 2,
      createdAt: 1,
      updatedAt: 2,
      index: {
        health: "failed" as const,
        profileId: "realmflow-vector-index-v1",
      },
    };
    const getKnowledgeIndex = vi.fn(async () => ({
      source,
      health: "failed" as const,
      job: {
        id: "job-1",
        status: "failed" as const,
        triggerSource: "scheduled" as const,
        createdAt: Date.UTC(2026, 9, 2, 1, 2),
        updatedAt: Date.UTC(2026, 9, 2, 1, 3),
        completedAt: Date.UTC(2026, 9, 2, 1, 3),
        errorCode: "qdrant_timeout",
      },
    }));
    const business = {
      listKnowledgeSources: vi.fn(async () => [source]),
      getKnowledgeIndex,
    } as unknown as RealmFlowApi["business"];

    render(
      <MemoryRouter initialEntries={["/spaces/space-1"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  business={business}
                  spaces={[
                    {
                      id: "space-1",
                      path: "/spaces/space-1",
                      label: "Product Space",
                      description: "",
                      revision: 1,
                    },
                  ]}
                  requirementsBySpace={{ "/spaces/space-1": [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "查看 Product brief 的最近索引任务",
      }),
    );

    expect(getKnowledgeIndex).toHaveBeenCalledWith({ sourceId: "resource-1" });
    expect(
      await screen.findByRole("dialog", {
        name: "Product brief 的最近索引任务",
      }),
    ).toBeVisible();
    expect(screen.getByText("定时任务")).toBeVisible();
    expect(screen.getByText("本地向量数据库响应超时")).toBeVisible();
  });

  it("shows failed source status and replaces it only after retry succeeds", async () => {
    const api = createApi();
    const source = {
      id: "resource-1",
      workspaceId: "space-1",
      name: "Architecture",
      type: "document" as const,
      locator: "https://example.com/architecture",
      detail: "example.com",
      sortOrder: 0,
      status: "failed" as const,
      errorCode: "source_unavailable" as const,
      errorMessage: "无法读取知识源",
      revision: 2,
      createdAt: 1,
      updatedAt: 1,
    };
    const refreshed = {
      ...source,
      status: "syncing" as const,
      errorCode: undefined,
      errorMessage: undefined,
      revision: 3,
    };
    const listKnowledgeSources = vi
      .fn()
      .mockResolvedValueOnce([source])
      .mockResolvedValue([refreshed]);
    const refreshKnowledgeSource = vi.fn(async () => ({
      id: "refresh-1",
      sourceId: source.id,
    }));
    const business = {
      listKnowledgeSources,
      refreshKnowledgeSource,
    } as unknown as RealmFlowApi["business"];

    render(
      <MemoryRouter initialEntries={["/spaces/space-1"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  business={business}
                  spaces={[
                    {
                      id: "space-1",
                      path: "/spaces/space-1",
                      label: "Product Space",
                      description: "",
                      revision: 1,
                    },
                  ]}
                  requirementsBySpace={{ "/spaces/space-1": [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (1)" }));
    expect(screen.getByText("同步失败")).toBeInTheDocument();
    expect(screen.getByText("无法读取知识源")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新 Architecture" }));

    await waitFor(() =>
      expect(refreshKnowledgeSource).toHaveBeenCalledWith({
        sourceId: "resource-1",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(screen.getByText("同步中")).toBeInTheDocument();
  });

  it("shows a non-blocking status when resource persistence is unavailable", async () => {
    const api = createApi();
    const business = {
      listKnowledgeSources: vi.fn(async () => []),
      ingestLocalFiles: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    } as unknown as RealmFlowApi["business"];

    render(
      <MemoryRouter initialEntries={["/spaces/xxx"]}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route
              path="/spaces/:spaceId"
              element={
                <SpaceDetailPage
                  api={api}
                  business={business}
                  spaces={[
                    {
                      id: "space-1",
                      path: "/spaces/xxx",
                      label: "xxx 空间",
                      description: "测试空间",
                    },
                  ]}
                  requirementsBySpace={{ "/spaces/xxx": [] }}
                />
              }
            />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "空间知识库 (0)" }));
    fireEvent.click(screen.getByRole("button", { name: "上传本地文件" }));
    expect(
      await screen.findByRole("status", { name: "空间资源存储状态" }),
    ).toHaveTextContent("空间资源的更改暂时无法保存");
    expect(
      screen.getByRole("status", { name: "空间资源存储状态" }),
    ).toHaveClass("ui-inline-alert", "ui-inline-alert--warning");
    expect(screen.queryByRole("tab", { name: "概览" })).not.toBeInTheDocument();
  });

  it("lists and edits active Knowledge Notes from the space knowledge page", async () => {
    const api = createApi();
    const note = knowledgeNote();
    const editKnowledgeNote = vi.fn().mockResolvedValue({
      ...note,
      title: "Storage decision updated",
      content: "Use SQLite with WAL.",
      version: 2,
      revision: 2,
      updatedAt: 2,
    });
    const business = {
      listKnowledgeSources: vi.fn().mockResolvedValue([]),
      listKnowledgeNotes: vi.fn().mockResolvedValue([note]),
      editKnowledgeNote,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (0)" }));
    const notes = await screen.findByRole("region", { name: "知识笔记" });
    expect(within(notes).getByText("Storage decision")).toBeInTheDocument();
    expect(within(notes).getByText("决策")).toBeInTheDocument();
    fireEvent.click(
      within(notes).getByRole("button", { name: "编辑 Storage decision" }),
    );
    const dialog = screen.getByRole("dialog", { name: "编辑知识笔记" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "标题" }), {
      target: { value: "Storage decision updated" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "正文" }), {
      target: { value: "Use SQLite with WAL." },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存修改" }),
    );

    await waitFor(() => {
      expect(editKnowledgeNote).toHaveBeenCalledWith({
        noteId: "note-1",
        versionId: expect.any(String),
        expectedRevision: 1,
        title: "Storage decision updated",
        content: "Use SQLite with WAL.",
      });
    });
    expect(
      await screen.findByText("Storage decision updated"),
    ).toBeInTheDocument();
  });

  it("keeps a Knowledge Note visible when archive fails", async () => {
    const api = createApi();
    const note = knowledgeNote();
    const archiveKnowledgeNote = vi
      .fn()
      .mockRejectedValue(new Error("Knowledge Note revision conflict"));
    const business = {
      listKnowledgeSources: vi.fn().mockResolvedValue([]),
      listKnowledgeNotes: vi.fn().mockResolvedValue([note]),
      archiveKnowledgeNote,
    } as unknown as RealmFlowApi["business"];
    renderSpaceResources(api, business);

    fireEvent.click(await screen.findByRole("tab", { name: "空间知识库 (0)" }));
    const notes = await screen.findByRole("region", { name: "知识笔记" });
    fireEvent.click(
      within(notes).getByRole("button", { name: "归档 Storage decision" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "归档知识笔记" })).getByRole(
        "button",
        { name: "确认归档" },
      ),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("知识笔记归档失败，请重试");
    expect(alert).not.toHaveTextContent("Knowledge Note revision conflict");
    expect(screen.getByText("Storage decision")).toBeInTheDocument();
    expect(archiveKnowledgeNote).toHaveBeenCalledWith({
      noteId: "note-1",
      expectedRevision: 1,
    });
  });
});

function knowledgeNote() {
  return {
    id: "note-1",
    workspaceId: "space-1",
    sessionId: "conversation-1",
    kind: "decision" as const,
    title: "Storage decision",
    content: "Use SQLite.",
    sourceMessageIds: ["message-1"],
    version: 1,
    status: "active" as const,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function onlineDocumentSource() {
  return {
    id: "source-online",
    workspaceId: "space-1",
    name: "Product brief",
    type: "document" as const,
    locator: "connector:connector-docs/documents/brief",
    detail: "connector-docs",
    sortOrder: 0,
    status: "indexed" as const,
    revision: 3,
    createdAt: 1,
    updatedAt: 1,
  };
}

function repositorySource() {
  return {
    id: "repository-1",
    workspaceId: "space-1",
    name: "RealmFlow repository",
    type: "repository" as const,
    locator: "local-repository:repository-1",
    detail: "1 file · 8 B",
    sortOrder: 0,
    status: "indexed" as const,
    revision: 3,
    createdAt: 1,
    updatedAt: 2,
  };
}

function repositorySnapshotView() {
  return {
    repository: {
      sourceId: "repository-1",
      workspaceId: "space-1",
      mode: "local" as const,
      locator: "local-repository:repository-1",
      selectedBranch: "main",
      currentVersion: 1,
      revisionLabel: "main@abc123",
      fileCount: 1,
      totalBytes: 8,
      lastScannedAt: 2,
      createdAt: 1,
      updatedAt: 2,
    },
    snapshot: {
      id: "snapshot-1",
      sourceId: "repository-1",
      version: 1,
      branch: "main",
      revisionLabel: "main@abc123",
      manifestChecksum: "manifest-checksum",
      fileCount: 1,
      totalBytes: 8,
      files: [
        {
          relativePath: "README.md",
          contentChecksum: "content-checksum",
          byteSize: 8,
          indexStatus: {
            status: "indexed" as const,
            generationId: "generation-1",
            updatedAt: 2,
          },
        },
      ],
      scannedAt: 2,
    },
  };
}

function repositorySyncResult(overrides?: {
  source?: ReturnType<typeof repositorySource>;
}) {
  return {
    source: overrides?.source ?? repositorySource(),
    ...repositorySnapshotView(),
  };
}

function renderSpaceResources(
  api: RealmFlowApi,
  business: RealmFlowApi["business"],
): void {
  render(
    <MemoryRouter initialEntries={["/spaces/xxx"]}>
      <WorkbenchProvider api={api}>
        <Routes>
          <Route
            path="/spaces/:spaceId"
            element={
              <SpaceDetailPage
                api={api}
                business={business}
                spaces={[
                  {
                    id: "space-1",
                    path: "/spaces/xxx",
                    label: "xxx 空间",
                    description: "测试空间",
                  },
                ]}
                requirementsBySpace={{ "/spaces/xxx": [] }}
              />
            }
          />
        </Routes>
      </WorkbenchProvider>
    </MemoryRouter>,
  );
}

function renderSpaceDetailHeader(
  spaceName: string,
  onCreateRequirement?: (
    spacePath: string,
    title: string,
    templateVersionId?: string,
  ) => void,
  business?: BusinessApi,
  initialEntry = "/spaces/space-1",
): ReturnType<typeof testingRender> {
  const api = createApi();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WorkbenchProvider api={api}>
        <Routes>
          <Route
            path="/spaces/:spaceId"
            element={
              <SpaceDetailPage
                api={api}
                business={business}
                spaces={[
                  {
                    id: "space-1",
                    path: "/spaces/space-1",
                    label: spaceName,
                    description: "",
                  },
                ]}
                requirementsBySpace={{ "/spaces/space-1": [] }}
                onCreateRequirement={onCreateRequirement}
              />
            }
          />
        </Routes>
      </WorkbenchProvider>
    </MemoryRouter>,
  );
}

function renderSpaceConversationEntry(
  onCreateSession: (spacePath: string, prompt: string) => Promise<void>,
): void {
  const api = createApi();
  render(
    <MemoryRouter initialEntries={["/spaces/space-1"]}>
      <WorkbenchProvider api={api}>
        <Routes>
          <Route
            path="/spaces/:spaceId"
            element={
              <SpaceDetailPage
                api={api}
                spaces={[
                  {
                    id: "space-1",
                    path: "/spaces/space-1",
                    label: "Product Space",
                    description: "",
                    revision: 1,
                  },
                ]}
                requirementsBySpace={{ "/spaces/space-1": [] }}
                onCreateSession={onCreateSession}
              />
            }
          />
        </Routes>
      </WorkbenchProvider>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
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
