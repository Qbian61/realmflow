import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  X,
  type LucideIcon
} from 'lucide-react'
import {
  lazy,
  Suspense,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject
} from 'react'
import type { TerminalApi } from '../../../shared/terminal'
import type {
  TerminalTab,
  WebTab,
  WorkbenchTab,
  WorkspaceTab
} from '../../application/workbench/workbench-reducer'
import ArtifactWorkbench from '../artifacts/ArtifactWorkbench'

const TerminalPane = lazy(() => import('./TerminalPane'))

export type WorkbenchLauncherAction = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  run: () => void | Promise<void>
}

type WorkbenchLayoutProps = {
  children: ReactNode
  layoutRef: RefObject<HTMLDivElement>
  panelRef: RefObject<HTMLElement>
  addButtonRef: RefObject<HTMLButtonElement>
  panelOpen: boolean
  panelMaximized: boolean
  panelWidth: number
  tabs: WorkbenchTab[]
  activeTab?: WorkbenchTab
  activeTabId?: string
  urlDialogOpen: boolean
  urlDraft: string
  urlError: string
  terminalApi?: TerminalApi
  launcherActions: WorkbenchLauncherAction[]
  onPageClick: (event: MouseEvent<HTMLDivElement>) => void
  onTogglePanel: () => void
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onToggleAddMenu: () => void
  onToggleMaximized: () => void
  onNavigateWeb: (tab: WebTab, url: string) => void
  onGoBack: (tabId: string) => void
  onGoForward: (tabId: string) => void
  onReload: (tabId: string) => void
  onOpenExternal: (url: string) => void
  onUrlDraftChange: (value: string) => void
  onCloseUrlDialog: () => void
  onSubmitUrl: () => void
}

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
  onSubmitUrl
}: WorkbenchLayoutProps): JSX.Element {
  return (
    <>
      <div
        ref={layoutRef}
        className={[
          'global-workbench-layout',
          panelOpen ? 'open' : '',
          panelMaximized ? 'maximized' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ '--global-workbench-width': `${panelWidth}px` } as CSSProperties}
      >
        <div className="global-workbench-page" onClickCapture={onPageClick}>
          {children}
          <div className="global-workbench-tools" aria-label="工作区工具">
            <button
              type="button"
              aria-label={panelOpen ? '收起工作区' : '打开工作区'}
              title={panelOpen ? '收起工作区' : '打开工作区'}
              onClick={onTogglePanel}
            >
              {panelOpen ? (
                <PanelRightClose size={18} strokeWidth={1.8} />
              ) : (
                <PanelRightOpen size={18} strokeWidth={1.8} />
              )}
            </button>
          </div>
        </div>

        <div
          className="global-workbench-resizer"
          hidden={!panelOpen}
          role="separator"
          aria-label="调整全局工作区宽度"
          tabIndex={0}
          onMouseDown={onResizeStart}
          onKeyDown={onResizeKeyDown}
        />
        <aside
          className={
            tabs.length > 0
              ? 'global-workbench'
              : 'global-workbench empty'
          }
          hidden={!panelOpen}
          aria-label="全局工作区"
          ref={panelRef}
        >
          <header className="global-workbench-header">
            <div className="global-workbench-tabbar">
              <div className="global-workbench-tabs" role="tablist">
                {tabs.map((tab) => (
                  <div
                    className={tab.id === activeTabId ? 'active' : ''}
                    key={tab.id}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab.id === activeTabId}
                      onClick={() => onSelectTab(tab.id)}
                    >
                      {tab.type === 'web' && tab.page.loading ? (
                        <LoaderCircle className="spinning" size={13} />
                      ) : null}
                      <span>{tab.label}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`关闭 ${tab.label}`}
                      onClick={() => onCloseTab(tab.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="global-workbench-add">
                <button
                  ref={addButtonRef}
                  type="button"
                  aria-label="添加工作区内容"
                  title="添加工作区内容"
                  onClick={onToggleAddMenu}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            <div className="global-workbench-header-actions">
              <button
                type="button"
                aria-label={
                  panelMaximized ? '还原工作区' : '最大化工作区'
                }
                title={panelMaximized ? '还原工作区' : '最大化工作区'}
                onClick={onToggleMaximized}
              >
                {panelMaximized ? (
                  <Minimize2 size={17} />
                ) : (
                  <Maximize2 size={17} />
                )}
              </button>
            </div>
          </header>

          {tabs.length === 0 ? (
            <div className="global-workbench-empty">
              <p>从这里开始</p>
              <div>
                {launcherActions.map((action) => {
                  const Icon = action.icon
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
                  )
                })}
              </div>
            </div>
          ) : null}

          {tabs
            .filter((tab): tab is WorkspaceTab => tab.type === 'workspace')
            .map((tab) => (
              <div
                className="global-workspace-tab-content"
                hidden={tab.id !== activeTabId}
                key={tab.id}
              >
                <ArtifactWorkbench
                  requirementId={tab.workspaceId}
                  activeStage={tab.activeStage}
                  initialFiles={tab.initialFiles}
                />
              </div>
            ))}
          {activeTab?.type === 'web' ? (
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
                .filter((tab): tab is TerminalTab => tab.type === 'terminal')
                .map((tab) => (
                  <div
                    className="global-terminal-tab-content"
                    hidden={tab.id !== activeTabId}
                    key={tab.id}
                  >
                    <Suspense
                      fallback={
                        <div className="global-terminal-loading">
                          正在启动终端...
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
        </aside>
      </div>

      {urlDialogOpen ? (
        <div
          className="global-url-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCloseUrlDialog()
          }}
        >
          <form
            className="global-url-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-url-dialog-title"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmitUrl()
            }}
          >
            <div>
              <Globe2 size={18} />
              <h2 id="global-url-dialog-title">打开网页</h2>
            </div>
            <label htmlFor="global-web-url">网页地址</label>
            <input
              id="global-web-url"
              autoFocus
              value={urlDraft}
              onChange={(event) => onUrlDraftChange(event.target.value)}
              placeholder="https://example.com"
            />
            {urlError ? <p role="alert">{urlError}</p> : null}
            <footer>
              <button type="button" onClick={onCloseUrlDialog}>
                取消
              </button>
              <button type="submit" disabled={!urlDraft.trim()}>
                打开
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  )
}

function WebPane({
  tab,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onOpenExternal
}: {
  tab: WebTab
  onNavigate: (tab: WebTab, url: string) => void
  onGoBack: (tabId: string) => void
  onGoForward: (tabId: string) => void
  onReload: (tabId: string) => void
  onOpenExternal: (url: string) => void
}): JSX.Element {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onNavigate(tab, String(data.get('url') ?? ''))
  }
  return (
    <div className="global-web-workbench">
      <form onSubmit={submit}>
        <button
          type="button"
          aria-label="后退"
          disabled={!tab.page.canGoBack}
          onClick={() => onGoBack(tab.id)}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          type="button"
          aria-label="前进"
          disabled={!tab.page.canGoForward}
          onClick={() => onGoForward(tab.id)}
        >
          <ArrowRight size={15} />
        </button>
        <button
          type="button"
          aria-label="重新加载"
          onClick={() => onReload(tab.id)}
        >
          <RefreshCw size={15} />
        </button>
        <input
          key={tab.page.url}
          name="url"
          aria-label="网页地址"
          defaultValue={tab.page.url}
        />
        <button
          type="button"
          aria-label="在系统浏览器打开"
          onClick={() => onOpenExternal(tab.page.url)}
        >
          <ExternalLink size={15} />
        </button>
      </form>
      {tab.page.error ? (
        <div className="global-web-error">
          <strong>网页无法在应用内打开</strong>
          <span>{tab.page.error}</span>
        </div>
      ) : null}
    </div>
  )
}
