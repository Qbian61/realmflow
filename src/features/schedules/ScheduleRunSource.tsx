import { Clock3 } from "lucide-react";
import type { ScheduleDto, ScheduleRunDto } from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";

export function ScheduleTiming({
  schedule,
}: {
  schedule: ScheduleDto;
}): JSX.Element {
  const { locale, t } = useLocalization();

  return (
    <div className="schedule-timing">
      <Clock3 size={15} />
      <div>
        <span>
          {schedule.cronExpression} · {schedule.timeZone}
        </span>
        <span>
          {t("schedule.timing.missedPolicy", {
            policy: t(
              schedule.missedRunPolicy === "run_once"
                ? "schedule.policy.runOnce"
                : "schedule.policy.skip",
            ),
          })}
        </span>
        {schedule.lastRecoveryDecision ? (
          <>
            <span>
              {t("schedule.timing.missedAt", {
                time: new Date(
                  schedule.lastRecoveryDecision.missedDueAt,
                ).toLocaleString(locale),
              })}
            </span>
            <span>
              {t("schedule.timing.lastRecovery", {
                action: t(
                  schedule.lastRecoveryDecision.action === "run_once"
                    ? "schedule.recovery.ranOnce"
                    : "schedule.recovery.skipped",
                ),
                time: new Date(
                  schedule.lastRecoveryDecision.decidedAt,
                ).toLocaleString(locale),
              })}
            </span>
          </>
        ) : null}
        {schedule.status === "active" && schedule.nextRunAt !== undefined ? (
          <time dateTime={new Date(schedule.nextRunAt).toISOString()}>
            {t("schedule.timing.nextRun", {
              time: new Date(schedule.nextRunAt).toLocaleString(locale),
            })}
          </time>
        ) : null}
      </div>
    </div>
  );
}

export function ScheduleRunSource({
  run,
}: {
  run: ScheduleRunDto;
}): JSX.Element {
  const { locale, t } = useLocalization();

  return (
    <div className="schedule-run-source">
      <span>
        {t(
          run.triggerSource === "cron"
            ? "schedule.runSource.automatic"
            : "schedule.runSource.manual",
        )}
      </span>
      {run.scheduledFor === undefined ? null : (
        <span>
          <span>{t("schedule.runSource.scheduledFor")}</span>{" "}
          <time dateTime={new Date(run.scheduledFor).toISOString()}>
            {new Date(run.scheduledFor).toLocaleString(locale)}
          </time>
        </span>
      )}
    </div>
  );
}
