import { FilePlus2, MessageSquarePlus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  DashboardExceptionRow,
  DashboardHealth,
  DashboardRangeHours,
} from "../../../../shared/workbench-dashboard";
import type { WorkbenchHubApi } from "../../../../shared/workbench-hub";
import { IconButton, InlineAlert, Metric } from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";
import type { TranslationKey } from "../../../localization/translate";
import { useDashboardSnapshot } from "../hooks/use-dashboard-snapshot";
import {
  createEnumQueryCodec,
  createTextQueryCodec,
  useUrlQueryState,
  type UrlQueryCodec,
} from "../../../navigation/url-query-state";

type ExceptionFilter = "user" | "system" | "all";
const dashboardWorkspaceCodec = createTextQueryCodec();
const dashboardRangeCodec: UrlQueryCodec<DashboardRangeHours> = {
  parse: (rawValue) =>
    rawValue === "24" ? 24 : rawValue === "720" ? 720 : 168,
  serialize: (value) => (value === 168 ? null : String(value)),
};
const dashboardExceptionCodec = createEnumQueryCodec(
  ["user", "system", "all"] as const,
  "user",
);

export function WorkbenchDashboardPage({
  api = window.realmflow?.workbenchHub.dashboard,
}: {
  api?: WorkbenchHubApi["dashboard"];
}): JSX.Element {
  const { locale, t } = useLocalization();
  const [workspaceId, setWorkspaceId] = useUrlQueryState(
    "workspace",
    dashboardWorkspaceCodec,
  );
  const [rangeHours, setRangeHours] = useUrlQueryState(
    "range",
    dashboardRangeCodec,
  );
  const [exceptionFilter, setExceptionFilter] =
    useUrlQueryState<ExceptionFilter>(
      "exceptions",
      dashboardExceptionCodec,
    );
  const { snapshot, loading, refreshing, error, refresh } =
    useDashboardSnapshot({
      api,
      query: {
        ...(workspaceId ? { workspaceId } : {}),
        rangeHours,
      },
    });
  const exceptions =
    exceptionFilter === "all"
      ? (snapshot?.exceptions ?? [])
      : (snapshot?.exceptions ?? []).filter(
          ({ kind }) => kind === exceptionFilter,
        );
  const updatedAt = snapshot
    ? new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(snapshot.asOf)
    : undefined;

  return (
    <div
      className="workbench-dashboard"
      role="region"
      aria-label={t("workbenchDashboard.aria")}
    >
      <header className="workbench-dashboard-controls">
        <div className="workbench-dashboard-filters">
          <label>
            <span className="sr-only">
              {t("workbenchDashboard.filter.space")}
            </span>
            <select name="workbench-dashboard-filter-space" autoComplete="off"
              aria-label={t("workbenchDashboard.filter.space")}
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              <option value="">
                {t("workbenchDashboard.filter.allSpaces")}
              </option>
              {(snapshot?.spaces ?? []).map((space) => (
                <option key={space.id} value={space.id}>
                  {space.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">
              {t("workbenchDashboard.filter.range")}
            </span>
            <select name="workbench-dashboard-filter-range" autoComplete="off"
              aria-label={t("workbenchDashboard.filter.range")}
              value={rangeHours}
              onChange={(event) =>
                setRangeHours(Number(event.target.value) as DashboardRangeHours)
              }
            >
              {[24, 168, 720].map((hours) => (
                <option key={hours} value={hours}>
                  {t(`workbenchDashboard.range.${hours}` as TranslationKey)}
                </option>
              ))}
            </select>
          </label>
          <IconButton
            size="default"
            variant="ghost"
            className="workbench-dashboard-refresh"
            aria-label={t("workbenchDashboard.refresh")}
            title={t("workbenchDashboard.refresh")}
            loading={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </IconButton>
          {updatedAt ? (
            <time dateTime={new Date(snapshot!.asOf).toISOString()}>
              {t("workbenchDashboard.updatedAt", { time: updatedAt })}
            </time>
          ) : null}
        </div>
        <div className="workbench-dashboard-actions">
          <Link to="/chat/new" aria-label={t("workbenchDashboard.newChatAria")}>
            <MessageSquarePlus size={15} />
            {t("workbenchDashboard.newChat")}
          </Link>
          <Link
            to={
              workspaceId ? `/spaces/${workspaceId}?createRequirement=1` : "/"
            }
            aria-disabled={!workspaceId}
            onClick={(event) => {
              if (!workspaceId) event.preventDefault();
            }}
          >
            <FilePlus2 size={15} />
            {t("workbenchDashboard.newRequirement")}
          </Link>
        </div>
      </header>

      {error ? (
        <InlineAlert
          className="workbench-dashboard-error"
          tone="danger"
          title={t("workbenchDashboard.loadFailed")}
          actionLabel={t("workbenchDashboard.retry")}
          onAction={() => void refresh()}
        />
      ) : null}
      {loading && !snapshot ? (
        <div className="workbench-dashboard-loading" role="status">
          {t("workbenchDashboard.loading")}
        </div>
      ) : null}

      <section className="workbench-dashboard-metrics">
        <Metric
          label={t("workbenchDashboard.metric.active")}
          value={snapshot?.summary.activeRequirements ?? 0}
        />
        <Metric
          label={t("workbenchDashboard.metric.waiting")}
          value={snapshot?.summary.waitingForUser ?? 0}
        />
        <Metric
          label={t("workbenchDashboard.metric.exceptions")}
          value={snapshot?.summary.runtimeExceptions ?? 0}
        />
        <Metric
          label={t("workbenchDashboard.metric.completion")}
          value={
            snapshot?.summary.completionRate === undefined
              ? t("workbenchDashboard.metric.noSample")
              : `${Math.round(snapshot.summary.completionRate * 100)}%`
          }
          detail={t("workbenchDashboard.metric.completionDetail", {
            completed: snapshot?.summary.completedCount ?? 0,
            entered: snapshot?.summary.enteredExecutionCount ?? 0,
          })}
        />
      </section>

      <div className="workbench-dashboard-body">
        <div className="workbench-dashboard-progress">
          <DashboardSection
            title={t("workbenchDashboard.section.spaces")}
            className="workbench-dashboard-spaces"
          >
            {(snapshot?.spaces ?? []).length === 0 ? (
              <Empty />
            ) : (
              snapshot!.spaces.map((space) => (
                <Link key={space.id} to={`/spaces/${space.id}`}>
                  <div>
                    <strong>{space.label}</strong>
                    <span data-health={space.health}>
                      {healthLabel(space.health, t)}
                    </span>
                  </div>
                  <div className="workbench-dashboard-progress-track">
                    <i
                      style={{
                        transform: `scaleX(${
                          space.totalRequirements === 0
                            ? 0
                            : space.completedRequirements /
                              space.totalRequirements
                        })`,
                      }}
                    />
                  </div>
                  <small>
                    {t("workbenchDashboard.spaceProgress", {
                      completed: space.completedRequirements,
                      total: space.totalRequirements,
                    })}
                    {" · "}
                    {t("workbenchDashboard.activeCount", {
                      count: space.activeRequirements,
                    })}
                  </small>
                </Link>
              ))
            )}
          </DashboardSection>

          <DashboardSection title={t("workbenchDashboard.section.inProgress")}>
            <ol className="workbench-dashboard-list">
              {(snapshot?.inProgress ?? []).map((requirement) => (
                <li key={requirement.id}>
                  <Link
                    to={`/spaces/${requirement.workspaceId}/requirements/${requirement.id}${
                      requirement.currentNodeId
                        ? `?node=${encodeURIComponent(requirement.currentNodeId)}`
                        : ""
                    }`}
                  >
                    <span>
                      <strong>{requirement.title}</strong>
                      <small>{requirement.workspaceLabel}</small>
                    </span>
                    <span data-health={requirement.health}>
                      {requirement.currentNodeName ??
                        healthLabel(requirement.health, t)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </DashboardSection>

          <DashboardSection title={t("workbenchDashboard.section.recent")}>
            <ol className="workbench-dashboard-list">
              {(snapshot?.recentResults ?? []).map((result) => (
                <li key={result.id}>
                  <Link
                    to={`/spaces/${result.workspaceId}/requirements/${result.requirementId}`}
                  >
                    <span>
                      <strong>{result.requirementTitle}</strong>
                      <small>{result.workspaceLabel}</small>
                    </span>
                    <span data-outcome={result.outcome}>{result.outcome}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </DashboardSection>
        </div>

        <section
          className="workbench-dashboard-exceptions"
          role="region"
          aria-label={t("workbenchDashboard.section.exceptions")}
        >
          <header>
            <h2>{t("workbenchDashboard.section.exceptions")}</h2>
            <div
              role="tablist"
              aria-label={t("workbenchDashboard.section.exceptions")}
            >
              {(["user", "system", "all"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={exceptionFilter === filter}
                  onClick={() => setExceptionFilter(filter)}
                >
                  {t(`workbenchDashboard.exception.${filter}`)}
                </button>
              ))}
            </div>
          </header>
          <ol>
            {exceptions.length === 0 ? (
              <Empty />
            ) : (
              exceptions.map((exception) => (
                <ExceptionRow key={exception.id} exception={exception} />
              ))
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}

function DashboardSection({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className={className}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ExceptionRow({
  exception,
}: {
  exception: DashboardExceptionRow;
}): JSX.Element {
  return (
    <li>
      <Link
        to={`/spaces/${exception.workspaceId}/requirements/${exception.requirementId}${
          exception.nodeId
            ? `?node=${encodeURIComponent(exception.nodeId)}`
            : ""
        }`}
      >
        <span>
          <strong>{exception.title}</strong>
          <small>
            {exception.workspaceLabel} · {exception.requirementTitle}
          </small>
        </span>
        <span data-kind={exception.kind}>{exception.kind}</span>
      </Link>
    </li>
  );
}

function Empty(): JSX.Element {
  const { t } = useLocalization();
  return (
    <p className="workbench-dashboard-empty">{t("workbenchDashboard.empty")}</p>
  );
}

function healthLabel(
  health: DashboardHealth,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  return t(`workbenchDashboard.health.${health}`);
}
