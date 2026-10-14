import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import type {
  BusinessApi,
  KnowledgeIndexViewDto,
  RepositorySnapshotViewDto,
} from "../../../shared/business";
import type { SpaceResource } from "../../domain/space-resource";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { RepositorySnapshotDialog } from "./RepositorySnapshotDialog";

describe("RepositorySnapshotDialog", () => {
  it("keeps the long repository file list inside the shared dialog scroll body", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", {
      name: "RealmFlow repository",
    });
    const scrollBody = dialog.querySelector('[data-dialog-scroll="true"]');

    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--workspace");
    expect(screen.getByTestId("ui-dialog-backdrop")).not.toHaveClass(
      "ui-dialog-backdrop--workspace",
    );
    expect(scrollBody).toHaveClass("ui-dialog__body");
    expect(scrollBody).toContainElement(screen.getByRole("table"));
    expect(dialog.querySelectorAll('[data-dialog-scroll="true"]')).toHaveLength(
      1,
    );
  });

  it("combines the file-name search with the index status filter", async () => {
    renderDialog();

    const metadata = document.querySelector(".repository-snapshot-meta");
    expect(metadata).not.toBeNull();
    expect(
      within(metadata as HTMLElement).getByText("4 个文件"),
    ).toBeInTheDocument();
    expect(
      within(metadata as HTMLElement).getByText("4.0 KB"),
    ).toBeInTheDocument();

    const headers = await screen.findAllByRole("columnheader");
    const search = within(headers[0]!).getByRole("searchbox", {
      name: "搜索文件名",
    });
    const statusFilter = within(headers[2]!).getByRole("button", {
      name: "按索引状态过滤",
    });

    fireEvent.click(statusFilter);
    const statusMenu = screen.getByRole("menu", {
      name: "按索引状态过滤",
    });
    expect(statusMenu.parentElement).toBe(document.body);
    fireEvent.click(
      within(statusMenu).getByRole("menuitemradio", { name: "索引失败" }),
    );
    expect(visibleFilePaths()).toEqual(["src/large.ts", "test/large.ts"]);
    expect(
      within(metadata as HTMLElement).getByText("2 个文件"),
    ).toBeInTheDocument();

    fireEvent.change(search, {
      target: { value: "src/" },
    });
    expect(visibleFilePaths()).toEqual(["src/large.ts"]);
    expect(
      within(metadata as HTMLElement).getByText("1 个文件"),
    ).toBeInTheDocument();
    expect(
      within(metadata as HTMLElement).getByText("2.0 KB"),
    ).toBeInTheDocument();

    fireEvent.click(statusFilter);
    fireEvent.click(
      within(
        screen.getByRole("menu", { name: "按索引状态过滤" }),
      ).getByRole("menuitemradio", { name: "正在索引" }),
    );
    expect(screen.getByText("没有匹配的文件")).toBeInTheDocument();
    expect(
      within(metadata as HTMLElement).getByText("0 个文件"),
    ).toBeInTheDocument();
    expect(
      within(metadata as HTMLElement).getByText("0 B"),
    ).toBeInTheDocument();
  });

  it("sorts files by byte size in both directions with a stable path tie-break", async () => {
    renderDialog();

    const headers = await screen.findAllByRole("columnheader");
    const sort = within(headers[1]!).getByRole("button", {
      name: "文件大小当前从大到小，切换为从小到大",
    });
    fireEvent.click(sort);
    expect(visibleFilePaths()).toEqual([
      "README.md",
      "src/pending.ts",
      "src/large.ts",
      "test/large.ts",
    ]);

    fireEvent.click(
      within(headers[1]!).getByRole("button", {
        name: "文件大小当前从小到大，切换为从大到小",
      }),
    );
    expect(visibleFilePaths()).toEqual([
      "src/large.ts",
      "test/large.ts",
      "src/pending.ts",
      "README.md",
    ]);
  });

  it("publishes a safe toast when switching branches fails", async () => {
    const sensitiveError =
      "checkout failed in /Users/alice/private-repository";
    renderDialog({
      updateRepositoryBranch: vi
        .fn()
        .mockRejectedValue(new Error(sensitiveError)),
    });

    fireEvent.change(
      await screen.findByRole("combobox", { name: "分支" }),
      { target: { value: "feature" } },
    );

    expect(
      await screen.findByText("切换分支失败，请刷新后重试"),
    ).toBeInTheDocument();
    expect(screen.queryByText(sensitiveError)).not.toBeInTheDocument();
    expect(
      document.querySelector(".repository-snapshot-meta + p[role='alert']"),
    ).toBeNull();
  });

  it("publishes a safe toast when retrying a failed file fails", async () => {
    const sensitiveError =
      "retry src/large.ts failed with credential=secret";
    renderDialog({
      retryRepositoryFileIndex: vi
        .fn()
        .mockRejectedValue(new Error(sensitiveError)),
    });

    fireEvent.click(
      await screen.findAllByRole("button", {
        name: "重新索引此文件",
      }).then((buttons) => buttons[0]!),
    );

    expect(
      await screen.findByText("文件重新索引失败，请重试"),
    ).toBeInTheDocument();
    expect(screen.queryByText(sensitiveError)).not.toBeInTheDocument();
    expect(
      document.querySelector(".repository-snapshot-meta + p[role='alert']"),
    ).toBeNull();
  });

  it("paginates 1,000 repository files before creating row DOM", async () => {
    const view = repositorySnapshotView();
    view.snapshot!.files = Array.from({ length: 1_000 }, (_, index) => ({
      relativePath: `src/file-${String(index).padStart(4, "0")}.ts`,
      contentChecksum: `checksum-${index}`,
      byteSize: index + 1,
      indexStatus: { status: "indexed" as const, updatedAt: 2 },
    }));
    view.snapshot!.fileCount = 1_000;
    view.snapshot!.totalBytes = 500_500;

    renderDialog({}, view);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(101);
    expect(screen.getByText("1-100 / 1000")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "下一页" }),
    );

    expect(
      within(table).getByText("src/file-0899.ts"),
    ).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(101);
    expect(screen.getByText("101-200 / 1000")).toBeInTheDocument();
  });

  it("treats skipped repository files as an index status filter", async () => {
    const view = repositorySnapshotView() as RepositorySnapshotViewDto & {
      snapshot: NonNullable<RepositorySnapshotViewDto["snapshot"]> & {
        skippedFiles: Array<{
          relativePath: string;
          reason: string;
          byteSize?: number;
        }>;
      };
    };
    view.snapshot.skippedFiles = [
      {
        relativePath: "large.txt",
        reason: "file_too_large",
        byteSize: 5 * 1024 * 1024 + 1,
      },
      {
        relativePath: "src/generated.ts",
        reason: "repository_text_limit_exceeded",
        byteSize: 1024,
      },
    ];

    renderDialog({}, view);

    const headers = await screen.findAllByRole("columnheader");
    const statusFilter = within(headers[2]!).getByRole("button", {
      name: "按索引状态过滤",
    });
    fireEvent.click(statusFilter);
    const statusMenu = screen.getByRole("menu", {
      name: "按索引状态过滤",
    });
    expect(statusMenu.parentElement).toBe(document.body);
    fireEvent.click(
      within(statusMenu).getByRole("menuitemradio", { name: "已跳过" }),
    );

    expect(visibleFilePaths()).toEqual(["large.txt", "src/generated.ts"]);
    expect(screen.queryByText("已跳过文件")).not.toBeInTheDocument();
    expect(screen.getByText("large.txt")).toBeInTheDocument();
    expect(screen.getByText("单文件超过 5 MB")).toBeInTheDocument();
    expect(screen.getByText("src/generated.ts")).toBeInTheDocument();
    expect(screen.getByText("仓库文本预算已用完")).toBeInTheDocument();
  });

  it("refreshes active repository index states while the dialog stays open", async () => {
    vi.useFakeTimers();
    try {
      const initial = repositorySnapshotView();
      initial.snapshot!.files = initial.snapshot!.files.map((file) => ({
        ...file,
        indexStatus: { status: "indexing" as const, updatedAt: 2 },
      }));
      const refreshed = repositorySnapshotView();
      refreshed.snapshot!.files = refreshed.snapshot!.files.map(
        (file, index) => ({
          ...file,
          indexStatus:
            index === 0
              ? {
                  status: "indexed" as const,
                  generationId: "generation-2",
                  updatedAt: 3,
                }
              : { status: "indexing" as const, updatedAt: 3 },
        }),
      );
      const getRepositorySnapshot = vi.fn().mockResolvedValue(refreshed);

      renderDialog({ getRepositorySnapshot }, initial);

      expect(screen.queryByLabelText("索引成功")).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(getRepositorySnapshot).toHaveBeenCalledWith({
        sourceId: "repository-1",
      });
      expect(screen.getByLabelText("索引成功")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes failed files while the latest repository job is active", async () => {
    vi.useFakeTimers();
    try {
      const initial = repositorySnapshotView();
      initial.indexJobStatus = "running";
      initial.snapshot!.files = initial.snapshot!.files.map((file) => ({
        ...file,
        indexStatus: { status: "failed" as const, updatedAt: 2 },
      }));
      const refreshed = repositorySnapshotView();
      refreshed.indexJobStatus = "completed";
      refreshed.snapshot!.files = refreshed.snapshot!.files.map((file) => ({
        ...file,
        indexStatus: {
          status: "indexed" as const,
          generationId: "generation-2",
          updatedAt: 3,
        },
      }));
      const getRepositorySnapshot = vi.fn().mockResolvedValue(refreshed);

      renderDialog({ getRepositorySnapshot }, initial);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(getRepositorySnapshot).toHaveBeenCalledTimes(1);
      expect(screen.getAllByLabelText("索引成功")).toHaveLength(4);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(getRepositorySnapshot).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes refresh and index information when opened from the resource row", () => {
    renderDialog(
      {},
      repositorySnapshotView(),
      {
        id: "repository-1",
        name: "RealmFlow repository",
        type: "repository",
        locator: "local-repository:repository-1",
        detail: "本地仓库",
        status: "stale",
        revision: 3,
        updatedAt: 2,
        refresh: {
          enabled: true,
          preset: "manual",
          revision: 2,
          nextDueAt: 0,
          lastCheckedAt: 100,
          lastChangedAt: 90,
        },
        index: {
          health: "failed",
          profileId: "realmflow-vector-index-v1",
          indexedAt: 80,
        },
      },
    );

    expect(screen.getByText("检查与索引信息")).toBeInTheDocument();
    expect(screen.getByText("待更新")).toBeInTheDocument();
    expect(screen.getByText("索引失败")).toBeInTheDocument();
    expect(screen.getByText("上次检查")).toBeInTheDocument();
    expect(screen.getByText("上次索引")).toBeInTheDocument();
  });

  it("embeds the latest index job information in the repository dialog", () => {
    renderDialog(
      {},
      repositorySnapshotView(),
      undefined,
      {
        loading: false,
        view: latestIndexJobView(),
      },
    );

    expect(
      screen.getByRole("heading", {
        name: "RealmFlow repository 的最近索引任务",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("手动触发")).toBeInTheDocument();
    expect(screen.getByText("本地向量数据库响应超时")).toBeInTheDocument();
  });
});

function renderDialog(
  overrides: Partial<BusinessApi> = {},
  view = repositorySnapshotView(),
  resource?: SpaceResource,
  indexJob?: {
    view?: KnowledgeIndexViewDto;
    loading: boolean;
    error?: boolean;
    onRetry?: () => void;
  },
): void {
  const business = {
    listRepositoryBranches: vi.fn().mockResolvedValue([
      {
        name: "main",
        current: true,
      },
      {
        name: "feature",
        current: false,
      },
    ]),
    ...overrides,
  } as unknown as BusinessApi;

  render(
    <LocalizationProvider>
      <ToastProvider>
        <RepositorySnapshotDialog
          name="RealmFlow repository"
          view={view}
          resource={resource}
          business={business}
          sourceRevision={3}
          indexJob={indexJob}
          onClose={vi.fn()}
        />
      </ToastProvider>
    </LocalizationProvider>,
  );
}

function visibleFilePaths(): string[] {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

function repositorySnapshotView(): RepositorySnapshotViewDto {
  return {
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
    snapshot: {
      id: "snapshot-1",
      sourceId: "repository-1",
      version: 1,
      branch: "main",
      revisionLabel: "main@abc123",
      manifestChecksum: "manifest-checksum",
      fileCount: 4,
      totalBytes: 4120,
      files: [
        {
          relativePath: "test/large.ts",
          contentChecksum: "test-large",
          byteSize: 2048,
          indexStatus: { status: "failed", updatedAt: 2 },
        },
        {
          relativePath: "README.md",
          contentChecksum: "readme",
          byteSize: 8,
          indexStatus: {
            status: "indexed",
            generationId: "generation-1",
            updatedAt: 2,
          },
        },
        {
          relativePath: "src/pending.ts",
          contentChecksum: "pending",
          byteSize: 16,
          indexStatus: { status: "pending", updatedAt: 2 },
        },
        {
          relativePath: "src/large.ts",
          contentChecksum: "src-large",
          byteSize: 2048,
          indexStatus: { status: "failed", updatedAt: 2 },
        },
      ],
      scannedAt: 2,
    },
  };
}

function latestIndexJobView(): KnowledgeIndexViewDto {
  return {
    source: {
      id: "repository-1",
      workspaceId: "space-1",
      name: "RealmFlow repository",
      type: "repository",
      locator: "local-repository:repository-1",
      detail: "本地仓库",
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
  };
}
