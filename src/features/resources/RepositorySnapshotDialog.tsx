import {
  AlertCircle,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCircle2,
  Clock3,
  FileCode2,
  GitBranch,
  ListFilter,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  BusinessApi,
  RepositoryBranchDto,
  RepositorySnapshotViewDto,
} from "../../../shared/business";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton,
  ListPagination,
  Spinner,
  useListPagination,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";

type RepositorySnapshotDialogProps = {
  name: string;
  view: RepositorySnapshotViewDto;
  business: BusinessApi;
  sourceRevision: number;
  onClose: () => void;
};

type FileIndexStatusFilter =
  | "all"
  | "pending"
  | "indexing"
  | "indexed"
  | "failed";

type FileSizeSort = "size-asc" | "size-desc";

export function RepositorySnapshotDialog({
  name,
  view,
  business,
  sourceRevision,
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
    return [...(currentView.snapshot?.files ?? [])]
      .filter(
        (file) =>
          file.relativePath.toLocaleLowerCase().includes(normalized) &&
          (statusFilter === "all" ||
            (file.indexStatus?.status ?? "pending") === statusFilter),
      )
      .sort((left, right) => {
        const sizeDifference =
          sizeSort === "size-asc"
            ? left.byteSize - right.byteSize
            : right.byteSize - left.byteSize;
        return (
          sizeDifference ||
          left.relativePath.localeCompare(right.relativePath, undefined, {
            sensitivity: "base",
          })
        );
      });
  }, [currentView.snapshot, query, sizeSort, statusFilter]);
  const visibleBytes = useMemo(
    () => files.reduce((total, file) => total + file.byteSize, 0),
    [files],
  );
  const filePagination = useListPagination(files);

  useEffect(() => {
    filePagination.resetPage();
  }, [query, sizeSort, statusFilter]);

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
        {currentView.snapshot ? (
          <>
            <div className="repository-snapshot-meta">
              <label>
                <GitBranch size={14} />
                <select name="resources-repository-branch" autoComplete="off"
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
                </select>
              </label>
              <span>{currentView.snapshot.revisionLabel}</span>
              <span>
                {t("resources.repositoryPreview.fileCount", {
                  count: files.length,
                })}
              </span>
              <span>{formatBytes(visibleBytes)}</span>
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
                  <label
                    className={`repository-header-filter ${
                      statusFilter === "all" ? "" : "active"
                    }`}
                    title={t("resources.repositoryPreview.statusFilter")}
                  >
                    <ListFilter size={14} />
                    <select name="resources-repository-preview-status-filter" autoComplete="off"
                      aria-label={t("resources.repositoryPreview.statusFilter")}
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(
                          event.target.value as FileIndexStatusFilter,
                        )
                      }
                    >
                      <option value="all">
                        {t("resources.repositoryPreview.statusAll")}
                      </option>
                      <option value="indexed">
                        {t("resources.repositoryPreview.indexed")}
                      </option>
                      <option value="failed">
                        {t("resources.repositoryPreview.failed")}
                      </option>
                      <option value="indexing">
                        {t("resources.repositoryPreview.indexing")}
                      </option>
                      <option value="pending">
                        {t("resources.repositoryPreview.pending")}
                      </option>
                    </select>
                  </label>
                </span>
              </div>
              {filePagination.pageItems.map((file) => (
                <div role="row" key={file.relativePath}>
                  <span role="cell">
                    <FileCode2 size={14} />
                    <span
                      className="repository-file-path"
                      title={file.relativePath}
                    >
                      {file.relativePath}
                    </span>
                  </span>
                  <span role="cell">{formatBytes(file.byteSize)}</span>
                  <span role="cell">
                    <FileIndexStatus
                      status={file.indexStatus?.status ?? "pending"}
                      loading={retryingFile === file.relativePath}
                      onRetry={() => void retryFile(file.relativePath)}
                      labels={{
                        indexed: t("resources.repositoryPreview.indexed"),
                        failed: t("resources.repositoryPreview.failed"),
                        indexing: t("resources.repositoryPreview.indexing"),
                        pending: t("resources.repositoryPreview.pending"),
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

function FileIndexStatus({
  status,
  loading,
  onRetry,
  labels,
}: {
  status: "pending" | "indexing" | "indexed" | "failed";
  loading: boolean;
  onRetry: () => void;
  labels: Record<
    "pending" | "indexing" | "indexed" | "failed" | "retry",
    string
  >;
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
