import { Clock3, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import type {
  ScheduleDto,
  SkillCatalogDto,
  SpaceDto,
} from "../../../shared/business";
import type { ModelProfile } from "../../../domain/model";
import { Badge, Card, EmptyState, IconButton } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { ScheduleTiming } from "./ScheduleRunSource";

type ScheduledTaskListProps = {
  schedules: ScheduleDto[];
  spaces: SpaceDto[];
  models: ModelProfile[];
  skills: SkillCatalogDto["versions"];
  loading: boolean;
  busyId?: string;
  onEdit: (schedule: ScheduleDto) => void;
  onTransition: (schedule: ScheduleDto, action: "pause" | "resume") => void;
  onRunNow: (schedule: ScheduleDto) => void;
  onRemove: (schedule: ScheduleDto) => void;
};

export function ScheduledTaskList({
  schedules,
  spaces,
  models,
  skills,
  loading,
  busyId,
  onEdit,
  onTransition,
  onRunNow,
  onRemove,
}: ScheduledTaskListProps): JSX.Element {
  const { t } = useLocalization();

  return (
    <section
      className="schedule-section"
      aria-label={t("schedule.tab.active", { count: schedules.length })}
    >
      {loading ? (
        <div className="schedule-empty">{t("schedule.loading")}</div>
      ) : schedules.length === 0 ? (
        <EmptyState
          className="schedule-empty"
          icon={<Clock3 size={19} />}
          title={t("schedule.empty")}
        />
      ) : (
        <div className="schedule-list">
          {schedules.map((schedule) => {
            const space = spaces.find(
              (item) => item.id === schedule.workspaceId,
            );
            const model = models.find(
              (item) => item.id === schedule.modelProfileId,
            );
            const skill = skills.find(
              (item) =>
                item.skillId === schedule.executionTarget.id &&
                item.version === schedule.executionTarget.version &&
                item.checksum === schedule.executionTarget.digest,
            );
            const busy = busyId === schedule.id;

            return (
              <Card
                as="article"
                density="compact"
                className="schedule-row"
                key={schedule.id}
              >
                <div className="schedule-row-main">
                  <div className="schedule-title-line">
                    <h3>{schedule.name}</h3>
                    <Badge
                      tone={
                        schedule.status === "active" ? "success" : "neutral"
                      }
                      data-status={schedule.status}
                    >
                      {t(
                        schedule.status === "active"
                          ? "schedule.status.active"
                          : "schedule.status.paused",
                      )}
                    </Badge>
                  </div>
                  <p>{schedule.description}</p>
                  <div className="schedule-bindings">
                    <span>
                      {t("schedule.binding.workspace", {
                        name: space?.label ?? schedule.workspaceId,
                      })}
                    </span>
                    <span>
                      {t("schedule.binding.model", {
                        name: model?.displayName ?? schedule.modelProfileId,
                      })}
                    </span>
                    <span>
                      {t("schedule.binding.skill", {
                        name: skill
                          ? `${skill.name} · ${skill.version}`
                          : `${schedule.executionTarget.id}@${schedule.executionTarget.version}`,
                      })}
                    </span>
                  </div>
                </div>
                <ScheduleTiming schedule={schedule} />
                <div className="schedule-actions">
                  <IconButton
                    size="compact"
                    variant="ghost"
                    aria-label={t("schedule.action.editAria", {
                      name: schedule.name,
                    })}
                    title={t("schedule.action.edit")}
                    disabled={busy}
                    onClick={() => onEdit(schedule)}
                  >
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton
                    size="compact"
                    variant="ghost"
                    aria-label={t(
                      schedule.status === "active"
                        ? "schedule.action.pauseAria"
                        : "schedule.action.resumeAria",
                      { name: schedule.name },
                    )}
                    title={t(
                      schedule.status === "active"
                        ? "schedule.action.pause"
                        : "schedule.action.resume",
                    )}
                    disabled={busy}
                    onClick={() =>
                      onTransition(
                        schedule,
                        schedule.status === "active" ? "pause" : "resume",
                      )
                    }
                  >
                    {schedule.status === "active" ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} />
                    )}
                  </IconButton>
                  <IconButton
                    size="compact"
                    variant="ghost"
                    aria-label={t("schedule.action.runAria", {
                      name: schedule.name,
                    })}
                    title={t("schedule.action.run")}
                    disabled={busy || schedule.status !== "active"}
                    onClick={() => onRunNow(schedule)}
                  >
                    <RefreshCw size={16} />
                  </IconButton>
                  <IconButton
                    size="compact"
                    variant="ghost"
                    aria-label={t("schedule.action.deleteAria", {
                      name: schedule.name,
                    })}
                    title={t("schedule.action.delete")}
                    disabled={busy}
                    onClick={() => onRemove(schedule)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
