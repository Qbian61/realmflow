import { Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import type {
  ScheduleDto,
  ScheduleRunDto,
  SkillCatalogDto,
  SpaceDto,
} from "../../../shared/business";
import type { ModelProfile } from "../../../domain/model";
import {
  Badge,
  Button,
  Card,
  IconButton,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { WorkbenchNavigationItem } from "../workbench-hub/WorkbenchNavigationItem";
import { WorkbenchSplitPage } from "../workbench-hub/WorkbenchSplitPage";
import { RecentScheduleRuns } from "./SchedulePageSections";
import { ScheduleTiming } from "./ScheduleRunSource";

type ScheduledTaskListProps = {
  schedules: ScheduleDto[];
  runs: ScheduleRunDto[];
  spaces: SpaceDto[];
  models: ModelProfile[];
  skills: SkillCatalogDto["versions"];
  loading: boolean;
  busyId?: string;
  selectedScheduleId?: string;
  onSelect: (scheduleId: string) => void;
  onCreate: () => void;
  onEdit: (schedule: ScheduleDto) => void;
  onTransition: (schedule: ScheduleDto, action: "pause" | "resume") => void;
  onRunNow: (schedule: ScheduleDto) => void;
  onRemove: (schedule: ScheduleDto) => void;
};

export function ScheduledTaskList({
  schedules,
  runs,
  spaces,
  models,
  skills,
  loading,
  busyId,
  selectedScheduleId,
  onSelect,
  onCreate,
  onEdit,
  onTransition,
  onRunNow,
  onRemove,
}: ScheduledTaskListProps): JSX.Element {
  const { t } = useLocalization();
  const selectedSchedule = schedules.find(
    (schedule) => schedule.id === selectedScheduleId,
  );
  const selectedRuns = selectedSchedule
    ? runs.filter((run) => run.scheduleId === selectedSchedule.id)
    : [];
  const space = spaces.find(
    (item) => item.id === selectedSchedule?.workspaceId,
  );
  const model = models.find(
    (item) => item.id === selectedSchedule?.modelProfileId,
  );
  const skill = skills.find(
    (item) =>
      item.skillId === selectedSchedule?.executionTarget.id &&
      item.version === selectedSchedule.executionTarget.version &&
      item.checksum === selectedSchedule.executionTarget.digest,
  );
  const busy = busyId === selectedSchedule?.id;

  return (
    <WorkbenchSplitPage
      createLabel={t("schedule.create")}
      createIconOnly
      onCreate={onCreate}
      navigationEmpty={!loading && schedules.length === 0}
      navigation={
        <div className="schedule-navigation-list">
          {loading ? (
            <div className="schedule-navigation-empty">
              {t("schedule.loading")}
            </div>
          ) : (
            schedules.map((schedule) => (
              <WorkbenchNavigationItem
                key={schedule.id}
                active={schedule.id === selectedScheduleId}
                primary={
                  <Button
                    variant="ghost"
                    aria-label={schedule.name}
                    aria-current={
                      schedule.id === selectedScheduleId ? "page" : undefined
                    }
                    onClick={() => onSelect(schedule.id)}
                  >
                    <span>{schedule.name}</span>
                    <small>
                      {t(
                        schedule.status === "active"
                          ? "schedule.status.active"
                          : "schedule.status.paused",
                      )}
                    </small>
                  </Button>
                }
              />
            ))
          )}
        </div>
      }
    >
      {selectedSchedule ? (
        <div className="schedule-detail">
          <Card
            as="article"
            density="compact"
            className="schedule-row schedule-detail-summary"
          >
            <div className="schedule-row-main">
              <div className="schedule-title-line">
                <h3>{selectedSchedule.name}</h3>
                <Badge
                  tone={
                    selectedSchedule.status === "active"
                      ? "success"
                      : "neutral"
                  }
                  data-status={selectedSchedule.status}
                >
                  {t(
                    selectedSchedule.status === "active"
                      ? "schedule.status.active"
                      : "schedule.status.paused",
                  )}
                </Badge>
              </div>
              <p>{selectedSchedule.description}</p>
              <div className="schedule-bindings">
                <span>
                  {t("schedule.binding.workspace", {
                    name: space?.label ?? selectedSchedule.workspaceId,
                  })}
                </span>
                <span>
                  {t("schedule.binding.model", {
                    name:
                      model?.displayName ?? selectedSchedule.modelProfileId,
                  })}
                </span>
                <span>
                  {t("schedule.binding.skill", {
                    name: skill
                      ? `${skill.name} · ${skill.version}`
                      : `${selectedSchedule.executionTarget.id}@${selectedSchedule.executionTarget.version}`,
                  })}
                </span>
              </div>
            </div>
            <ScheduleTiming schedule={selectedSchedule} />
            <div className="schedule-actions">
              <IconButton
                size="compact"
                variant="ghost"
                aria-label={t("schedule.action.editAria", {
                  name: selectedSchedule.name,
                })}
                title={t("schedule.action.edit")}
                disabled={busy}
                onClick={() => onEdit(selectedSchedule)}
              >
                <Pencil size={16} />
              </IconButton>
              <IconButton
                size="compact"
                variant="ghost"
                aria-label={t(
                  selectedSchedule.status === "active"
                    ? "schedule.action.pauseAria"
                    : "schedule.action.resumeAria",
                  { name: selectedSchedule.name },
                )}
                title={t(
                  selectedSchedule.status === "active"
                    ? "schedule.action.pause"
                    : "schedule.action.resume",
                )}
                disabled={busy}
                onClick={() =>
                  onTransition(
                    selectedSchedule,
                    selectedSchedule.status === "active" ? "pause" : "resume",
                  )
                }
              >
                {selectedSchedule.status === "active" ? (
                  <Pause size={16} />
                ) : (
                  <Play size={16} />
                )}
              </IconButton>
              <IconButton
                size="compact"
                variant="ghost"
                aria-label={t("schedule.action.runAria", {
                  name: selectedSchedule.name,
                })}
                title={t("schedule.action.run")}
                disabled={busy || selectedSchedule.status !== "active"}
                onClick={() => onRunNow(selectedSchedule)}
              >
                <RefreshCw size={16} />
              </IconButton>
              <IconButton
                size="compact"
                variant="ghost"
                aria-label={t("schedule.action.deleteAria", {
                  name: selectedSchedule.name,
                })}
                title={t("schedule.action.delete")}
                disabled={busy}
                onClick={() => onRemove(selectedSchedule)}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          </Card>
          <RecentScheduleRuns runs={selectedRuns} />
        </div>
      ) : null}
    </WorkbenchSplitPage>
  );
}
