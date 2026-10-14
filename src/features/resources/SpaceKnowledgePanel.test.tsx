import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { act } from "react";
import type { BusinessApi } from "../../../shared/business";
import type { RealmFlowApi } from "../../../shared/types";
import type { SpaceResource } from "../../domain/space-resource";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { SpaceKnowledgePanel } from "./SpaceKnowledgePanel";

const workbench = vi.hoisted(() => ({
  openWorkspaceSelection: vi.fn(),
  openUrl: vi.fn(async () => undefined),
}));

vi.mock("../workbench/WorkbenchProvider", () => ({
  useWorkbench: () => workbench,
}));

const persistenceMessage =
  "当前更改暂时无法保存，请检查本地存储权限或可用空间。";

const documentResource: SpaceResource = {
  id: "document-1",
  name: "Design doc",
  type: "document",
  locator: "https://user:password@example.test/design",
  detail: "飞书文档",
  status: "indexed",
  revision: 2,
  updatedAt: 2,
  refresh: {
    enabled: true,
    preset: "manual",
    revision: 3,
    nextDueAt: 0,
    lastCheckedAt: null,
    lastChangedAt: null,
  },
  index: {
    health: "ready",
    profileId: "realmflow-vector-index-v1",
    generationId: "generation-1",
    sourceVersion: "document:v2",
    indexedAt: 120,
  },
};

const repositoryResource: SpaceResource = {
  ...documentResource,
  id: "repository-1",
  name: "developers-server",
  type: "repository",
  locator: "local-repository:repository-1",
  detail: "本地仓库",
  repository: {
    sourceId: "repository-1",
    workspaceId: "space-1",
    mode: "local",
    locator: "local-repository:repository-1",
    selectedBranch: "main",
    currentVersion: 1,
    revisionLabel: "main@abc123",
    fileCount: 4,
    totalBytes: 4120,
    lastScannedAt: 2,
    createdAt: 1,
    updatedAt: 2,
  },
};

const remoteRepositoryResource: SpaceResource = {
  ...repositoryResource,
  id: "repository-remote-1",
  name: "remote-server",
  locator: "connector:github/org/remote-server",
  repository: {
    ...repositoryResource.repository!,
    sourceId: "repository-remote-1",
    mode: "remote",
    locator: "connector:github/org/remote-server",
    selectedBranch: "release",
    revisionLabel: "release@def456",
  },
};

const fileResource: SpaceResource = {
  ...documentResource,
  id: "file-1",
  name: "architecture.md",
  type: "file",
  locator: "managed:.realmflow/knowledge/files/file-1/architecture.md",
  detail: "托管副本",
};

const referencedFileResource: SpaceResource = {
  ...fileResource,
  id: "file-2",
  name: "external-brief.md",
  locator: "external:file-2",
  detail: "外部引用",
};

describe("SpaceKnowledgePanel", () => {
  beforeEach(() => {
    workbench.openWorkspaceSelection.mockClear();
    workbench.openUrl.mockClear();
  });

  it("uses shared controls and empty state primitives", () => {
    renderPanel(
      {
        getKnowledgeRuntimeHealth: vi.fn().mockResolvedValue({
          status: "ready",
          components: {
            vectorStore: "ready",
            embeddings: "ready",
          },
        }),
      },
      vi.fn(),
      [],
    );

    const controls = screen.getByRole("toolbar", { name: "空间资源" });
    expect(controls).toHaveClass(
      "ui-toolbar",
    );
    expect(
      within(controls).getByRole("button", { name: "上传本地文件" }),
    ).toHaveClass(
      "ui-button",
      "ui-button--default",
      "ui-button--primary",
    );
    expect(
      within(controls).getByRole("button", { name: "引用本地文件" }),
    ).toBeInTheDocument();
    expect(
      within(controls).getByRole("button", { name: "添加在线文档" }),
    ).toBeInTheDocument();
    expect(
      within(controls).getByRole("button", { name: "关联代码仓库" }),
    ).toBeInTheDocument();
    expect(
      within(controls).getByRole("searchbox", { name: "搜索空间资源" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("集中管理当前空间使用的本地文件、在线文档和代码仓库。")).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "本地知识运行时" })).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "资源类型筛选" })).not.toBeInTheDocument();
    expect(
      screen.getByText("暂无匹配的空间资源").closest(".ui-empty-state"),
    ).toBeTruthy();
  });

  it("publishes a safe toast when opening a local file from details fails", async () => {
    const sensitiveError =
      "open /Users/alice/private/architecture.md failed";
    renderPanel(
      {
        openLocalFileSource: vi
        .fn()
        .mockRejectedValue(new Error(sensitiveError)),
      },
      vi.fn(),
      [fileResource],
    );

    fireEvent.click(screen.getByRole("button", { name: "打开 architecture.md" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "在工作区打开 architecture.md",
      }),
    );

    expect(await screen.findByText(persistenceMessage)).toBeInTheDocument();
    expect(screen.queryByText(sensitiveError)).not.toBeInTheDocument();
  });

  it("publishes a localized toast when checking a resource fails", async () => {
    renderPanel({
      refreshKnowledgeSource: vi
        .fn()
        .mockRejectedValue(new Error("sync /Users/alice/private failed")),
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "检查更新并索引 Design doc",
      }),
    );

    expect(
      await screen.findByText("在线文档同步失败，请检查连接器和文档路径"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("sync /Users/alice/private failed"),
    ).not.toBeInTheDocument();
  });

  it.each([fileResource, documentResource, repositoryResource])(
    "checks $type updates and indexes through the merged database action",
    async (resource) => {
      const refreshKnowledgeSource = vi.fn().mockResolvedValue(undefined);
      const buildKnowledgeIndex = vi.fn().mockResolvedValue(undefined);
      renderPanel(
        {
          refreshKnowledgeSource,
          buildKnowledgeIndex,
          listKnowledgeSources: vi.fn().mockResolvedValue([]),
        },
        vi.fn(),
        [resource],
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: `检查更新并索引 ${resource.name}`,
        }),
      );

      await vi.waitFor(() => {
        expect(refreshKnowledgeSource).toHaveBeenCalledWith({
          sourceId: resource.id,
          idempotencyKey: expect.stringMatching(/^refresh-/),
        });
      });
      expect(buildKnowledgeIndex).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: `刷新 ${resource.name}` }),
      ).not.toBeInTheDocument();
    },
  );

  it("publishes a safe toast when changing the refresh policy fails", async () => {
    renderPanel({
      setKnowledgeRefreshPolicy: vi
        .fn()
        .mockRejectedValue(new Error("database at /private/data.db failed")),
    });

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Design doc 的自动刷新周期",
      }),
      { target: { value: "5m" } },
    );

    expect(await screen.findByText(persistenceMessage)).toBeInTheDocument();
    expect(
      screen.queryByText("database at /private/data.db failed"),
    ).not.toBeInTheDocument();
  });

  it("publishes a safe toast when deleting a resource fails", async () => {
    renderPanel({
      removeKnowledgeSource: vi
        .fn()
        .mockRejectedValue(new Error("delete token=secret failed")),
    });

    fireEvent.click(screen.getByRole("button", { name: "删除 Design doc" }));

    expect(await screen.findByText(persistenceMessage)).toBeInTheDocument();
    expect(
      screen.queryByText("delete token=secret failed"),
    ).not.toBeInTheDocument();
  });

  it("omits linked information and standalone index job actions from the resource table", () => {
    renderPanel({}, vi.fn(), [documentResource]);

    const table = screen.getByRole("table");
    expect(
      within(table).queryByRole("columnheader", { name: "关联信息" }),
    ).not.toBeInTheDocument();
    expect(within(table).queryByText("飞书文档")).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("button", {
        name: "查看 Design doc 的最近索引任务",
      }),
    ).not.toBeInTheDocument();
  });

  it("paginates more than 100 knowledge resources", () => {
    renderPanel(
      {},
      vi.fn(),
      Array.from({ length: 150 }, (_, index) => ({
        ...documentResource,
        id: `document-${index}`,
        name: `Document ${index + 1}`,
      })),
    );

    expect(document.querySelectorAll(".space-resource-table [role='row']")).toHaveLength(
      101,
    );
    expect(screen.getByText("1-100 / 150")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(document.querySelectorAll(".space-resource-table [role='row']")).toHaveLength(
      51,
    );
  });

  it("restores resource filters, search, and pagination from the URL", () => {
    renderPanel(
      {},
      vi.fn(),
      Array.from({ length: 150 }, (_, index) => ({
        ...documentResource,
        id: `document-${index}`,
        name: `Design document ${index + 1}`,
      })),
      "/spaces/space-1?resourceType=document&resourceQuery=design&resourcePage=2",
    );

    const filterButton = screen.getByRole("button", {
      name: "按类型筛选资源",
    });
    expect(filterButton).toHaveClass("repository-header-filter", "active");
    fireEvent.click(filterButton);
    expect(
      within(
        screen.getByRole("menu", { name: "按类型筛选资源" }),
      ).getByRole("menuitemradio", { name: "在线文档" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("searchbox", { name: "搜索空间资源" })).toHaveValue(
      "design",
    );
    expect(screen.getByText("101-150 / 150")).toBeInTheDocument();
  });

  it("filters resource rows by the type selector in the table header", () => {
    renderPanel(
      {},
      vi.fn(),
      [
        fileResource,
        referencedFileResource,
        documentResource,
        repositoryResource,
        remoteRepositoryResource,
      ],
    );

    expect(screen.getByText("本地文件")).toBeInTheDocument();
    expect(screen.getByText("本地引用")).toBeInTheDocument();
    expect(screen.getByText("在线文档")).toBeInTheDocument();
    expect(screen.getByText("代码仓库")).toBeInTheDocument();
    expect(screen.getByText("远程仓库")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "索引状态" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "检查与索引" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "按类型筛选资源" }),
    );
    fireEvent.click(
      within(
        screen.getByRole("menu", { name: "按类型筛选资源" }),
      ).getByRole("menuitemradio", { name: "本地引用" }),
    );

    expect(screen.getByText("external-brief.md")).toBeInTheDocument();
    expect(screen.queryByText("architecture.md")).not.toBeInTheDocument();
    expect(screen.queryByText("Design doc")).not.toBeInTheDocument();
    expect(screen.queryByText("developers-server")).not.toBeInTheDocument();
    expect(screen.queryByText("remote-server")).not.toBeInTheDocument();
  });

  it("filters resource rows by the index status selector in the table header", () => {
    const missingFile = {
      ...fileResource,
      id: "file-missing",
      name: "Missing file",
      index: undefined,
    } satisfies SpaceResource;
    const buildingDocument = {
      ...documentResource,
      id: "document-building",
      name: "Building document",
      index: {
        ...documentResource.index!,
        health: "building" as const,
      },
    } satisfies SpaceResource;
    const failedRepository = {
      ...repositoryResource,
      id: "repository-failed",
      name: "failed-server",
      index: {
        ...documentResource.index!,
        health: "failed" as const,
      },
    } satisfies SpaceResource;
    renderPanel(
      {},
      vi.fn(),
      [missingFile, buildingDocument, documentResource, failedRepository],
    );

    fireEvent.click(
      screen.getByRole("button", { name: "按索引状态筛选资源" }),
    );
    fireEvent.click(
      within(
        screen.getByRole("menu", { name: "按索引状态筛选资源" }),
      ).getByRole("menuitemradio", { name: "索引失败" }),
    );

    expect(screen.getByText("failed-server")).toBeInTheDocument();
    expect(screen.queryByText("Missing file")).not.toBeInTheDocument();
    expect(screen.queryByText("Building document")).not.toBeInTheDocument();
    expect(screen.queryByText("Design doc")).not.toBeInTheDocument();
  });

  it("restores the index status resource filter from the URL", () => {
    renderPanel(
      {},
      vi.fn(),
      [
        {
          ...documentResource,
          id: "document-building",
          name: "Building document",
          index: {
            ...documentResource.index!,
            health: "building" as const,
          },
        },
        repositoryResource,
      ],
      "/spaces/space-1?resourceIndex=building",
    );

    const filterButton = screen.getByRole("button", {
      name: "按索引状态筛选资源",
    });
    expect(filterButton).toHaveClass("repository-header-filter", "active");
    fireEvent.click(filterButton);
    expect(
      within(
        screen.getByRole("menu", { name: "按索引状态筛选资源" }),
      ).getByRole("menuitemradio", { name: "索引构建中" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Building document")).toBeInTheDocument();
    expect(screen.queryByText("developers-server")).not.toBeInTheDocument();
  });

  it("shows repository file index status counts from the row index status hovercard", async () => {
    const getRepositorySnapshot = vi.fn().mockResolvedValue({
      repository: repositoryResource.repository,
      snapshot: {
        id: "snapshot-1",
        sourceId: "repository-1",
        version: 1,
        revisionLabel: "main@abc123",
        manifestChecksum: "manifest-checksum",
        fileCount: 4,
        totalBytes: 400,
        files: [
          {
            relativePath: "README.md",
            contentChecksum: "readme-checksum",
            byteSize: 100,
            indexStatus: { status: "indexed", updatedAt: 2 },
          },
          {
            relativePath: "src/App.tsx",
            contentChecksum: "app-checksum",
            byteSize: 100,
            indexStatus: { status: "indexed", updatedAt: 2 },
          },
          {
            relativePath: "src/index.ts",
            contentChecksum: "index-checksum",
            byteSize: 100,
            indexStatus: { status: "indexed", updatedAt: 2 },
          },
          {
            relativePath: "src/failing.ts",
            contentChecksum: "failing-checksum",
            byteSize: 100,
            indexStatus: { status: "failed", updatedAt: 2 },
          },
          {
            relativePath: "docs/todo.md",
            contentChecksum: "todo-checksum",
            byteSize: 100,
          },
        ],
        skippedFiles: [
          {
            relativePath: "dist/bundle.js",
            reason: "file_too_large",
            byteSize: 5_242_881,
          },
        ],
        scannedAt: 2,
      },
    });
    renderPanel({ getRepositorySnapshot }, vi.fn(), [repositoryResource]);

    await act(async () => {
      fireEvent.mouseEnter(screen.getByText("索引就绪"));
      await Promise.resolve();
    });

    await vi.waitFor(() =>
      expect(getRepositorySnapshot).toHaveBeenCalledWith({
        sourceId: "repository-1",
      }),
    );
    const tooltip = await screen.findByRole("tooltip", {
      name: "仓库内索引状态",
    });
    expect(tooltip.querySelector('[data-status="indexed"]')).toHaveTextContent(
      "索引成功3 个文件",
    );
    expect(tooltip.querySelector('[data-status="failed"]')).toHaveTextContent(
      "索引失败1 个文件",
    );
    expect(tooltip.querySelector('[data-status="pending"]')).toHaveTextContent(
      "等待索引1 个文件",
    );
    expect(tooltip.querySelector('[data-status="skipped"]')).toHaveTextContent(
      "已跳过1 个文件",
    );
  });

  it("matches resource search against display type labels", () => {
    renderPanel(
      {},
      vi.fn(),
      [
        fileResource,
        referencedFileResource,
        documentResource,
        repositoryResource,
      ],
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索空间资源" }), {
      target: { value: "本地引用" },
    });

    expect(screen.getByText("external-brief.md")).toBeInTheDocument();
    expect(screen.queryByText("architecture.md")).not.toBeInTheDocument();
    expect(screen.queryByText("Design doc")).not.toBeInTheDocument();
    expect(screen.queryByText("developers-server")).not.toBeInTheDocument();
  });

  it("opens local file details before opening the file in the workbench", async () => {
    const openLocalFileSource = vi.fn().mockResolvedValue({
      binding: { requirementId: "selection-1", rootName: "docs" },
      files: [{ name: "architecture.md", path: "/docs/architecture.md" }],
    });
    renderPanel(
      { openLocalFileSource },
      vi.fn(),
      [
        {
          ...fileResource,
          refresh: {
            ...documentResource.refresh!,
            lastCheckedAt: 100,
            lastChangedAt: 90,
          },
          index: {
            health: "ready",
            profileId: "realmflow-vector-index-v1",
            indexedAt: 80,
          },
        },
      ],
    );

    fireEvent.click(screen.getByRole("button", { name: "打开 architecture.md" }));

    const dialog = await screen.findByRole("dialog", {
      name: "architecture.md",
    });
    expect(within(dialog).getByText("资源状态")).toBeInTheDocument();
    expect(within(dialog).getByText("已索引")).toBeInTheDocument();
    expect(within(dialog).getByText("索引可用性")).toBeInTheDocument();
    expect(within(dialog).getByText("索引就绪")).toBeInTheDocument();
    expect(dialog.querySelector(".lucide-file-code2")).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "在工作区打开 architecture.md",
      }),
    );

    await vi.waitFor(() =>
      expect(openLocalFileSource).toHaveBeenCalledWith({
        sourceId: "file-1",
      }),
    );
    expect(workbench.openWorkspaceSelection).toHaveBeenCalledWith({
      binding: { requirementId: "selection-1", rootName: "docs" },
      files: [{ name: "architecture.md", path: "/docs/architecture.md" }],
    });
  });

  it("loads the latest index job inside local file details", async () => {
    const getKnowledgeIndex = vi.fn().mockResolvedValue({
      source: {
        id: "file-1",
        workspaceId: "space-1",
        name: "architecture.md",
        type: "file",
        locator: "managed:.realmflow/knowledge/files/file-1/architecture.md",
        detail: "托管副本",
        sortOrder: 0,
        status: "indexed",
        revision: 2,
        createdAt: 1,
        updatedAt: 2,
      },
      health: "failed",
      job: {
        id: "job-1",
        status: "failed",
        triggerSource: "manual",
        createdAt: Date.UTC(2026, 9, 2, 1, 2),
        updatedAt: Date.UTC(2026, 9, 2, 1, 3),
        completedAt: Date.UTC(2026, 9, 2, 1, 3),
        errorCode: "qdrant_timeout",
      },
    });
    renderPanel({ getKnowledgeIndex }, vi.fn(), [fileResource]);

    fireEvent.click(screen.getByRole("button", { name: "打开 architecture.md" }));

    const dialog = await screen.findByRole("dialog", {
      name: "architecture.md",
    });
    await vi.waitFor(() =>
      expect(getKnowledgeIndex).toHaveBeenCalledWith({
        sourceId: "file-1",
      }),
    );
    expect(
      await within(dialog).findByRole("heading", {
        name: "architecture.md 的最近索引任务",
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("失败")).toBeInTheDocument();
    expect(within(dialog).getByText("手动触发")).toBeInTheDocument();
    expect(
      within(dialog).getByText("本地向量数据库响应超时"),
    ).toBeInTheDocument();
  });

  it("shows the safe extraction reason in resource details", async () => {
    renderPanel({}, vi.fn(), [
      {
        ...fileResource,
        index: {
          health: "failed",
          profileId: "realmflow-vector-index-v1",
          errorCode: "extraction_encrypted",
        },
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "打开 architecture.md" }));

    const dialog = await screen.findByRole("dialog", {
      name: "architecture.md",
    });
    expect(within(dialog).getByText("索引可用性")).toBeInTheDocument();
    expect(within(dialog).getByText("索引失败")).toBeInTheDocument();
    expect(within(dialog).getByText("错误")).toBeInTheDocument();
    expect(within(dialog).getByText("文件已加密")).toBeInTheDocument();
  });

  it("opens online document details and sends the document URL to the workbench", async () => {
    renderPanel({}, vi.fn(), [documentResource]);

    fireEvent.click(screen.getByRole("button", { name: "打开 Design doc" }));

    const dialog = await screen.findByRole("dialog", { name: "Design doc" });
    expect(
      within(dialog).getByRole("button", {
        name: "在工作区打开 Design doc",
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("索引就绪")).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "在工作区打开 Design doc",
      }),
    );

    expect(workbench.openUrl).toHaveBeenCalledWith(documentResource.locator);
  });
});

function renderPanel(
  overrides: Partial<BusinessApi>,
  onPersistenceUnavailable = vi.fn(),
  resources: SpaceResource[] = [documentResource],
  initialEntry = "/spaces/space-1",
): void {
  const business = {
    ...overrides,
  } as unknown as BusinessApi;

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocalizationProvider>
        <ToastProvider>
          <SpaceKnowledgePanel
            spaceId="space-1"
            api={{} as RealmFlowApi}
            business={business}
            resources={resources}
            setResources={vi.fn()}
            onPersistenceUnavailable={onPersistenceUnavailable}
          />
        </ToastProvider>
      </LocalizationProvider>
    </MemoryRouter>,
  );
}
