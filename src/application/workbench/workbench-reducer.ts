import type { TerminalEvent, TerminalSession } from '../../../shared/terminal'
import type {
  OpenedSessionFiles,
  WorkspaceFile
} from '../../../shared/workspace'
import type { WebPageState } from '../../../shared/workbench'
import type { RequirementStageId } from '../../domain/requirement'

export type WorkspaceTab = {
  id: string
  type: 'workspace'
  label: string
  workspaceId: string
  activeStage?: RequirementStageId
  initialFiles?: WorkspaceFile[]
}

export type WebTab = {
  id: string
  type: 'web'
  label: string
  page: WebPageState
}

export type TerminalTab = {
  id: string
  type: 'terminal'
  label: string
  session: TerminalSession
  output: string
  exited: boolean
}

export type WorkbenchTab = WorkspaceTab | WebTab | TerminalTab

export type WorkbenchState = {
  tabs: WorkbenchTab[]
  activeTabId?: string
}

export type WorkbenchAction =
  | { type: 'tab-activated'; tab: WorkbenchTab }
  | { type: 'tab-selected'; tabId: string }
  | { type: 'tab-closed'; tabId: string }
  | { type: 'web-state-changed'; page: WebPageState }
  | { type: 'terminal-event-received'; event: TerminalEvent }

export function createWorkbenchState(): WorkbenchState {
  return { tabs: [] }
}

export function workbenchReducer(
  state: WorkbenchState,
  action: WorkbenchAction
): WorkbenchState {
  switch (action.type) {
    case 'tab-activated': {
      const exists = state.tabs.some((tab) => tab.id === action.tab.id)
      return {
        tabs: exists
          ? state.tabs.map((tab) =>
              tab.id === action.tab.id ? action.tab : tab
            )
          : [...state.tabs, action.tab],
        activeTabId: action.tab.id
      }
    }
    case 'tab-selected':
      return state.tabs.some((tab) => tab.id === action.tabId)
        ? { ...state, activeTabId: action.tabId }
        : state
    case 'tab-closed': {
      const tabs = state.tabs.filter((tab) => tab.id !== action.tabId)
      return {
        tabs,
        activeTabId:
          state.activeTabId === action.tabId
            ? tabs.at(-1)?.id
            : state.activeTabId
      }
    }
    case 'web-state-changed':
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.type === 'web' && tab.id === action.page.id
            ? {
                ...tab,
                label: action.page.title || action.page.url,
                page: action.page
              }
            : tab
        )
      }
    case 'terminal-event-received':
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (
            tab.type !== 'terminal' ||
            tab.id !== action.event.sessionId
          ) {
            return tab
          }
          if (action.event.type === 'exit') {
            return {
              ...tab,
              exited: true,
              output: `${tab.output}\r\n[进程已退出，代码 ${action.event.exitCode}]\r\n`
            }
          }
          return {
            ...tab,
            output: `${tab.output}${action.event.data}`.slice(-1024 * 1024)
          }
        })
      }
  }
}

export function workspaceTabFromSelection(
  selection: OpenedSessionFiles
): WorkspaceTab {
  return {
    id: `workspace:${selection.binding.requirementId}`,
    type: 'workspace',
    label: selection.binding.rootName,
    workspaceId: selection.binding.requirementId,
    initialFiles: selection.files
  }
}
