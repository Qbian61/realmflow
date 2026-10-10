import {
  createWorkbenchState,
  workbenchReducer,
  type TerminalTab,
  type WorkbenchTab
} from './workbench-reducer'

const workspaceTab: WorkbenchTab = {
  id: 'workspace:one',
  type: 'workspace',
  label: 'one',
  workspaceId: 'one'
}

const terminalTab: TerminalTab = {
  id: 'terminal:one',
  type: 'terminal',
  label: 'terminal',
  session: {
    id: 'terminal:one',
    title: 'terminal',
    cwd: '/tmp',
    shell: 'zsh'
  },
  output: '',
  exited: false
}

describe('workbenchReducer', () => {
  it('opens editable code snippets as reusable workbench tabs', () => {
    const codeTab: WorkbenchTab = {
      id: 'code:example',
      type: 'code',
      label: 'example.js',
      snippet: {
        language: 'javascript',
        content: 'console.log("ready")',
        suggestedName: 'example.js'
      }
    }

    const opened = workbenchReducer(createWorkbenchState(), {
      type: 'tab-activated',
      tab: codeTab
    })
    const reopened = workbenchReducer(opened, {
      type: 'tab-activated',
      tab: {
        ...codeTab,
        snippet: { ...codeTab.snippet, content: 'console.log("updated")' }
      }
    })

    expect(opened).toEqual({
      tabs: [codeTab],
      activeTabId: codeTab.id
    })
    expect(reopened.tabs).toHaveLength(1)
    expect(reopened.tabs[0]).toMatchObject({
      type: 'code',
      snippet: { content: 'console.log("updated")' }
    })
  })

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

  it('opens and closes an isolated Agent browser tab from Main lifecycle events', () => {
    const page = {
      id: 'browser-session-1',
      title: 'Agent Browser',
      url: 'about:blank',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      managed: 'agent' as const
    }
    const opened = workbenchReducer(createWorkbenchState(), {
      type: 'agent-browser-opened',
      page
    } as never)
    const closed = workbenchReducer(opened, {
      type: 'agent-browser-closed',
      sessionId: page.id
    } as never)

    expect(opened).toEqual({
      tabs: [{
        id: page.id,
        type: 'web',
        label: 'Agent Browser',
        page,
        managed: 'agent'
      }],
      activeTabId: page.id
    })
    expect(closed).toEqual({ tabs: [], activeTabId: undefined })
  })
})
