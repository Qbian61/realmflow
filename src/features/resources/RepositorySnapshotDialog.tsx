import {
  AlertCircle,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  CheckCircle2,
  Clock3,
  FileCode2,
  GitBranch,
  ListFilter,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BusinessApi,
  KnowledgeIndexViewDto,
  RepositoryBranchDto,
  RepositorySnapshotViewDto,
} from "../../../shared/business";
import type { SpaceResource } from "../../domain/space-resource";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton,
  ListPagination,
  Popover,
  PopoverContent,
  Spinner,
  useListPagination,
  Select,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { TranslationKey } from "../../localization/translate";
import { useToast } from "../toast/ToastProvider";
import { KnowledgeResourceStatusSummary } from "./KnowledgeResourceStatusSummary";
import { KnowledgeIndexJobDetails } from "./KnowledgeIndexJobDialog";

type RepositorySnapshotDialogProps = {
  name: string;
  view: RepositorySnapshotViewDto;
  resource?: SpaceResource;
  business: BusinessApi;
  sourceRevision: number;
  indexJob?: {
    view?: KnowledgeIndexViewDto;
    loading: boolean;
    error?: boolean;
  };
  onRetryIndexJob?: () => void;
  onClose: () => void;
};

type FileIndexStatusFilter =
  | "all"
  | "pending"
  | "indexing"
  | "indexed"
  | "failed"
  | "skipped";

type FileSizeSort = "size-asc" | "size-desc";

type RepositorySkippedFileReason = NonNullable<
  NonNullable<RepositorySnapshotViewDto["snapshot"]>["skippedFiles"]
>[number]["reason"];

type RepositorySnapshotFile = NonNullable<
  RepositorySnapshotViewDto["snapshot"]
>["files"][number];

type RepositorySnapshotSkippedFile = NonNullable<
  NonNullable<RepositorySnapshotViewDto["snapshot"]>["skippedFiles"]
>[number];

type RepositoryFileRow =
  | ({ kind: "file" } & RepositorySnapshotFile)
  | ({ kind: "skipped" } & RepositorySnapshotSkippedFile);

type RepositoryFileRowStatus = Exclude<FileIndexStatusFilter, "all">;

type RepositoryStatusFilterOption = {
  value: FileIndexStatusFilter;
  label: string;
};

export function RepositorySnapshotDialog({
  name,
  view,
  resource,
  business,
  sourceRevision,
  indexJob,
  onRetryIndexJob,
  onClose,
}: RepositorySnapshotDialogProps): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const [currentView, setCurrentView] = useState(view);
  const [currentRevision, setCurrentRevision] = useState(sourceRevision);
  const [branches, setBranches] = useState<RepositoryBranchDto[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<FileIndexStatusFilter>("all");
  const [sizeSort, setSizeSort] = useState<FileSizeSort>("size-desc");
  const [updatingBranch, setUpdatingBranch] = useState(false);
  const [retryingFile, setRetryingFile] = useState("");
  const [error, setError] = useState("");
  const statusFilterOptions = useMemo<RepositoryStatusFilterOption[]>(
    () => [
      {
        value: "all",
        label: t("resources.repositoryPreview.statusAll"),
      },
      {
        value: "indexed",
        label: t("resources.repositoryPreview.indexed"),
      },
      {
        value: "failed",
        label: t("resources.repositoryPreview.failed"),
      },
      {
        value: "indexing",
        label: t("resources.repositoryPreview.indexing"),
      },
      {
        value: "pending",
        label: t("resources.repositoryPreview.pending"),
      },
      {
        value: "skipped",
        label: t("resources.repositoryPreview.skipped"),
      },
    ],
    [t],
  );

  useEffect(() => {
    if (typeof business.listRepositoryBranches !== "function") {
      setBranches(
        currentView.repository.selectedBranch
          ? [
              {
                name: currentView.repository.selectedBranch,
                current: true,
              },
            ]
          : [],
      );
      return;
    }
    let active = true;
    void business
      .listRepositoryBranches({ sourceId: currentView.repository.sourceId })
      .then((items) => {
        if (active) setBranches(items);
      })
      .catch(() => {
        if (active) setError(t("resources.repository.branchLoadFailed"));
      });
    return () => {
      active = false;
    };
  }, [business, currentView.repository.sourceId, t]);

  const files = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const rows: RepositoryFileRow[] = [
      ...(currentView.snapshot?.files ?? []).map((file) => ({
        ...file,
        kind: "file" as const,
      })),
      ...(currentView.snapshot?.skippedFiles ?? []).map((file) => ({
        ...file,
        kind: "skipped" as const,
      })),
    ];
    return rows
      .filter((file) => {
        const status = repositoryFileRowStatus(file);
        return (
          file.relativePath.toLocaleLowerCase().includes(normalized) &&
          (statusFilter === "all" || status === statusFilter)
        );
      })
      .sort((left, right) => {
        const sizeDifference =
          sizeSort === "size-asc"
            ? fileRowByteSize(left) - fileRowByteSize(right)
            : fileRowByteSize(right) - fileRowByteSize(left);
        return (
          sizeDifference ||
          left.relativePath.localeCompare(right.relativePath, undefined, {
            sensitivity: "base",
          })
        );
      });
  }, [currentView.snapshot, query, sizeSort, statusFilter]);
  const skippedFiles = useMemo(
    () => currentView.snapshot?.skippedFiles ?? [],
    [currentView.snapshot],
  );
  const visibleBytes = useMemo(
    () => files.reduce((total, file) => total + fileRowByteSize(file), 0),
    [files],
  );
  const filePagination = useListPagination(files);

  useEffect(() => {
    filePagination.resetPage();
  }, [query, sizeSort, statusFilter]);

  const shouldRefreshIndexStatus = useMemo(
    () => hasActiveRepositoryIndexStatus(currentView),
    [currentView],
  );

  useEffect(() => {
    if (!shouldRefreshIndexStatus) return;
    let disposed = false;
    let timeoutId: number | undefined;

    const refresh = async (): Promise<void> => {
      try {
        const nextView = await business.getRepositorySnapshot({
          sourceId: currentView.repository.sourceId,
        });
        if (!disposed) setCurrentView(nextView);
      } catch {
        // Keep the current snapshot visible; the next tick can recover.
      } finally {
        if (!disposed) {
          timeoutId = window.setTimeout(() => void refresh(), 2_000);
        }
      }
    };

    timeoutId = window.setTimeout(() => void refresh(), 2_000);
    return () => {
      disposed = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [business, currentView.repository.sourceId, shouldRefreshIndexStatus]);

  const updateBranch = async (branch: string): Promise<void> => {
    if (!branch || branch === currentView.repository.selectedBranch) return;
    setUpdatingBranch(true);
    setError("");
    try {
      const result = await business.updateRepositoryBranch({
        sourceId: currentView.repository.sourceId,
        branch,
        expectedRevision: currentRevision,
        idempotencyKey: `repository-branch-${crypto.randomUUID()}`,
      });
      setCurrentView({
        repository: result.repository,
        ...(result.snapshot ? { snapshot: result.snapshot } : {}),
      });
      setCurrentRevision(result.source.revision);
      setQuery("");
    } catch {
      toast.error("resources.repository.branchUpdateFailed");
    } finally {
      setUpdatingBranch(false);
    }
  };

  const retryFile = async (documentKey: string): Promise<void> => {
    const snapshot = currentView.snapshot;
    if (!snapshot) return;
    setRetryingFile(documentKey);
    setError("");
    try {
      await business.retryRepositoryFileIndex({
        sourceId: currentView.repository.sourceId,
        documentKey,
        expectedSourceRevision: currentRevision,
        expectedSnapshotVersion: snapshot.version,
        idempotencyKey: `repository-file-retry-${crypto.randomUUID()}`,
      });
      setCurrentView(
        await business.getRepositorySnapshot({
          sourceId: currentView.repository.sourceId,
        }),
      );
    } catch {
      toast.error("resources.repositoryPreview.retryFailed");
    } finally {
      setRetryingFile("");
    }
  };

  return (
    <Dialog
      open
      size="workspace"
      className="repository-snapshot-preview"
      aria-labelledby="repository-snapshot-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogHeader>
        <div>
          <GitBranch size={17} />
          <span>
            <h2 id="repository-snapshot-title">{name}</h2>
            <small>{view.repository.locator}</small>
          </span>
        </div>
        <IconButton
          aria-label={t("resources.repositoryPreview.close")}
          title={t("resources.repositoryPreview.close")}
          variant="ghost"
          size="compact"
          onClick={onClose}
        >
            <X size={16} />
        </IconButton>
      </DialogHeader>
      <DialogBody className="repository-snapshot-body">
        {resource ? (
          <KnowledgeResourceStatusSummary
            resource={resource}
            className="repository-snapshot-status-summary"
          />
        ) : null}
        {indexJob ? (
          <KnowledgeIndexJobDetails
            name={name}
            view={indexJob.view}
            loading={indexJob.loading}
            error={indexJob.error}
            onRetry={onRetryIndexJob}
            className="repository-snapshot-index-job"
            showHeading
          />
        ) : null}
        {currentView.snapshot ? (
          <>
            <div className="repository-snapshot-meta">
              <label>
                <GitBranch size={14} />
                <Select name="resources-repository-branch" autoComplete="off"
                  aria-label={t("resources.repository.branch")}
                  value={currentView.repository.selectedBranch ?? ""}
                  disabled={updatingBranch}
                  onChange={(event) => void updateBranch(event.target.value)}
                >
                  {branches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </label>
              <span>{currentView.snapshot.revisionLabel}</span>
              <span>
                {t("resources.repositoryPreview.fileCount", {
                  count: files.length,
                })}
              </span>
              <span>{formatBytes(visibleBytes)}</span>
              {skippedFiles.length > 0 ? (
                <span>
                  {t("resources.repositoryPreview.skippedCount", {
                    count: skippedFiles.length,
                  })}
                </span>
              ) : null}
            </div>
            {error ? <p role="alert">{error}</p> : null}
            <div className="repository-snapshot-files" role="table">
              <div className="repository-snapshot-file-header" role="row">
                <span
                  className="repository-file-column-header"
                  role="columnheader"
                >
                  <span>{t("resources.repositoryPreview.file")}</span>
                  <label className="repository-header-search">
                    <Search size={13} />
                    <input name="resources-repository-preview-search" autoComplete="off"
                      type="search"
                      aria-label={t("resources.repositoryPreview.search")}
                      placeholder={t("resources.repositoryPreview.search")}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </span>
                <span
                  className="repository-column-header"
                  role="columnheader"
                >
                  <span>{t("resources.repositoryPreview.size")}</span>
                  <IconButton
                    size="compact"
                    variant="ghost"
                    aria-label={t(
                      sizeSort === "size-desc"
                        ? "resources.repositoryPreview.sizeSortToAscending"
                        : "resources.repositoryPreview.sizeSortToDescending",
                    )}
                    title={t(
                      sizeSort === "size-desc"
                        ? "resources.repositoryPreview.sizeSortToAscending"
                        : "resources.repositoryPreview.sizeSortToDescending",
                    )}
                    onClick={() =>
                      setSizeSort((current) =>
                        current === "size-desc" ? "size-asc" : "size-desc",
                      )
                    }
                  >
                    {sizeSort === "size-desc" ? (
                      <ArrowDownWideNarrow size={14} aria-hidden="true" />
                    ) : (
                      <ArrowUpNarrowWide size={14} aria-hidden="true" />
                    )}
                  </IconButton>
                </span>
                <span
                  className="repository-column-header"
                  role="columnheader"
                >
                  <span>{t("resources.repositoryPreview.indexStatus")}</span>
                  <RepositoryStatusFilter
                    label={t("resources.repositoryPreview.statusFilter")}
                    options={statusFilterOptions}
                    value={statusFilter}
                    onChange={setStatusFilter}
                  />
                </span>
              </div>
              {filePagination.pageItems.map((file) => (
                <div role="row" key={`${file.kind}:${file.relativePath}`}>
                  <span role="cell">
                    <FileCode2 size={14} />
                    <span
                      className="repository-file-path"
                      title={file.relativePath}
                    >
                      {file.relativePath}
                    </span>
                  </span>
                  <span role="cell">
                    {file.byteSize === undefined
                      ? ""
                      : formatBytes(file.byteSize)}
                  </span>
                  <span role="cell">
                    <FileIndexStatus
                      status={repositoryFileRowStatus(file)}
                      loading={
                        file.kind === "file" &&
                        retryingFile === file.relativePath
                      }
                      onRetry={
                        file.kind === "file"
                          ? () => void retryFile(file.relativePath)
                          : undefined
                      }
                      skippedReason={
                        file.kind === "skipped"
                          ? skippedReasonLabel(t, file.reason)
                          : undefined
                      }
                      labels={{
                        indexed: t("resources.repositoryPreview.indexed"),
                        failed: t("resources.repositoryPreview.failed"),
                        indexing: t("resources.repositoryPreview.indexing"),
                        pending: t("resources.repositoryPreview.pending"),
                        skipped: t("resources.repositoryPreview.skipped"),
                        retry: t("resources.repositoryPreview.retry"),
                      }}
                    />
                  </span>
                </div>
              ))}
              {files.length === 0 ? (
                <div className="repository-snapshot-no-results">
                  {t("resources.repositoryPreview.noResults")}
                </div>
              ) : null}
            </div>
            <ListPagination
              className="repository-snapshot-pagination"
              total={files.length}
              page={filePagination.page}
              pageSize={filePagination.pageSize}
              onPageChange={filePagination.setPage}
            />
          </>
        ) : (
          <div className="repository-snapshot-empty">
            {t("resources.repositoryPreview.empty")}
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}

function RepositoryStatusFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: RepositoryStatusFilterOption[];
  value: FileIndexStatusFilter;
  onChange: (value: FileIndexStatusFilter) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`repository-header-filter ${
          value === "all" ? "" : "active"
        }`}
        title={label}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <ListFilter size={14} aria-hidden="true" />
      </button>
      <Popover
        open={open}
        trigger={triggerRef.current}
        placement="bottom-end"
        onOpenChange={setOpen}
      >
        <PopoverContent
          className="repository-header-filter-menu ui-menu"
          role="menu"
          aria-label={label}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                className="ui-menu-item repository-header-filter-menu-item"
                data-checked={selected || undefined}
                key={option.value}
                role="menuitemradio"
                type="button"
                aria-checked={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <Check size={13} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </>
  );
}

function skippedReasonLabel(
  t: ReturnType<typeof useLocalization>["t"],
  reason: RepositorySkippedFileReason,
): string {
  return t(repositorySkippedReasonKeys[reason]);
}

const repositorySkippedReasonKeys = {
  file_too_large: "resources.repositoryPreview.skipReason.fileTooLarge",
  binary: "resources.repositoryPreview.skipReason.binary",
  invalid_utf8: "resources.repositoryPreview.skipReason.invalidUtf8",
  repository_text_limit_exceeded:
    "resources.repositoryPreview.skipReason.repositoryTextLimitExceeded",
  file_count_limit_exceeded:
    "resources.repositoryPreview.skipReason.fileCountLimitExceeded",
} satisfies Record<RepositorySkippedFileReason, TranslationKey>;

function repositoryFileRowStatus(
  file: RepositoryFileRow,
): RepositoryFileRowStatus {
  if (file.kind === "skipped") return "skipped";
  return file.indexStatus?.status ?? "pending";
}

function hasActiveRepositoryIndexStatus(
  view: RepositorySnapshotViewDto,
): boolean {
  if (
    view.indexJobStatus === "pending" ||
    view.indexJobStatus === "running" ||
    view.indexJobStatus === "qdrant_written"
  ) {
    return true;
  }
  return (
    view.snapshot?.files.some((file) => {
      const status = file.indexStatus?.status ?? "pending";
      return status === "indexing" || status === "pending";
    }) ?? false
  );
}

function fileRowByteSize(file: RepositoryFileRow): number {
  return file.byteSize ?? 0;
}

function FileIndexStatus({
  status,
  loading,
  onRetry,
  skippedReason,
  labels,
}: {
  status: RepositoryFileRowStatus;
  loading: boolean;
  onRetry?: () => void;
  skippedReason?: string;
  labels: Record<RepositoryFileRowStatus | "retry", string>;
}): JSX.Element {
  if (status === "failed") {
    return (
      <>
        <AlertCircle
          className="repository-file-status failed"
          size={15}
          aria-label={labels.failed}
        />
        <IconButton
          size="compact"
          variant="ghost"
          disabled={loading}
          loading={loading}
          aria-label={labels.retry}
          title={labels.retry}
          onClick={onRetry}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </IconButton>
      </>
    );
  }
  if (status === "indexed") {
    return (
      <CheckCircle2
        className="repository-file-status indexed"
        size={15}
        aria-label={labels.indexed}
      />
    );
  }
  if (status === "indexing") {
    return (
      <Spinner
        className="repository-file-status indexing"
        size={15}
        label={labels.indexing}
      />
    );
  }
  if (status === "skipped") {
    return (
      <span
        className="repository-file-status skipped"
        title={skippedReason}
        aria-label={`${labels.skipped}: ${skippedReason ?? labels.skipped}`}
      >
        <AlertCircle size={15} aria-hidden="true" />
        <span>{skippedReason ?? labels.skipped}</span>
      </span>
    );
  }
  return (
    <Clock3
      className="repository-file-status pending"
      size={15}
      aria-label={labels.pending}
    />
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
