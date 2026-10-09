import { Boxes, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import type { RealmFlowApi } from "../../shared/types";
import type { BusinessApi } from "../../shared/business";
import type { SpaceResource } from "../domain/space-resource";
import type { RequirementStageId } from "../domain/requirement";
import type { WorkspaceRequirement, WorkspaceSpace } from "../domain/workspace";
import {
  formatResourceUpdatedAt,
  mapBusinessResource,
} from "../features/resources/space-resource-mappers";
import { SpaceKnowledgePanel } from "../features/resources/SpaceKnowledgePanel";
import { SpaceConversationComposer } from "../features/conversation/SpaceConversationComposer";
import ProductAnalyticsPanel from "../features/analytics/ProductAnalyticsPanel";
import { WorkspaceHeaderPortal } from "../features/navigation/WorkspaceLayout";
import { RequirementCreateDialog } from "../features/navigation/RequirementCreateDialog";
import { WorkspaceNameDialog } from "../features/navigation/WorkspaceNameDialog";
import {
  Button,
  EmptyState,
  InlineAlert,
  Metric,
  Tab,
  TabList,
  Tabs,
  Toolbar,
} from "../components/ui";
import { useLocalization } from "../localization/LocalizationProvider";
import type { TranslationKey } from "../localization/translate";
import { useUrlQueryState } from "../navigation/url-query-state";
import { spaceTabCodec } from "./page-query-state";

type SpaceDetailPageProps = {
  spaces: WorkspaceSpace[];
  requirementsBySpace: Record<string, WorkspaceRequirement[]>;
  api?: RealmFlowApi;
  business?: BusinessApi;
  onCreateRequirement?: (
    spacePath: string,
    title: string,
    templateVersionId?: string,
  ) => void | Promise<void>;
  onCreateSession?: (
    spacePath: string,
    prompt: string,
    modelProfileId?: string,
  ) => void | Promise<void>;
};

const stageLabelKeys: Record<RequirementStageId, TranslationKey> = {
  analysis: "stage.analysis",
  design: "stage.design",
  implementation: "stage.implementation",
  testing: "stage.testing",
  release: "stage.release",
  retrospective: "stage.retrospective",
};

export default function SpaceDetailPage({
  spaces,
  requirementsBySpace,
  api = window.realmflow,
  business = window.realmflow?.business,
  onCreateRequirement,
  onCreateSession,
}: SpaceDetailPageProps): JSX.Element {
  const { t } = useLocalization();
  const { spaceId } = useParams();
  const [searchParams] = useSearchParams();
  const spacePath = `/spaces/${spaceId ?? ""}`;
  const space = spaces.find((item) => item.path === spacePath);
  const requirements = requirementsBySpace[spacePath] ?? [];
  const [activeTab, setActiveTab] = useUrlQueryState("tab", spaceTabCodec);
  const [resources, setResources] = useState<SpaceResource[]>([]);
  const [resourcePersistenceUnavailable, setResourcePersistenceUnavailable] =
    useState(false);
  const [createRequirementOpen, setCreateRequirementOpen] = useState(
    searchParams.get("createRequirement") === "1",
  );
  const [requirementDraft, setRequirementDraft] = useState("");

  useEffect(() => {
    if (!business || !space?.id) return;
    let disposed = false;
    void business
      .listKnowledgeSources({ workspaceId: space.id })
      .then((items) => {
        if (disposed) return;
        setResources(items.map(mapBusinessResource));
        setResourcePersistenceUnavailable(false);
      })
      .catch(() => {
        if (!disposed) setResourcePersistenceUnavailable(true);
      });
    return () => {
      disposed = true;
    };
  }, [business, space?.id, spacePath]);

  const stageCounts = useMemo(() => {
    const counts = new Map<RequirementStageId, number>();
    for (const requirement of requirements) {
      const stage = requirement.stage ?? "analysis";
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return counts;
  }, [requirements]);

  if (!space) return <Navigate to="/chat/new" replace />;

  const completedCount = requirements.filter(
    (requirement) => requirement.status === "completed",
  ).length;
  const pendingCount = requirements.filter(
    (requirement) => requirement.status === "pending",
  ).length;
  const activeCount = requirements.length - completedCount - pendingCount;
  const closeCreateRequirement = (): void => {
    setCreateRequirementOpen(false);
    setRequirementDraft("");
  };
  const submitFallbackRequirement = (
    event: FormEvent<HTMLFormElement>,
  ): void => {
    event.preventDefault();
    const title = requirementDraft.trim();
    if (!title || !onCreateRequirement) return;
    void onCreateRequirement(spacePath, title);
    closeCreateRequirement();
  };

  return (
    <div
      className={
        resourcePersistenceUnavailable
          ? "space-detail-page has-persistence-issue"
          : "space-detail-page"
      }
    >
      <h1 className="sr-only">{space.label}</h1>
      <WorkspaceHeaderPortal>
        <Toolbar
          variant="workspace-header"
          className="space-detail-header"
          aria-label={t("spaceDetail.tabs")}
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as "overview" | "resources")
            }
          >
            <TabList
              className="space-detail-tabs"
              aria-label={t("spaceDetail.tabs")}
            >
            <Tab
              id="space-resources-tab"
              aria-controls="space-resources-panel"
              value="resources"
            >
              {t("spaceDetail.knowledge", { count: resources.length })}
            </Tab>
            <Tab
              id="space-overview-tab"
              aria-controls="space-overview-panel"
              className="space-detail-name"
              value="overview"
              title={space.label}
            >
              <span className="space-detail-name-label">
                {space.label} ({requirements.length})
              </span>
            </Tab>
            </TabList>
          </Tabs>
          {onCreateRequirement ? (
            <Button
              variant="primary"
              size="default"
              leadingIcon={<Plus size={15} aria-hidden="true" />}
              onClick={() => setCreateRequirementOpen(true)}
            >
              {t("workspace.createRequirement")}
            </Button>
          ) : null}
        </Toolbar>
      </WorkspaceHeaderPortal>

      {createRequirementOpen && business ? (
        <RequirementCreateDialog
          business={business}
          spaceLabel={space.label}
          onClose={closeCreateRequirement}
          onCreate={(title, templateVersionId) =>
            onCreateRequirement?.(spacePath, title, templateVersionId)
          }
        />
      ) : createRequirementOpen ? (
        <WorkspaceNameDialog
          dialog={{
            kind: "requirement",
            spacePath,
            spaceLabel: space.label,
          }}
          draft={requirementDraft}
          onDraftChange={setRequirementDraft}
          onClose={closeCreateRequirement}
          onSubmit={submitFallbackRequirement}
        />
      ) : null}

      {resourcePersistenceUnavailable ? (
        <InlineAlert
          className="persistence-notice"
          tone="warning"
          title={t("spaceDetail.persistenceUnavailable")}
          aria-label={t("spaceDetail.persistenceStatus")}
        />
      ) : null}

      {activeTab === "overview" ? (
        <div
          id="space-overview-panel"
          className="space-detail-scroll"
          role="tabpanel"
          aria-labelledby="space-overview-tab"
        >
          <div className="space-detail-content">
            <SpaceConversationComposer
              spacePath={spacePath}
              inputId={`space-attachment-${spaceId ?? "unknown"}`}
              onCreateSession={onCreateSession}
            />

            <section
              className="space-requirement-statistics"
              aria-label={t("spaceDetail.statistics")}
            >
              <div className="space-statistics-summary">
                <Metric label={t("spaceDetail.all")} value={requirements.length} />
                <Metric label={t("spaceDetail.active")} value={activeCount} />
                <Metric
                  label={t("spaceDetail.completed")}
                  value={completedCount}
                />
                <Metric label={t("spaceDetail.pending")} value={pendingCount} />
              </div>

              <div className="space-statistics-grid">
                <section>
                  <header>
                    <h2>{t("spaceDetail.stageDistribution")}</h2>
                    <span>
                      {t("spaceDetail.requirementCount", {
                        count: requirements.length,
                      })}
                    </span>
                  </header>
                  <div className="space-stage-list">
                    {(Object.keys(stageLabelKeys) as RequirementStageId[]).map(
                      (stage) => {
                        const count = stageCounts.get(stage) ?? 0;
                        const width =
                          requirements.length === 0
                            ? 0
                            : Math.round((count / requirements.length) * 100);
                        return (
                          <div className="space-stage-row" key={stage}>
                            <span>{t(stageLabelKeys[stage])}</span>
                            <i>
                              <b style={{ width: `${width}%` }} />
                            </i>
                            <strong>{count}</strong>
                          </div>
                        );
                      },
                    )}
                  </div>
                </section>

                <section>
                  <header>
                    <h2>{t("spaceDetail.currentRequirements")}</h2>
                    <span>{t("spaceDetail.recentlyUpdated")}</span>
                  </header>
                  {requirements.length > 0 ? (
                    <div className="space-requirement-table" role="table">
                      <div role="row">
                        <span role="columnheader">
                          {t("spaceDetail.requirement")}
                        </span>
                        <span role="columnheader">
                          {t("spaceDetail.currentStage")}
                        </span>
                        <span role="columnheader">
                          {t("spaceDetail.updatedAt")}
                        </span>
                      </div>
                      {requirements.map((requirement) => (
                        <a
                          href={`#${space.path}/requirements/${requirement.id}`}
                          role="row"
                          key={requirement.id}
                        >
                          <strong role="cell">{requirement.title}</strong>
                          <span role="cell">
                            {t(stageLabelKeys[requirement.stage ?? "analysis"])}
                          </span>
                          <span role="cell">
                            {formatResourceUpdatedAt(requirement.updatedAt)}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      className="space-empty-block"
                      icon={<Boxes size={20} />}
                      title={t("spaceDetail.empty")}
                    />
                  )}
                </section>
              </div>
            </section>

            {business?.queryProductAnalytics ? (
              <section className="space-detail-analytics">
                <ProductAnalyticsPanel
                  business={business}
                  fixedWorkspaceId={space.id}
                />
              </section>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          id="space-resources-panel"
          role="tabpanel"
          aria-labelledby="space-resources-tab"
        >
          <SpaceKnowledgePanel
            spaceId={space.id ?? ""}
            api={api}
            business={business}
            resources={resources}
            setResources={setResources}
            onPersistenceUnavailable={setResourcePersistenceUnavailable}
          />
        </div>
      )}
    </div>
  );
}
