import {
  BookOpen,
  DatabaseZap,
  File,
  FileCode2,
  History,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { KnowledgeRefreshPreset } from "../../../domain/knowledge-refresh";
import type { SpaceResource } from "../../domain/space-resource";
import { Badge, IconButton } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { TranslationKey } from "../../localization/translate";

const resourceLabelKeys = {
  file: "resources.type.file",
  document: "resources.type.document",
  repository: "resources.type.repository",
} as const satisfies Record<SpaceResource["type"], TranslationKey>;

const resourceStatusLabelKeys = {
  registered: "resources.status.registered",
  syncing: "resources.status.syncing",
  indexed: "resources.status.indexed",
  stale: "resources.status.stale",
  failed: "resources.status.failed",
  removed: "resources.status.removed",
} as const satisfies Record<
  NonNullable<SpaceResource["status"]>,
  TranslationKey
>;

const indexHealthLabelKeys = {
  missing: "resources.index.missing",
  building: "resources.index.building",
  ready: "resources.index.ready",
  failed: "resources.index.failed",
} as const satisfies Record<
  NonNullable<SpaceResource["index"]>["health"],
  TranslationKey
>;

const refreshPresets: ReadonlyArray<{
  value: KnowledgeRefreshPreset;
  label: TranslationKey;
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
  onIndex,
  onViewLatestIndexJob,
  onRefreshPolicyChange,
  onRemove,
}: {
  resource: SpaceResource;
  onOpen: (resource: SpaceResource) => Promise<void>;
  onSync: (resource: SpaceResource) => Promise<void>;
  onIndex: (resource: SpaceResource) => Promise<void>;
  onViewLatestIndexJob: (resource: SpaceResource) => void;
  onRefreshPolicyChange: (
    resource: SpaceResource,
    preset: KnowledgeRefreshPreset,
  ) => Promise<void>;
  onRemove: (resource: SpaceResource) => Promise<void>;
}): JSX.Element {
  const { locale, t } = useLocalization();
  const ResourceIcon =
    resource.type === "file"
      ? File
      : resource.type === "repository"
        ? FileCode2
        : BookOpen;
  const canIndex =
    resource.status &&
    resource.status !== "syncing" &&
    resource.status !== "removed";
  const indexLabel = t(
    resource.index?.health === "ready"
      ? "resources.action.rebuildIndex"
      : "resources.action.buildIndex",
    { name: resource.name },
  );
  const resourceStatus = resource.status
    ? t(resourceStatusLabelKeys[resource.status])
    : undefined;
  const indexAvailability = resource.index
    ? t(indexHealthLabelKeys[resource.index.health])
    : undefined;
  const refreshLabel = t("resources.action.refresh", { name: resource.name });
  const deleteLabel = t("resources.action.delete", { name: resource.name });

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
            <small className="space-resource-locator" title={resource.locator}>
              {resource.locator}
            </small>
          </span>
        </button>
      </div>
      <span role="cell">{t(resourceLabelKeys[resource.type])}</span>
      <span className="space-resource-state" role="cell">
        <span className="space-resource-detail">{resource.detail}</span>
        {resourceStatus ? (
          <Badge
            tone={resourceStatusTone(resource.status)}
            className="space-resource-status-line"
            aria-label={`${t("resources.resourceStatus")}：${resourceStatus}`}
          >
            <small>{t("resources.resourceStatus")}</small>
            <strong>{resourceStatus}</strong>
          </Badge>
        ) : null}
        {indexAvailability ? (
          <Badge
            tone={indexHealthTone(resource.index?.health)}
            className="space-resource-status-line"
            aria-label={`${t("resources.indexAvailability")}：${indexAvailability}`}
          >
            <small>{t("resources.indexAvailability")}</small>
            <strong data-health={resource.index?.health}>
              {indexAvailability}
            </strong>
          </Badge>
        ) : null}
        {resource.errorMessage ? (
          <small className="space-resource-error">
            {resource.errorMessage}
          </small>
        ) : null}
      </span>
      <span className="space-resource-timestamps" role="cell">
        <small>
          <b>{t("resources.lastChecked")}</b>
          {formatTimestamp(
            resource.refresh?.lastCheckedAt,
            locale,
            t("resources.never"),
          )}
        </small>
        <small>
          <b>{t("resources.lastChanged")}</b>
          {formatTimestamp(
            resource.refresh?.lastChangedAt,
            locale,
            t("resources.never"),
          )}
        </small>
        <small>
          <b>{t("resources.lastIndexed")}</b>
          {formatTimestamp(
            resource.index?.indexedAt,
            locale,
            t("resources.never"),
          )}
        </small>
      </span>
      <span className="space-resource-row-actions" role="cell">
        {resource.refresh ? (
          <select name="resources-refresh-aria" autoComplete="off"
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
          </select>
        ) : null}
        {canIndex ? (
          <IconButton
            size="compact"
            variant="ghost"
            aria-label={indexLabel}
            title={indexLabel}
            onClick={() => void onIndex(resource)}
          >
            <DatabaseZap size={14} />
          </IconButton>
        ) : null}
        <IconButton
          size="compact"
          variant="ghost"
          aria-label={t("resources.indexJob.open", { name: resource.name })}
          title={t("tooltip.viewIndexJob")}
          onClick={() => onViewLatestIndexJob(resource)}
        >
          <History size={14} />
        </IconButton>
        {resource.status !== "syncing" && resource.status !== "removed" ? (
          <IconButton
            size="compact"
            variant="ghost"
            aria-label={refreshLabel}
            title={refreshLabel}
            onClick={() => void onSync(resource)}
          >
            <RefreshCw size={14} />
          </IconButton>
        ) : null}
        <IconButton
          size="compact"
          variant="ghost"
          aria-label={deleteLabel}
          title={deleteLabel}
          onClick={() => void onRemove(resource)}
        >
          <Trash2 size={14} />
        </IconButton>
      </span>
    </div>
  );
}

function resourceStatusTone(
  status: SpaceResource["status"],
): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "indexed") return "success";
  if (status === "syncing") return "info";
  if (status === "stale") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

function indexHealthTone(
  health: NonNullable<SpaceResource["index"]>["health"] | undefined,
): "neutral" | "success" | "warning" | "danger" | "info" {
  if (health === "ready") return "success";
  if (health === "building") return "info";
  if (health === "failed") return "danger";
  return "neutral";
}

function formatTimestamp(
  value: number | null | undefined,
  locale: string,
  fallback: string,
): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}
