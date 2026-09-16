import {
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type MutableRefObject,
  useEffect,
  useRef,
  useState
} from 'react'
import { NavLink } from 'react-router-dom'
import {
  ChevronDown,
  Ellipsis,
  FilePlus2,
  FileText,
  FolderClosed,
  FolderDot,
  FolderOpen,
  FolderOpenDot,
  FolderPlus,
  GripVertical,
  PencilLine,
  Trash2
} from 'lucide-react'
import type { ChatSession } from '../../domain/chat-session'
import type {
  WorkspaceNavigation,
  WorkspaceSpace
} from '../../domain/workspace'
import { primaryNavigation } from '../../navigation'
import { RecentSessions } from '../sessions/RecentSessions'
import {
  WorkspaceNameDialog,
  type WorkspaceNameDialogState
} from './WorkspaceNameDialog'
import { WorkspaceUserMenu } from './WorkspaceUserMenu'

const SPACE_ITEM_MENU_HEIGHT = 125
const VIEWPORT_MENU_MARGIN = 8

type SidebarDragState =
  | { kind: 'space'; spacePath: string }
  | { kind: 'requirement'; spacePath: string; requirementId: string }

export type WorkspaceSidebarProps = WorkspaceNavigation & {
  visible: boolean
  sessions: ChatSession[]
  onCreateSpace: (label: string) => void
  onRenameSpace: (spacePath: string, label: string) => void
  onDeleteSpace: (spacePath: string) => void
  onMoveSpace: (sourcePath: string, targetPath: string) => void
  onCreateRequirement: (spacePath: string, title: string) => void
  onDeleteRequirement: (spacePath: string, requirementId: string) => void
  onMoveRequirement: (
    spacePath: string,
    sourceId: string,
    targetId: string
  ) => void
}

export function WorkspaceSidebar({
  visible,
  spaces,
  requirementsBySpace,
  sessions,
  onCreateSpace,
  onRenameSpace,
  onDeleteSpace,
  onMoveSpace,
  onCreateRequirement,
  onDeleteRequirement,
  onMoveRequirement
}: WorkspaceSidebarProps): JSX.Element {
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
  const [sidebarDropTarget, setSidebarDropTarget] = useState<string | null>(null)
  const [collapsedSpacePaths, setCollapsedSpacePaths] = useState<Set<string>>(
    () => new Set()
  )
  const [nameDialog, setNameDialog] =
    useState<WorkspaceNameDialogState | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const spaceActionsRef = useRef<HTMLDivElement>(null)
  const spaceListRef = useRef<HTMLDivElement>(null)
  const sidebarDragRef = useRef<SidebarDragState | null>(null)

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!spaceActionsRef.current?.contains(event.target as Node)) {
        setSpaceMenuOpen(false)
      }
      if (!spaceListRef.current?.contains(event.target as Node)) {
        setSpaceItemMenuPath(null)
        setRequirementMenuKey(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setSpaceMenuOpen(false)
      setSpaceItemMenuPath(null)
      setRequirementMenuKey(null)
      closeNameDialog()
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const openNameDialog = (dialog: WorkspaceNameDialogState): void => {
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
    onMoveSpace(activeDrag.spacePath, targetPath)
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
    onMoveRequirement(
      targetSpacePath,
      activeDrag.requirementId,
      targetRequirementId
    )
    clearSidebarDrag()
  }

  const submitNameDialog = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!nameDialog) return

    if (nameDialog.kind === 'delete-space') {
      if (nameDraft !== nameDialog.spaceLabel) return
      onDeleteSpace(nameDialog.spacePath)
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
      onDeleteRequirement(nameDialog.spacePath, nameDialog.requirementId)
      closeNameDialog()
      return
    }

    const name = nameDraft.trim()
    if (!name) return

    if (nameDialog.kind === 'rename-space') {
      if (name === nameDialog.spaceLabel) return
      onRenameSpace(nameDialog.spacePath, name)
      closeNameDialog()
      return
    }

    if (nameDialog.kind === 'space') {
      onCreateSpace(name)
    } else {
      onCreateRequirement(nameDialog.spacePath, name)
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
    <>
      {visible && <aside className="sidebar">
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
              className={({ isActive }) =>
                isActive ? 'nav-item active' : 'nav-item'
              }
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
                <span>空间 ({spaces.length})</span>
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
                  <div
                    className="space-actions-menu"
                    role="menu"
                    aria-label="空间操作"
                  >
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
                {spaces.map((space) => (
                  <SpaceEntry
                    key={space.path}
                    space={space}
                    requirements={requirementsBySpace[space.path] ?? []}
                    requirementsOpen={!collapsedSpacePaths.has(space.path)}
                    dropTarget={sidebarDropTarget}
                    activeMenuPath={spaceItemMenuPath}
                    activeRequirementMenuKey={requirementMenuKey}
                    menuPosition={spaceItemMenuPosition}
                    dragRef={sidebarDragRef}
                    onDropTargetChange={setSidebarDropTarget}
                    onClearDrag={clearSidebarDrag}
                    onSpaceDrop={handleSpaceDrop}
                    onRequirementDrop={handleRequirementDrop}
                    onToggleRequirements={() => {
                      setCollapsedSpacePaths((current) => {
                        const next = new Set(current)
                        if (next.has(space.path)) next.delete(space.path)
                        else next.add(space.path)
                        return next
                      })
                    }}
                    onOpenSpaceMenu={(bounds) => {
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
                      setSpaceItemMenuPath((current) =>
                        current === space.path ? null : space.path
                      )
                    }}
                    onOpenRequirementMenu={(key) => {
                      setSpaceItemMenuPath(null)
                      setRequirementMenuKey((current) =>
                        current === key ? null : key
                      )
                    }}
                    onOpenNameDialog={openNameDialog}
                  />
                ))}
              </div>
            )}
          </section>
          <RecentSessions
            sessions={sessions}
            spaces={spaces}
            open={recentOpen}
            onToggle={() => setRecentOpen((open) => !open)}
          />
        </div>

        <WorkspaceUserMenu />
      </aside>}
      {nameDialog && (
        <WorkspaceNameDialog
          dialog={nameDialog}
          draft={nameDraft}
          onDraftChange={setNameDraft}
          onClose={closeNameDialog}
          onSubmit={submitNameDialog}
        />
      )}
    </>
  )
}

type SpaceEntryProps = {
  space: WorkspaceSpace
  requirements: WorkspaceNavigation['requirementsBySpace'][string]
  requirementsOpen: boolean
  dropTarget: string | null
  activeMenuPath: string | null
  activeRequirementMenuKey: string | null
  menuPosition: { top: number; right: number } | null
  dragRef: MutableRefObject<SidebarDragState | null>
  onDropTargetChange: (target: string) => void
  onClearDrag: () => void
  onSpaceDrop: (event: ReactDragEvent<HTMLElement>, path: string) => void
  onRequirementDrop: (
    event: ReactDragEvent<HTMLElement>,
    spacePath: string,
    requirementId: string
  ) => void
  onToggleRequirements: () => void
  onOpenSpaceMenu: (bounds: DOMRect) => void
  onOpenRequirementMenu: (key: string) => void
  onOpenNameDialog: (dialog: WorkspaceNameDialogState) => void
}

function SpaceEntry({
  space,
  requirements,
  requirementsOpen,
  dropTarget,
  activeMenuPath,
  activeRequirementMenuKey,
  menuPosition,
  dragRef,
  onDropTargetChange,
  onClearDrag,
  onSpaceDrop,
  onRequirementDrop,
  onToggleRequirements,
  onOpenSpaceMenu,
  onOpenRequirementMenu,
  onOpenNameDialog
}: SpaceEntryProps): JSX.Element {
  const SpaceStateIcon =
    requirements.length > 0
      ? requirementsOpen
        ? FolderOpenDot
        : FolderDot
      : requirementsOpen
        ? FolderOpen
        : FolderClosed

  return (
    <div
      className={
        dropTarget === `space:${space.path}`
          ? 'space-entry drag-over'
          : 'space-entry'
      }
      draggable
      onDragStart={() => {
        dragRef.current = { kind: 'space', spacePath: space.path }
      }}
      onDragEnd={onClearDrag}
      onDragOver={(event) => {
        const activeDrag = dragRef.current
        if (
          activeDrag?.kind !== 'space' ||
          activeDrag.spacePath === space.path
        ) {
          return
        }
        event.preventDefault()
        onDropTargetChange(`space:${space.path}`)
      }}
      onDrop={(event) => onSpaceDrop(event, space.path)}
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
          aria-label={`${requirementsOpen ? '折叠' : '展开'} ${space.label}需求`}
          aria-expanded={requirementsOpen}
          onClick={onToggleRequirements}
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
            aria-expanded={activeMenuPath === space.path}
            title={`${space.label}操作`}
            onClick={(event) =>
              onOpenSpaceMenu(event.currentTarget.getBoundingClientRect())
            }
          >
            <Ellipsis size={17} />
          </button>
          {activeMenuPath === space.path && (
            <div
              className="space-item-actions-menu"
              role="menu"
              aria-label={`${space.label}操作`}
              style={menuPosition ?? undefined}
            >
              <div className="space-item-actions-group">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    onOpenNameDialog({
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
                    onOpenNameDialog({
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
                    onOpenNameDialog({
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
      {requirements.length > 0 && requirementsOpen && (
        <ul className="space-requirements" aria-label={`${space.label}需求`}>
          {requirements.map((requirement) => {
            const menuKey = `${space.path}:${requirement.id}`
            return (
              <li
                className={
                  dropTarget ===
                  `requirement:${space.path}:${requirement.id}`
                    ? 'drag-over'
                    : undefined
                }
                draggable
                key={requirement.id}
                onDragStart={(event) => {
                  event.stopPropagation()
                  dragRef.current = {
                    kind: 'requirement',
                    spacePath: space.path,
                    requirementId: requirement.id
                  }
                }}
                onDragEnd={onClearDrag}
                onDragOver={(event) => {
                  const activeDrag = dragRef.current
                  if (
                    activeDrag?.kind !== 'requirement' ||
                    activeDrag.spacePath !== space.path ||
                    activeDrag.requirementId === requirement.id
                  ) {
                    return
                  }
                  event.preventDefault()
                  onDropTargetChange(
                    `requirement:${space.path}:${requirement.id}`
                  )
                }}
                onDrop={(event) =>
                  onRequirementDrop(event, space.path, requirement.id)
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
                    aria-expanded={activeRequirementMenuKey === menuKey}
                    title={`${requirement.title}操作`}
                    onClick={() => onOpenRequirementMenu(menuKey)}
                  >
                    <Ellipsis size={16} />
                  </button>
                  {activeRequirementMenuKey === menuKey && (
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
                          onOpenNameDialog({
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
}
