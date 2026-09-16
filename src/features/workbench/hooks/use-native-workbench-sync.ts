import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject
} from 'react'
import type {
  NativeOverlayEvent,
  NativeOverlayRequest,
  WorkbenchActionId
} from '../../../../shared/native-overlay'
import type { RealmFlowApi } from '../../../../shared/types'
import type {
  WorkbenchAction,
  WorkbenchTab
} from '../../../application/workbench/workbench-reducer'

export function useNativeWorkbenchSync({
  api,
  dispatch,
  panelOpen,
  activeTab,
  panelRef,
  webViewObscured,
  onAction
}: {
  api?: RealmFlowApi
  dispatch: Dispatch<WorkbenchAction>
  panelOpen: boolean
  activeTab?: WorkbenchTab
  panelRef: RefObject<HTMLElement>
  webViewObscured: boolean
  onAction: (action: WorkbenchActionId) => void
}): {
  addButtonRef: RefObject<HTMLButtonElement>
  addMenuOpen: boolean
  showAddMenu: () => void
  hideAddMenu: () => void
} {
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  const getAddMenuRequest = useCallback((): NativeOverlayRequest | null => {
    const button = addButtonRef.current
    if (!button) return null
    const bounds = button.getBoundingClientRect()
    return {
      kind: 'workbench-menu',
      anchor: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
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

  useEffect(
    () =>
      api?.nativeOverlay?.onEvent((event: NativeOverlayEvent) => {
        if (event.kind !== 'workbench-menu') return
        setAddMenuOpen(false)
        if (event.type === 'action') onAction(event.action)
      }),
    [api, onAction]
  )

  useEffect(
    () =>
      api?.webWorkbench.onStateChange((page) => {
        dispatch({ type: 'web-state-changed', page })
      }),
    [api, dispatch]
  )

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
  }, [activeTab, api, panelOpen, panelRef, webViewObscured])

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
  }, [panelRef, syncWebView])

  return {
    addButtonRef,
    addMenuOpen,
    showAddMenu,
    hideAddMenu
  }
}
