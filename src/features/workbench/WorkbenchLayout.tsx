import {
  ArrowLeft,
  ArrowRight,
  Code2,
  ExternalLink,
  Folder,
  Globe2,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { TerminalApi } from "../../../shared/terminal";
import type { CodeSnippetApi } from "../../../shared/code-snippet";
import type {
  CodeSnippetTab,
  TerminalTab,
  WebTab,
  WorkbenchTab,
  WorkspaceTab,
} from "../../application/workbench/workbench-reducer";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DocumentTabs,
  Field,
  IconButton,
  Toolbar,
} from "../../components/ui";
import ArtifactWorkbench from "../artifacts/ArtifactWorkbench";
import { useLocalization } from "../../localization/LocalizationProvider";

const TerminalPane = lazy(() => import("./TerminalPane"));
const CodeSnippetPane = lazy(() => import("./CodeSnippetPane"));

export type WorkbenchLauncherAction = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  run: () => void | Promise<void>;
};

function workbenchTabIcon(type: WorkbenchTab["type"]): JSX.Element {
  if (type === "workspace") return <Folder size={14} />;
  if (type === "web") return <Globe2 size={14} />;
  if (type === "terminal") return <Terminal size={14} />;
  return <Code2 size={14} />;
}

type WorkbenchLayoutProps = {
  children: ReactNode;
  layoutRef: RefObject<HTMLDivElement>;
  panelRef: RefObject<HTMLElement>;
  addButtonRef: RefObject<HTMLButtonElement>;
  panelOpen: boolean;
  panelMaximized: boolean;
  panelWidth: number;
  tabs: WorkbenchTab[];
  activeTab?: WorkbenchTab;
  activeTabId?: string;
  urlDialogOpen: boolean;
  urlDraft: string;
  urlError: string;
  terminalApi?: TerminalApi;
  codeSnippetApi?: CodeSnippetApi;
  launcherActions: WorkbenchLauncherAction[];
  onPageClick: (event: MouseEvent<HTMLDivElement>) => void;
  onTogglePanel: () => void;
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onToggleAddMenu: () => void;
  onToggleMaximized: () => void;
  onNavigateWeb: (tab: WebTab, url: string) => void;
  onGoBack: (tabId: string) => void;
  onGoForward: (tabId: string) => void;
  onReload: (tabId: string) => void;
  onOpenExternal: (url: string) => void;
  onUrlDraftChange: (value: string) => void;
  onCloseUrlDialog: () => void;
  onSubmitUrl: () => void;
};

export function WorkbenchLayout({
  children,
  layoutRef,
  panelRef,
  addButtonRef,
  panelOpen,
  panelMaximized,
  panelWidth,
  tabs,
  activeTab,
  activeTabId,
  urlDialogOpen,
  urlDraft,
  urlError,
  terminalApi,
  codeSnippetApi,
  launcherActions,
  onPageClick,
  onTogglePanel,
  onResizeStart,
  onResizeKeyDown,
  onSelectTab,
  onCloseTab,
  onToggleAddMenu,
  onToggleMaximized,
  onNavigateWeb,
  onGoBack,
  onGoForward,
  onReload,
  onOpenExternal,
  onUrlDraftChange,
  onCloseUrlDialog,
  onSubmitUrl,
}: WorkbenchLayoutProps): JSX.Element {
  const { t } = useLocalization();

  return (
    <>
      <div
        ref={layoutRef}
        className={[
          "global-workbench-layout",
          panelOpen ? "open" : "",
          panelMaximized ? "maximized" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          { "--global-workbench-width": `${panelWidth}px` } as CSSProperties
        }
      >
        <div className="global-workbench-page" onClickCapture={onPageClick}>
          {children}
          <Toolbar
            className="global-workbench-tools"
            aria-label={t("workbench.tools")}
          >
            <IconButton
              size="default"
              variant="ghost"
              aria-label={t(
                panelOpen ? "workbench.collapse" : "workbench.open",
              )}
              title={t(panelOpen ? "workbench.collapse" : "workbench.open")}
              onClick={onTogglePanel}
            >
              {panelOpen ? (
                <PanelRightClose size={18} strokeWidth={1.8} />
              ) : (
                <PanelRightOpen size={18} strokeWidth={1.8} />
              )}
            </IconButton>
          </Toolbar>
        </div>

        <div
          className="global-workbench-resizer"
          hidden={!panelOpen}
          role="separator"
          aria-label={t("workbench.resize")}
          tabIndex={0}
          onMouseDown={onResizeStart}
          onKeyDown={onResizeKeyDown}
        />
        <aside
          className={
            tabs.length > 0 ? "global-workbench" : "global-workbench empty"
          }
          hidden={!panelOpen}
          aria-label={t("workbench.aria")}
          ref={panelRef}
        >
          <header className="global-workbench-header">
            <DocumentTabs
              aria-label={t("workbench.aria")}
              className="global-workbench-tabbar"
              value={activeTabId ?? ""}
              items={tabs.map((tab) => ({
                value: tab.id,
                label: tab.label,
                leading: workbenchTabIcon(tab.type),
                loading: tab.type === "web" && tab.page.loading,
                closable: true,
              }))}
              onValueChange={onSelectTab}
              onClose={onCloseTab}
              getCloseLabel={(item) =>
                t("workbench.closeTab", { name: item.label })
              }
              toolbar={
                <Toolbar
                  className="global-workbench-header-actions"
                  aria-label={t("workbench.tools")}
                >
                  <IconButton
                    size="default"
                    variant="ghost"
                    title={t("workbench.add")}
                    aria-label={t("workbench.add")}
                    ref={addButtonRef}
                    onClick={onToggleAddMenu}
                  >
                    <Plus size={18} />
                  </IconButton>
                  <IconButton
                    size="default"
                    variant="ghost"
                    aria-label={t(
                      panelMaximized
                        ? "workbench.restore"
                        : "workbench.maximize",
                    )}
                    title={t(
                      panelMaximized
                        ? "workbench.restore"
                        : "workbench.maximize",
                    )}
                    onClick={onToggleMaximized}
                  >
                    {panelMaximized ? (
                      <Minimize2 size={17} />
                    ) : (
                      <Maximize2 size={17} />
                    )}
                  </IconButton>
                </Toolbar>
              }
            />
          </header>

          {tabs.length === 0 ? (
            <div className="global-workbench-empty">
              <p>{t("workbench.startHere")}</p>
              <div>
                {launcherActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      type="button"
                      aria-label={`${action.label} ${action.description}`}
                      key={action.id}
                      onClick={() => void action.run()}
                    >
                      <Icon size={18} />
                      <strong>{action.label}</strong>
                      <span>{action.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tabs
            .filter((tab): tab is WorkspaceTab => tab.type === "workspace")
            .map((tab) => (
              <div
                className="global-workspace-tab-content"
                hidden={tab.id !== activeTabId}
                key={tab.id}
              >
                <ArtifactWorkbench
                  requirementId={tab.workspaceId}
                  activeStage={tab.activeStage}
                  initialPath={tab.initialPath}
                  initialFiles={tab.initialFiles}
                />
              </div>
            ))}
          {activeTab?.type === "web" ? (
            <WebPane
              tab={activeTab}
              onNavigate={onNavigateWeb}
              onGoBack={onGoBack}
              onGoForward={onGoForward}
              onReload={onReload}
              onOpenExternal={onOpenExternal}
            />
          ) : null}
          {terminalApi
            ? tabs
                .filter((tab): tab is TerminalTab => tab.type === "terminal")
                .map((tab) => (
                  <div
                    className="global-terminal-tab-content"
                    hidden={tab.id !== activeTabId}
                    key={tab.id}
                  >
                    <Suspense
                      fallback={
                        <div className="global-terminal-loading">
                          {t("workbench.terminalStarting")}
                        </div>
                      }
                    >
                      <TerminalPane
                        api={terminalApi}
                        sessionId={tab.id}
                        title={tab.label}
                        output={tab.output}
                        active={panelOpen && tab.id === activeTabId}
                      />
                    </Suspense>
                  </div>
                ))
            : null}
          {tabs
            .filter((tab): tab is CodeSnippetTab => tab.type === "code")
            .map((tab) => (
              <div
                className="global-code-tab-content"
                hidden={tab.id !== activeTabId}
                key={tab.id}
              >
                <Suspense
                  fallback={
                    <div className="global-terminal-loading">
                      {t("workbench.code.loading")}
                    </div>
                  }
                >
                  <CodeSnippetPane
                    snippet={tab.snippet}
                    api={codeSnippetApi}
                  />
                </Suspense>
              </div>
            ))}
        </aside>
      </div>

      {urlDialogOpen ? (
        <Dialog
          open
          size="compact"
          className="global-url-dialog"
          aria-labelledby="global-url-dialog-title"
          onOpenChange={(open) => {
            if (!open) onCloseUrlDialog();
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitUrl();
            }}
          >
            <DialogHeader>
              <Globe2 size={18} />
              <h2 id="global-url-dialog-title">{t("workbench.web.open")}</h2>
            </DialogHeader>
            <DialogBody className="global-url-dialog__body">
              <Field name="workbench-web-address"
                label={t("workbench.web.address")}
                error={urlError || undefined}
              >
                <input type="url" inputMode="url"
                  id="global-web-url"
                  data-autofocus
                  value={urlDraft}
                  onChange={(event) => onUrlDraftChange(event.target.value)}
                  placeholder="https://example.com"
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={onCloseUrlDialog}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={!urlDraft.trim()}
              >
                {t("common.open")}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

function WebPane({
  tab,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onOpenExternal,
}: {
  tab: WebTab;
  onNavigate: (tab: WebTab, url: string) => void;
  onGoBack: (tabId: string) => void;
  onGoForward: (tabId: string) => void;
  onReload: (tabId: string) => void;
  onOpenExternal: (url: string) => void;
}): JSX.Element {
  const { t } = useLocalization();
  const agentManaged = tab.managed === "agent";
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (agentManaged) return;
    const data = new FormData(event.currentTarget);
    onNavigate(tab, String(data.get("url") ?? ""));
  };
  return (
    <div className="global-web-workbench">
      <form onSubmit={submit}>
        <button
          type="button"
          aria-label={t("workbench.web.back")}
          title={t("workbench.web.back")}
          disabled={agentManaged || !tab.page.canGoBack}
          onClick={() => onGoBack(tab.id)}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          type="button"
          aria-label={t("workbench.web.forward")}
          title={t("workbench.web.forward")}
          disabled={agentManaged || !tab.page.canGoForward}
          onClick={() => onGoForward(tab.id)}
        >
          <ArrowRight size={15} />
        </button>
        <button
          type="button"
          aria-label={t("workbench.web.reload")}
          title={t("workbench.web.reload")}
          disabled={agentManaged}
          onClick={() => onReload(tab.id)}
        >
          <RefreshCw size={15} />
        </button>
        <input type="url" inputMode="url" autoComplete="off"
          key={tab.page.url}
          name="url"
          aria-label={t("workbench.web.address")}
          defaultValue={tab.page.url}
          readOnly={agentManaged}
        />
        <button
          type="button"
          aria-label={t("workbench.web.openExternal")}
          title={t("workbench.web.openExternal")}
          disabled={agentManaged}
          onClick={() => onOpenExternal(tab.page.url)}
        >
          <ExternalLink size={15} />
        </button>
      </form>
      {tab.page.error ? (
        <div className="global-web-error">
          <strong>{t("workbench.web.error")}</strong>
          <span>{tab.page.error}</span>
        </div>
      ) : null}
    </div>
  );
}
