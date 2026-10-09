import type { ModelStatisticsSummary as Summary } from "../../../shared/model-statistics";
import { Metric } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

export function formatLatency(value: number | null, locale: string): string {
  return value === null
    ? "--"
    : `${Math.round(value).toLocaleString(locale)} ms`;
}

export function formatRate(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: value === 0 || value === 100 ? 0 : 1,
  }).format(value / 100);
}

export function formatCost(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatThroughput(
  value: number | null,
  locale: string,
): string {
  return value === null
    ? "--"
    : `${new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value)} tok/s`;
}

export default function ModelStatisticsSummary({
  summary,
}: {
  summary: Summary;
}): JSX.Element {
  const { locale, t } = useLocalization();

  return (
    <section
      className="analytics-summary"
      aria-label={t("analytics.summary.aria")}
    >
      <Metric
        className="analytics-summary-primary"
        label={t("analytics.metric.calls")}
        value={summary.calls.toLocaleString(locale)}
      />
      <Metric
        className="analytics-summary-primary"
        label={t("analytics.metric.totalTokens")}
        value={summary.totalTokens.toLocaleString(locale)}
      />
      <Metric
        className="analytics-summary-primary"
        label={t("analytics.metric.averageFirstTokenLatency")}
        value={formatLatency(summary.averageFirstTokenLatencyMs, locale)}
      />
      <Metric
        className="analytics-summary-primary"
        label={t("analytics.metric.successRate")}
        value={formatRate(summary.successRate, locale)}
      />
      <Metric
        className="analytics-summary-primary"
        label={t("analytics.metric.estimatedCost")}
        value={formatCost(summary.estimatedCost, locale)}
      />
      <Metric
        label={t("analytics.metric.inputTokens")}
        value={summary.inputTokens.toLocaleString(locale)}
      />
      <Metric
        label={t("analytics.metric.outputTokens")}
        value={summary.outputTokens.toLocaleString(locale)}
      />
      <Metric
        label={t("analytics.metric.cachedTokens")}
        value={summary.cachedTokens.toLocaleString(locale)}
      />
      <Metric
        label={t("analytics.metric.reasoningTokens")}
        value={summary.reasoningTokens.toLocaleString(locale)}
      />
      <Metric
        label={t("analytics.metric.averageThroughput")}
        value={formatThroughput(
          summary.averageThroughputTokensPerSecond,
          locale,
        )}
      />
    </section>
  );
}
