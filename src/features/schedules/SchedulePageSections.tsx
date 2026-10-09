import type { ScheduleRunDto } from "../../../shared/business";
import { Badge } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { ScheduleRunSource } from "./ScheduleRunSource";

export function RecentScheduleRuns({
  runs,
}: {
  runs: ScheduleRunDto[];
}): JSX.Element | null {
  const { locale, t } = useLocalization();
  if (runs.length === 0) return null;

  return (
    <section className="schedule-section" aria-labelledby="recent-runs-title">
      <div className="schedule-section-heading">
        <h2 id="recent-runs-title">{t("schedule.recentRuns")}</h2>
      </div>
      <div className="schedule-run-list">
        {runs.slice(0, 8).map((run) => (
          <div
            className="schedule-run-row"
            data-testid={`schedule-run-${run.id}`}
            key={run.id}
          >
            <strong>{run.scheduleName}</strong>
            <ScheduleRunSource run={run} />
            <Badge
              tone={
                run.status === "succeeded"
                  ? "success"
                  : run.status === "failed"
                    ? "danger"
                    : "info"
              }
              data-status={run.status}
            >
              {t(`schedule.runStatus.${run.status}`)}
            </Badge>
            <time dateTime={new Date(run.startedAt).toISOString()}>
              {new Date(run.startedAt).toLocaleString(locale)}
            </time>
          </div>
        ))}
      </div>
    </section>
  );
}
