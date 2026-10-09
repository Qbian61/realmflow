import type {
  ModelStatisticsGroup,
  ModelStatisticsGroupBy,
} from "../../../shared/model-statistics";
import {
  formatCost,
  formatLatency,
  formatRate,
} from "./ModelStatisticsSummary";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

export default function ModelStatisticsGroups({
  groupBy,
  groups,
}: {
  groupBy: ModelStatisticsGroupBy;
  groups: ModelStatisticsGroup[];
}): JSX.Element {
  const { locale, t } = useLocalization();
  const groupLabel = t(`analytics.dimension.${groupBy}`);

  return (
    <section
      className="model-section analytics-detail"
      aria-labelledby="model-groups-heading"
    >
      <header>
        <div>
          <h2 id="model-groups-heading">
            {t("analytics.groups.heading", { dimension: groupLabel })}
          </h2>
          <p>{t("analytics.groups.latencyNote")}</p>
        </div>
      </header>
      {groups.length === 0 ? (
        <p className="model-empty">{t("analytics.groups.empty")}</p>
      ) : (
        <DataTable
          caption={t("analytics.groups.heading", { dimension: groupLabel })}
          density="compact"
          className="analytics-table"
          scrollClassName="analytics-table-wrap"
        >
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>{groupLabel}</DataTableHead>
                <DataTableHead numeric>{t("analytics.metric.calls")}</DataTableHead>
                <DataTableHead numeric>{t("analytics.metric.totalTokens")}</DataTableHead>
                <DataTableHead numeric>{t("analytics.metric.firstTokenLatency")}</DataTableHead>
                <DataTableHead numeric>{t("analytics.metric.successRate")}</DataTableHead>
                <DataTableHead numeric>{t("analytics.metric.estimatedCost")}</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {groups.map((group) => (
                <DataTableRow key={group.key}>
                  <DataTableHead scope="row">{group.label}</DataTableHead>
                  <DataTableCell numeric>{group.summary.calls.toLocaleString(locale)}</DataTableCell>
                  <DataTableCell numeric>{group.summary.totalTokens.toLocaleString(locale)}</DataTableCell>
                  <DataTableCell numeric>
                    {formatLatency(
                      group.summary.averageFirstTokenLatencyMs,
                      locale,
                    )}
                  </DataTableCell>
                  <DataTableCell numeric>
                    {formatRate(group.summary.successRate, locale)}
                  </DataTableCell>
                  <DataTableCell numeric>
                    {formatCost(group.summary.estimatedCost, locale)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
        </DataTable>
      )}
    </section>
  );
}
