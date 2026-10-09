import { useEffect, useRef, useState } from "react";
import type { BusinessApi } from "../../../shared/business";
import type { ProductAnalyticsResult } from "../../../shared/product-analytics";
import { InlineAlert } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import ProductAnalyticsActivity from "./ProductAnalyticsActivity";
import ProductAnalyticsDistributions from "./ProductAnalyticsDistributions";
import ProductAnalyticsSummary from "./ProductAnalyticsSummary";

type ProductAnalyticsPanelProps = {
  business?: BusinessApi;
  workspaceId?: string;
  fixedWorkspaceId?: string;
  onWorkspaceIdChange?: (workspaceId: string | undefined) => void;
};

export default function ProductAnalyticsPanel({
  business = window.realmflow?.business,
  workspaceId,
  fixedWorkspaceId,
  onWorkspaceIdChange,
}: ProductAnalyticsPanelProps): JSX.Element {
  const { t } = useLocalization();
  const requestId = useRef(0);
  const [result, setResult] = useState<ProductAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const selectedWorkspaceId = fixedWorkspaceId ?? workspaceId;

  useEffect(() => {
    const currentRequest = ++requestId.current;
    if (!business) {
      setError(t("productAnalytics.unavailable"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    void business
      .queryProductAnalytics({
        ...(selectedWorkspaceId ? { workspaceId: selectedWorkspaceId } : {}),
        activityLimit: 12,
      })
      .then((nextResult) => {
        if (currentRequest !== requestId.current) return;
        if (
          !fixedWorkspaceId &&
          workspaceId &&
          !nextResult.scope.workspaces.some(({ id }) => id === workspaceId)
        ) {
          onWorkspaceIdChange?.(undefined);
        }
        setResult(nextResult);
      })
      .catch((caught: unknown) => {
        if (currentRequest !== requestId.current) return;
        if (
          !fixedWorkspaceId &&
          workspaceId &&
          caught instanceof Error &&
          caught.message.includes("空间不存在或不可用")
        ) {
          onWorkspaceIdChange?.(undefined);
          return;
        }
        setError(t("productAnalytics.loadFailed"));
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  }, [
    business,
    fixedWorkspaceId,
    onWorkspaceIdChange,
    retryVersion,
    selectedWorkspaceId,
    t,
    workspaceId,
  ]);

  return (
    <div className="product-analytics-panel">
      {!fixedWorkspaceId ? (
        <label className="product-analytics-scope">
          <span>{t("productAnalytics.workspaceScope")}</span>
          <select name="product-analytics-workspace-scope" autoComplete="off"
            aria-label={t("productAnalytics.workspaceScope")}
            value={workspaceId ?? ""}
            disabled={!business}
            onChange={(event) =>
              onWorkspaceIdChange?.(event.target.value || undefined)
            }
          >
            <option value="">{t("productAnalytics.allWorkspaces")}</option>
            {(result?.scope.workspaces ?? []).map((workspace) => (
              <option value={workspace.id} key={workspace.id}>
                {workspace.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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

      {loading && !result ? (
        <p className="model-empty">{t("productAnalytics.loading")}</p>
      ) : null}
      {result ? (
        <>
          <ProductAnalyticsSummary summary={result.summary} />
          <ProductAnalyticsDistributions result={result} />
          <ProductAnalyticsActivity activities={result.recentActivity} />
        </>
      ) : null}
    </div>
  );
}
