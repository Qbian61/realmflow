import type { SpaceResource } from "../../domain/space-resource";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { TranslationKey } from "../../localization/translate";
import { getResourceIndexErrorLabelKey } from "./resource-presentation";

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

export function KnowledgeResourceStatusSummary({
  resource,
  className,
}: {
  resource: SpaceResource;
  className?: string;
}): JSX.Element {
  const { locale, t } = useLocalization();
  const resourceStatus = resource.status
    ? t(resourceStatusLabelKeys[resource.status])
    : t("resources.never");
  const indexAvailability = resource.index
    ? t(indexHealthLabelKeys[resource.index.health])
    : t("resources.never");
  const errorLabelKey = getResourceIndexErrorLabelKey(resource);
  const errorMessage = errorLabelKey
    ? t(errorLabelKey)
    : resource.errorMessage;

  return (
    <section
      className={["space-resource-status-summary", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("resources.detail.indexSection")}
    >
      <h3>{t("resources.detail.indexSection")}</h3>
      <dl>
        <div>
          <dt>{t("resources.resourceStatus")}</dt>
          <dd>{resourceStatus}</dd>
        </div>
        <div>
          <dt>{t("resources.indexAvailability")}</dt>
          <dd data-health={resource.index?.health}>{indexAvailability}</dd>
        </div>
        <div>
          <dt>{t("resources.lastChecked")}</dt>
          <dd>
            {formatResourceTimestamp(
              resource.refresh?.lastCheckedAt,
              locale,
              t("resources.never"),
            )}
          </dd>
        </div>
        <div>
          <dt>{t("resources.lastChanged")}</dt>
          <dd>
            {formatResourceTimestamp(
              resource.refresh?.lastChangedAt,
              locale,
              t("resources.never"),
            )}
          </dd>
        </div>
        <div>
          <dt>{t("resources.lastIndexed")}</dt>
          <dd>
            {formatResourceTimestamp(
              resource.index?.indexedAt,
              locale,
              t("resources.never"),
            )}
          </dd>
        </div>
        {errorMessage ? (
          <div>
            <dt>{t("resources.errorLabel")}</dt>
            <dd>{errorMessage}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function formatResourceTimestamp(
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
