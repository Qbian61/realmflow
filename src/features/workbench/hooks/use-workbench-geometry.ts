import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject
} from 'react'

const MIN_WORKBENCH_WIDTH = 440
const WORKBENCH_RIGHT_INSET = 8
const MIN_PANEL_WIDTH = MIN_WORKBENCH_WIDTH + WORKBENCH_RIGHT_INSET
const MAX_PANEL_WIDTH = 920
const MIN_SIDEBAR_WIDTH = 220
const MIN_CONTENT_WIDTH = 320
const MIN_MAIN_WORKSPACE_WIDTH =
  MIN_SIDEBAR_WIDTH + MIN_CONTENT_WIDTH + 8
const WORKBENCH_RESIZER_WIDTH = 4

export function useWorkbenchGeometry(panelOpen: boolean): {
  layoutRef: RefObject<HTMLDivElement>
  panelRef: RefObject<HTMLDivElement>
  panelWidth: number
  panelMaximized: boolean
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onToggleMaximized: () => void
} {
  const layoutRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resizeStartRef = useRef<{ clientX: number; width: number }>()
  const [panelWidth, setPanelWidth] = useState(640)
  const [panelMaximized, setPanelMaximized] = useState(false)

  const clampPanelWidth = useCallback((width: number): number => {
    const layout = layoutRef.current
    const layoutWidth = layout?.getBoundingClientRect().width ?? 0
    const sidebar = layout?.querySelector<HTMLElement>('.sidebar')
    const content = layout?.querySelector<HTMLElement>('.app-content')
    const styles = content ? window.getComputedStyle(content) : undefined
    const measuredInset = styles
      ? Number.parseFloat(styles.marginLeft) +
        Number.parseFloat(styles.marginRight)
      : Number.NaN
    const contentInset = Number.isFinite(measuredInset) ? measuredInset : 8
    const sidebarWidth =
      sidebar?.getBoundingClientRect().width || MIN_SIDEBAR_WIDTH
    const minimumMainWidth = Math.max(
      MIN_MAIN_WORKSPACE_WIDTH,
      sidebarWidth + contentInset + MIN_CONTENT_WIDTH
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

  useEffect(() => {
    const resizePanel = (event: globalThis.MouseEvent): void => {
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

  return {
    layoutRef,
    panelRef,
    panelWidth,
    panelMaximized,
    onResizeStart: (event) => {
      resizeStartRef.current = {
        clientX: event.clientX,
        width: panelWidth
      }
      document.body.classList.add('resizing-global-workbench')
    },
    onResizeKeyDown: (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      setPanelWidth((width) =>
        clampPanelWidth(width + (event.key === 'ArrowLeft' ? 8 : -8))
      )
    },
    onToggleMaximized: () => setPanelMaximized((value) => !value)
  }
}
