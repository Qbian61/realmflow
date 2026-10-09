import {
  BookOpen,
  CircleCheck,
  CircleX,
  ExternalLink,
  File,
  GitBranch,
  Search,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type {
  BusinessApi,
  ConnectorDto,
  KnowledgeIndexViewDto,
  KnowledgeRuntimeHealthDto,
  OnlineDocumentSnapshotViewDto,
  RepositorySnapshotViewDto,
} from "../../../shared/business";
import type { RealmFlowApi } from "../../../shared/types";
import type { KnowledgeRefreshPreset } from "../../../domain/knowledge-refresh";
import type { LocalFileStorageMode } from "../../../domain/local-file-source";
import type {
  SpaceResource,
  SpaceResourceType,
} from "../../domain/space-resource";
import { mapBusinessResource } from "./space-resource-mappers";
import { KnowledgeResourceRow } from "./KnowledgeResourceRow";
import { KnowledgeIndexJobDialog } from "./KnowledgeIndexJobDialog";
import { KnowledgeNotesPanel } from "./KnowledgeNotesPanel";
import { OnlineDocumentSnapshotDialog } from "./OnlineDocumentSnapshotDialog";
import { RepositorySnapshotDialog } from "./RepositorySnapshotDialog";
import { RepositorySourceDialog } from "./RepositorySourceDialog";
import { ResourceDialog } from "./ResourceDialog";
import { useWorkbench } from "../workbench/WorkbenchProvider";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";
import {
  createEnumQueryCodec,
  createPositiveIntegerQueryCodec,
  createTextQueryCodec,
  useUrlQueryState,
} from "../../navigation/url-query-state";
import {
  Badge,
  Button,
  EmptyState,
  ListPagination,
  Toolbar,
  useListPagination,
} from "../../components/ui";

type SpaceKnowledgePanelProps = {
  spaceId: string;
  api?: RealmFlowApi;
  business?: BusinessApi;
  resources: SpaceResource[];
  setResources: Dispatch<SetStateAction<SpaceResource[]>>;
  onPersistenceUnavailable: (unavailable: boolean) => void;
};

const resourceTypeCodec = createEnumQueryCodec(
  ["all", "file", "document", "repository"] as const,
  "all",
);
const resourceSearchCodec = createTextQueryCodec();
const resourcePageCodec = createPositiveIntegerQueryCodec(1);

export function SpaceKnowledgePanel({
  spaceId,
  api,
  business,
  resources,
  setResources,
  onPersistenceUnavailable,
}: SpaceKnowledgePanelProps): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const workbench = useWorkbench();
  const [resourceDialog, setResourceDialog] = useState<"document" | null>(null);
  const [repositoryDialog, setRepositoryDialog] = useState(false);
  const [resourceName, setResourceName] = useState("");
  const [resourceLocator, setResourceLocator] = useState("");
  const [connectorId, setConnectorId] = useState("");
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [resourceError, setResourceError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    view: OnlineDocumentSnapshotViewDto;
  }>();
  const [repositoryPreview, setRepositoryPreview] = useState<{
    name: string;
    sourceRevision: number;
    view: RepositorySnapshotViewDto;
  }>();
  const [resourceFilter, setResourceFilter] = useUrlQueryState<
    "all" | SpaceResourceType
  >("resourceType", resourceTypeCodec);
  const [resourceSearch, setResourceSearch] = useUrlQueryState(
    "resourceQuery",
    resourceSearchCodec,
  );
  const [resourcePage, setResourcePage] = useUrlQueryState(
    "resourcePage",
    resourcePageCodec,
  );
  const [runtimeHealth, setRuntimeHealth] =
    useState<KnowledgeRuntimeHealthDto>();
  const [indexJobDialog, setIndexJobDialog] = useState<{
    sourceId: string;
    name: string;
    loading: boolean;
    view?: KnowledgeIndexViewDto;
    error?: boolean;
  }>();

  useEffect(() => {
    if (!business?.getKnowledgeRuntimeHealth) return;
    let disposed = false;
    void business
      .getKnowledgeRuntimeHealth()
      .then((health) => {
        if (!disposed) setRuntimeHealth(health);
      })
      .catch(() => {
        if (!disposed) {
          setRuntimeHealth({
            status: "unavailable",
            components: {
              vectorStore: "unavailable",
              embeddings: "unavailable",
            },
          });
        }
      });
    return () => {
      disposed = true;
    };
  }, [business]);

  const filteredResources = useMemo(() => {
    const query = resourceSearch.trim().toLowerCase();
    return resources.filter(
      (resource) =>
        (resourceFilter === "all" || resource.type === resourceFilter) &&
        (!query ||
          `${resource.name} ${resource.detail} ${resource.locator}`
            .toLowerCase()
            .includes(query)),
    );
  }, [resourceFilter, resourceSearch, resources]);
  const resourcePagination = useListPagination(filteredResources, undefined, {
    page: resourcePage,
    onPageChange: (page) => setResourcePage(page, { replace: page === 1 }),
  });

  const reloadResources = useCallback(async (): Promise<void> => {
    if (!business) return;
    const items = await business.listKnowledgeSources({ workspaceId: spaceId });
    setResources(items.map(mapBusinessResource));
  }, [business, setResources, spaceId]);

  const addLocalFiles = async (
    storageMode: LocalFileStorageMode,
  ): Promise<void> => {
    const selection = await api?.workspace.chooseFiles();
    if (!selection) return;
    if (!business) {
      toast.error("app.persistenceUnavailable");
      onPersistenceUnavailable(true);
      return;
    }
    try {
      const saved = await business.ingestLocalFiles({
        workspaceId: spaceId,
        selectionId: selection.binding.requirementId,
        filePaths: selection.files.map(({ path }) => path),
        storageMode,
        idempotencyKey: `ingest-local-${crypto.randomUUID()}`,
      });
      setResources((current) => [
        ...saved.map(mapBusinessResource),
        ...current.filter(
          (item) => !saved.some((source) => source.id === item.id),
        ),
      ]);
      onPersistenceUnavailable(false);
    } catch {
      toast.error("app.persistenceUnavailable");
      onPersistenceUnavailable(true);
    }
  };

  const openDocumentDialog = async (): Promise<void> => {
    setResourceDialog("document");
    setResourceError("");
    if (!business) return;
    try {
      const records = await business.listConnectors();
      const enabled = records.filter(({ connector }) => connector.enabled);
      setConnectors(enabled);
      setConnectorId(enabled[0]?.connector.id ?? "");
    } catch {
      setResourceError(t("resources.error.loadConnectors"));
    }
  };

  const closeResourceDialog = (): void => {
    if (submitting) return;
    setResourceDialog(null);
    setResourceName("");
    setResourceLocator("");
    setConnectorId("");
    setConnectors([]);
    setResourceError("");
  };

  const submitResource = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!resourceDialog || !business) return;
    const name = resourceName.trim();
    const locator = resourceLocator.trim();
    if (!name || !locator) return;
    setSubmitting(true);
    setResourceError("");
    try {
      const result = await business.createOnlineDocumentSource({
        id: `document-${crypto.randomUUID()}`,
        workspaceId: spaceId,
        name,
        connectorId,
        path: locator,
        sortOrder: resources.length,
        idempotencyKey: `create-online-${crypto.randomUUID()}`,
      });
      setResources((current) => [
        mapBusinessResource(result.source),
        ...current,
      ]);
      onPersistenceUnavailable(false);
      closeResourceDialogAfterSubmit();
    } catch {
      toast.error("resources.document.syncFailed");
      onPersistenceUnavailable(true);
    } finally {
      setSubmitting(false);
    }
  };

  const closeResourceDialogAfterSubmit = (): void => {
    setResourceDialog(null);
    setResourceName("");
    setResourceLocator("");
    setConnectorId("");
    setConnectors([]);
  };

  const openResource = async (resource: SpaceResource): Promise<void> => {
    if (resource.type === "document") {
      if (!business) {
        toast.error("app.persistenceUnavailable");
        return onPersistenceUnavailable(true);
      }
      try {
        const view = await business.getOnlineDocumentSnapshot({
          sourceId: resource.id,
        });
        setPreview({ name: resource.name, view });
        onPersistenceUnavailable(false);
      } catch {
        toast.error("app.persistenceUnavailable");
        onPersistenceUnavailable(true);
      }
      return;
    }
    if (resource.type === "repository") {
      if (!business) {
        toast.error("app.persistenceUnavailable");
        return onPersistenceUnavailable(true);
      }
      try {
        const view = await business.getRepositorySnapshot({
          sourceId: resource.id,
        });
        setRepositoryPreview({
          name: resource.name,
          sourceRevision: resource.revision ?? 1,
          view,
        });
        onPersistenceUnavailable(false);
      } catch {
        toast.error("app.persistenceUnavailable");
        onPersistenceUnavailable(true);
      }
      return;
    }
    if (!business) {
      toast.error("app.persistenceUnavailable");
      return onPersistenceUnavailable(true);
    }
    try {
      const selection = await business.openLocalFileSource({
        sourceId: resource.id,
      });
      workbench.openWorkspaceSelection(selection);
      onPersistenceUnavailable(false);
    } catch {
      toast.error("app.persistenceUnavailable");
      onPersistenceUnavailable(true);
    }
  };

  const syncResource = async (resource: SpaceResource): Promise<void> => {
    if (!business) {
      toast.error("app.persistenceUnavailable");
      return onPersistenceUnavailable(true);
    }
    try {
      await business.refreshKnowledgeSource({
        sourceId: resource.id,
        idempotencyKey: `refresh-${crypto.randomUUID()}`,
      });
      await reloadResources();
      onPersistenceUnavailable(false);
    } catch {
      toast.error(
        resource.type === "repository"
          ? "resources.repository.syncFailed"
          : resource.type === "document"
            ? "resources.document.syncFailed"
            : "app.persistenceUnavailable",
      );
      onPersistenceUnavailable(true);
    }
  };

  const indexResource = async (resource: SpaceResource): Promise<void> => {
    if (!business || resource.revision === undefined) return;
    try {
      const result = await business.buildKnowledgeIndex({
        id: resource.id,
        expectedRevision: resource.revision,
        idempotencyKey: `index-${crypto.randomUUID()}`,
      });
      void result;
      await reloadResources();
      onPersistenceUnavailable(false);
    } catch {
      onPersistenceUnavailable(true);
    }
  };

  const loadLatestIndexJob = async (
    sourceId: string,
    name: string,
  ): Promise<void> => {
    setIndexJobDialog({
      sourceId,
      name,
      loading: true,
    });
    if (!business) {
      setIndexJobDialog({
        sourceId,
        name,
        loading: false,
        error: true,
      });
      onPersistenceUnavailable(true);
      return;
    }
    try {
      const view = await business.getKnowledgeIndex({ sourceId });
      setIndexJobDialog((current) =>
        current?.sourceId === sourceId
          ? {
              sourceId,
              name,
              loading: false,
              view,
            }
          : current,
      );
      onPersistenceUnavailable(false);
    } catch {
      setIndexJobDialog((current) =>
        current?.sourceId === sourceId
          ? {
              sourceId,
              name,
              loading: false,
              error: true,
            }
          : current,
      );
      onPersistenceUnavailable(true);
    }
  };

  const viewLatestIndexJob = async (resource: SpaceResource): Promise<void> => {
    await loadLatestIndexJob(resource.id, resource.name);
  };

  const changeRefreshPolicy = async (
    resource: SpaceResource,
    preset: KnowledgeRefreshPreset,
  ): Promise<void> => {
    if (!resource.refresh) return;
    if (!business) {
      toast.error("app.persistenceUnavailable");
      return onPersistenceUnavailable(true);
    }
    try {
      await business.setKnowledgeRefreshPolicy({
        sourceId: resource.id,
        expectedRevision: resource.refresh.revision,
        preset,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      await reloadResources();
      onPersistenceUnavailable(false);
    } catch {
      toast.error("app.persistenceUnavailable");
      onPersistenceUnavailable(true);
    }
  };

  const removeResource = async (resource: SpaceResource): Promise<void> => {
    if (resource.revision === undefined) return;
    if (!business) {
      toast.error("app.persistenceUnavailable");
      return onPersistenceUnavailable(true);
    }
    try {
      await business.removeKnowledgeSource({
        id: resource.id,
        expectedRevision: resource.revision,
        idempotencyKey: `remove-${crypto.randomUUID()}`,
      });
      setResources((current) =>
        current.filter((item) => item.id !== resource.id),
      );
    } catch {
      toast.error("app.persistenceUnavailable");
      onPersistenceUnavailable(true);
    }
  };

  return (
    <div className="space-detail-scroll">
      <div className="space-detail-content">
        <section
          className="space-resource-section"
          aria-label={t("resources.title")}
        >
          <header className="space-resource-header">
            <div>
              <p>{t("resources.description")}</p>
              {runtimeHealth ? (
                <Badge
                  tone={runtimeHealth.status === "ready" ? "success" : "danger"}
                  className={`knowledge-runtime-health ${runtimeHealth.status}`}
                  role="status"
                  aria-label={t("resources.runtime.aria")}
                >
                  {runtimeHealth.status === "ready" ? (
                    <CircleCheck size={13} />
                  ) : (
                    <CircleX size={13} />
                  )}
                  {t(
                    runtimeHealth.status === "ready"
                      ? "resources.runtime.ready"
                      : "resources.runtime.unavailable",
                  )}
                  <small>{t("resources.runtime.detail")}</small>
                </Badge>
              ) : null}
            </div>
            <Toolbar
              className="space-resource-actions"
              aria-label={t("resources.title")}
            >
              <Button
                variant="primary"
                onClick={() => void addLocalFiles("managed_copy")}
                leadingIcon={<Upload size={15} />}
              >
                {t("resources.uploadLocal")}
              </Button>
              <Button
                onClick={() => void addLocalFiles("external_reference")}
                leadingIcon={<ExternalLink size={15} />}
              >
                {t("resources.referenceLocal")}
              </Button>
              <Button
                onClick={() => void openDocumentDialog()}
                leadingIcon={<BookOpen size={15} />}
              >
                {t("resources.document.add")}
              </Button>
              <Button
                onClick={() => {
                  if (!business) {
                    toast.error("app.persistenceUnavailable");
                    return onPersistenceUnavailable(true);
                  }
                  setRepositoryDialog(true);
                }}
                leadingIcon={<GitBranch size={15} />}
              >
                {t("resources.repository.connect")}
              </Button>
            </Toolbar>
          </header>

          <Toolbar
            className="space-resource-toolbar"
            aria-label={t("resources.filterAria")}
          >
            <div role="group" aria-label={t("resources.filterAria")}>
              {(
                [
                  ["all", "resources.type.all"],
                  ["file", "resources.type.file"],
                  ["document", "resources.type.document"],
                  ["repository", "resources.type.repository"],
                ] as const
              ).map(([value, labelKey]) => (
                <Button
                  size="compact"
                  variant={resourceFilter === value ? "neutral" : "ghost"}
                  aria-pressed={resourceFilter === value}
                  key={value}
                  onClick={() => setResourceFilter(value)}
                >
                  {t(labelKey)}
                  <span>
                    {value === "all"
                      ? resources.length
                      : resources.filter((item) => item.type === value).length}
                  </span>
                </Button>
              ))}
            </div>
            <label>
              <Search size={14} />
              <input name="resources-search-aria" autoComplete="off"
                type="search"
                aria-label={t("resources.searchAria")}
                placeholder={t("resources.searchPlaceholder")}
                value={resourceSearch}
                onChange={(event) =>
                  setResourceSearch(event.target.value, { replace: true })
                }
              />
            </label>
          </Toolbar>

          {filteredResources.length > 0 ? (
            <>
              <div className="space-resource-table" role="table">
                <div role="row">
                  <span role="columnheader">{t("resources.column.name")}</span>
                  <span role="columnheader">{t("resources.column.type")}</span>
                  <span role="columnheader">{t("resources.column.detail")}</span>
                  <span role="columnheader">
                    {t("resources.column.updatedAt")}
                  </span>
                  <span aria-hidden="true" />
                </div>
                {resourcePagination.pageItems.map((resource) => (
                  <KnowledgeResourceRow
                    key={resource.id}
                    resource={resource}
                    onOpen={openResource}
                    onSync={syncResource}
                    onIndex={indexResource}
                    onViewLatestIndexJob={(item) => {
                      void viewLatestIndexJob(item);
                    }}
                    onRefreshPolicyChange={changeRefreshPolicy}
                    onRemove={removeResource}
                  />
                ))}
              </div>
              <ListPagination
                total={filteredResources.length}
                page={resourcePagination.page}
                pageSize={resourcePagination.pageSize}
                onPageChange={resourcePagination.setPage}
              />
            </>
          ) : (
            <EmptyState
              className="space-empty-block"
              icon={<File size={21} />}
              title={t("resources.empty")}
              description={t("resources.emptyDescription")}
            />
          )}
        </section>
        <KnowledgeNotesPanel workspaceId={spaceId} business={business} />
      </div>

      {resourceDialog ? (
        <ResourceDialog
          type={resourceDialog}
          name={resourceName}
          locator={resourceLocator}
          connectorId={connectorId}
          connectors={connectors}
          error={resourceError}
          submitting={submitting}
          onNameChange={setResourceName}
          onLocatorChange={(value) => {
            setResourceLocator(value);
            setResourceError("");
          }}
          onConnectorChange={setConnectorId}
          onClose={closeResourceDialog}
          onSubmit={submitResource}
        />
      ) : null}
      {preview ? (
        <OnlineDocumentSnapshotDialog
          name={preview.name}
          view={preview.view}
          onClose={() => setPreview(undefined)}
        />
      ) : null}
      {repositoryDialog && business ? (
        <RepositorySourceDialog
          api={api}
          business={business}
          spaceId={spaceId}
          sortOrder={resources.length}
          onSaved={(source) => {
            setResources((current) => [
              mapBusinessResource(source),
              ...current.filter((item) => item.id !== source.id),
            ]);
          }}
          onClose={() => setRepositoryDialog(false)}
          onPersistenceUnavailable={onPersistenceUnavailable}
        />
      ) : null}
      {repositoryPreview ? (
        <RepositorySnapshotDialog
          name={repositoryPreview.name}
          business={business!}
          sourceRevision={repositoryPreview.sourceRevision}
          view={repositoryPreview.view}
          onClose={() => setRepositoryPreview(undefined)}
        />
      ) : null}
      {indexJobDialog ? (
        <KnowledgeIndexJobDialog
          name={indexJobDialog.name}
          view={indexJobDialog.view}
          loading={indexJobDialog.loading}
          error={indexJobDialog.error}
          onRetry={() =>
            void loadLatestIndexJob(
              indexJobDialog.sourceId,
              indexJobDialog.name,
            )
          }
          onClose={() => setIndexJobDialog(undefined)}
        />
      ) : null}
    </div>
  );
}
