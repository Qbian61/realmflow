import { Plus, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type {
  ConnectorDto,
  ScheduleDto,
  ScheduleRunDto,
  SkillCatalogDto,
  SpaceDto,
} from "../../shared/business";
import { MissedRunPolicyField } from "../features/schedules/MissedRunPolicyField";
import { RecentScheduleRuns } from "../features/schedules/SchedulePageSections";
import { ScheduleRecommendations } from "../features/schedules/ScheduleRecommendations";
import { ScheduledTaskList } from "../features/schedules/ScheduledTaskList";
import { WorkspaceHeaderPortal } from "../features/navigation/WorkspaceLayout";
import { useWorkspacePageActive } from "../features/navigation/WorkspaceRouteCache";
import { useToast } from "../features/toast/ToastProvider";
import { useLocalization } from "../localization/LocalizationProvider";
import { useUrlQueryState } from "../navigation/url-query-state";
import { toSkillCatalogOptions } from "../features/capabilities/catalog-skill-options";
import {
  createScheduleCommandId,
  scheduleRecommendations,
  type ModelPool,
  type ScheduleDraft,
} from "./schedule-page-model";
import { scheduleTabCodec } from "./page-query-state";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  InlineAlert,
  Field,
  IconButton,
  PageBody,
  Tab,
  TabList,
  Tabs,
  Toolbar,
} from "../components/ui";

export default function SchedulePage(): JSX.Element {
  const { locale, t } = useLocalization();
  const toast = useToast();
  const pageActive = useWorkspacePageActive();
  const business = window.realmflow?.business;
  const toolCatalog = window.realmflow?.toolCatalog;
  const [schedules, setSchedules] = useState<ScheduleDto[]>([]);
  const [runs, setRuns] = useState<ScheduleRunDto[]>([]);
  const [spaces, setSpaces] = useState<SpaceDto[]>([]);
  const [models, setModels] = useState<ModelPool>({
    providers: [],
    profiles: [],
  });
  const [skills, setSkills] = useState<SkillCatalogDto[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [draft, setDraft] = useState<ScheduleDraft>();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<ScheduleDto>();
  const [deleteError, setDeleteError] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useUrlQueryState("tab", scheduleTabCodec);

  const load = useCallback(async (): Promise<void> => {
    if (!business || !toolCatalog) {
      setError(t("schedule.unavailable"));
      setLoading(false);
      return;
    }
    try {
      const [
        nextSchedules,
        nextRuns,
        nextSpaces,
        nextModels,
        nextCatalog,
        nextConnectors,
      ] = await Promise.all([
        business.listSchedules(),
        business.listScheduleRuns({ limit: 50 }),
        business.listSpaces(),
        business.listModels(),
        toolCatalog.list({ locale }),
        business.listConnectors(),
      ]);
      setSchedules(nextSchedules);
      setRuns(nextRuns);
      setSpaces(nextSpaces);
      setModels(nextModels);
      setSkills(toSkillCatalogOptions(nextCatalog.skills));
      setConnectors(nextConnectors);
      setError("");
    } catch {
      setError(t("schedule.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [business, locale, t, toolCatalog]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!draft || !pageActive) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setDraft(undefined);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [draft, pageActive]);

  const enabledProfiles = useMemo(() => {
    const enabledProviders = new Set(
      models.providers.filter((item) => item.enabled).map((item) => item.id),
    );
    return models.profiles.filter(
      (profile) => profile.enabled && enabledProviders.has(profile.providerId),
    );
  }, [models]);

  const enabledSkills = useMemo(
    () =>
      skills.flatMap((catalog) =>
        catalog.skill.enabled
          ? catalog.versions.filter(
              (version) => version.integrity.status === "verified",
            )
          : [],
      ),
    [skills],
  );

  const availableConnectors = useMemo(
    () =>
      connectors.filter(
        ({ connector }) =>
          connector.enabled && connector.validation?.status === "available",
      ),
    [connectors],
  );

  const recommendations = scheduleRecommendations.map((item) => ({
    ...item,
    name: t(`schedule.recommendation.${item.id}.name`),
    description: t(`schedule.recommendation.${item.id}.description`),
  }));

  function openCreate(preset?: (typeof recommendations)[number]): void {
    const skill = enabledSkills[0];
    setDraft({
      name: preset?.name ?? "",
      description: preset?.description ?? "",
      cronExpression: preset?.cronExpression ?? "0 9 * * 1-5",
      timeZone: "Asia/Shanghai",
      missedRunPolicy: "skip",
      workspaceId: spaces[0]?.id ?? "",
      modelProfileId: enabledProfiles[0]?.id ?? "",
      skillVersionId: skill?.id ?? "",
      skillInputText: "{}",
      connectorIds: Object.fromEntries(
        (skill?.network.services ?? []).map((service) => [
          service,
          availableConnectors[0]?.connector.id ?? "",
        ]),
      ),
    });
    setError("");
  }

  function openEdit(schedule: ScheduleDto): void {
    setDraft({
      id: schedule.id,
      expectedRevision: schedule.revision,
      name: schedule.name,
      description: schedule.description,
      cronExpression: schedule.cronExpression,
      timeZone: schedule.timeZone,
      missedRunPolicy: schedule.missedRunPolicy,
      workspaceId: schedule.workspaceId,
      modelProfileId: schedule.modelProfileId,
      skillVersionId:
        enabledSkills.find(
          (version) =>
            version.skillId === schedule.executionTarget.id &&
            version.version === schedule.executionTarget.version &&
            version.checksum === schedule.executionTarget.digest,
        )?.id ?? "",
      skillInputText: JSON.stringify(schedule.skillInput, null, 2),
      connectorIds: Object.fromEntries(
        schedule.connectorBindings.map((binding) => [
          binding.service,
          binding.connectorId,
        ]),
      ),
    });
    setError("");
  }

  function updateDraft(changes: Partial<ScheduleDraft>): void {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }

  function selectSkill(skillVersionId: string): void {
    const skill = enabledSkills.find((item) => item.id === skillVersionId);
    updateDraft({
      skillVersionId,
      connectorIds: Object.fromEntries(
        (skill?.network.services ?? []).map((service) => [
          service,
          draft?.connectorIds[service] ??
            availableConnectors[0]?.connector.id ??
            "",
        ]),
      ),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!business || !draft) return;
    let skillInput: Record<string, unknown>;
    try {
      const parsed = JSON.parse(draft.skillInputText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error();
      }
      skillInput = parsed as Record<string, unknown>;
    } catch {
      setError(t("schedule.error.skillInput"));
      return;
    }
    const skill = enabledSkills.find(
      (item) => item.id === draft.skillVersionId,
    );
    const definition = {
      name: draft.name,
      description: draft.description,
      cronExpression: draft.cronExpression,
      timeZone: draft.timeZone,
      missedRunPolicy: draft.missedRunPolicy,
      workspaceId: draft.workspaceId,
      modelProfileId: draft.modelProfileId,
      executionTarget: {
        kind: "skill" as const,
        id: skill?.skillId ?? "",
        version: skill?.version ?? "",
        digest: skill?.checksum ?? "",
      },
      skillInput,
      connectorBindings: (skill?.network.services ?? []).map((service) => ({
        service,
        connectorId: draft.connectorIds[service] ?? "",
      })),
      permissions: skill?.permissions ?? [],
    };
    setBusyId(draft.id ?? "new");
    setError("");
    try {
      const result = draft.id
        ? await business.updateSchedule({
            id: draft.id,
            expectedRevision: draft.expectedRevision!,
            definition,
            idempotencyKey: createScheduleCommandId("schedule-update"),
          })
        : await business.createSchedule({
            definition,
            idempotencyKey: createScheduleCommandId("schedule-create"),
          });
      if (result.outcome === "conflict") {
        replaceSchedule(result.schedule);
        setError(t("schedule.error.conflict"));
        return;
      }
      setDraft(undefined);
      setActiveTab("schedules");
      await load();
    } catch {
      toast.error("schedule.saveFailed");
    } finally {
      setBusyId(undefined);
    }
  }

  async function transition(
    schedule: ScheduleDto,
    action: "pause" | "resume",
  ): Promise<void> {
    if (!business) return;
    setBusyId(schedule.id);
    setError("");
    try {
      const result = await business[
        action === "pause" ? "pauseSchedule" : "resumeSchedule"
      ]({
        id: schedule.id,
        expectedRevision: schedule.revision,
        idempotencyKey: createScheduleCommandId(`schedule-${action}`),
      });
      if (result.outcome === "conflict") {
        replaceSchedule(result.schedule);
        setError(t("schedule.error.conflict"));
        return;
      }
      await load();
    } catch {
      toast.error("schedule.transitionFailed");
    } finally {
      setBusyId(undefined);
    }
  }

  async function runNow(schedule: ScheduleDto): Promise<void> {
    if (!business) return;
    setBusyId(schedule.id);
    setError("");
    try {
      await business.runScheduleNow({
        id: schedule.id,
        idempotencyKey: createScheduleCommandId("schedule-run"),
      });
      await load();
    } catch {
      toast.error("schedule.runFailed");
    } finally {
      setBusyId(undefined);
    }
  }

  async function remove(): Promise<void> {
    if (!business || !pendingDelete) return;
    const schedule = pendingDelete;
    setBusyId(schedule.id);
    setError("");
    setDeleteError("");
    try {
      const result = await business.deleteSchedule({
        id: schedule.id,
        expectedRevision: schedule.revision,
        idempotencyKey: createScheduleCommandId("schedule-delete"),
      });
      if (result.outcome === "conflict") {
        replaceSchedule(result.schedule);
        setError(t("schedule.error.conflict"));
        return;
      }
      await load();
      setPendingDelete(undefined);
    } catch {
      setDeleteError(t("schedule.deleteFailed"));
      toast.error("schedule.deleteFailed");
    } finally {
      setBusyId(undefined);
    }
  }

  function replaceSchedule(schedule: ScheduleDto): void {
    setSchedules((current) => [
      schedule,
      ...current.filter((item) => item.id !== schedule.id),
    ]);
  }

  const selectedSkill = enabledSkills.find(
    (skill) => skill.id === draft?.skillVersionId,
  );
  return (
    <div className="schedule-page">
      <h1 className="sr-only">{t("navigation.schedules")}</h1>
      <WorkspaceHeaderPortal>
        <Toolbar
          variant="workspace-header"
          className="schedule-page-header"
          aria-label={t("schedule.tabs")}
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as "templates" | "schedules")
            }
          >
            <TabList
              className="schedule-page-tabs"
              aria-label={t("schedule.tabs")}
            >
              <Tab
                id="schedule-templates-tab"
                aria-controls="schedule-templates-panel"
                value="templates"
              >
                {t("schedule.tab.templates")}
              </Tab>
              <Tab
                id="schedule-active-tab"
                aria-controls="schedule-active-panel"
                value="schedules"
              >
                {t("schedule.tab.active", { count: schedules.length })}
              </Tab>
            </TabList>
          </Tabs>
          <Button
            variant="primary"
            size="default"
            leadingIcon={<Plus size={15} aria-hidden="true" />}
            onClick={() => openCreate()}
          >
            {t("schedule.create")}
          </Button>
        </Toolbar>
      </WorkspaceHeaderPortal>

      <PageBody mode="wide" className="schedule-content">
        {error ? (
          <InlineAlert className="schedule-error" tone="danger" title={error} />
        ) : null}

        {activeTab === "templates" ? (
          <div
            id="schedule-templates-panel"
            role="tabpanel"
            aria-labelledby="schedule-templates-tab"
          >
            <h2 className="sr-only">{t("schedule.tab.templates")}</h2>
            <ScheduleRecommendations
              recommendations={recommendations}
              onSelect={openCreate}
            />
          </div>
        ) : (
          <div
            id="schedule-active-panel"
            role="tabpanel"
            aria-labelledby="schedule-active-tab"
          >
            <h2 className="sr-only">{t("schedule.tab.active", { count: schedules.length })}</h2>
            <ScheduledTaskList
              schedules={schedules}
              spaces={spaces}
              models={models.profiles}
              skills={enabledSkills}
              loading={loading}
              busyId={busyId}
              onEdit={openEdit}
              onTransition={(schedule, action) =>
                void transition(schedule, action)
              }
              onRunNow={(schedule) => void runNow(schedule)}
              onRemove={(schedule) => {
                setDeleteError("");
                setPendingDelete(schedule);
              }}
            />
            <RecentScheduleRuns runs={runs} />
          </div>
        )}
      </PageBody>

      {draft ? (
        <Dialog
          open
          size="wide"
          locked={busyId !== undefined || !pageActive}
          aria-labelledby="schedule-dialog-title"
          onOpenChange={(open) => {
            if (!open) setDraft(undefined);
          }}
        >
          <form
            className="schedule-create-dialog"
            onSubmit={(event) => void submit(event)}
          >
            <DialogHeader>
              <div>
                <span>
                  {t(
                    draft.id
                      ? "schedule.dialog.eyebrow.edit"
                      : "schedule.dialog.eyebrow.create",
                  )}
                </span>
                <h2 id="schedule-dialog-title">
                  {t(
                    draft.id
                      ? "schedule.dialog.edit"
                      : "schedule.dialog.create",
                  )}
                </h2>
              </div>
              <IconButton
                aria-label={t("schedule.dialog.closeAria")}
                title={t("common.close")}
                variant="ghost"
                disabled={busyId !== undefined}
                onClick={() => setDraft(undefined)}
              >
                <X size={18} />
              </IconButton>
            </DialogHeader>
            <DialogBody className="schedule-form-grid">
              <Field name="schedule-form-name"
                className="schedule-field-wide"
                label={t("schedule.form.name")}
              >
                <input
                  aria-label={t("schedule.form.name")}
                  required
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft({ name: event.target.value })
                  }
                />
              </Field>
              <Field name="schedule-form-description"
                className="schedule-field-wide"
                label={t("schedule.form.description")}
              >
                <textarea
                  aria-label={t("schedule.form.descriptionAria")}
                  required
                  rows={3}
                  value={draft.description}
                  onChange={(event) =>
                    updateDraft({ description: event.target.value })
                  }
                />
              </Field>
              <Field name="schedule-form-cron" label={t("schedule.form.cron")}>
                <input
                  aria-label={t("schedule.form.cron")}
                  required
                  value={draft.cronExpression}
                  onChange={(event) =>
                    updateDraft({ cronExpression: event.target.value })
                  }
                />
              </Field>
              <Field name="schedule-form-time-zone" label={t("schedule.form.timeZone")}>
                <input
                  aria-label={t("schedule.form.timeZone")}
                  required
                  value={draft.timeZone}
                  onChange={(event) =>
                    updateDraft({ timeZone: event.target.value })
                  }
                />
              </Field>
              <MissedRunPolicyField
                value={draft.missedRunPolicy}
                onChange={(missedRunPolicy) => updateDraft({ missedRunPolicy })}
              />
              <Field name="schedule-form-workspace" label={t("schedule.form.workspace")}>
                <select
                  aria-label={t("schedule.form.workspace")}
                  required
                  value={draft.workspaceId}
                  onChange={(event) =>
                    updateDraft({ workspaceId: event.target.value })
                  }
                >
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field name="schedule-form-model" label={t("schedule.form.model")}>
                <select
                  aria-label={t("schedule.form.model")}
                  required
                  value={draft.modelProfileId}
                  onChange={(event) =>
                    updateDraft({ modelProfileId: event.target.value })
                  }
                >
                  {enabledProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field name="schedule-form-skill-version"
                className="schedule-field-wide"
                label={t("schedule.form.skillVersion")}
              >
                <select
                  aria-label={t("schedule.form.skillVersion")}
                  required
                  value={draft.skillVersionId}
                  onChange={(event) => selectSkill(event.target.value)}
                >
                  {enabledSkills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name} · {skill.version}
                    </option>
                  ))}
                </select>
              </Field>
              {(selectedSkill?.network.services ?? []).map((service) => (
                <Field name={`schedule-connector-${service}`} label={`Connector · ${service}`} key={service}>
                  <select
                    aria-label={`Connector ${service}`}
                    required
                    value={draft.connectorIds[service] ?? ""}
                    onChange={(event) =>
                      updateDraft({
                        connectorIds: {
                          ...draft.connectorIds,
                          [service]: event.target.value,
                        },
                      })
                    }
                  >
                    {availableConnectors.map(({ connector }) => (
                      <option key={connector.id} value={connector.id}>
                        {connector.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <Field name="schedule-form-skill-input"
                className="schedule-field-wide"
                label={t("schedule.form.skillInput")}
              >
                <textarea
                  aria-label={t("schedule.form.skillInput")}
                  required
                  rows={5}
                  spellCheck={false}
                  value={draft.skillInputText}
                  onChange={(event) =>
                    updateDraft({ skillInputText: event.target.value })
                  }
                />
              </Field>
            </DialogBody>
            <DialogFooter className="schedule-create-dialog__footer">
              <span>
                {t("schedule.form.permissions", {
                  permissions:
                    selectedSkill?.permissions.join(", ") ||
                    t("schedule.form.noExtraPermissions"),
                })}
              </span>
              <div>
                <Button type="button" onClick={() => setDraft(undefined)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={busyId !== undefined}
                  disabled={busyId !== undefined}
                >
                  {t(draft.id ? "schedule.form.save" : "schedule.form.create")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Dialog>
) : null}
      <ConfirmDialog
        open={pendingDelete !== undefined}
        title={t("schedule.action.delete")}
        description={
          pendingDelete
            ? t("schedule.deleteConfirm", { name: pendingDelete.name })
            : ""
        }
        confirmLabel={t("schedule.action.delete")}
        cancelLabel={t("common.cancel")}
        pending={busyId === pendingDelete?.id}
        error={deleteError}
        onCancel={() => {
          setDeleteError("");
          setPendingDelete(undefined);
        }}
        onConfirm={remove}
      />

    </div>
  );
}
