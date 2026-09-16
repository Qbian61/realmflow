import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState
} from 'react'
import {
  HashRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate
} from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  DatabaseBackup,
  Ellipsis,
  FilePlus2,
  FileText,
  FolderClosed,
  FolderDot,
  FolderHeart,
  FolderOpen,
  FolderOpenDot,
  FolderPlus,
  Globe2,
  GripVertical,
  HardDrive,
  LogOut,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  RefreshCw,
  Settings,
  TriangleAlert,
  Trash2
} from 'lucide-react'
import type { SidecarStatus } from '../shared/types'
import {
  primaryNavigation,
  spaces as initialSpaces,
  utilityPages
} from './navigation'
import { NewChatPage } from './pages/NewChatPage'
import ChatSessionPage from './pages/ChatSessionPage'
import RequirementDetailPage, {
  type WorkspaceRequirement,
  type WorkspaceSpace
} from './pages/RequirementDetailPage'
import SchedulePage from './pages/SchedulePage'
import SpaceDetailPage from './pages/SpaceDetailPage'
import { RecentSessions } from './features/sessions/RecentSessions'
import {
  ensureDefaultChatSessions,
  readChatSessions,
  saveChatSessions,
  titleFromPrompt,
  type ChatSession
} from './features/sessions/session-store'
import { WorkbenchProvider } from './features/workbench/WorkbenchProvider'

const DEFAULT_SIDEBAR_WIDTH = 248
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 420
const MIN_CONTENT_WIDTH = 320
const CONTENT_PANEL_INSET = 8
const SPACE_ITEM_MENU_HEIGHT = 125
const VIEWPORT_MENU_MARGIN = 8
const CONTENT_PANEL_HORIZONTAL_INSET = CONTENT_PANEL_INSET * 2
const SIDEBAR_WIDTH_KEY = 'realmflow:sidebar-width'
const WORKSPACE_NAVIGATION_KEY = 'realmflow:workspace-navigation:v1'

type WorkspaceNavigationState = {
  version: 1
  spaces: WorkspaceSpace[]
  requirementsBySpace: Record<string, WorkspaceRequirement[]>
}

type SidebarDragState =
  | { kind: 'space'; spacePath: string }
  | { kind: 'requirement'; spacePath: string; requirementId: string }

const defaultWorkspaceNavigation = (): WorkspaceNavigationState => ({
  version: 1,
  spaces: initialSpaces.map(({ path, label, description }) => ({
    path,
    label,
    description
  })),
  requirementsBySpace: {
    '/spaces/xxx': [
      {
        id: 'test-requirement',
        title: '测试需求'
      }
    ]
  }
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWorkspaceSpace(value: unknown): value is WorkspaceSpace {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    value.path.startsWith('/spaces/') &&
    typeof value.label === 'string' &&
    typeof value.description === 'string'
  )
}

function isWorkspaceRequirement(value: unknown): value is WorkspaceRequirement {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (value.stage === undefined ||
      [
        'analysis',
        'design',
        'implementation',
        'testing',
        'release',
        'retrospective'
      ].includes(String(value.stage))) &&
    (value.status === undefined ||
      ['pending', 'active', 'completed'].includes(String(value.status))) &&
    (value.updatedAt === undefined || typeof value.updatedAt === 'number')
  )
}

function readWorkspaceNavigation(): WorkspaceNavigationState {
  try {
    const rawValue = window.localStorage.getItem(WORKSPACE_NAVIGATION_KEY)
    if (!rawValue) return defaultWorkspaceNavigation()

    const value: unknown = JSON.parse(rawValue)
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !Array.isArray(value.spaces) ||
      !value.spaces.every(isWorkspaceSpace) ||
      !isRecord(value.requirementsBySpace)
    ) {
      return defaultWorkspaceNavigation()
    }

    const requirementsBySpace = Object.fromEntries(
      Object.entries(value.requirementsBySpace).filter(
        (entry): entry is [string, WorkspaceRequirement[]] =>
          Array.isArray(entry[1]) && entry[1].every(isWorkspaceRequirement)
      )
    )
    if (
      Object.keys(requirementsBySpace).length !==
      Object.keys(value.requirementsBySpace).length
    ) {
      return defaultWorkspaceNavigation()
    }

    return {
      version: 1,
      spaces: value.spaces,
      requirementsBySpace
    }
  } catch {
    return defaultWorkspaceNavigation()
  }
}

function moveItem<T>(items: T[], sourceIndex: number, targetIndex: number): T[] {
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex === targetIndex ||
    sourceIndex >= items.length ||
    targetIndex >= items.length
  ) {
    return items
  }

  const next = [...items]
  const [movedItem] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, movedItem)
  return next
}

function highestSequence(values: string[], pattern: RegExp): number {
  return values.reduce((highest, value) => {
    const sequence = Number(value.match(pattern)?.[1] ?? 0)
    return Math.max(highest, sequence)
  }, 0)
}

type NameDialogState =
  | { kind: 'space' }
  | { kind: 'requirement'; spacePath: string; spaceLabel: string }
  | { kind: 'rename-space'; spacePath: string; spaceLabel: string }
  | { kind: 'delete-space'; spacePath: string; spaceLabel: string }
  | {
      kind: 'delete-requirement'
      spacePath: string
      requirementId: string
      requirementTitle: string
    }

function readSidebarWidth(): number {
  const storedValue = window.localStorage.getItem(SIDEBAR_WIDTH_KEY)
  if (storedValue === null) return DEFAULT_SIDEBAR_WIDTH
  const storedWidth = Number(storedValue)
  if (!Number.isFinite(storedWidth)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, storedWidth))
}

function EmptyPage({
  title,
  description
}: {
  title: string
  description: string
}): JSX.Element {
  return (
    <main className="page">
      <div className="page-kicker">REALMFLOW / {title.toUpperCase()}</div>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="page-mark" aria-hidden="true">
          <ArrowUpRight size={22} strokeWidth={1.7} />
        </div>
      </div>
      <div className="page-rule" />
      <section className="empty-state">
        <span>模块已就绪</span>
        <strong>{title}</strong>
      </section>
    </main>
  )
}

function AppShell(): JSX.Element {
  const navigate = useNavigate()
  const [initialNavigation] = useState(readWorkspaceNavigation)
  const [chatSessions, setChatSessions] =
    useState<ChatSession[]>(readChatSessions)
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>('starting')
  const [spacesOpen, setSpacesOpen] = useState(true)
  const [recentOpen, setRecentOpen] = useState(true)
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false)
  const [spaceItemMenuPath, setSpaceItemMenuPath] = useState<string | null>(null)
  const [spaceItemMenuPosition, setSpaceItemMenuPosition] = useState<{
    top: number
    right: number
  } | null>(null)
  const [requirementMenuKey, setRequirementMenuKey] = useState<string | null>(
    null
  )
  const [workspaceSpaces, setWorkspaceSpaces] = useState<WorkspaceSpace[]>(
    initialNavigation.spaces
  )
  const [requirementsBySpace, setRequirementsBySpace] = useState<
    Record<string, WorkspaceRequirement[]>
  >(initialNavigation.requirementsBySpace)
  const [sidebarDropTarget, setSidebarDropTarget] = useState<string | null>(null)
  const [collapsedSpacePaths, setCollapsedSpacePaths] = useState<Set<string>>(
    () => new Set()
  )
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth)
  const [resizing, setResizing] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const spaceActionsRef = useRef<HTMLDivElement>(null)
  const spaceListRef = useRef<HTMLDivElement>(null)
  const sidebarDragRef = useRef<SidebarDragState | null>(null)
  const spaceSequenceRef = useRef(
    highestSequence(
      initialNavigation.spaces.map((space) => space.path),
      /\/local-(\d+)$/
    )
  )
  const requirementSequenceRef = useRef(
    highestSequence(
      Object.values(initialNavigation.requirementsBySpace)
        .flat()
        .map((requirement) => requirement.id),
      /^requirement-(\d+)$/
    )
  )
  const userAreaRef = useRef<HTMLDivElement>(null)
  const sessionSequenceRef = useRef(Date.now())

  useEffect(() => {
    const refreshStatus = (): void => {
      void window.realmflow?.getSidecarStatus().then(setSidecarStatus)
    }

    refreshStatus()
    const interval = window.setInterval(refreshStatus, 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        WORKSPACE_NAVIGATION_KEY,
        JSON.stringify({
          version: 1,
          spaces: workspaceSpaces,
          requirementsBySpace
        } satisfies WorkspaceNavigationState)
      )
    } catch {
      // The sidebar remains usable when local storage is unavailable.
    }
  }, [requirementsBySpace, workspaceSpaces])

  useEffect(() => {
    setChatSessions((current) => ensureDefaultChatSessions(current))
  }, [])

  useEffect(() => {
    saveChatSessions(chatSessions)
  }, [chatSessions])

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!spaceActionsRef.current?.contains(event.target as Node)) {
        setSpaceMenuOpen(false)
      }
      if (!spaceListRef.current?.contains(event.target as Node)) {
        setSpaceItemMenuPath(null)
        setRequirementMenuKey(null)
      }
      if (!userAreaRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setSpaceMenuOpen(false)
        setSpaceItemMenuPath(null)
        setRequirementMenuKey(null)
        setUserMenuOpen(false)
        setNameDialog(null)
        setNameDraft('')
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const allPages = [...primaryNavigation, ...workspaceSpaces, ...utilityPages]
  const shellStyle = {
    '--sidebar-width': sidebarVisible ? `${sidebarWidth}px` : '0px'
  } as CSSProperties

  const updateSidebarWidth = (width: number): void => {
    const shellWidth = shellRef.current?.getBoundingClientRect().width ?? 0
    const content = shellRef.current?.querySelector<HTMLElement>('.app-content')
    const contentStyles = content ? window.getComputedStyle(content) : undefined
    const measuredContentInset = contentStyles
      ? Number.parseFloat(contentStyles.marginLeft) +
        Number.parseFloat(contentStyles.marginRight)
      : Number.NaN
    const contentHorizontalInset = Number.isFinite(measuredContentInset)
      ? measuredContentInset
      : CONTENT_PANEL_HORIZONTAL_INSET
    const availableMaxWidth =
      shellWidth > 0
        ? shellWidth - MIN_CONTENT_WIDTH - contentHorizontalInset
        : MAX_SIDEBAR_WIDTH
    const effectiveMaxWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, availableMaxWidth)
    )
    const nextWidth = Math.min(
      effectiveMaxWidth,
      Math.max(MIN_SIDEBAR_WIDTH, width)
    )
    setSidebarWidth(nextWidth)
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth))
  }

  const finishResize = (): void => {
    setResizing(false)
  }

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 8 : -8
    updateSidebarWidth(sidebarWidth + delta)
  }

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (resizing) updateSidebarWidth(event.clientX - CONTENT_PANEL_INSET)
  }

  const openNameDialog = (dialog: NameDialogState): void => {
    setSpaceMenuOpen(false)
    setSpaceItemMenuPath(null)
    setRequirementMenuKey(null)
    setNameDraft('')
    setNameDialog(dialog)
  }

  const closeNameDialog = (): void => {
    setNameDialog(null)
    setNameDraft('')
  }

  const clearSidebarDrag = (): void => {
    sidebarDragRef.current = null
    setSidebarDropTarget(null)
  }

  const handleSpaceDrop = (
    event: ReactDragEvent<HTMLElement>,
    targetPath: string
  ): void => {
    const activeDrag = sidebarDragRef.current
    if (activeDrag?.kind !== 'space') return
    event.preventDefault()
    setWorkspaceSpaces((current) =>
      moveItem(
        current,
        current.findIndex((space) => space.path === activeDrag.spacePath),
        current.findIndex((space) => space.path === targetPath)
      )
    )
    clearSidebarDrag()
  }

  const handleRequirementDrop = (
    event: ReactDragEvent<HTMLElement>,
    targetSpacePath: string,
    targetRequirementId: string
  ): void => {
    const activeDrag = sidebarDragRef.current
    if (
      activeDrag?.kind !== 'requirement' ||
      activeDrag.spacePath !== targetSpacePath
    ) {
      return
    }

    event.preventDefault()
    setRequirementsBySpace((current) => {
      const requirements = current[targetSpacePath] ?? []
      return {
        ...current,
        [targetSpacePath]: moveItem(
          requirements,
          requirements.findIndex(
            (requirement) => requirement.id === activeDrag.requirementId
          ),
          requirements.findIndex(
            (requirement) => requirement.id === targetRequirementId
          )
        )
      }
    })
    clearSidebarDrag()
  }

  const createSpaceSession = (spacePath: string, prompt: string): void => {
    sessionSequenceRef.current += 1
    const now = Date.now()
    const sessionId = `conversation-${sessionSequenceRef.current}`
    setChatSessions((current) => [
      {
        id: sessionId,
        title: titleFromPrompt(prompt),
        spacePath,
        messages: [
          {
            id: `${sessionId}-message-1`,
            content: prompt,
            createdAt: now,
            role: 'user'
          }
        ],
        createdAt: now,
        updatedAt: now
      },
      ...current
    ])
    navigate(`/sessions/${sessionId}`)
  }

  const appendSessionMessage = (
    sessionId: string,
    content: string
  ): void => {
    const now = Date.now()
    setChatSessions((current) => {
      const session = current.find((item) => item.id === sessionId)
      if (!session) return current
      const updatedSession: ChatSession = {
        ...session,
        messages: [
          ...session.messages,
          {
            id: `${sessionId}-message-${session.messages.length + 1}`,
            content,
            createdAt: now,
            role: 'user'
          }
        ],
        updatedAt: now
      }
      return [
        updatedSession,
        ...current.filter((item) => item.id !== sessionId)
      ]
    })
  }

  const submitNameDialog = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!nameDialog) return

    if (nameDialog.kind === 'delete-space') {
      if (nameDraft !== nameDialog.spaceLabel) return

      setWorkspaceSpaces((current) =>
        current.filter((space) => space.path !== nameDialog.spacePath)
      )
      setRequirementsBySpace((current) => {
        const next = { ...current }
        delete next[nameDialog.spacePath]
        return next
      })
      setChatSessions((current) =>
        current.filter(
          (session) => session.spacePath !== nameDialog.spacePath
        )
      )
      setCollapsedSpacePaths((current) => {
        const next = new Set(current)
        next.delete(nameDialog.spacePath)
        return next
      })
      closeNameDialog()
      return
    }

    if (nameDialog.kind === 'delete-requirement') {
      if (nameDraft !== nameDialog.requirementTitle) return

      setRequirementsBySpace((current) => ({
        ...current,
        [nameDialog.spacePath]: (
          current[nameDialog.spacePath] ?? []
        ).filter(
          (requirement) => requirement.id !== nameDialog.requirementId
        )
      }))
      closeNameDialog()
      return
    }

    const name = nameDraft.trim()
    if (!name) return

    if (nameDialog.kind === 'rename-space') {
      if (name === nameDialog.spaceLabel) return

      setWorkspaceSpaces((current) =>
        current.map((space) =>
          space.path === nameDialog.spacePath
            ? { ...space, label: name }
            : space
        )
      )
      closeNameDialog()
      return
    }

    if (nameDialog.kind === 'space') {
      spaceSequenceRef.current += 1
      setWorkspaceSpaces((current) => [
        {
          path: `/spaces/local-${spaceSequenceRef.current}`,
          label: name,
          description: '管理空间中的需求与工作内容'
        },
        ...current
      ])
    } else {
      requirementSequenceRef.current += 1
      setRequirementsBySpace((current) => ({
        ...current,
        [nameDialog.spacePath]: [
          {
            id: `requirement-${requirementSequenceRef.current}`,
            title: name
          },
          ...(current[nameDialog.spacePath] ?? [])
        ]
      }))
      setCollapsedSpacePaths((current) => {
        if (!current.has(nameDialog.spacePath)) return current
        const next = new Set(current)
        next.delete(nameDialog.spacePath)
        return next
      })
    }

    closeNameDialog()
  }

  return (
    <div
      ref={shellRef}
      className={resizing ? 'app-shell resizing' : 'app-shell'}
      style={shellStyle}
      data-testid="app-shell"
    >
      {sidebarVisible && (
        <aside className="sidebar">
          <div className="drag-region" />
        <div className="brand">
          <strong>RealmFlow</strong>
        </div>

        <nav aria-label="主导航">
          {primaryNavigation.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div
          className={[
            'sidebar-collections',
            spacesOpen ? 'spaces-open' : 'spaces-closed',
            recentOpen ? 'recent-open' : 'recent-closed'
          ].join(' ')}
        >
        <section className="spaces-section" aria-label="空间">
          <div className="spaces-heading">
            <button
              className="spaces-toggle"
              type="button"
              aria-expanded={spacesOpen}
              onClick={() => {
                setSpacesOpen((open) => !open)
                setSpaceItemMenuPath(null)
                setRequirementMenuKey(null)
              }}
            >
              <span>空间 ({workspaceSpaces.length})</span>
              <ChevronDown
                className={spacesOpen ? 'spaces-chevron open' : 'spaces-chevron'}
                size={14}
              />
            </button>
            <div className="space-actions" ref={spaceActionsRef}>
              <button
                className="space-actions-trigger"
                type="button"
                aria-label="空间操作"
                aria-haspopup="menu"
                aria-expanded={spaceMenuOpen}
                title="空间操作"
                onClick={() => {
                  setSpaceMenuOpen((open) => !open)
                  setSpaceItemMenuPath(null)
                  setRequirementMenuKey(null)
                }}
              >
                <Ellipsis size={17} />
              </button>
              {spaceMenuOpen && (
                <div className="space-actions-menu" role="menu" aria-label="空间操作">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openNameDialog({ kind: 'space' })}
                  >
                    <FolderPlus size={16} />
                    <span>新建空间</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          {spacesOpen && (
            <div className="space-list" ref={spaceListRef}>
              {workspaceSpaces.map((space) => {
                const requirementCount =
                  requirementsBySpace[space.path]?.length ?? 0
                const requirementsOpen = !collapsedSpacePaths.has(space.path)
                const SpaceStateIcon =
                  requirementCount > 0
                    ? requirementsOpen
                      ? FolderOpenDot
                      : FolderDot
                    : requirementsOpen
                      ? FolderOpen
                      : FolderClosed

                return (
                  <div
                    className={
                      sidebarDropTarget === `space:${space.path}`
                        ? 'space-entry drag-over'
                        : 'space-entry'
                    }
                    draggable
                    key={space.path}
                    onDragStart={() => {
                      sidebarDragRef.current = {
                        kind: 'space',
                        spacePath: space.path
                      }
                    }}
                    onDragEnd={clearSidebarDrag}
                    onDragOver={(event) => {
                      const activeDrag = sidebarDragRef.current
                      if (
                        activeDrag?.kind !== 'space' ||
                        activeDrag.spacePath === space.path
                      ) {
                        return
                      }
                      event.preventDefault()
                      setSidebarDropTarget(`space:${space.path}`)
                    }}
                    onDrop={(event) => handleSpaceDrop(event, space.path)}
                  >
                    <div className="space-row">
                      <NavLink
                        to={space.path}
                        end
                        className={({ isActive }) =>
                          isActive ? 'space-item active' : 'space-item'
                        }
                      >
                        <span className="space-icon" aria-hidden="true">
                          <SpaceStateIcon size={18} strokeWidth={1.8} />
                        </span>
                        <span title={space.label}>{space.label}</span>
                      </NavLink>
                      <button
                        className="space-drag-handle"
                        type="button"
                        aria-label={`拖动 ${space.label}`}
                        title={`拖动 ${space.label}`}
                      >
                        <GripVertical size={15} />
                      </button>
                      <button
                        className="space-requirements-toggle"
                        type="button"
                        aria-label={`${
                          requirementsOpen ? '折叠' : '展开'
                        } ${space.label}需求`}
                        aria-expanded={requirementsOpen}
                        onClick={() => {
                          setCollapsedSpacePaths((current) => {
                            const next = new Set(current)
                            if (next.has(space.path)) next.delete(space.path)
                            else next.add(space.path)
                            return next
                          })
                        }}
                      >
                        <ChevronDown
                          className={
                            requirementsOpen
                              ? 'space-requirements-chevron open'
                              : 'space-requirements-chevron'
                          }
                          size={14}
                        />
                      </button>
                      <div className="space-item-actions">
                        <button
                          className="space-item-actions-trigger"
                          type="button"
                          aria-label={`${space.label}操作`}
                          aria-haspopup="menu"
                          aria-expanded={spaceItemMenuPath === space.path}
                          title={`${space.label}操作`}
                          onClick={(event) => {
                            const bounds = event.currentTarget.getBoundingClientRect()
                            const preferredTop = bounds.bottom + 5
                            const top =
                              preferredTop + SPACE_ITEM_MENU_HEIGHT <=
                              window.innerHeight - VIEWPORT_MENU_MARGIN
                                ? preferredTop
                                : Math.max(
                                    VIEWPORT_MENU_MARGIN,
                                    bounds.top - SPACE_ITEM_MENU_HEIGHT - 5
                                  )
                            setSpaceMenuOpen(false)
                            setRequirementMenuKey(null)
                            setSpaceItemMenuPosition({
                              top,
                              right: Math.max(
                                VIEWPORT_MENU_MARGIN,
                                window.innerWidth - bounds.right
                              )
                            })
                            setSpaceItemMenuPath((currentPath) =>
                              currentPath === space.path ? null : space.path
                            )
                          }}
                        >
                          <Ellipsis size={17} />
                        </button>
                        {spaceItemMenuPath === space.path && (
                          <div
                            className="space-item-actions-menu"
                            role="menu"
                            aria-label={`${space.label}操作`}
                            style={
                              spaceItemMenuPosition
                                ? {
                                    top: spaceItemMenuPosition.top,
                                    right: spaceItemMenuPosition.right
                                  }
                                : undefined
                            }
                          >
                            <div className="space-item-actions-group">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  openNameDialog({
                                    kind: 'requirement',
                                    spacePath: space.path,
                                    spaceLabel: space.label
                                  })
                                }
                              >
                                <FilePlus2 size={16} />
                                <span>新建需求</span>
                              </button>
                            </div>
                            <div className="space-item-actions-group">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  openNameDialog({
                                    kind: 'rename-space',
                                    spacePath: space.path,
                                    spaceLabel: space.label
                                  })
                                }
                              >
                                <PencilLine size={16} />
                                <span>更新名称</span>
                              </button>
                              <button
                                className="danger"
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  openNameDialog({
                                    kind: 'delete-space',
                                    spacePath: space.path,
                                    spaceLabel: space.label
                                  })
                                }
                              >
                                <Trash2 size={16} />
                                <span>删除空间</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {requirementCount > 0 && requirementsOpen && (
                      <ul
                        className="space-requirements"
                        aria-label={`${space.label}需求`}
                      >
                        {requirementsBySpace[space.path].map((requirement) => {
                          const menuKey = `${space.path}:${requirement.id}`

                          return (
                            <li
                              className={
                                sidebarDropTarget ===
                                `requirement:${space.path}:${requirement.id}`
                                  ? 'drag-over'
                                  : undefined
                              }
                              draggable
                              key={requirement.id}
                              onDragStart={(event) => {
                                event.stopPropagation()
                                sidebarDragRef.current = {
                                  kind: 'requirement',
                                  spacePath: space.path,
                                  requirementId: requirement.id
                                }
                              }}
                              onDragEnd={clearSidebarDrag}
                              onDragOver={(event) => {
                                const activeDrag = sidebarDragRef.current
                                if (
                                  activeDrag?.kind !== 'requirement' ||
                                  activeDrag.spacePath !== space.path ||
                                  activeDrag.requirementId === requirement.id
                                ) {
                                  return
                                }
                                event.preventDefault()
                                setSidebarDropTarget(
                                  `requirement:${space.path}:${requirement.id}`
                                )
                              }}
                              onDrop={(event) =>
                                handleRequirementDrop(
                                  event,
                                  space.path,
                                  requirement.id
                                )
                              }
                            >
                              <button
                                className="requirement-drag-handle"
                                type="button"
                                aria-label={`拖动 ${requirement.title}`}
                                title={`拖动 ${requirement.title}`}
                              >
                                <GripVertical size={14} />
                              </button>
                              <NavLink
                                to={`${space.path}/requirements/${requirement.id}`}
                                title={requirement.title}
                              >
                                <FileText size={15} strokeWidth={1.8} />
                                <span>{requirement.title}</span>
                              </NavLink>
                              <div className="requirement-actions">
                                <button
                                  className="requirement-actions-trigger"
                                  type="button"
                                  aria-label={`${requirement.title}操作`}
                                  aria-haspopup="menu"
                                  aria-expanded={requirementMenuKey === menuKey}
                                  title={`${requirement.title}操作`}
                                  onClick={() => {
                                    setSpaceItemMenuPath(null)
                                    setRequirementMenuKey((currentKey) =>
                                      currentKey === menuKey ? null : menuKey
                                    )
                                  }}
                                >
                                  <Ellipsis size={16} />
                                </button>
                                {requirementMenuKey === menuKey && (
                                  <div
                                    className="requirement-actions-menu"
                                    role="menu"
                                    aria-label={`${requirement.title}操作`}
                                  >
                                    <button
                                      className="danger"
                                      type="button"
                                      role="menuitem"
                                      onClick={() =>
                                        openNameDialog({
                                          kind: 'delete-requirement',
                                          spacePath: space.path,
                                          requirementId: requirement.id,
                                          requirementTitle: requirement.title
                                        })
                                      }
                                    >
                                      <Trash2 size={16} />
                                      删除需求
                                    </button>
                                  </div>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
        <RecentSessions
          sessions={chatSessions}
          spaces={workspaceSpaces}
          open={recentOpen}
          onToggle={() => setRecentOpen((open) => !open)}
        />
        </div>

        <div className="user-area" ref={userAreaRef}>
          {userMenuOpen && (
            <div className="user-menu" role="menu" aria-label="用户菜单">
              <div className="user-menu-group">
                <NavLink to="/settings" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                  <Settings size={17} />
                  <span>设置</span>
                </NavLink>
                <NavLink
                  to="/settings/appearance"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Palette size={17} />
                  <span>外观设置</span>
                  <ChevronRight className="menu-chevron" size={15} />
                </NavLink>
                <NavLink to="/favorites" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                  <FolderHeart size={17} />
                  <span>收藏夹</span>
                </NavLink>
              </div>
              <div className="user-menu-group">
                <a href="https://realmflow.dev" target="_blank" rel="noreferrer" role="menuitem">
                  <Globe2 size={17} />
                  <span>RealmFlow 官网</span>
                </a>
                <NavLink to="/updates" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                  <RefreshCw size={17} />
                  <span>检查更新</span>
                </NavLink>
                <NavLink to="/feedback" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                  <CircleHelp size={17} />
                  <span>帮助与反馈</span>
                </NavLink>
              </div>
              <div className="user-menu-group">
                <NavLink
                  to="/settings/storage"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <HardDrive size={17} />
                  <span>存储状态</span>
                </NavLink>
                <NavLink
                  to="/settings/backup"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <DatabaseBackup size={17} />
                  <span>数据备份</span>
                </NavLink>
              </div>
              <div className="user-menu-group">
                <NavLink to="/" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                  <ArrowLeftRight size={17} />
                  <span>切换工作空间</span>
                  <ChevronRight className="menu-chevron" size={15} />
                </NavLink>
                <button
                  className="danger-item"
                  type="button"
                  role="menuitem"
                  onClick={() => void window.realmflow?.quitApp()}
                >
                  <LogOut size={17} />
                  <span>退出</span>
                </button>
              </div>
            </div>
          )}
          <button
            className="user-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((open) => !open)}
          >
            <span className="avatar">Q</span>
            <span className="user-copy">
              <strong>Qbian61</strong>
              <small>
                <i data-status={sidecarStatus} />
                本地版 · 免费
              </small>
            </span>
            <ChevronRight className="user-chevron" size={16} />
          </button>
        </div>
        </aside>
      )}

      {sidebarVisible && (
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="调整菜单栏宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            setResizing(true)
          }}
          onPointerMove={handleResizeMove}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId)
            finishResize()
          }}
          onPointerCancel={finishResize}
        />
      )}

      <button
        className={`sidebar-edge-toggle ${
          sidebarVisible ? 'sidebar-open' : 'sidebar-closed'
        }`}
        type="button"
        aria-label={sidebarVisible ? '隐藏菜单栏' : '展示菜单栏'}
        title={sidebarVisible ? '隐藏菜单栏' : '展示菜单栏'}
        onClick={() => {
          setUserMenuOpen(false)
          setSidebarVisible((visible) => !visible)
        }}
      >
        {sidebarVisible ? (
          <PanelLeftClose size={18} strokeWidth={1.8} />
        ) : (
          <PanelLeftOpen size={18} strokeWidth={1.8} />
        )}
      </button>

      <div className="app-content" data-testid="app-content">
        <Routes>
          <Route
            path="/chat/new"
            element={
              <NewChatPage
                spaces={workspaceSpaces}
                onCreateSession={createSpaceSession}
              />
            }
          />
          <Route path="/schedules" element={<SchedulePage />} />
          <Route
            path="/spaces/:spaceId"
            element={
              <SpaceDetailPage
                spaces={workspaceSpaces}
                requirementsBySpace={requirementsBySpace}
                onCreateSession={createSpaceSession}
              />
            }
          />
          <Route
            path="/sessions/:sessionId"
            element={
              <ChatSessionPage
                sessions={chatSessions}
                spaces={workspaceSpaces}
                onAppendMessage={appendSessionMessage}
              />
            }
          />
          <Route
            path="/spaces/:spaceId/requirements/:requirementId"
            element={
              <RequirementDetailPage
                spaces={workspaceSpaces}
                requirementsBySpace={requirementsBySpace}
              />
            }
          />
          {allPages
            .filter(
              ({ path }) =>
                path !== '/chat/new' &&
                path !== '/schedules' &&
                !path.startsWith('/spaces/')
            )
            .map(({ path, label, description }) => (
              <Route
                key={path}
                path={path}
                element={<EmptyPage title={label} description={description} />}
              />
            ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {nameDialog && (
        <div
          className="name-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeNameDialog()
          }}
        >
          <form
            className="name-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="name-dialog-title"
            onSubmit={submitNameDialog}
          >
            <h2 id="name-dialog-title">
              {nameDialog.kind === 'space'
                ? '新建空间'
                : nameDialog.kind === 'requirement'
                  ? '新建需求'
                  : nameDialog.kind === 'rename-space'
                    ? '更新空间名称'
                    : nameDialog.kind === 'delete-space'
                      ? '删除空间'
                      : '删除需求'}
            </h2>
            {nameDialog.kind === 'rename-space' && (
              <p className="name-dialog-current">
                {`当前名称：${nameDialog.spaceLabel}`}
              </p>
            )}
            {nameDialog.kind === 'delete-space' && (
              <div className="name-dialog-warning">
                <TriangleAlert size={18} />
                <p>{`删除后，空间“${nameDialog.spaceLabel}”及空间下的所有需求都会被永久删除，且无法恢复。`}</p>
              </div>
            )}
            {nameDialog.kind === 'delete-requirement' && (
              <div className="name-dialog-warning">
                <TriangleAlert size={18} />
                <p>{`删除后，需求“${nameDialog.requirementTitle}”将被永久删除，且无法恢复。`}</p>
              </div>
            )}
            <label>
              <span>
                {nameDialog.kind === 'space'
                  ? '空间名称'
                  : nameDialog.kind === 'requirement'
                    ? '需求名称'
                    : nameDialog.kind === 'rename-space'
                      ? '更新后'
                      : nameDialog.kind === 'delete-space'
                        ? '输入空间名称以确认'
                        : '输入需求名称以确认'}
              </span>
              <input
                autoFocus
                value={nameDraft}
                aria-label={
                  nameDialog.kind === 'space'
                    ? '空间名称'
                    : nameDialog.kind === 'requirement'
                      ? '需求名称'
                      : nameDialog.kind === 'rename-space'
                        ? '更新后'
                        : nameDialog.kind === 'delete-space'
                          ? '输入空间名称以确认'
                          : '输入需求名称以确认'
                }
                maxLength={64}
                placeholder={
                  nameDialog.kind === 'space'
                    ? '输入空间名称'
                    : nameDialog.kind === 'requirement'
                      ? `输入${nameDialog.spaceLabel}下的需求名称`
                      : nameDialog.kind === 'rename-space'
                        ? '输入新的空间名称'
                        : nameDialog.kind === 'delete-space'
                          ? `请输入“${nameDialog.spaceLabel}”`
                          : `请输入“${nameDialog.requirementTitle}”`
                }
                onChange={(event) => setNameDraft(event.target.value)}
              />
            </label>
            <div className="name-dialog-actions">
              <button type="button" onClick={closeNameDialog}>
                取消
              </button>
              <button
                className={
                  nameDialog.kind === 'delete-space' ||
                  nameDialog.kind === 'delete-requirement'
                    ? 'primary danger'
                    : 'primary'
                }
                type="submit"
                aria-label={
                  nameDialog.kind === 'space'
                    ? '确认新建空间'
                    : nameDialog.kind === 'requirement'
                      ? '确认新建需求'
                      : nameDialog.kind === 'rename-space'
                        ? '确认更新空间名称'
                        : nameDialog.kind === 'delete-space'
                          ? '确认删除空间'
                          : '确认删除需求'
                }
                disabled={
                  nameDialog.kind === 'delete-space'
                    ? nameDraft !== nameDialog.spaceLabel
                    : nameDialog.kind === 'delete-requirement'
                      ? nameDraft !== nameDialog.requirementTitle
                    : nameDialog.kind === 'rename-space'
                      ? !nameDraft.trim() ||
                        nameDraft.trim() === nameDialog.spaceLabel
                      : !nameDraft.trim()
                }
              >
                {nameDialog.kind === 'delete-space' ||
                nameDialog.kind === 'delete-requirement'
                  ? '删除'
                  : nameDialog.kind === 'rename-space'
                    ? '更新'
                    : '创建'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <WorkbenchProvider>
        <AppShell />
      </WorkbenchProvider>
    </HashRouter>
  )
}
