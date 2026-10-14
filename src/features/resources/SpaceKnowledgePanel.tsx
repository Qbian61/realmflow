import {
  BookOpen,
  ExternalLink,
  GitBranch,
  Search,
  Upload,
} from "lucide-react";
import {
  useCallback,
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
  RepositorySnapshotViewDto,
} from "../../../shared/business";
import type { RealmFlowApi } from "../../../shared/types";
import type { KnowledgeRefreshPreset } from "../../../domain/knowledge-refresh";
import type { LocalFileStorageMode } from "../../../domain/local-file-source";
import type { SpaceResource } from "../../domain/space-resource";
import { mapBusinessResource } from "./space-resource-mappers";
import type { RepositoryIndexStatusSummaryState } from "./KnowledgeResourceRow";
import { KnowledgeNotesPanel } from "./KnowledgeNotesPanel";
import { RepositorySnapshotDialog } from "./RepositorySnapshotDialog";
import { RepositorySourceDialog } from "./RepositorySourceDialog";
import { ResourceDetailDialog } from "./ResourceDetailDialog";
import { ResourceDialog } from "./ResourceDialog";
import { SpaceKnowledgeResourceTable } from "./SpaceKnowledgeResourceTable";
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
  Button,
  Toolbar,
  useListPagination,
} from "../../components/ui";
import {
  getResourceDisplayType,
  resourceDisplayTypeLabelKeys,
} from "./resource-display-type";
import {
  getResourceIndexHealth,
  resourceIndexHealthLabelKeys,
  summarizeRepositoryIndexStatusCounts,
} from "./resource-presentation";
import {
  spaceResourceIndexOptions,
  spaceResourceTypeOptions,
} from "./space-resource-filter-options";

type SpaceKnowledgePanelProps = {
  spaceId: string;
  api?: RealmFlowApi;
  business?: BusinessApi;
  resources: SpaceResource[];
  setResources: Dispatch<SetStateAction<SpaceResource[]>>;
  onPersistenceUnavailable: (unavailable: boolean) => void;
};

type ResourceIndexJobState = {
  sourceId: string;
  name: string;
  loading: boolean;
  view?: KnowledgeIndexViewDto;
  error?: boolean;
};

const resourceTypeCodec = createEnumQueryCodec(
  [
    "all",
    "localFile",
    "localReference",
    "document",
    "repository",
    "remoteRepository",
  ] as const,
  "all",
);
const resourceIndexHealthCodec = createEnumQueryCodec(
  ["all", "missing", "building", "ready", "failed"] as const,
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
  const [resourceDetail, setResourceDetail] = useState<SpaceResource>();
  const [openingResourceId, setOpeningResourceId] = useState("");
  const [repositoryPreview, setRepositoryPreview] = useState<{
    name: string;
    sourceRevision: number;
    view: RepositorySnapshotViewDto;
    resource: SpaceResource;
  }>();
  const [resourceFilter, setResourceFilter] = useUrlQueryState(
    "resourceType",
    resourceTypeCodec,
  );
  const [resourceIndexFilter, setResourceIndexFilter] = useUrlQueryState(
    "resourceIndex",
    resourceIndexHealthCodec,
  );
  const [resourceSearch, setResourceSearch] = useUrlQueryState(
    "resourceQuery",
    resourceSearchCodec,
  );
  const [resourcePage, setResourcePage] = useUrlQueryState(
    "resourcePage",
    resourcePageCodec,
  );
  const [resourceIndexJob, setResourceIndexJob] =
    useState<ResourceIndexJobState>();
  const [repositoryIndexStatusSummaries, setRepositoryIndexStatusSummaries] =
    useState<Record<string, RepositoryIndexStatusSummaryState>>({});

  const filteredResources = useMemo(() => {
    const query = resourceSearch.trim().toLowerCase();
    return resources.filter((resource) => {
      const displayType = getResourceDisplayType(resource);
      const displayTypeLabel = t(resourceDisplayTypeLabelKeys[displayType]);
      const indexHealth = getResourceIndexHealth(resource);
      const indexStatusLabel = t(resourceIndexHealthLabelKeys[indexHealth]);
      return (
        (resourceFilter === "all" || displayType === resourceFilter) &&
        (resourceIndexFilter === "all" ||
          indexHealth === resourceIndexFilter) &&
        (!query ||
          `${resource.name} ${resource.detail} ${resource.locator} ${displayTypeLabel} ${indexStatusLabel}`
            .toLowerCase()
            .includes(query))
      );
    });
  }, [resourceFilter, resourceIndexFilter, resourceSearch, resources, t]);
  const resourceTypeOptions = useMemo(
    () => spaceResourceTypeOptions(t),
    [t],
  );
  const resourceIndexOptions = useMemo(
    () => spaceResourceIndexOptions(t),
    [t],
  );
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
          resource,
        });
        void loadLatestIndexJob(resource.id, resource.name);
        onPersistenceUnavailable(false);
      } catch {
        toast.error("app.persistenceUnavailable");
        onPersistenceUnavailable(true);
      }
      return;
    }

    setResourceDetail(resource);
    void loadLatestIndexJob(resource.id, resource.name);
  };

  const openResourceInWorkbench = async (
    resource: SpaceResource,
  ): Promise<void> => {
    setOpeningResourceId(resource.id);
    if (resource.type === "document") {
      try {
        await workbench.openUrl(resource.locator);
        onPersistenceUnavailable(false);
      } catch {
        toast.error("app.persistenceUnavailable");
        onPersistenceUnavailable(true);
      } finally {
        setOpeningResourceId("");
      }
      return;
    }
    if (!business) {
      toast.error("app.persistenceUnavailable");
      setOpeningResourceId("");
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
    } finally {
      setOpeningResourceId("");
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
      setRepositoryIndexStatusSummaries((current) => {
        const { [resource.id]: _removed, ...rest } = current;
        return rest;
      });
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

  const loadRepositoryIndexStatusSummary = useCallback(
    (resource: SpaceResource): void => {
      if (resource.type !== "repository") return;
      if (!business || typeof business.getRepositorySnapshot !== "function") {
        setRepositoryIndexStatusSummaries((current) => ({
          ...current,
          [resource.id]: {
            loading: false,
            error: true,
          },
        }));
        return;
      }
      const current = repositoryIndexStatusSummaries[resource.id];
      if (current?.loading || current?.counts) return;
      setRepositoryIndexStatusSummaries((items) => ({
        ...items,
        [resource.id]: { loading: true },
      }));
      void business
        .getRepositorySnapshot({ sourceId: resource.id })
        .then((view) => {
          setRepositoryIndexStatusSummaries((items) => ({
            ...items,
            [resource.id]: {
              loading: false,
              counts: summarizeRepositoryIndexStatusCounts(view),
            },
          }));
          onPersistenceUnavailable(false);
        })
        .catch(() => {
          setRepositoryIndexStatusSummaries((items) => ({
            ...items,
            [resource.id]: {
              loading: false,
              error: true,
            },
          }));
        });
    },
    [business, onPersistenceUnavailable, repositoryIndexStatusSummaries],
  );

  const loadLatestIndexJob = async (
    sourceId: string,
    name: string,
  ): Promise<void> => {
    setResourceIndexJob({
      sourceId,
      name,
      loading: true,
    });
    if (!business) {
      setResourceIndexJob({
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
      setResourceIndexJob((current) =>
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
      setResourceIndexJob((current) =>
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
          <Toolbar
            className="space-resource-controls"
            aria-label={t("resources.title")}
          >
            <div className="space-resource-actions">
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
            </div>
            <label className="space-resource-search">
              <Search size={14} />
              <input
                name="resources-search-aria"
                autoComplete="off"
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

          <SpaceKnowledgeResourceTable
            total={filteredResources.length}
            pageItems={resourcePagination.pageItems}
            page={resourcePagination.page}
            pageSize={resourcePagination.pageSize}
            resourceTypeOptions={resourceTypeOptions}
            resourceFilter={resourceFilter}
            resourceIndexOptions={resourceIndexOptions}
            resourceIndexFilter={resourceIndexFilter}
            repositoryIndexStatusSummaries={repositoryIndexStatusSummaries}
            onPageChange={resourcePagination.setPage}
            onResourceFilterChange={(value) =>
              setResourceFilter(value, { replace: true })
            }
            onResourceIndexFilterChange={(value) =>
              setResourceIndexFilter(value, { replace: true })
            }
            onOpen={openResource}
            onSync={syncResource}
            onRefreshPolicyChange={changeRefreshPolicy}
            onRemove={removeResource}
            onLoadRepositoryIndexStatusSummary={
              loadRepositoryIndexStatusSummary
            }
          />
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
      {resourceDetail ? (
        <ResourceDetailDialog
          resource={resourceDetail}
          loading={openingResourceId === resourceDetail.id}
          indexJob={
            resourceIndexJob?.sourceId === resourceDetail.id
              ? resourceIndexJob
              : undefined
          }
          onRetryIndexJob={() =>
            void loadLatestIndexJob(resourceDetail.id, resourceDetail.name)
          }
          onOpen={openResourceInWorkbench}
          onClose={() => {
            setResourceDetail(undefined);
            setResourceIndexJob(undefined);
          }}
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
          resource={repositoryPreview.resource}
          indexJob={
            resourceIndexJob?.sourceId === repositoryPreview.resource.id
              ? resourceIndexJob
              : undefined
          }
          onRetryIndexJob={() =>
            void loadLatestIndexJob(
              repositoryPreview.resource.id,
              repositoryPreview.name,
            )
          }
          onClose={() => {
            setRepositoryPreview(undefined);
            setResourceIndexJob(undefined);
          }}
        />
      ) : null}
    </div>
  );
}
