import {
  createWorkbenchState,
  workbenchReducer,
  type WorkbenchTab
} from './workbench-reducer'

const workspaceTab: WorkbenchTab = {
  id: 'workspace:one',
  type: 'workspace',
  label: 'one',
  workspaceId: 'one'
}

const terminalTab: WorkbenchTab = {
  id: 'terminal:one',
  type: 'terminal',
  label: 'terminal',
  session: { id: 'terminal:one', title: 'terminal', cwd: '/tmp' },
  output: '',
  exited: false
}

describe('workbenchReducer', () => {
  it('activates a new tab and replaces an existing tab in place', () => {
    const opened = workbenchReducer(createWorkbenchState(), {
      type: 'tab-activated',
      tab: workspaceTab
    })
    const replaced = workbenchReducer(opened, {
      type: 'tab-activated',
      tab: { ...workspaceTab, label: 'renamed' }
    })

    expect(opened).toMatchObject({
      activeTabId: workspaceTab.id,
      tabs: [workspaceTab]
    })
    expect(replaced.tabs).toHaveLength(1)
    expect(replaced.tabs[0].label).toBe('renamed')
  })

  it('selects the last remaining tab when closing the active tab', () => {
    const state = {
      tabs: [workspaceTab, terminalTab],
      activeTabId: terminalTab.id
    }

    expect(
      workbenchReducer(state, {
        type: 'tab-closed',
        tabId: terminalTab.id
      })
    ).toEqual({
      tabs: [workspaceTab],
      activeTabId: workspaceTab.id
    })
  })

  it('updates native web state and terminal lifecycle events', () => {
    const webTab: WorkbenchTab = {
      id: 'web:one',
      type: 'web',
      label: 'loading',
      page: {
        id: 'web:one',
        title: '',
        url: 'https://example.com',
        loading: true,
        canGoBack: false,
        canGoForward: false
      }
    }
    const state = {
      tabs: [webTab, terminalTab],
      activeTabId: webTab.id
    }
    const webUpdated = workbenchReducer(state, {
      type: 'web-state-changed',
      page: { ...webTab.page, title: 'Example', loading: false }
    })
    const terminalUpdated = workbenchReducer(webUpdated, {
      type: 'terminal-event-received',
      event: { sessionId: terminalTab.id, type: 'data', data: 'ready' }
    })
    const terminalExited = workbenchReducer(terminalUpdated, {
      type: 'terminal-event-received',
      event: { sessionId: terminalTab.id, type: 'exit', exitCode: 0 }
    })

    expect(webUpdated.tabs[0].label).toBe('Example')
    expect(terminalUpdated.tabs[1]).toMatchObject({ output: 'ready' })
    expect(terminalExited.tabs[1]).toMatchObject({ exited: true })
    expect((terminalExited.tabs[1] as typeof terminalTab).output).toContain(
      '进程已退出，代码 0'
    )
  })
})
