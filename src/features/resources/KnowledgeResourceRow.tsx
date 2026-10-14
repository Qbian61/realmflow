import { DatabaseZap, Trash2 } from "lucide-react";
import { useId, useState, type FocusEvent } from "react";
import type { KnowledgeRefreshPreset } from "../../../domain/knowledge-refresh";
import type { SpaceResource } from "../../domain/space-resource";
import { IconButton, Select } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  getResourceDisplayType,
  resourceDisplayTypeLabelKeys,
} from "./resource-display-type";
import {
  getResourceIcon,
  getResourceIndexErrorLabelKey,
  getResourceIndexHealth,
  type RepositoryIndexStatus,
  type RepositoryIndexStatusCounts,
  repositoryIndexStatusLabelKeys,
  resourceIndexHealthLabelKeys,
} from "./resource-presentation";

export type RepositoryIndexStatusSummaryState = {
  loading: boolean;
  counts?: RepositoryIndexStatusCounts;
  error?: boolean;
};

const refreshPresets: ReadonlyArray<{
  value: KnowledgeRefreshPreset;
  label:
    | "resources.refresh.manual"
    | "resources.refresh.5m"
    | "resources.refresh.15m"
    | "resources.refresh.30m"
    | "resources.refresh.1h"
    | "resources.refresh.daily";
}> = [
  { value: "manual", label: "resources.refresh.manual" },
  { value: "5m", label: "resources.refresh.5m" },
  { value: "15m", label: "resources.refresh.15m" },
  { value: "30m", label: "resources.refresh.30m" },
  { value: "1h", label: "resources.refresh.1h" },
  { value: "daily", label: "resources.refresh.daily" },
];

export function KnowledgeResourceRow({
  resource,
  onOpen,
  onSync,
  onRefreshPolicyChange,
  onRemove,
  repositoryIndexStatusSummary,
  onLoadRepositoryIndexStatusSummary,
}: {
  resource: SpaceResource;
  onOpen: (resource: SpaceResource) => Promise<void>;
  onSync: (resource: SpaceResource) => Promise<void>;
  onRefreshPolicyChange: (
    resource: SpaceResource,
    preset: KnowledgeRefreshPreset,
  ) => Promise<void>;
  onRemove: (resource: SpaceResource) => Promise<void>;
  repositoryIndexStatusSummary?: RepositoryIndexStatusSummaryState;
  onLoadRepositoryIndexStatusSummary?: (resource: SpaceResource) => void;
}): JSX.Element {
  const { t } = useLocalization();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const summaryId = useId();
  const ResourceIcon = getResourceIcon(resource);
  const canCheckAndIndex =
    resource.status &&
    resource.status !== "syncing" &&
    resource.status !== "removed";
  const indexLabel = t("resources.action.checkAndIndex", {
    name: resource.name,
  });
  const indexTooltipLabel = t("resources.action.checkAndIndexTooltip");
  const resourceDisplayType = getResourceDisplayType(resource);
  const deleteLabel = t("resources.action.delete", { name: resource.name });
  const deleteTooltipLabel = t("resources.action.deleteTooltip");
  const resourceSubtitle = resourceSubtitleText(resource, t("resources.never"));
  const indexHealth = getResourceIndexHealth(resource);
  const indexStatusLabel = t(resourceIndexHealthLabelKeys[indexHealth]);
  const indexErrorLabelKey = getResourceIndexErrorLabelKey(resource);
  const indexErrorMessage = indexErrorLabelKey
    ? t(indexErrorLabelKey)
    : undefined;
  const indexFailureAria = indexErrorMessage
    ? t("resources.indexFailureAria", {
        status: indexStatusLabel,
        message: indexErrorMessage,
      })
    : undefined;
  const indexFailureTitle = indexErrorMessage
    ? t("resources.indexFailureTitle", { message: indexErrorMessage })
    : undefined;
  const canShowRepositoryIndexSummary = resource.type === "repository";
  const openRepositoryIndexSummary = (): void => {
    if (!canShowRepositoryIndexSummary) return;
    setSummaryOpen(true);
    onLoadRepositoryIndexStatusSummary?.(resource);
  };
  const closeRepositoryIndexSummary = (
    event: FocusEvent<HTMLSpanElement>,
  ): void => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setSummaryOpen(false);
  };

  return (
    <div role="row">
      <div role="cell">
        <button
          className="space-resource-name"
          type="button"
          aria-label={t("resources.action.open", { name: resource.name })}
          onClick={() => void onOpen(resource)}
        >
          <span>
            <ResourceIcon size={15} />
          </span>
          <span>
            <strong>{resource.name}</strong>
            {resourceSubtitle ? (
              <small className="space-resource-name-meta">
                {resourceSubtitle}
              </small>
            ) : null}
          </span>
        </button>
      </div>
      <span role="cell">
        {t(resourceDisplayTypeLabelKeys[resourceDisplayType])}
      </span>
      <span role="cell">
        {canShowRepositoryIndexSummary ? (
          <span
            className="space-resource-index-status-wrap"
            onMouseEnter={openRepositoryIndexSummary}
            onMouseLeave={() => setSummaryOpen(false)}
            onFocus={openRepositoryIndexSummary}
            onBlur={closeRepositoryIndexSummary}
          >
            <span
              className="space-resource-index-status"
              data-health={indexHealth}
              tabIndex={0}
              aria-describedby={summaryOpen ? summaryId : undefined}
              aria-label={indexFailureAria}
              title={indexFailureTitle}
            >
              {indexStatusLabel}
            </span>
            {summaryOpen ? (
              <RepositoryIndexStatusSummaryTooltip
                id={summaryId}
                summary={repositoryIndexStatusSummary}
                labels={{
                  title: t("resources.repositoryIndexStatusSummary.title"),
                  loading: t("resources.repositoryIndexStatusSummary.loading"),
                  empty: t("resources.repositoryIndexStatusSummary.empty"),
                  loadFailed: t(
                    "resources.repositoryIndexStatusSummary.loadFailed",
                  ),
                  count: (count) =>
                    t("resources.repositoryIndexStatusSummary.count", {
                      count,
                    }),
                  statuses: {
                    indexed: t(repositoryIndexStatusLabelKeys.indexed),
                    failed: t(repositoryIndexStatusLabelKeys.failed),
                    indexing: t(repositoryIndexStatusLabelKeys.indexing),
                    pending: t(repositoryIndexStatusLabelKeys.pending),
                    skipped: t(repositoryIndexStatusLabelKeys.skipped),
                  },
                }}
              />
            ) : null}
          </span>
        ) : (
          <span
            className="space-resource-index-status"
            data-health={indexHealth}
            aria-label={indexFailureAria}
            title={indexFailureTitle}
          >
            {indexStatusLabel}
          </span>
        )}
      </span>
      <span className="space-resource-row-actions" role="cell">
        {resource.refresh ? (
          <Select name="resources-refresh-aria" autoComplete="off"
            aria-label={t("resources.refresh.aria", { name: resource.name })}
            value={resource.refresh.preset}
            onChange={(event) =>
              void onRefreshPolicyChange(
                resource,
                event.target.value as KnowledgeRefreshPreset,
              )
            }
          >
            {refreshPresets.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {t(preset.label)}
              </option>
            ))}
          </Select>
        ) : null}
        {canCheckAndIndex ? (
          <IconButton
            size="compact"
            variant="ghost"
            aria-label={indexLabel}
            title={indexTooltipLabel}
            onClick={() => void onSync(resource)}
          >
            <DatabaseZap size={14} />
          </IconButton>
        ) : null}
        <IconButton
          size="compact"
          variant="ghost"
          aria-label={deleteLabel}
          title={deleteTooltipLabel}
          onClick={() => void onRemove(resource)}
        >
          <Trash2 size={14} />
        </IconButton>
      </span>
    </div>
  );
}

const repositoryIndexStatusOrder: RepositoryIndexStatus[] = [
  "indexed",
  "failed",
  "indexing",
  "pending",
  "skipped",
];

function RepositoryIndexStatusSummaryTooltip({
  id,
  summary,
  labels,
}: {
  id: string;
  summary?: RepositoryIndexStatusSummaryState;
  labels: {
    title: string;
    loading: string;
    empty: string;
    loadFailed: string;
    count: (count: number) => string;
    statuses: Record<RepositoryIndexStatus, string>;
  };
}): JSX.Element {
  const rows = repositoryIndexStatusOrder
    .map((status) => ({
      status,
      count: summary?.counts?.[status] ?? 0,
    }))
    .filter(({ count }) => count > 0);

  return (
    <span
      id={id}
      className="space-resource-index-status-summary"
      role="tooltip"
      aria-label={labels.title}
    >
      <strong>{labels.title}</strong>
      {!summary || summary.loading ? (
        <span className="space-resource-index-status-summary-message">
          {labels.loading}
        </span>
      ) : summary.error ? (
        <span className="space-resource-index-status-summary-message">
          {labels.loadFailed}
        </span>
      ) : rows.length === 0 ? (
        <span className="space-resource-index-status-summary-message">
          {labels.empty}
        </span>
      ) : (
        rows.map(({ status, count }) => (
          <span
            className="space-resource-index-status-summary-row"
            data-status={status}
            key={status}
          >
            <span>{labels.statuses[status]}</span>
            <b>{labels.count(count)}</b>
          </span>
        ))
      )}
    </span>
  );
}

function resourceSubtitleText(
  resource: SpaceResource,
  fallback: string,
): string | undefined {
  if (resource.type !== "repository") return undefined;
  const branch =
    resource.repository?.selectedBranch ??
    resource.repository?.revisionLabel?.split("@")[0] ??
    fallback;
  const revision = formatRepositoryRevision(
    resource.repository?.revisionLabel,
    fallback,
  );
  return `${branch} · ${revision}`;
}

function formatRepositoryRevision(
  revisionLabel: string | undefined,
  fallback: string,
): string {
  if (!revisionLabel) return fallback;
  const [, revision] = revisionLabel.split("@");
  return revision || revisionLabel;
}
