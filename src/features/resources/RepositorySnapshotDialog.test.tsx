import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import type {
  BusinessApi,
  RepositorySnapshotViewDto,
} from "../../../shared/business";
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
    const statusFilter = within(headers[2]!).getByRole("combobox", {
      name: "按索引状态过滤",
    });

    fireEvent.change(statusFilter, { target: { value: "failed" } });
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

    fireEvent.change(statusFilter, { target: { value: "indexing" } });
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
});

function renderDialog(
  overrides: Partial<BusinessApi> = {},
  view = repositorySnapshotView(),
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
          business={business}
          sourceRevision={3}
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
