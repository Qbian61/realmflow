import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe2,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  SquareTerminal,
  X
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  lazy,
  useLayoutEffect,
  useMemo,
  useRef,
  Suspense,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import type { RealmFlowApi } from '../../../shared/types'
import type {
  NativeOverlayEvent,
  NativeOverlayRequest
} from '../../../shared/native-overlay'
import type { TerminalEvent, TerminalSession } from '../../../shared/terminal'
import type {
  OpenedSessionFiles,
  RequirementStageId,
  WorkspaceFile
} from '../../../shared/workspace'
import type { WebPageState } from '../../../shared/workbench'
import ArtifactWorkbench from '../artifacts/ArtifactWorkbench'
import './workbench.css'

const TerminalPane = lazy(() => import('./TerminalPane'))

const MIN_WORKBENCH_WIDTH = 440
const WORKBENCH_RIGHT_INSET = 8
const MIN_PANEL_WIDTH = MIN_WORKBENCH_WIDTH + WORKBENCH_RIGHT_INSET
const MAX_PANEL_WIDTH = 920
const MIN_SIDEBAR_WIDTH = 220
const MIN_CONTENT_WIDTH = 320
const MIN_MAIN_WORKSPACE_WIDTH =
  MIN_SIDEBAR_WIDTH + MIN_CONTENT_WIDTH + 8
const WORKBENCH_RESIZER_WIDTH = 4

type WorkspaceTab = {
  id: string
  type: 'workspace'
  label: string
  workspaceId: string
  activeStage?: RequirementStageId
  initialFiles?: WorkspaceFile[]
}

type WebTab = {
  id: string
  type: 'web'
  label: string
  page: WebPageState
}

type TerminalTab = {
  id: string
  type: 'terminal'
  label: string
  session: TerminalSession
  output: string
  exited: boolean
}

type WorkbenchTab = WorkspaceTab | WebTab | TerminalTab

type WorkbenchContextValue = {
  openFiles: () => Promise<void>
  openWorkspaceSelection: (selection: OpenedSessionFiles) => void
  openFolder: () => Promise<void>
  openUrl: (url?: string) => Promise<void>
  openTerminal: () => Promise<void>
  openRequirementArtifact: (
    requirementId: string,
    stage: RequirementStageId,
    label: string
  ) => void
  openPanel: () => void
  closePanel: () => void
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null)

export function useWorkbench(): WorkbenchContextValue {
  const context = useContext(WorkbenchContext)
  if (!context) throw new Error('WorkbenchProvider is required')
  return context
}

type WorkbenchProviderProps = {
  children: ReactNode
  api?: RealmFlowApi
}

export function WorkbenchProvider({
  children,
  api = window.realmflow
}: WorkbenchProviderProps): JSX.Element {
  const layoutRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const resizeStartRef = useRef<{ clientX: number; width: number }>()
  const terminalBufferRef = useRef(new Map<string, string>())
  const terminalIdsRef = useRef(new Set<string>())
  const [tabs, setTabs] = useState<WorkbenchTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string>()
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(640)
  const [urlDialogOpen, setUrlDialogOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState('https://')
  const [urlError, setUrlError] = useState('')
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [panelMaximized, setPanelMaximized] = useState(false)
  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  const webViewObscured = urlDialogOpen

  const clampPanelWidth = useCallback((width: number): number => {
    const layout = layoutRef.current
    const layoutWidth = layout?.getBoundingClientRect().width ?? 0
    const sidebar = layout?.querySelector<HTMLElement>('.sidebar')
    const content = layout?.querySelector<HTMLElement>('.app-content')
    const contentStyles = content ? window.getComputedStyle(content) : undefined
    const measuredContentInset = contentStyles
      ? Number.parseFloat(contentStyles.marginLeft) +
        Number.parseFloat(contentStyles.marginRight)
      : Number.NaN
    const contentHorizontalInset = Number.isFinite(measuredContentInset)
      ? measuredContentInset
      : 8
    const sidebarWidth =
      sidebar?.getBoundingClientRect().width || MIN_SIDEBAR_WIDTH
    const minimumMainWidth = Math.max(
      MIN_MAIN_WORKSPACE_WIDTH,
      sidebarWidth + contentHorizontalInset + MIN_CONTENT_WIDTH
    )
    const availableMaxWidth =
      layoutWidth > 0
        ? layoutWidth - minimumMainWidth - WORKBENCH_RESIZER_WIDTH
        : MAX_PANEL_WIDTH
    const effectiveMaxWidth = Math.max(
      MIN_PANEL_WIDTH,
      Math.min(MAX_PANEL_WIDTH, availableMaxWidth)
    )
    return Math.min(effectiveMaxWidth, Math.max(MIN_PANEL_WIDTH, width))
  }, [])

  const getAddMenuRequest = useCallback((): NativeOverlayRequest | null => {
    const button = addButtonRef.current
    if (!button) return null

    const buttonBounds = button.getBoundingClientRect()
    return {
      kind: 'workbench-menu',
      anchor: {
        x: buttonBounds.x,
        y: buttonBounds.y,
        width: buttonBounds.width,
        height: buttonBounds.height
      }
    }
  }, [])

  const showAddMenu = useCallback((): void => {
    const request = getAddMenuRequest()
    if (!request || !api?.nativeOverlay) return
    setAddMenuOpen(true)
    void api.nativeOverlay.show(request)
  }, [api, getAddMenuRequest])

  const hideAddMenu = useCallback((): void => {
    setAddMenuOpen(false)
    void api?.nativeOverlay?.hide('workbench-menu')
  }, [api])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (
        panelOpen &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === 'p'
      ) {
        event.preventDefault()
        showAddMenu()
      }
      if (event.key === 'Escape') hideAddMenu()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [hideAddMenu, panelOpen, showAddMenu])

  useEffect(() => {
    return api?.webWorkbench.onStateChange((page) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.type === 'web' && tab.id === page.id
            ? { ...tab, label: page.title || page.url, page }
            : tab
        )
      )
    })
  }, [api])

  useEffect(() => {
    return api?.terminal.onEvent((event: TerminalEvent) => {
      if (
        event.type === 'data' &&
        !terminalIdsRef.current.has(event.sessionId)
      ) {
        const buffered = terminalBufferRef.current.get(event.sessionId) ?? ''
        terminalBufferRef.current.set(
          event.sessionId,
          `${buffered}${event.data}`.slice(-1024 * 1024)
        )
        return
      }
      setTabs((current) =>
        current.map((tab) => {
          if (tab.type !== 'terminal' || tab.id !== event.sessionId) return tab
          if (event.type === 'exit') {
            return {
              ...tab,
              exited: true,
              output: `${tab.output}\r\n[进程已退出，代码 ${event.exitCode}]\r\n`
            }
          }
          return {
            ...tab,
            output: `${tab.output}${event.data}`.slice(-1024 * 1024)
          }
        })
      )
    })
  }, [api])

  const syncWebView = useCallback(() => {
    if (
      !api ||
      !panelOpen ||
      activeTab?.type !== 'web' ||
      !panelRef.current ||
      webViewObscured
    ) {
      void api?.webWorkbench.hideAll()
      return
    }
    const bounds = panelRef.current.getBoundingClientRect()
    void api.webWorkbench.show(activeTab.id, {
      x: bounds.x,
      y: bounds.y + 90,
      width: bounds.width,
      height: Math.max(1, bounds.height - 90)
    })
  }, [activeTab, api, panelOpen, webViewObscured])

  useLayoutEffect(() => {
    syncWebView()
    if (!panelRef.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(syncWebView)
    observer.observe(panelRef.current)
    window.addEventListener('resize', syncWebView)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncWebView)
    }
  }, [syncWebView])

  useEffect(() => {
    const resizePanel = (event: MouseEvent): void => {
      const start = resizeStartRef.current
      if (!start) return
      setPanelWidth(
        clampPanelWidth(start.width + start.clientX - event.clientX)
      )
    }
    const stopResizing = (): void => {
      resizeStartRef.current = undefined
      document.body.classList.remove('resizing-global-workbench')
    }
    window.addEventListener('mousemove', resizePanel)
    window.addEventListener('mouseup', stopResizing)
    return () => {
      window.removeEventListener('mousemove', resizePanel)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [clampPanelWidth])

  useLayoutEffect(() => {
    if (!panelOpen || panelMaximized) return
    const layout = layoutRef.current
    if (!layout) return

    const keepPanelWithinBounds = (): void => {
      setPanelWidth((width) => clampPanelWidth(width))
    }
    keepPanelWithinBounds()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(keepPanelWithinBounds)
    observer.observe(layout)
    return () => observer.disconnect()
  }, [clampPanelWidth, panelMaximized, panelOpen])

  const activateTab = (tab: WorkbenchTab): void => {
    setTabs((current) => {
      const existing = current.find((item) => item.id === tab.id)
      return existing
        ? current.map((item) => (item.id === tab.id ? tab : item))
        : [...current, tab]
    })
    setActiveTabId(tab.id)
    setPanelOpen(true)
  }

  const openWorkspaceSelection = (selection: OpenedSessionFiles): void => {
    activateTab({
      id: `workspace:${selection.binding.requirementId}`,
      type: 'workspace',
      label: selection.binding.rootName,
      workspaceId: selection.binding.requirementId,
      initialFiles: selection.files
    })
  }

  const openFiles = async (): Promise<void> => {
    const selection = await api?.workspace.chooseFiles()
    if (!selection) return
    openWorkspaceSelection(selection)
  }

  const openFolder = async (): Promise<void> => {
    const binding = await api?.workspace.chooseFolder()
    if (!binding) return
    activateTab({
      id: `workspace:${binding.requirementId}`,
      type: 'workspace',
      label: binding.rootName,
      workspaceId: binding.requirementId
    })
  }

  const openTerminal = async (): Promise<void> => {
    if (!api) return
    const binding = await api.workspace.chooseFolder()
    if (!binding) return
    const session = await api.terminal.create(binding.requirementId, {
      cols: 80,
      rows: 24
    })
    terminalIdsRef.current.add(session.id)
    const output = terminalBufferRef.current.get(session.id) ?? ''
    terminalBufferRef.current.delete(session.id)
    activateTab({
      id: session.id,
      type: 'terminal',
      label: session.title,
      session,
      output,
      exited: false
    })
  }

  const openUrl = async (url?: string): Promise<void> => {
    if (!api) return
    if (!url) {
      setUrlError('')
      setUrlDialogOpen(true)
      return
    }
    try {
      const page = await api.webWorkbench.create(url)
      activateTab({
        id: page.id,
        type: 'web',
        label: page.title || page.url,
        page
      })
      setUrlDialogOpen(false)
      setUrlError('')
    } catch (error) {
      setUrlError(
        error instanceof Error ? error.message : '无法打开该网页地址'
      )
    }
  }

  const closeTab = async (id: string): Promise<void> => {
    const closingTab = tabs.find((tab) => tab.id === id)
    if (closingTab?.type === 'web') await api?.webWorkbench.destroy(id)
    if (closingTab?.type === 'terminal' && !closingTab.exited) {
      await api?.terminal.destroy(id)
    }
    if (closingTab?.type === 'terminal') {
      terminalIdsRef.current.delete(id)
      terminalBufferRef.current.delete(id)
    }
    const remainingTabs = tabs.filter((tab) => tab.id !== id)
    setTabs(remainingTabs)
    if (activeTabId === id) {
      setActiveTabId(remainingTabs.at(-1)?.id)
    }
  }

  const openLinkedWebContent = (
    event: ReactMouseEvent<HTMLDivElement>
  ): void => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    const target = event.target
    if (!(target instanceof Element)) return
    const link = target.closest<HTMLAnchorElement>('a[href]')
    if (!link || link.hasAttribute('download')) return
    const rawHref = link.getAttribute('href')
    if (!rawHref || rawHref.startsWith('#')) return
    const url = new URL(link.href)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    event.preventDefault()
    void openUrl(url.toString())
  }

  const contextValue = useMemo<WorkbenchContextValue>(
    () => ({
      openFiles,
      openWorkspaceSelection,
      openFolder,
      openUrl,
      openTerminal,
      openRequirementArtifact: (requirementId, stage, label) => {
        activateTab({
          id: `requirement:${requirementId}`,
          type: 'workspace',
          label,
          workspaceId: requirementId,
          activeStage: stage
        })
      },
      openPanel: () => {
        setPanelOpen(true)
      },
      closePanel: () => {
        setPanelOpen(false)
        void api?.webWorkbench.hideAll()
      }
    }),
    [api, tabs]
  )

  const workbenchActions = [
    {
      id: 'files',
      label: '文件',
      description: '浏览和预览文件',
      icon: FileText,
      run: openFiles
    },
    {
      id: 'folder',
      label: '文件夹',
      description: '浏览文件夹目录',
      icon: FolderOpen,
      run: openFolder
    },
    {
      id: 'browser',
      label: '浏览器',
      description: '浏览及调试网页',
      icon: Globe2,
      run: () => openUrl()
    },
    {
      id: 'terminal',
      label: '终端',
      description: '运行命令及脚本',
      icon: SquareTerminal,
      run: openTerminal
    }
  ]

  useEffect(() => {
    return api?.nativeOverlay?.onEvent((event: NativeOverlayEvent) => {
      if (event.kind !== 'workbench-menu') return
      setAddMenuOpen(false)
      if (event.type !== 'action') return
      const action = workbenchActions.find((item) => item.id === event.action)
      if (action) void action.run()
    })
  }, [api])

  return (
    <WorkbenchContext.Provider value={contextValue}>
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
        <div
          className="global-workbench-page"
          onClickCapture={openLinkedWebContent}
        >
          {children}
          <div className="global-workbench-tools" aria-label="工作区工具">
            <button
              type="button"
              aria-label={panelOpen ? '收起工作区' : '打开工作区'}
              title={panelOpen ? '收起工作区' : '打开工作区'}
              onClick={() => {
                if (panelOpen) contextValue.closePanel()
                else setPanelOpen(true)
              }}
            >
              {panelOpen ? (
                <PanelRightClose size={18} strokeWidth={1.8} />
              ) : (
                <PanelRightOpen size={18} strokeWidth={1.8} />
              )}
            </button>
          </div>
        </div>

        <>
          <div
              className="global-workbench-resizer"
              hidden={!panelOpen}
              role="separator"
              aria-label="调整全局工作区宽度"
              tabIndex={0}
              onMouseDown={(event) => {
                resizeStartRef.current = {
                  clientX: event.clientX,
                  width: panelWidth
                }
                document.body.classList.add('resizing-global-workbench')
              }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                setPanelWidth((width) =>
                  clampPanelWidth(
                    width + (event.key === 'ArrowLeft' ? 8 : -8)
                  )
                )
              }}
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
                      <div className={tab.id === activeTabId ? 'active' : ''} key={tab.id}>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={tab.id === activeTabId}
                          onClick={() => setActiveTabId(tab.id)}
                        >
                          {tab.type === 'web' && tab.page.loading ? (
                            <LoaderCircle className="spinning" size={13} />
                          ) : null}
                          <span>{tab.label}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`关闭 ${tab.label}`}
                          onClick={() => void closeTab(tab.id)}
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
                      onClick={() => {
                        if (addMenuOpen) {
                          hideAddMenu()
                          return
                        }
                        showAddMenu()
                      }}
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
                    onClick={() => setPanelMaximized((value) => !value)}
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
                    {workbenchActions.map((action) => {
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
                <div className="global-web-workbench">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      const data = new FormData(event.currentTarget)
                      void api?.webWorkbench.navigate(
                        activeTab.id,
                        String(data.get('url') ?? '')
                      )
                    }}
                  >
                    <button
                      type="button"
                      aria-label="后退"
                      disabled={!activeTab.page.canGoBack}
                      onClick={() => void api?.webWorkbench.goBack(activeTab.id)}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="前进"
                      disabled={!activeTab.page.canGoForward}
                      onClick={() => void api?.webWorkbench.goForward(activeTab.id)}
                    >
                      <ArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="重新加载"
                      onClick={() => void api?.webWorkbench.reload(activeTab.id)}
                    >
                      <RefreshCw size={15} />
                    </button>
                    <input
                      key={activeTab.page.url}
                      name="url"
                      aria-label="网页地址"
                      defaultValue={activeTab.page.url}
                    />
                    <button
                      type="button"
                      aria-label="在系统浏览器打开"
                      onClick={() =>
                        void api?.webWorkbench.openExternal(activeTab.page.url)
                      }
                    >
                      <ExternalLink size={15} />
                    </button>
                  </form>
                  {activeTab.page.error ? (
                    <div className="global-web-error">
                      <strong>网页无法在应用内打开</strong>
                      <span>{activeTab.page.error}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {tabs
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
                        api={api!.terminal}
                        sessionId={tab.id}
                        title={tab.label}
                        output={tab.output}
                        active={panelOpen && tab.id === activeTabId}
                      />
                    </Suspense>
                  </div>
                ))}
          </aside>
        </>
      </div>
      {urlDialogOpen ? (
        <div
          className="global-url-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setUrlDialogOpen(false)
          }}
        >
          <form
            className="global-url-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-url-dialog-title"
            onSubmit={(event) => {
              event.preventDefault()
              void openUrl(urlDraft)
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
              onChange={(event) => setUrlDraft(event.target.value)}
              placeholder="https://example.com"
            />
            {urlError ? <p role="alert">{urlError}</p> : null}
            <footer>
              <button type="button" onClick={() => setUrlDialogOpen(false)}>
                取消
              </button>
              <button type="submit" disabled={!urlDraft.trim()}>
                打开
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </WorkbenchContext.Provider>
  )
}
