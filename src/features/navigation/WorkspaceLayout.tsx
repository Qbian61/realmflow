import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
  useState
} from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import {
  WorkspaceSidebar,
  type WorkspaceSidebarProps
} from './WorkspaceSidebar'

const DEFAULT_SIDEBAR_WIDTH = 248
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 420
const MIN_CONTENT_WIDTH = 320
const CONTENT_PANEL_INSET = 8
const CONTENT_PANEL_HORIZONTAL_INSET = CONTENT_PANEL_INSET * 2
const SIDEBAR_WIDTH_KEY = 'realmflow:sidebar-width'

type WorkspaceLayoutProps = Omit<WorkspaceSidebarProps, 'visible'> & {
  children: ReactNode
  status?: ReactNode
}

function readSidebarWidth(): number {
  const storedValue = window.localStorage.getItem(SIDEBAR_WIDTH_KEY)
  if (storedValue === null) return DEFAULT_SIDEBAR_WIDTH
  const storedWidth = Number(storedValue)
  if (!Number.isFinite(storedWidth)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, storedWidth))
}

export function WorkspaceLayout({
  children,
  status,
  ...sidebarProps
}: WorkspaceLayoutProps): JSX.Element {
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth)
  const [resizing, setResizing] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
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

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    updateSidebarWidth(sidebarWidth + (event.key === 'ArrowRight' ? 8 : -8))
  }

  const handleResizeMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    if (resizing) updateSidebarWidth(event.clientX - CONTENT_PANEL_INSET)
  }

  return (
    <div
      ref={shellRef}
      className={resizing ? 'app-shell resizing' : 'app-shell'}
      style={shellStyle}
      data-testid="app-shell"
    >
      <WorkspaceSidebar visible={sidebarVisible} {...sidebarProps} />

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
            setResizing(false)
          }}
          onPointerCancel={() => setResizing(false)}
        />
      )}

      <button
        className={`sidebar-edge-toggle ${
          sidebarVisible ? 'sidebar-open' : 'sidebar-closed'
        }`}
        type="button"
        aria-label={sidebarVisible ? '隐藏菜单栏' : '展示菜单栏'}
        title={sidebarVisible ? '隐藏菜单栏' : '展示菜单栏'}
        onClick={() => setSidebarVisible((visible) => !visible)}
      >
        {sidebarVisible ? (
          <PanelLeftClose size={18} strokeWidth={1.8} />
        ) : (
          <PanelLeftOpen size={18} strokeWidth={1.8} />
        )}
      </button>

      <div
        className={status ? 'app-content has-status' : 'app-content'}
        data-testid="app-content"
      >
        {status}
        <div className="app-content-body">{children}</div>
      </div>
    </div>
  )
}
