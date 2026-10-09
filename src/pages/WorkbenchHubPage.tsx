import { Plus, Settings, X } from "lucide-react";
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
import { DragHandle } from "../features/drag/DragHandle";
import { WorkbenchDashboardPage } from "../features/workbench-hub/dashboard/WorkbenchDashboardPage";
import { SystemStatusPage } from "../features/workbench-hub/system/SystemStatusPage";
import { TaskWorkbenchPage } from "../features/workbench-hub/tasks/TaskWorkbenchPage";
import { SiteWorkbenchPage } from "../features/workbench-hub/sites/SiteWorkbenchPage";
import { MemoWorkbenchPage } from "../features/workbench-hub/memos/MemoWorkbenchPage";
import { TerminalWorkbenchPage } from "../features/workbench-hub/terminal/TerminalWorkbenchPage";
import { useLocalization } from "../localization/LocalizationProvider";
import type { TranslationKey } from "../localization/translate";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton,
  InlineAlert,
  Menu,
  MenuContent,
  MenuItem,
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
  { id: "system", labelKey: "workbenchHub.module.system" },
] as const satisfies readonly {
  id: WorkbenchModuleId;
  labelKey: TranslationKey;
}[];

type WorkbenchHubPageProps = {
  layoutApi?: WorkbenchHubApi["layout"];
};

export default function WorkbenchHubPage({
  layoutApi = window.realmflow?.workbenchHub?.layout,
}: WorkbenchHubPageProps): JSX.Element {
  const { t } = useLocalization();
  const [activeModule, setActiveModule] =
    useState<WorkbenchModuleId>("overview");
  const [hiddenModules, setHiddenModules] = useState<Set<WorkbenchModuleId>>(
    new Set(DEFAULT_WORKBENCH_LAYOUT.hiddenModules),
  );
  const [moduleMenuOpen, setModuleMenuOpen] = useState(false);
  const moduleMenuButtonRef = useRef<HTMLButtonElement>(null);
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
    nextOrder: ConfigurableWorkbenchModuleId[],
    nextHiddenModules: Set<WorkbenchModuleId>,
  ): Promise<"saved" | "conflict" | "failed"> => {
    setLayoutMessage(undefined);
    if (!layoutApi) {
      applyLayout({
        revision: revision + 1,
        moduleOrder: nextOrder,
        hiddenModules: [...nextHiddenModules].filter(
          (moduleId): moduleId is ConfigurableWorkbenchModuleId =>
            moduleId !== "overview",
        ),
      });
      return "saved";
    }

    setSavingLayout(true);
    try {
      const result = await layoutApi.update({
        requestId: workbenchLayoutRequestId(),
        expectedRevision: revision,
        moduleOrder: nextOrder,
        hiddenModules: [...nextHiddenModules].filter(
          (moduleId): moduleId is ConfigurableWorkbenchModuleId =>
            moduleId !== "overview",
        ),
      });
      if (result.ok) {
        applyLayout(result.layout);
        return "saved";
      }
      applyLayout(result.current);
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
  const hiddenConfigurableModules = configurableModules.filter((module) =>
    hiddenModules.has(module.id),
  );
  const active = WORKBENCH_MODULES.find(
    (module) => module.id === activeModule,
  )!;

  const hideModule = async (moduleId: WorkbenchModuleId): Promise<void> => {
    const nextHiddenModules = new Set(hiddenModules).add(moduleId);
    await persistLayout(moduleOrder, nextHiddenModules);
  };

  const restoreModule = async (moduleId: WorkbenchModuleId): Promise<void> => {
    const nextHiddenModules = new Set(hiddenModules);
    nextHiddenModules.delete(moduleId);
    if (!layoutApi) {
      void persistLayout(moduleOrder, nextHiddenModules);
      setActiveModule(moduleId);
      setModuleMenuOpen(false);
      return;
    }
    if ((await persistLayout(moduleOrder, nextHiddenModules)) === "saved") {
      setActiveModule(moduleId);
      setModuleMenuOpen(false);
    }
  };

  const moveModuleToIndex = async (
    sourceId: ConfigurableWorkbenchModuleId,
    targetIndex: number,
  ): Promise<void> => {
    const sourceIndex = moduleOrder.indexOf(sourceId);
    if (sourceIndex < 0 || sourceIndex === targetIndex) return;
    const withoutSource = moduleOrder.filter(
      (moduleId) => moduleId !== sourceId,
    );
    const insertionIndex = Math.max(
      0,
      Math.min(targetIndex, withoutSource.length),
    );
    await persistLayout(
      [
        ...withoutSource.slice(0, insertionIndex),
        sourceId,
        ...withoutSource.slice(insertionIndex),
      ],
      hiddenModules,
    );
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
              <div className="workbench-hub-add">
                <IconButton
                  ref={moduleMenuButtonRef}
                  size="default"
                  variant="ghost"
                  aria-label={t("workbenchHub.addModule")}
                  title={t("tooltip.add")}
                  onClick={() => setModuleMenuOpen((open) => !open)}
                >
                  <Plus size={17} aria-hidden="true" />
                </IconButton>
                <Menu
                  open={moduleMenuOpen}
                  onOpenChange={setModuleMenuOpen}
                  trigger={moduleMenuButtonRef.current}
                >
                  <MenuContent
                    className="workbench-hub-module-menu"
                    aria-label={t("workbenchHub.addModule")}
                  >
                    {hiddenConfigurableModules.map((module) => (
                      <MenuItem
                        key={module.id}
                        disabled={savingLayout}
                        onSelect={() => void restoreModule(module.id)}
                      >
                        {t(module.labelKey)}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              </div>
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
        {active.id !== "terminal" ? (
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
            ) : (
              <SystemStatusPage />
            )}
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
                <DragHandle
                  className="workbench-hub-module-drag"
                  name={t(module.labelKey)}
                  disabled={savingLayout}
                  draggable
                />
                <span>{t(module.labelKey)}</span>
                <button
                  type="button"
                  aria-label={t("workbenchHub.hideModule", {
                    name: t(module.labelKey),
                  })}
                  disabled={savingLayout || hiddenModules.has(module.id)}
                  onClick={() => void hideModule(module.id)}
                >
                  {t("workbenchHub.hide")}
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
