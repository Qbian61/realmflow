import { Settings, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_WORKBENCH_LAYOUT,
  type ConfigurableWorkbenchModuleId,
  type WorkbenchHubApi,
  type WorkbenchLayout,
  type WorkbenchModuleId,
} from "../../shared/workbench-hub";
import { WorkspaceHeaderPortal } from "../features/navigation/WorkspaceLayout";
import {
  beginNativeDrag,
  finishNativeDrag,
} from "../features/drag/native-drag-feedback";
import { WorkbenchDashboardPage } from "../features/workbench-hub/dashboard/WorkbenchDashboardPage";
import { TaskWorkbenchPage } from "../features/workbench-hub/tasks/TaskWorkbenchPage";
import { SiteWorkbenchPage } from "../features/workbench-hub/sites/SiteWorkbenchPage";
import { MemoWorkbenchPage } from "../features/workbench-hub/memos/MemoWorkbenchPage";
import { TerminalWorkbenchPage } from "../features/workbench-hub/terminal/TerminalWorkbenchPage";
import SchedulePage from "./SchedulePage";
import { useLocalization } from "../localization/LocalizationProvider";
import type { TranslationKey } from "../localization/translate";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton,
  InlineAlert,
  PageBody,
  Tab,
  TabList,
  Tabs,
  Toolbar,
} from "../components/ui";

const WORKBENCH_MODULES = [
  { id: "overview", labelKey: "workbenchHub.module.overview" },
  { id: "tasks", labelKey: "workbenchHub.module.tasks" },
  { id: "sites", labelKey: "workbenchHub.module.sites" },
  { id: "memos", labelKey: "workbenchHub.module.memos" },
  { id: "terminal", labelKey: "workbenchHub.module.terminal" },
  { id: "schedules", labelKey: "navigation.schedules" },
] as const satisfies readonly {
  id: WorkbenchModuleId;
  labelKey: TranslationKey;
}[];

type WorkbenchHubPageProps = {
  layoutApi?: WorkbenchHubApi["layout"];
};

type WorkbenchLayoutChange = (
  layout: WorkbenchLayout,
) => Pick<WorkbenchLayout, "moduleOrder" | "hiddenModules">;

export default function WorkbenchHubPage({
  layoutApi = window.realmflow?.workbenchHub?.layout,
}: WorkbenchHubPageProps): JSX.Element {
  const { t } = useLocalization();
  const [activeModule, setActiveModule] =
    useState<WorkbenchModuleId>("overview");
  const [hiddenModules, setHiddenModules] = useState<Set<WorkbenchModuleId>>(
    new Set(DEFAULT_WORKBENCH_LAYOUT.hiddenModules),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moduleOrder, setModuleOrder] = useState<
    ConfigurableWorkbenchModuleId[]
  >([...DEFAULT_WORKBENCH_LAYOUT.moduleOrder]);
  const [revision, setRevision] = useState(DEFAULT_WORKBENCH_LAYOUT.revision);
  const [layoutMessage, setLayoutMessage] = useState<string>();
  const [savingLayout, setSavingLayout] = useState(false);
  const [draggedModule, setDraggedModule] =
    useState<ConfigurableWorkbenchModuleId>();
  const [moduleDropTarget, setModuleDropTarget] =
    useState<ConfigurableWorkbenchModuleId>();
  const schedulesVisited = useRef(false);
  if (activeModule === "schedules") {
    schedulesVisited.current = true;
  }
  const applyLayout = (layout: WorkbenchLayout): void => {
    setRevision(layout.revision);
    setModuleOrder([...layout.moduleOrder]);
    setHiddenModules(new Set(layout.hiddenModules));
    if (
      layout.hiddenModules.includes(
        activeModule as ConfigurableWorkbenchModuleId,
      )
    ) {
      setActiveModule("overview");
    }
  };

  useEffect(() => {
    if (!layoutApi) return;
    let active = true;
    void layoutApi
      .get()
      .then((layout) => {
        if (active) applyLayout(layout);
      })
      .catch(() => {
        if (active) setLayoutMessage(t("workbenchHub.layoutLoadFailed"));
      });
    return () => {
      active = false;
    };
  }, [layoutApi, t]);

  const persistLayout = async (
    change: WorkbenchLayoutChange,
  ): Promise<"saved" | "conflict" | "failed"> => {
    setLayoutMessage(undefined);
    const currentLayout: WorkbenchLayout = {
      revision,
      moduleOrder,
      hiddenModules: [...hiddenModules].filter(
        (moduleId): moduleId is ConfigurableWorkbenchModuleId =>
          moduleId !== "overview",
      ),
    };
    if (!layoutApi) {
      const nextLayout = change(currentLayout);
      applyLayout({
        revision: revision + 1,
        ...nextLayout,
      });
      return "saved";
    }

    setSavingLayout(true);
    try {
      const update = async (layout: WorkbenchLayout) => {
        const nextLayout = change(layout);
        return layoutApi.update({
          requestId: workbenchLayoutRequestId(),
          expectedRevision: layout.revision,
          ...nextLayout,
        });
      };
      const result = await update(currentLayout);
      if (result.ok) {
        applyLayout(result.layout);
        return "saved";
      }
      const retry = await update(result.current);
      if (retry.ok) {
        applyLayout(retry.layout);
        return "saved";
      }
      applyLayout(retry.current);
      setLayoutMessage(t("workbenchHub.layoutConflict"));
      return "conflict";
    } catch {
      setLayoutMessage(t("workbenchHub.layoutSaveFailed"));
      return "failed";
    } finally {
      setSavingLayout(false);
    }
  };

  const configurableModules = moduleOrder.map((moduleId) =>
    WORKBENCH_MODULES.find((module) => module.id === moduleId)!,
  );
  const visibleModules = [
    WORKBENCH_MODULES[0],
    ...configurableModules.filter((module) => !hiddenModules.has(module.id)),
  ];
  const active = WORKBENCH_MODULES.find(
    (module) => module.id === activeModule,
  )!;

  const hideModule = async (moduleId: WorkbenchModuleId): Promise<void> => {
    await persistLayout((layout) => ({
      moduleOrder: layout.moduleOrder,
      hiddenModules: [
        ...new Set<WorkbenchModuleId>(layout.hiddenModules).add(moduleId),
      ].filter(
        (id): id is ConfigurableWorkbenchModuleId => id !== "overview",
      ),
    }));
  };

  const restoreModule = async (moduleId: WorkbenchModuleId): Promise<void> => {
    const restore = (layout: WorkbenchLayout) => ({
      moduleOrder: layout.moduleOrder,
      hiddenModules: layout.hiddenModules.filter((id) => id !== moduleId),
    });
    if (!layoutApi) {
      void persistLayout(restore);
      setActiveModule(moduleId);
      return;
    }
    if (
      (await persistLayout(restore)) === "saved"
    ) {
      setActiveModule(moduleId);
    }
  };

  const moveModuleToIndex = async (
    sourceId: ConfigurableWorkbenchModuleId,
    targetIndex: number,
  ): Promise<void> => {
    const sourceIndex = moduleOrder.indexOf(sourceId);
    if (sourceIndex < 0 || sourceIndex === targetIndex) return;
    await persistLayout((layout) => {
      const rebasedWithoutSource = layout.moduleOrder.filter(
        (moduleId) => moduleId !== sourceId,
      );
      const rebasedInsertionIndex = Math.max(
        0,
        Math.min(targetIndex, rebasedWithoutSource.length),
      );
      return {
        moduleOrder: [
          ...rebasedWithoutSource.slice(0, rebasedInsertionIndex),
          sourceId,
          ...rebasedWithoutSource.slice(rebasedInsertionIndex),
        ],
        hiddenModules: layout.hiddenModules,
      };
    });
  };

  return (
    <div className="workbench-hub-page" aria-busy={savingLayout}>
      <h1 className="sr-only">{t("navigation.home")}</h1>
      <WorkspaceHeaderPortal>
        <Toolbar
          variant="workspace-header"
          className="workbench-hub-header"
          aria-label={t("workbenchHub.tabs.aria")}
        >
          <Tabs
            value={activeModule}
            onValueChange={(value) =>
              setActiveModule(value as WorkbenchModuleId)
            }
          >
            <TabList
              className="workbench-hub-tabs"
              aria-label={t("workbenchHub.tabs.aria")}
            >
              {visibleModules.map((module) => (
                <Tab
                  id={`workbench-hub-tab-${module.id}`}
                  key={module.id}
                  aria-controls={`workbench-hub-panel-${module.id}`}
                  value={module.id}
                >
                  {t(module.labelKey)}
                </Tab>
              ))}
            </TabList>
          </Tabs>
          <IconButton
            className="workbench-hub-settings-button"
            size="default"
            variant="ghost"
            aria-label={t("workbenchHub.manageTabs")}
            title={t("workbenchHub.manageTabs")}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} aria-hidden="true" />
          </IconButton>
        </Toolbar>
      </WorkspaceHeaderPortal>
      <PageBody mode="workspace" className="workbench-hub-content">
        {layoutMessage ? (
          <InlineAlert
            className="workbench-hub-layout-message"
            tone="danger"
            title={layoutMessage}
          />
        ) : null}
        {active.id !== "terminal" && active.id !== "schedules" ? (
          <section
            id={`workbench-hub-panel-${active.id}`}
            role="tabpanel"
            aria-labelledby={`workbench-hub-tab-${active.id}`}
          >
            {active.id === "overview" ? (
              <WorkbenchDashboardPage />
            ) : active.id === "tasks" ? (
              <TaskWorkbenchPage />
            ) : active.id === "sites" ? (
              <SiteWorkbenchPage />
            ) : active.id === "memos" ? (
              <MemoWorkbenchPage />
            ) : null}
          </section>
        ) : null}
        <section
          id="workbench-hub-panel-terminal"
          role="tabpanel"
          aria-labelledby="workbench-hub-tab-terminal"
          hidden={active.id !== "terminal"}
        >
          <TerminalWorkbenchPage active={active.id === "terminal"} />
        </section>
        {schedulesVisited.current ? (
          <section
            id="workbench-hub-panel-schedules"
            role="tabpanel"
            aria-labelledby="workbench-hub-tab-schedules"
            hidden={active.id !== "schedules"}
          >
            <SchedulePage active={active.id === "schedules"} />
          </section>
        ) : null}
      </PageBody>
      {settingsOpen ? (
        <Dialog
          open
          size="default"
          className="workbench-hub-settings-dialog"
          aria-label={t("workbenchHub.manageTabs")}
          locked={savingLayout}
          onOpenChange={(open) => {
            if (!open) setSettingsOpen(false);
          }}
        >
          <DialogHeader>
            <strong>{t("workbenchHub.manageTabs")}</strong>
            <IconButton
              aria-label={t("workbenchHub.close")}
              title={t("workbenchHub.close")}
              variant="ghost"
              size="compact"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={16} />
            </IconButton>
          </DialogHeader>
          <DialogBody>
            {configurableModules.map((module, index) => (
              <div
                key={module.id}
                draggable
                data-dragging={draggedModule === module.id || undefined}
                data-drop-target={
                  moduleDropTarget === module.id ? "before" : undefined
                }
                onDragStart={(event) => {
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                  }
                  beginNativeDrag(event, event.currentTarget);
                  setDraggedModule(
                    module.id as ConfigurableWorkbenchModuleId,
                  );
                }}
                onDragEnd={(event) => {
                  finishNativeDrag(event.currentTarget);
                  setDraggedModule(undefined);
                  setModuleDropTarget(undefined);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                  }
                  setModuleDropTarget(
                    module.id as ConfigurableWorkbenchModuleId,
                  );
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  ) {
                    setModuleDropTarget(undefined);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedModule) {
                    const sourceIndex = moduleOrder.indexOf(draggedModule);
                    void moveModuleToIndex(
                      draggedModule,
                      sourceIndex < index ? index - 1 : index,
                    );
                  }
                  finishNativeDrag(
                    event.currentTarget.parentElement?.querySelector<HTMLElement>(
                      "[data-dragging='true']",
                    ),
                  );
                  setDraggedModule(undefined);
                  setModuleDropTarget(undefined);
                }}
              >
                <span>{t(module.labelKey)}</span>
                <button
                  type="button"
                  aria-label={t(
                    hiddenModules.has(module.id)
                      ? "workbenchHub.restoreNamed"
                      : "workbenchHub.hideModule",
                    { name: t(module.labelKey) },
                  )}
                  disabled={savingLayout}
                  onClick={() =>
                    void (hiddenModules.has(module.id)
                      ? restoreModule(module.id)
                      : hideModule(module.id))
                  }
                >
                  {t(
                    hiddenModules.has(module.id)
                      ? "workbenchHub.restore"
                      : "workbenchHub.hide",
                  )}
                </button>
              </div>
            ))}
          </DialogBody>
        </Dialog>
      ) : null}
    </div>
  );
}

function workbenchLayoutRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `workbench-layout-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
