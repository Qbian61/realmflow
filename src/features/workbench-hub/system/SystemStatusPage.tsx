import { RefreshCw } from "lucide-react";
import type {
  SystemServiceStatusRow,
  SystemStatusApi,
} from "../../../../shared/system-status";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableRow,
  IconButton,
  InlineAlert,
} from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";
import type { TranslationKey } from "../../../localization/translate";
import { useSystemStatus } from "./use-system-status";

export function SystemStatusPage({
  api = window.realmflow?.workbenchHub.system,
}: {
  api?: SystemStatusApi;
}): JSX.Element {
  const { locale, t } = useLocalization();
  const { snapshot, loading, refreshing, error, refresh } =
    useSystemStatus(api);
  const updatedAt = snapshot
    ? new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(snapshot.asOf)
    : undefined;

  return (
    <div
      className="system-status-page"
      role="region"
      aria-label={t("systemStatus.aria")}
    >
      {loading && !snapshot ? (
        <div className="system-status-loading" role="status">
          {t("systemStatus.loading")}
        </div>
      ) : null}
      <section className="system-status-resources">
        <ResourceMetric
          label={t("systemStatus.cpu")}
          percent={snapshot?.resources.cpuPercent ?? 0}
          unavailable={snapshot?.resources.status === "unavailable"}
        />
        <ResourceMetric
          label={t("systemStatus.memory")}
          percent={snapshot?.resources.memoryPercent ?? 0}
          detail={
            snapshot
              ? `${formatBytes(snapshot.resources.memoryUsedBytes, locale)} / ${formatBytes(
                  snapshot.resources.memoryTotalBytes,
                  locale,
                )}`
              : undefined
          }
          unavailable={snapshot?.resources.status === "unavailable"}
        />
        <ResourceMetric
          label={t("systemStatus.disk")}
          percent={snapshot?.resources.diskPercent ?? 0}
          detail={
            snapshot
              ? `${formatBytes(snapshot.resources.diskUsedBytes, locale)} / ${formatBytes(
                  snapshot.resources.diskTotalBytes,
                  locale,
                )}`
              : undefined
          }
          unavailable={snapshot?.resources.status === "unavailable"}
        />
      </section>

      <section className="system-status-services">
        {error ? (
          <InlineAlert
            className="system-status-alert"
            tone="danger"
            role="alert"
            title={t("systemStatus.loadFailed")}
            actionLabel={t("systemStatus.retry")}
            actionLoading={refreshing}
            onAction={() => void refresh()}
          >
            {snapshot ? t("workbenchHub.stale") : null}
          </InlineAlert>
        ) : null}
        <h2>{t("systemStatus.services")}</h2>
        <DataTable caption={t("systemStatus.services")}>
          <DataTableBody>
            {(snapshot?.services ?? []).map((service) => (
              <ServiceRow key={service.id} service={service} />
            ))}
          </DataTableBody>
        </DataTable>
      </section>

      <footer className="system-status-footer">
        {updatedAt ? (
          <time dateTime={new Date(snapshot!.asOf).toISOString()}>
            {t("systemStatus.updatedAt", { time: updatedAt })}
          </time>
        ) : null}
        <IconButton
          size="default"
          variant="primary"
          className="system-status-refresh"
          aria-label={t("systemStatus.refresh")}
          title={t("systemStatus.refresh")}
          loading={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </IconButton>
      </footer>
    </div>
  );
}

function ResourceMetric({
  label,
  percent,
  detail,
  unavailable,
}: {
  label: string;
  percent: number;
  detail?: string;
  unavailable: boolean;
}): JSX.Element {
  const { t } = useLocalization();
  return (
    <div>
      <span>{label}</span>
      <strong>{Math.round(percent)}%</strong>
      <div className="system-status-meter">
        <i style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <small>
        {unavailable ? t("systemStatus.resourceUnavailable") : detail}
      </small>
    </div>
  );
}

function ServiceRow({
  service,
}: {
  service: SystemServiceStatusRow;
}): JSX.Element {
  const { t } = useLocalization();
  const detail =
    typeof service.detail === "string"
      ? service.detail
      : t("systemStatus.backgroundDetail", service.detail);
  return (
    <DataTableRow>
      <DataTableCell>
        <strong>
          {t(`systemStatus.service.${service.id}` as TranslationKey)}
        </strong>
      </DataTableCell>
      <DataTableCell>{detail}</DataTableCell>
      <DataTableCell data-status={service.status}>
        {t(`systemStatus.status.${service.status}` as TranslationKey)}
      </DataTableCell>
    </DataTableRow>
  );
}

function formatBytes(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unitIndex = 0;
  while (value >= 1_024 && unitIndex < units.length - 1) {
    value /= 1_024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(value)} ${units[unitIndex]}`;
}
