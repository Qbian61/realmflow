import { useCallback, useEffect, useRef, useState } from "react";
import type { BusinessApi } from "../../shared/business";
import type {
  ModelStatisticsOptions,
  ModelStatisticsQuery,
  ModelStatisticsResult,
} from "../../shared/model-statistics";
import ModelStatisticsFilters from "../features/analytics/ModelStatisticsFilters";
import ModelStatisticsGroups from "../features/analytics/ModelStatisticsGroups";
import {
  loadModelStatisticsPreferences,
  saveModelStatisticsPreferences,
  type ModelStatisticsPreferences,
} from "../features/analytics/model-statistics-preferences";
import ModelStatisticsSummary from "../features/analytics/ModelStatisticsSummary";
import ModelStatisticsTrend from "../features/analytics/ModelStatisticsTrend";
import ProductAnalyticsPanel from "../features/analytics/ProductAnalyticsPanel";
import RuntimeGovernancePanel from "../features/analytics/RuntimeGovernancePanel";
import {
  InlineAlert,
  PageBody,
  PageContainer,
  Tab,
  TabList,
  Tabs,
} from "../components/ui";
import {
  loadProductAnalyticsPreferences,
  saveProductAnalyticsPreferences,
} from "../features/analytics/product-analytics-preferences";
import { WorkspaceHeaderPortal } from "../features/navigation/WorkspaceLayout";
import { useLocalization } from "../localization/LocalizationProvider";

const DAY_MS = 24 * 60 * 60 * 1_000;

const EMPTY_OPTIONS: ModelStatisticsOptions = {
  providers: [],
  models: [],
  workspaces: [],
  requirements: [],
  nodes: [],
  conversations: [],
};

const FILTER_OPTION_KEYS = {
  providerId: "providers",
  modelProfileId: "models",
  workspaceId: "workspaces",
  requirementId: "requirements",
  nodeId: "nodes",
  conversationId: "conversations",
} as const;

function createQuery(
  preferences: ModelStatisticsPreferences,
): ModelStatisticsQuery {
  const { timeRange, ...filters } = preferences;
  if (timeRange === "all") return filters;
  const to = Date.now();
  return {
    ...filters,
    from: to - Number.parseInt(timeRange, 10) * DAY_MS,
    to,
  };
}

function clearMissingSelections(
  preferences: ModelStatisticsPreferences,
  options: ModelStatisticsOptions,
): ModelStatisticsPreferences {
  let next = preferences;
  for (const [filterKey, optionKey] of Object.entries(
    FILTER_OPTION_KEYS,
  ) as Array<
    [
      keyof typeof FILTER_OPTION_KEYS,
      (typeof FILTER_OPTION_KEYS)[keyof typeof FILTER_OPTION_KEYS],
    ]
  >) {
    const selected = preferences[filterKey];
    if (
      selected &&
      !options[optionKey].some((option) => option.id === selected)
    ) {
      if (next === preferences) next = { ...preferences };
      delete next[filterKey];
    }
  }
  return next;
}

function ModelAnalyticsView({
  business,
}: {
  business?: BusinessApi;
}): JSX.Element {
  const { t } = useLocalization();
  const requestId = useRef(0);
  const [preferences, setPreferences] = useState(
    loadModelStatisticsPreferences,
  );
  const [result, setResult] = useState<ModelStatisticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    saveModelStatisticsPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    if (!business) {
      setError(t("analytics.unavailable"));
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    void business
      .queryModelStatistics(createQuery(preferences))
      .then((nextResult) => {
        if (currentRequest !== requestId.current) return;
        const validPreferences = clearMissingSelections(
          preferences,
          nextResult.options,
        );
        if (validPreferences !== preferences) {
          setPreferences(validPreferences);
          return;
        }
        setResult(nextResult);
      })
      .catch(() => {
        if (currentRequest !== requestId.current) return;
        setResult(null);
        setError(t("analytics.loadFailed"));
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  }, [business, preferences, retryVersion, t]);

  return (
    <>
      <ModelStatisticsFilters
        value={preferences}
        options={result?.options ?? EMPTY_OPTIONS}
        disabled={!business}
        onChange={setPreferences}
      />

      {error ? (
        <InlineAlert
          className="model-page-error analytics-error"
          tone="danger"
          title={error}
          actionLabel={business ? t("common.retry") : undefined}
          onAction={
            business ? () => setRetryVersion((value) => value + 1) : undefined
          }
        />
      ) : null}

      {loading ? <p className="model-empty">{t("analytics.loading")}</p> : null}
      {result ? (
        <>
          <ModelStatisticsSummary summary={result.summary} />
          <ModelStatisticsTrend points={result.trend} />
          <ModelStatisticsGroups
            groupBy={preferences.groupBy}
            groups={result.groups}
          />
        </>
      ) : null}
    </>
  );
}

export default function AnalyticsPage(): JSX.Element {
  const { t } = useLocalization();
  const business = window.realmflow?.business;
  const [preferences, setPreferences] = useState(
    loadProductAnalyticsPreferences,
  );

  useEffect(() => {
    saveProductAnalyticsPreferences(preferences);
  }, [preferences]);

  const setWorkspaceId = useCallback((workspaceId: string | undefined) => {
    setPreferences((current) => ({
      ...current,
      ...(workspaceId ? { workspaceId } : { workspaceId: undefined }),
    }));
  }, []);

  return (
    <div className="model-page analytics-page">
      <h1 className="sr-only">{t("navigation.analytics")}</h1>
      <WorkspaceHeaderPortal>
        <div className="analytics-page-header">
          <Tabs
            value={preferences.view}
            onValueChange={(view) =>
              setPreferences((current) => ({
                ...current,
                view: view as typeof current.view,
              }))
            }
          >
            <TabList
              className="analytics-page-tabs"
              aria-label={t("productAnalytics.views.aria")}
            >
              <Tab
                id="analytics-product-tab"
                aria-controls="analytics-product-panel"
                value="product"
              >
                {t("productAnalytics.view.product")}
              </Tab>
              <Tab
                id="analytics-models-tab"
                aria-controls="analytics-models-panel"
                value="models"
              >
                {t("productAnalytics.view.models")}
              </Tab>
              <Tab
                id="analytics-governance-tab"
                aria-controls="analytics-governance-panel"
                value="governance"
              >
                {t("productAnalytics.view.governance")}
              </Tab>
            </TabList>
          </Tabs>
        </div>
      </WorkspaceHeaderPortal>

      <PageBody mode="wide" className="analytics-page-content">
        <PageContainer>
          {preferences.view === "product" ? (
            <div
              id="analytics-product-panel"
              role="tabpanel"
              aria-labelledby="analytics-product-tab"
            >
              <ProductAnalyticsPanel
                business={business}
                workspaceId={preferences.workspaceId}
                onWorkspaceIdChange={setWorkspaceId}
              />
            </div>
          ) : preferences.view === "models" ? (
            <div
              id="analytics-models-panel"
              role="tabpanel"
              aria-labelledby="analytics-models-tab"
            >
              <ModelAnalyticsView business={business} />
            </div>
          ) : (
            <div
              id="analytics-governance-panel"
              role="tabpanel"
              aria-labelledby="analytics-governance-tab"
            >
              <RuntimeGovernancePanel
                api={window.realmflow?.runtimeGovernance}
              />
            </div>
          )}
        </PageContainer>
      </PageBody>
    </div>
  );
}
