import { FolderGit2, GitBranch, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type {
  BusinessApi,
  ConnectorDto,
  KnowledgeSourceDto,
  RepositoryBranchDto,
} from "../../../shared/business";
import type { RealmFlowApi } from "../../../shared/types";
import type { WorkspaceBinding } from "../../../shared/workspace";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";

type RepositorySourceDialogProps = {
  api?: RealmFlowApi;
  business: BusinessApi;
  spaceId: string;
  sortOrder: number;
  onSaved: (source: KnowledgeSourceDto) => void;
  onClose: () => void;
  onPersistenceUnavailable: (unavailable: boolean) => void;
};

export function RepositorySourceDialog({
  api,
  business,
  spaceId,
  sortOrder,
  onSaved,
  onClose,
  onPersistenceUnavailable,
}: RepositorySourceDialogProps): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const [mode, setMode] = useState<"local" | "remote">("local");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [selection, setSelection] = useState<WorkspaceBinding>();
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [connectorId, setConnectorId] = useState("");
  const [branches, setBranches] = useState<RepositoryBranchDto[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const supportsBranchSelection =
    typeof business.listRepositoryBranches === "function";

  useEffect(() => {
    if (mode !== "remote") return;
    let active = true;
    void business
      .listConnectors()
      .then((records) => {
        if (!active) return;
        const enabled = records.filter(({ connector }) => connector.enabled);
        setConnectors(enabled);
        setConnectorId(enabled[0]?.connector.id ?? "");
      })
      .catch(() => {
        if (active) setError(t("resources.error.loadConnectors"));
      });
    return () => {
      active = false;
    };
  }, [business, mode, t]);

  useEffect(() => {
    const canLoad =
      (mode === "local" && selection) ||
      (mode === "remote" && connectorId && path.trim());
    if (!canLoad) {
      setBranches([]);
      setSelectedBranch("");
      return;
    }
    if (!supportsBranchSelection) {
      setBranches([]);
      setSelectedBranch("HEAD");
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingBranches(true);
      setError("");
      void business
        .listRepositoryBranches(
          mode === "local" && selection
            ? { mode: "local", selectionId: selection.requirementId }
            : {
                mode: "remote",
                workspaceId: spaceId,
                connectorId,
                path: path.trim(),
              },
        )
        .then((items) => {
          if (!active) return;
          setBranches(items);
          setSelectedBranch(
            items.find(({ current }) => current)?.name ?? items[0]?.name ?? "",
          );
        })
        .catch(() => {
          if (!active) return;
          setBranches([]);
          setSelectedBranch("");
          setError(t("resources.repository.branchLoadFailed"));
        })
        .finally(() => {
          if (active) setLoadingBranches(false);
        });
    }, mode === "remote" ? 300 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    business,
    connectorId,
    mode,
    path,
    selection,
    spaceId,
    supportsBranchSelection,
    t,
  ]);

  const chooseRepository = async (): Promise<void> => {
    if (!api) return onPersistenceUnavailable(true);
    const selected = await api.workspace.chooseFolder();
    if (!selected) return;
    setSelection(selected);
    setName((current) => current || selected.rootName);
    setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (
      !normalizedName ||
      !selectedBranch ||
      (mode === "local" && !selection) ||
      (mode === "remote" && (!connectorId || !path.trim()))
    ) {
      return;
    }
    setSubmitting(true);
    setError("");
    onClose();
    try {
      const id = `repository-${crypto.randomUUID()}`;
      const result =
        mode === "local" && selection
          ? await business.ingestLocalRepository({
              id,
              workspaceId: spaceId,
              selectionId: selection.requirementId,
              selectedBranch,
              name: normalizedName,
              sortOrder,
              idempotencyKey: `ingest-local-repository-${crypto.randomUUID()}`,
            })
          : await business.ingestRemoteRepository({
              id,
              workspaceId: spaceId,
              name: normalizedName,
              connectorId,
              path: path.trim(),
              selectedBranch,
              sortOrder,
              idempotencyKey: `ingest-remote-repository-${crypto.randomUUID()}`,
            });
      onSaved(result.source);
      onPersistenceUnavailable(false);
    } catch {
      toast.error("resources.repository.syncFailed");
      onPersistenceUnavailable(true);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    Boolean(name.trim()) &&
    (mode === "local"
      ? Boolean(selection && selectedBranch)
      : Boolean(connectorId && path.trim() && selectedBranch));

  return (
    <Dialog
      open
      size="default"
      className="repository-source-dialog"
      aria-labelledby="repository-source-dialog-title"
      locked={submitting}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        className="repository-source-dialog__form"
        onSubmit={(event) => void submit(event)}
      >
        <DialogHeader>
          <GitBranch size={18} />
          <h2 id="repository-source-dialog-title">
            {t("resources.repository.connect")}
          </h2>
        </DialogHeader>
        <DialogBody className="space-resource-dialog__body">
          <div
            className="repository-source-mode"
            role="group"
            aria-label={t("resources.repository.type")}
          >
            <Button
              size="compact"
              variant="ghost"
              aria-pressed={mode === "local"}
              onClick={() => {
                setMode("local");
                setError("");
              }}
            >
              {t("resources.repository.local")}
            </Button>
            <Button
              size="compact"
              variant="ghost"
              aria-pressed={mode === "remote"}
              onClick={() => {
                setMode("remote");
                setError("");
              }}
            >
              {t("resources.repository.remote")}
            </Button>
          </div>
          <Field name="resources-repository-name" label={t("resources.repository.name")}>
            <input
              data-autofocus
              aria-label={t("resources.repository.name")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {mode === "local" ? (
            <div className="repository-folder-selection">
              <Button
                size="compact"
                leadingIcon={<FolderGit2 size={15} />}
                onClick={() => void chooseRepository()}
              >
                {t("resources.repository.chooseFolder")}
              </Button>
              {selection ? <span>{selection.rootName}</span> : null}
            </div>
          ) : (
            <>
              <Field name="resources-connector" label={t("resources.connector")}>
                <select
                  aria-label={t("resources.connector")}
                  value={connectorId}
                  onChange={(event) => setConnectorId(event.target.value)}
                >
                  {connectors.map(({ connector }) => (
                    <option key={connector.id} value={connector.id}>
                      {connector.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field name="resources-repository-path" label={t("resources.repository.path")}>
                <input spellCheck={false}
                  aria-label={t("resources.repository.path")}
                  value={path}
                  placeholder="/repositories/team/project"
                  onChange={(event) => setPath(event.target.value)}
                />
              </Field>
            </>
          )}
          <Field name="resources-repository-branch" label={t("resources.repository.branch")}>
            <select
              aria-label={t("resources.repository.branch")}
              value={selectedBranch}
              disabled={loadingBranches || branches.length === 0}
              onChange={(event) => setSelectedBranch(event.target.value)}
            >
              <option value="">
                {t(
                  loadingBranches
                    ? "resources.repository.branchLoading"
                    : "resources.repository.branchPlaceholder",
                )}
              </option>
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          </Field>
          {error ? <p role="alert">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button disabled={submitting} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={submitting}
            disabled={!canSubmit}
            leadingIcon={<Plus size={14} />}
          >
            {t(
              submitting ? "resources.syncing" : "resources.repository.confirm",
            )}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
