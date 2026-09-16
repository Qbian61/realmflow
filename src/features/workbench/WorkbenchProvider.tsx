import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useState,
  type ReactNode
} from 'react'
import type { WorkbenchActionId } from '../../../shared/native-overlay'
import type { RealmFlowApi } from '../../../shared/types'
import {
  createWorkbenchState,
  workbenchReducer,
  type WorkbenchTab
} from '../../application/workbench/workbench-reducer'
import { WorkbenchLayout } from './WorkbenchLayout'
import {
  useWorkbenchCommands,
  type WorkbenchCommands
} from './hooks/use-workbench-commands'
import { useWorkbenchGeometry } from './hooks/use-workbench-geometry'
import { useNativeWorkbenchSync } from './hooks/use-native-workbench-sync'
import { useTerminalSessions } from './hooks/use-terminal-sessions'
import './workbench.css'

const WorkbenchContext = createContext<WorkbenchCommands | null>(null)

export function useWorkbench(): WorkbenchCommands {
  const context = useContext(WorkbenchContext)
  if (!context) throw new Error('WorkbenchProvider is required')
  return context
}

export function WorkbenchProvider({
  children,
  api = window.realmflow
}: {
  children: ReactNode
  api?: RealmFlowApi
}): JSX.Element {
  const [{ tabs, activeTabId }, dispatch] = useReducer(
    workbenchReducer,
    undefined,
    createWorkbenchState
  )
  const [panelOpen, setPanelOpen] = useState(false)
  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  const geometry = useWorkbenchGeometry(panelOpen)

  const activateTab = useCallback((tab: WorkbenchTab): void => {
    dispatch({ type: 'tab-activated', tab })
    setPanelOpen(true)
  }, [])
  const terminal = useTerminalSessions({
    api,
    dispatch,
    activateTab
  })
  const commands = useWorkbenchCommands({
    api,
    tabs,
    dispatch,
    activateTab,
    setPanelOpen,
    ...terminal
  })
  const handleNativeAction = useCallback(
    (action: WorkbenchActionId): void => {
      const selected = commands.launcherActions.find(
        (item) => item.id === action
      )
      if (selected) void selected.run()
    },
    [commands.launcherActions]
  )
  const nativeSync = useNativeWorkbenchSync({
    api,
    dispatch,
    panelOpen,
    activeTab,
    panelRef: geometry.panelRef,
    webViewObscured: commands.urlDialogOpen,
    onAction: handleNativeAction
  })

  return (
    <WorkbenchContext.Provider value={commands.contextValue}>
      <WorkbenchLayout
        layoutRef={geometry.layoutRef}
        panelRef={geometry.panelRef}
        addButtonRef={nativeSync.addButtonRef}
        panelOpen={panelOpen}
        panelMaximized={geometry.panelMaximized}
        panelWidth={geometry.panelWidth}
        tabs={tabs}
        activeTab={activeTab}
        activeTabId={activeTabId}
        urlDialogOpen={commands.urlDialogOpen}
        urlDraft={commands.urlDraft}
        urlError={commands.urlError}
        terminalApi={api?.terminal}
        launcherActions={commands.launcherActions}
        onPageClick={commands.openLinkedWebContent}
        onTogglePanel={() => {
          if (panelOpen) commands.contextValue.closePanel()
          else commands.contextValue.openPanel()
        }}
        onResizeStart={geometry.onResizeStart}
        onResizeKeyDown={geometry.onResizeKeyDown}
        onSelectTab={(tabId) => dispatch({ type: 'tab-selected', tabId })}
        onCloseTab={(tabId) => void commands.closeTab(tabId)}
        onToggleAddMenu={() => {
          if (nativeSync.addMenuOpen) nativeSync.hideAddMenu()
          else nativeSync.showAddMenu()
        }}
        onToggleMaximized={geometry.onToggleMaximized}
        onNavigateWeb={(tab, url) =>
          void api?.webWorkbench.navigate(tab.id, url)
        }
        onGoBack={(tabId) => void api?.webWorkbench.goBack(tabId)}
        onGoForward={(tabId) =>
          void api?.webWorkbench.goForward(tabId)
        }
        onReload={(tabId) => void api?.webWorkbench.reload(tabId)}
        onOpenExternal={(url) =>
          void api?.webWorkbench.openExternal(url)
        }
        onUrlDraftChange={commands.setUrlDraft}
        onCloseUrlDialog={commands.closeUrlDialog}
        onSubmitUrl={commands.submitUrl}
      >
        {children}
      </WorkbenchLayout>
    </WorkbenchContext.Provider>
  )
}
