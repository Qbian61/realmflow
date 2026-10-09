import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import App from './App'
import { createInMemoryRendererRepositories } from './infrastructure/storage/renderer-repositories'
import { createRealmFlowApi } from '../electron/src/preload-api'

vi.mock('./app/hooks/use-model-profiles', () => ({
  useModelProfiles: () => ({
    options: [
      { value: '', label: '自动选择' },
      { value: 'profile-1', label: 'Primary model' }
    ],
    groups: [
      {
        providerId: 'provider-1',
        providerName: 'Local',
        models: [{ value: 'profile-1', label: 'Primary model' }]
      }
    ],
    selectedId: '',
    effectiveId: 'profile-1',
    loading: false,
    select: vi.fn(),
    refresh: vi.fn()
  })
}))

describe('RealmFlow navigation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete (window as Window & { realmflow?: unknown }).realmflow
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('wires the typed follow-up sender from App through AppRoutes', () => {
    const appSource = readFileSync(resolve('src/App.tsx'), 'utf8')
    const routesSource = readFileSync(resolve('src/app/AppRoutes.tsx'), 'utf8')

    expect(appSource).toContain(
      'window.realmflow?.business.sendFollowUpSuggestion(command)'
    )
    expect(appSource).toContain(
      'onSendFollowUpSuggestion={sendFollowUpSuggestion}'
    )
    expect(routesSource).toContain(
      'onSendFollowUpSuggestion={onSendFollowUpSuggestion}'
    )
  })

  it('renders the main navigation entries', () => {
    render(<App />)

    const links = within(
      screen.getByRole('navigation', { name: '主导航' })
    ).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
        '工作台',
        '新对话',
        '定时任务',
        '能力',
        '流程模板',
        '统计分析'
    ])
    expect(screen.getByText('空间 (1)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'xxx 空间' })).toBeInTheDocument()
    expect(screen.queryByText('域流工作台')).not.toBeInTheDocument()
  })

  it('mounts the global Tool permission prompt above every route', async () => {
    window.location.hash = '#/help'
    const api = createRealmFlowApi(
      {
        invoke: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    Object.defineProperty(window, 'realmflow', {
      configurable: true,
      value: {
        ...api,
        toolPermissions: {
          listPending: vi.fn().mockResolvedValue([
            {
              schemaVersion: 2,
              id: 'permission-1',
              executionId: 'execution-1',
              runId: 'run-1',
              callId: 'call-1',
              toolId: 'builtin.process.run',
              toolName: 'Run local command',
              status: 'requested',
              reason: 'process',
              risk: 'high',
              effectsDigest: 'a'.repeat(64),
              argumentsDigest: 'b'.repeat(64),
              bindingRevision: 1,
              requestRevision: 1,
              requestedAt: 100,
              expiresAt: Date.now() + 60_000,
              resources: [{ kind: 'process', label: 'npm test' }]
            }
          ]),
          resolve: vi.fn(),
          onChanged: vi.fn().mockReturnValue(() => undefined)
        }
      }
    })

    render(<App />)

    expect(
      await screen.findByRole('dialog', { name: '需要你的授权' })
    ).toBeVisible()
    window.location.hash = '#/'
  })

  it('composes each cached route through one shared page scroll contract', () => {
    render(<App />)

    const content = screen.getByTestId('app-content')
    const pageShells = content.querySelectorAll('.ui-page.app-route-page')

    expect(pageShells).toHaveLength(1)
    expect(pageShells[0]).toHaveClass('app-route-page')
    const pageBody = pageShells[0].querySelector(
      ':scope > .ui-page__body'
    )
    expect(pageBody).toHaveClass(
      'app-route-page__body',
      'ui-page__body--workspace'
    )
    expect(pageBody).toBe(screen.getByRole('main'))
    expect(pageBody).toHaveAttribute('id', 'main-content')
    expect(pageBody).toHaveAttribute('tabindex', '-1')
    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(pageBody?.querySelector('.workbench-hub-page')).toBeInTheDocument()
  })

  it('offers the skip link as the first tab stop and focuses main content', () => {
    render(<App />)

    const skipLink = screen.getByRole('link', { name: '跳到主内容' })
    const main = screen.getByRole('main')

    expect(skipLink).toHaveAttribute('href', '#main-content')
    expect(document.activeElement).toBe(document.body)

    fireEvent.keyDown(document.body, { key: 'Tab' })
    skipLink.focus()
    expect(document.activeElement).toBe(skipLink)

    fireEvent.click(skipLink)
    expect(document.activeElement).toBe(main)
  })

  it('exposes one page heading on the workbench route', () => {
    render(<App />)

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('heading', { level: 1, name: '工作台' })
    ).toBeInTheDocument()
  })

  it('replaces native hover titles with the global tooltip', () => {
    vi.useFakeTimers()
    try {
      render(<App />)
      const trigger = screen.getByRole('button', { name: '打开工作区' })

      expect(trigger).toHaveAttribute('title', '打开工作区')
      fireEvent.pointerOver(trigger)
      expect(trigger).not.toHaveAttribute('title')
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(350)
      })

      const tooltip = screen.getByRole('tooltip')
      expect(tooltip).toHaveTextContent('打开工作区')
      expect(tooltip.parentElement).toBe(document.body)
      expect(trigger).toHaveAttribute('aria-describedby', tooltip.id)

      fireEvent.pointerOut(trigger, { relatedTarget: document.body })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      expect(trigger).toHaveAttribute('title', '打开工作区')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows title tooltips immediately for keyboard focus and closes on Escape', () => {
    render(<App />)
    const trigger = screen.getByRole('button', { name: '打开工作区' })

    fireEvent.focusIn(trigger)
    expect(screen.getByRole('tooltip')).toHaveTextContent('打开工作区')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('title', '打开工作区')
  })

  it('dismisses a tooltip on press without restoring the native title until leave', () => {
    render(<App />)
    const trigger = screen.getByRole('button', { name: '打开工作区' })

    fireEvent.focusIn(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.pointerDown(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(trigger).not.toHaveAttribute('title')

    fireEvent.focusOut(trigger, { relatedTarget: document.body })
    expect(trigger).toHaveAttribute('title', '打开工作区')
  })

  it('renders the workbench hub modules on the home route', () => {
    window.history.replaceState(null, '', '#/')
    render(<App />)

    const content = screen.getByTestId('app-content')
    const tabs = within(content).getByRole('tablist', {
      name: '工作台模块'
    })
    expect(
      within(tabs).getAllByRole('tab').map((tab) => tab.textContent)
    ).toEqual([
      '工作台',
      '任务待办',
      '常用网站',
      '备忘录',
      '终端',
      '系统状态'
    ])
    expect(
      within(tabs).getByRole('tab', { name: '工作台' })
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('restores the saved locale across the mounted application shell', () => {
    window.localStorage.setItem(
      'realmflow:locale:v1',
      JSON.stringify({ version: 1, locale: 'en' })
    )

    render(<App />)

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New chat' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('lang', 'en')
  })

  it('restores the saved theme across the mounted application shell', () => {
    window.localStorage.setItem(
      'realmflow:theme:v1',
      JSON.stringify({ version: 1, theme: 'dark' })
    )

    render(<App />)

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveAttribute(
      'data-theme-preference',
      'dark'
    )
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('localizes shell collections, user menu, and workspace dialogs in Japanese', () => {
    window.localStorage.setItem(
      'realmflow:locale:v1',
      JSON.stringify({ version: 1, locale: 'ja' })
    )
    render(<App />)

    expect(
      screen.getByRole('button', { name: 'スペース (1)' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: '最近のチャット' })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Qbian61/ }))
    expect(screen.getByRole('menuitem', { name: '一般' })).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'モデル設定' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /言語.*日本語/ })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'スペースの操作' }))
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'ワークスペースを作成' })
    )
    expect(
      screen.getByRole('dialog', { name: 'ワークスペースを作成' })
    ).toBeVisible()
  })

  it('keeps the right workbench open while navigating from the sidebar', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '打开工作区' }))
    const workbench = screen.getByRole('complementary', {
      name: '全局工作区'
    })

    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    expect(
      within(screen.getByTestId('app-content')).getByRole('region', {
        name: '新对话'
      })
    ).toBeInTheDocument()
    expect(workbench).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))
    expect(
      within(screen.getByTestId('app-content')).getByRole('tab', {
        name: '任务模板'
      })
    ).toBeInTheDocument()
    expect(workbench).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '能力' }))
    expect(
      within(screen.getByTestId('app-content')).getByRole('tab', {
        name: '工具'
      })
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('app-content')).getByRole('tab', {
        name: '技能'
      })
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('app-content')).getByRole('tab', {
        name: '智能体'
      })
    ).toBeInTheDocument()
    expect(workbench).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '统计分析' }))
    expect(
      within(screen.getByTestId('app-content')).getByRole('tablist', {
        name: '统计视图'
      })
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('app-content')).getByRole('tabpanel', {
        name: '产品活动'
      })
    ).toBeInTheDocument()
    expect(workbench).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起工作区' })).toBeInTheDocument()
  })

  it('preserves every visited middle workspace while switching sidebar pages', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    fireEvent.change(screen.getByRole('textbox', { name: '对话内容' }), {
      target: { value: '保留这段未发送内容' }
    })

    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))
    fireEvent.click(screen.getByRole('tab', { name: '进行中任务 (0)' }))
    fireEvent.click(screen.getByRole('button', { name: '新建任务' }))
    fireEvent.change(screen.getByRole('textbox', { name: '任务名称' }), {
      target: { value: '保留定时任务草稿' }
    })

    fireEvent.click(screen.getByRole('link', { name: '能力' }))
    fireEvent.click(screen.getByRole('tab', { name: '技能' }))

    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    expect(screen.getByRole('textbox', { name: '对话内容' })).toHaveValue(
      '保留这段未发送内容'
    )

    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))
    expect(
      screen.getByRole('tab', { name: '进行中任务 (0)' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('dialog', { name: '新建定时任务' })
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: '任务名称' })).toHaveValue(
      '保留定时任务草稿'
    )

    fireEvent.click(screen.getByRole('link', { name: '能力' }))
    expect(screen.getByRole('tab', { name: '技能' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('does not dispatch global keyboard events to inactive workspace pages', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))
    fireEvent.click(screen.getByRole('button', { name: '新建任务' }))
    fireEvent.change(screen.getByRole('textbox', { name: '任务名称' }), {
      target: { value: '后台页面草稿' }
    })

    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))

    expect(
      screen.getByRole('dialog', { name: '新建定时任务' })
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: '任务名称' })).toHaveValue(
      '后台页面草稿'
    )
  })

  it('keeps inactive page dialogs and their drafts intact', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    fireEvent.click(screen.getByRole('button', { name: '打开模板 代码审查助手' }))
    fireEvent.change(screen.getByRole('textbox', { name: '占位符 代码变更' }), {
      target: { value: '保留模板参数' }
    })

    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('link', { name: '新对话' }))

    expect(screen.getByRole('dialog', { name: '代码审查助手' })).toBeVisible()
    expect(
      screen.getByRole('textbox', { name: '占位符 代码变更' })
    ).toHaveValue('保留模板参数')
  })

  it('keeps workflow navigation active and returns to the cached editor', () => {
    window.history.replaceState(null, '', '#/templates/template-1/edit')
    render(<App />)

    const workflowLink = screen.getByRole('link', { name: '流程模板' })
    expect(workflowLink).toHaveClass('active')
    expect(workflowLink).toHaveAttribute(
      'href',
      '#/templates/template-1/edit'
    )

    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))
    fireEvent.click(screen.getByRole('link', { name: '流程模板' }))

    expect(window.location.hash).toBe('#/templates/template-1/edit')
    expect(screen.getByRole('link', { name: '流程模板' })).toHaveClass('active')
    window.history.replaceState(null, '', '#/')
  })

  it('toggles spaces and opens the space actions menu', () => {
    render(<App />)

    const toggle = screen.getByRole('button', { name: '空间 (1)' })
    const actions = screen.getByRole('button', { name: '空间操作' })
    const spaceLink = screen.getByRole('link', { name: 'xxx 空间' })

    expect(spaceLink.querySelector('svg')).toBeInTheDocument()
    expect(
      toggle.querySelector('.spaces-heading-icon')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menu', { name: '空间操作' })
    ).not.toBeInTheDocument()

    fireEvent.click(actions)
    expect(screen.getByRole('menu', { name: '空间操作' })).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: '新建空间' })
    ).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.queryByRole('menu', { name: '空间操作' })
    ).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(
      screen.queryByRole('link', { name: 'xxx 空间' })
    ).not.toBeInTheDocument()
  })

  it('opens actions for an individual space', () => {
    render(<App />)

    const actions = screen.getByRole('button', { name: 'xxx 空间操作' })

    expect(
      screen.queryByRole('menu', { name: 'xxx 空间操作' })
    ).not.toBeInTheDocument()

    fireEvent.click(actions)

    const menu = screen.getByRole('menu', { name: 'xxx 空间操作' })
    const groups = menu.querySelectorAll('.space-item-actions-group')

    expect(groups).toHaveLength(2)
    expect(
      within(groups[0] as HTMLElement).getByRole('menuitem', {
        name: '新建需求'
      })
    ).toBeInTheDocument()
    expect(
      within(groups[1] as HTMLElement).getByRole('menuitem', {
        name: '更新名称'
      })
    ).toBeInTheDocument()
    expect(
      within(groups[1] as HTMLElement).getByRole('menuitem', {
        name: '删除空间'
      })
    ).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.queryByRole('menu', { name: 'xxx 空间操作' })
    ).not.toBeInTheDocument()
  })

  it('creates a named space at the top of the space list', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建空间' }))

    const dialog = screen.getByRole('dialog', { name: '新建空间' })
    const confirm = within(dialog).getByRole('button', {
      name: '确认新建空间'
    })

    expect(dialog).toHaveClass('ui-dialog', 'ui-dialog--compact')
    expect(
      within(dialog).getByRole('textbox', { name: '空间名称' }).closest('.ui-field')
    ).not.toBeNull()
    expect(confirm).toHaveClass('ui-button', 'ui-button--primary')
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: '空间名称' }), {
      target: { value: '产品空间' }
    })
    fireEvent.click(confirm)

    const section = screen.getByRole('region', { name: '空间' })
    expect(within(section).getAllByRole('link')[0]).toHaveAccessibleName(
      '产品空间'
    )
    expect(screen.getByText('空间 (2)')).toBeInTheDocument()
  })

  it('creates a named requirement under its space', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建需求' }))

    const dialog = screen.getByRole('dialog', { name: '新建需求' })
    const confirm = within(dialog).getByRole('button', {
      name: '确认新建需求'
    })

    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: '需求名称' }), {
      target: { value: '登录流程优化' }
    })
    fireEvent.click(confirm)

    expect(
      within(screen.getByRole('list', { name: 'xxx 空间需求' })).getByText(
        '登录流程优化'
      )
    ).toBeInTheDocument()
  })

  it('creates a named requirement from the space detail header', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: 'xxx 空间' }))
    fireEvent.click(screen.getByRole('button', { name: '新建需求' }))

    const dialog = screen.getByRole('dialog', { name: '新建需求' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '需求名称' }), {
      target: { value: '支付流程优化' }
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: '确认新建需求' })
    )

    expect(
      within(screen.getByRole('list', { name: 'xxx 空间需求' })).getByText(
        '支付流程优化'
      )
    ).toBeInTheDocument()
  })

  it('opens a compact space overview with chat and requirement statistics', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: 'xxx 空间' }))

    const content = screen.getByTestId('app-content')
    const header = within(content).getByRole('banner', {
      name: '主工作区工具栏'
    })
    const body = content.querySelector('.app-content-body')
    const resourcesTab = within(content).getByRole('tab', {
      name: '空间知识库 (0)'
    })
    const spaceNameTab = within(content).getByRole('tab', {
      name: 'xxx 空间 (1)'
    })
    expect(
      within(content).getByRole('heading', { level: 1, name: 'xxx 空间' })
    ).toBeInTheDocument()
    expect(
      within(content).queryByRole('button', { name: '空间详情操作' })
    ).not.toBeInTheDocument()
    expect(within(content).queryByRole('tab', { name: '概览' })).not.toBeInTheDocument()
    expect(within(content).queryByRole('tab', { name: '统计' })).not.toBeInTheDocument()
    expect(within(content).getAllByRole('tab')).toHaveLength(2)
    expect(spaceNameTab).toHaveAttribute('aria-selected', 'true')
    expect(header).toContainElement(resourcesTab)
    expect(header).toContainElement(spaceNameTab)
    expect(resourcesTab.nextElementSibling).toBe(spaceNameTab)
    expect(body).not.toContainElement(resourcesTab)
    expect(body).not.toContainElement(spaceNameTab)
    expect(
      within(content).getByRole('textbox', { name: '空间对话内容' })
    ).toBeInTheDocument()
    expect(
      within(content).queryByRole('combobox', { name: '当前空间' })
    ).not.toBeInTheDocument()
    expect(
      within(content).queryByRole('combobox', { name: '空间权限模式' })
    ).not.toBeInTheDocument()

    const statistics = within(content).getByRole('region', {
      name: '需求统计'
    })
    expect(within(statistics).getByText('全部需求')).toBeInTheDocument()
    expect(within(statistics).getByText('测试需求')).toBeInTheDocument()
  })

  it('shows counted recent test conversations with styled details', () => {
    render(<App />)

    const recent = screen.getByRole('region', { name: '最近对话' })
    expect(
      within(recent).getByRole('heading', { name: '最近 (2)' })
    ).toBeInTheDocument()
    expect(
      within(recent).getByRole('link', { name: '测试对话 2' })
    ).toBeInTheDocument()

    fireEvent.click(
      within(recent).getByRole('link', { name: '测试对话' })
    )

    const content = screen.getByTestId('app-content')
    const messages = within(content).getByLabelText('对话消息')
    expect(
      within(content).getByRole('heading', { name: '测试对话' })
    ).toBeInTheDocument()
    expect(
      within(content).getByText(/AI 生成内容请核实/)
    ).toHaveClass('chat-session-subtitle-text')
    expect(within(messages).queryByText('你')).not.toBeInTheDocument()
    const executionBrand = within(messages).getByText('RealmFlow').parentElement
    const executionLogo = executionBrand?.querySelector(
      '.chat-execution-logo img'
    )
    expect(executionLogo).toHaveAttribute(
      'src',
      expect.stringContaining('logo.png')
    )
    expect(executionLogo).toHaveAttribute('width', '28')
    expect(executionLogo).toHaveAttribute('height', '28')
    expect(executionLogo).toHaveAttribute('loading', 'lazy')
    expect(executionLogo).toHaveAttribute('decoding', 'async')
    expect(within(messages).queryByText(/任务耗时/)).not.toBeInTheDocument()
    expect(
      within(content).getByText('如何设计空间内的需求管理流程？')
    ).toBeInTheDocument()
    expect(
      within(content).queryByLabelText('推荐追问')
    ).not.toBeInTheDocument()
    expect(
      within(content).getByRole('button', { name: '复制回答' })
    ).toBeInTheDocument()
    expect(
      within(content).getByRole('button', { name: '重新生成回答' })
    ).toBeInTheDocument()
    expect(within(content).queryByText('由 AI 生成')).not.toBeInTheDocument()
    expect(messages.querySelectorAll('time.chat-message-time')).toHaveLength(2)

    fireEvent.click(
      within(recent).getByRole('link', { name: '测试对话 2' })
    )
    expect(
      within(content).getByRole('heading', { name: '测试对话 2' })
    ).toBeInTheDocument()
    expect(
      within(content).getByText('如何制定需求测试计划？')
    ).toBeInTheDocument()
  })

  it('collapses and expands the recent conversation list', () => {
    render(<App />)

    const recent = screen.getByRole('region', { name: '最近对话' })
    const collapseButton = within(recent).getByRole('button', {
      name: '最近 (2)'
    })

    expect(collapseButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(recent).getByRole('navigation', { name: '最近对话列表' })
    ).toBeInTheDocument()

    fireEvent.click(collapseButton)

    const expandButton = within(recent).getByRole('button', {
      name: '最近 (2)'
    })
    expect(expandButton).toHaveAttribute('aria-expanded', 'false')
    expect(
      within(recent).queryByRole('navigation', { name: '最近对话列表' })
    ).not.toBeInTheDocument()

    fireEvent.click(expandButton)

    expect(
      within(recent).getByRole('navigation', { name: '最近对话列表' })
    ).toBeInTheDocument()
  })

  it('navigates to new chat after confirming deletion of the active conversation', async () => {
    render(<App />)
    const recent = screen.getByRole('region', { name: '最近对话' })
    fireEvent.click(within(recent).getByRole('link', { name: '测试对话' }))
    expect(
      screen.getByRole('heading', { name: '测试对话' })
    ).toBeInTheDocument()

    fireEvent.click(
      within(recent).getByRole('button', { name: '测试对话的更多操作' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: '删除对话' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除对话' }))

    expect(
      await screen.findByRole('textbox', { name: '对话内容' })
    ).toBeInTheDocument()
    expect(
      within(recent).queryByRole('link', { name: '测试对话' })
    ).not.toBeInTheDocument()
  })

  it('provides default conversations in degraded in-memory mode', () => {
    render(<App />)

    const recent = screen.getByRole('region', { name: '最近对话' })
    expect(within(recent).getByRole('link', { name: '测试对话' })).toBeInTheDocument()
    expect(
      within(recent).getByRole('link', { name: '测试对话 2' })
    ).toBeInTheDocument()
  })

  it('shows the persistence status when repository initialization degraded', () => {
    render(<App degraded />)

    expect(
      screen.getByRole('status', { name: '本地存储状态' })
    ).toHaveTextContent('当前更改暂时无法保存')
  })

  it('does not show the persistence status after normal initialization', () => {
    render(<App />)

    expect(
      screen.queryByRole('status', { name: '本地存储状态' })
    ).not.toBeInTheDocument()
  })

  it('lists persisted conversations from every space under recent', async () => {
    const repositories = createInMemoryRendererRepositories()
    const { unmount } = render(<App repositories={repositories} />)

    expect(
      screen.getByRole('region', { name: '最近对话' })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'xxx 空间' }))
    fireEvent.change(
      screen.getByRole('textbox', { name: '空间对话内容' }),
      {
        target: { value: '梳理登录流程优化方案' }
      }
    )
    fireEvent.click(screen.getByRole('button', { name: '发送空间消息' }))

    const recent = screen.getByRole('region', { name: '最近对话' })
    expect(
      within(recent).getByRole('link', { name: '梳理登录流程优化方案' })
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: '梳理登录流程优化方案' })
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByText(/xxx 空间 · AI 生成内容请核实/)
        .some(
          (element) =>
            element.classList.contains('chat-session-subtitle-text')
        )
    ).toBe(true)

    await vi.waitFor(() =>
      expect(
        repositories.chatSessions
          .getSnapshot()
          .value.some(
            (session) => session.title === '梳理登录流程优化方案'
          )
      ).toBe(true)
    )
    unmount()
    render(<App repositories={repositories} />)

    expect(
      within(screen.getByRole('region', { name: '最近对话' })).getByRole(
        'link',
        { name: '梳理登录流程优化方案' }
      )
    ).toBeInTheDocument()
  })

  it('adds a workspace-scoped new chat to recent conversations', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    fireEvent.change(screen.getByRole('combobox', { name: '工作空间' }), {
      target: { value: '/spaces/xxx' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '对话内容' }), {
      target: { value: '检查发布流程' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))

    expect(
      within(screen.getByRole('region', { name: '最近对话' })).getByRole(
        'link',
        { name: '检查发布流程' }
      )
    ).toBeInTheDocument()
  })

  it('reorders spaces by dragging a space handle onto another space', () => {
    render(<App />)

    for (const name of ['产品空间', '研发空间']) {
      fireEvent.click(screen.getByRole('button', { name: '空间操作' }))
      fireEvent.click(screen.getByRole('menuitem', { name: '新建空间' }))
      fireEvent.change(screen.getByRole('textbox', { name: '空间名称' }), {
        target: { value: name }
      })
      fireEvent.click(screen.getByRole('button', { name: '确认新建空间' }))
    }

    const productSpace = screen
      .getByRole('link', { name: '产品空间' })
      .closest('.space-entry')
    expect(productSpace).not.toBeNull()
    expect(productSpace).toHaveAttribute('draggable', 'true')

    const researchHandle = screen.getByLabelText('拖拽排序 研发空间')
    fireEvent.dragStart(researchHandle.closest('.space-entry') as HTMLElement)
    fireEvent.dragOver(productSpace as HTMLElement)
    fireEvent.drop(productSpace as HTMLElement)

    const section = screen.getByRole('region', { name: '空间' })
    expect(
      within(section)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['产品空间', '研发空间', 'xxx 空间', '测试需求'])
  })

  it('reorders requirements only inside their current space', () => {
    render(<App />)

    for (const name of ['需求 A', '需求 B']) {
      fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))
      fireEvent.click(screen.getByRole('menuitem', { name: '新建需求' }))
      fireEvent.change(screen.getByRole('textbox', { name: '需求名称' }), {
        target: { value: name }
      })
      fireEvent.click(screen.getByRole('button', { name: '确认新建需求' }))
    }

    const requirementA = screen
      .getByRole('link', { name: '需求 A' })
      .closest('li')
    expect(requirementA).not.toBeNull()
    expect(requirementA).toHaveAttribute('draggable', 'true')

    const requirementBHandle = screen.getByLabelText('拖拽排序 需求 B')
    fireEvent.dragStart(requirementBHandle.closest('li') as HTMLElement)
    fireEvent.dragOver(requirementA as HTMLElement)
    fireEvent.drop(requirementA as HTMLElement)

    expect(
      within(screen.getByRole('list', { name: 'xxx 空间需求' }))
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['需求 A', '需求 B', '测试需求'])
  })

  it('restores sidebar spaces, requirements, and their order after remounting', async () => {
    const repositories = createInMemoryRendererRepositories()
    const { unmount } = render(<App repositories={repositories} />)

    for (const name of ['产品空间', '研发空间']) {
      fireEvent.click(screen.getByRole('button', { name: '空间操作' }))
      fireEvent.click(screen.getByRole('menuitem', { name: '新建空间' }))
      fireEvent.change(screen.getByRole('textbox', { name: '空间名称' }), {
        target: { value: name }
      })
      fireEvent.click(screen.getByRole('button', { name: '确认新建空间' }))
    }

    const productSpace = screen
      .getByRole('link', { name: '产品空间' })
      .closest('.space-entry')
    const researchHandle = screen.getByLabelText('拖拽排序 研发空间')
    fireEvent.dragStart(researchHandle.closest('.space-entry') as HTMLElement)
    fireEvent.dragOver(productSpace as HTMLElement)
    fireEvent.drop(productSpace as HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建需求' }))
    fireEvent.change(screen.getByRole('textbox', { name: '需求名称' }), {
      target: { value: '持久化需求' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建需求' }))

    await vi.waitFor(() =>
      expect(
        repositories.workspaceNavigation
          .getSnapshot()
          .value.spaces.map((space) => space.label)
      ).toEqual(['产品空间', '研发空间', 'xxx 空间'])
    )
    unmount()
    render(<App repositories={repositories} />)

    const section = screen.getByRole('region', { name: '空间' })
    expect(
      within(section)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual([
      '产品空间',
      '研发空间',
      'xxx 空间',
      '持久化需求',
      '测试需求'
    ])
  })

  it('does not move a requirement into another space', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建空间' }))
    fireEvent.change(screen.getByRole('textbox', { name: '空间名称' }), {
      target: { value: '产品空间' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建空间' }))

    fireEvent.click(screen.getByRole('button', { name: '产品空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建需求' }))
    fireEvent.change(screen.getByRole('textbox', { name: '需求名称' }), {
      target: { value: '产品需求' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建需求' }))

    const productRequirement = screen
      .getByRole('link', { name: '产品需求' })
      .closest('li')
    const testRequirementHandle = screen.getByLabelText('拖拽排序 测试需求')
    fireEvent.dragStart(testRequirementHandle.closest('li') as HTMLElement)
    fireEvent.dragOver(productRequirement as HTMLElement)
    fireEvent.drop(productRequirement as HTMLElement)

    expect(
      within(screen.getByRole('list', { name: 'xxx 空间需求' }))
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['测试需求'])
    expect(
      within(screen.getByRole('list', { name: '产品空间需求' }))
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['产品需求'])
  })

  it('does not read business data from localStorage', () => {
    window.localStorage.setItem(
      'realmflow:workspace-navigation:v1',
      '{"version":1,"spaces":"invalid"}'
    )

    render(<App />)

    expect(screen.getByRole('link', { name: 'xxx 空间' })).toBeInTheDocument()
    expect(
      window.localStorage.getItem('realmflow:workspace-navigation:v1')
    ).toContain('"spaces":"invalid"')
  })

  it('opens a requirement detail page with the software lifecycle flow', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建需求' }))
    fireEvent.change(screen.getByRole('textbox', { name: '需求名称' }), {
      target: { value: '登录流程优化' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建需求' }))
    const spaceLink = screen.getByRole('link', { name: 'xxx 空间' })
    const requirementLink = screen.getByRole('link', { name: '登录流程优化' })
    fireEvent.click(requirementLink)

    const main = screen.getByRole('main')
    expect(spaceLink).not.toHaveClass('active')
    expect(requirementLink).toHaveClass('active')
    expect(
      within(
        screen.getByRole('banner', { name: '主工作区工具栏' })
      ).getByRole('tab', { name: '登录流程优化' })
    ).toBeInTheDocument()
    expect(
      within(main).getByRole('heading', { name: '软件全流程开发' })
    ).toBeInTheDocument()
        expect(
          screen.queryByRole('complementary', { name: '全局工作区' })
        ).not.toBeInTheDocument()
    const flow = main.querySelector('.development-flow-track')
    expect(flow).toBeInTheDocument()

    for (const stage of [
      '需求分析',
      '技术方案',
      '开发实现',
      '测试验证',
      '发布上线',
      '迭代复盘'
    ]) {
      expect(within(flow as HTMLElement).getByText(stage)).toBeInTheDocument()
    }

        const designStage = within(main).getByRole('button', {
          name: '打开技术方案阶段'
        })
        fireEvent.click(designStage)
        expect(designStage).toHaveAttribute('aria-pressed', 'true')
        expect(
          screen.getByRole('complementary', { name: '全局工作区' })
        ).toBeInTheDocument()
        expect(
          within(
            screen.getByRole('complementary', { name: '全局工作区' })
          ).getByRole('tab', { name: '登录流程优化' })
        ).toBeInTheDocument()
  })

  it('renders the default test requirement and highlights it on selection', () => {
    render(<App />)

    const spaceLink = screen.getByRole('link', { name: 'xxx 空间' })
    const requirementLink = screen.getByRole('link', { name: '测试需求' })
    fireEvent.click(requirementLink)

    expect(spaceLink).not.toHaveClass('active')
    expect(requirementLink).toHaveClass('active')
    expect(
      screen.getByRole('tab', { name: '测试需求' })
    ).toBeInTheDocument()
  })

  it('requires the exact requirement name before deleting a requirement', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '测试需求操作' }))
    expect(
      screen.getByRole('menu', { name: '测试需求操作' })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '删除需求' }))

    const dialog = screen.getByRole('dialog', { name: '删除需求' })
    const confirmation = within(dialog).getByRole('textbox', {
      name: '输入需求名称以确认'
    })
    const confirm = within(dialog).getByRole('button', {
      name: '确认删除需求'
    })

    expect(confirm).toHaveClass('ui-button', 'ui-button--danger')
    expect(
      within(dialog).getByText(
        '删除后，需求“测试需求”将被永久删除，且无法恢复。'
      )
    ).toBeInTheDocument()
    expect(confirm).toBeDisabled()

    fireEvent.change(confirmation, { target: { value: '错误名称' } })
    expect(confirm).toBeDisabled()

    fireEvent.change(confirmation, { target: { value: '测试需求' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    expect(
      screen.queryByRole('link', { name: '测试需求' })
    ).not.toBeInTheDocument()
  })

  it('updates a requirement name from its action menu', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '测试需求操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '更新名称' }))

    const dialog = screen.getByRole('dialog', { name: '更新需求名称' })
    const input = within(dialog).getByRole('textbox', { name: '更新后' })
    const confirm = within(dialog).getByRole('button', {
      name: '确认更新需求名称'
    })

    expect(within(dialog).getByText('当前名称：测试需求')).toBeInTheDocument()
    expect(confirm).toBeDisabled()

    fireEvent.change(input, { target: { value: '  新测试需求  ' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    expect(
      screen.getByRole('link', { name: '新测试需求' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '测试需求' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '新测试需求操作' })
    ).toBeInTheDocument()
  })

  it('opens a requirement menu above its trigger near the viewport bottom', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(768)
    render(<App />)

    const trigger = screen.getByRole('button', { name: '测试需求操作' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 730,
      top: 730,
      right: 240,
      bottom: 750,
      left: 200,
      width: 40,
      height: 20,
      toJSON: () => ({})
    })

    fireEvent.click(trigger)

    expect(
      screen.getByRole('menu', { name: '测试需求操作' })
    ).toHaveStyle({
      top: '639px',
      right: '784px'
    })
  })

  it('shows space icons and independently collapses each space', () => {
    const { container } = render(<App />)

    expect(container.querySelector('.spaces-heading-icon')).not.toBeInTheDocument()
    expect(container.querySelector('.space-icon')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建需求' }))
    fireEvent.change(screen.getByRole('textbox', { name: '需求名称' }), {
      target: { value: '登录流程优化' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建需求' }))

    expect(screen.queryByText('(1)')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: '折叠 xxx 空间需求' })
    )
    expect(
      screen.queryByRole('list', { name: 'xxx 空间需求' })
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: '展开 xxx 空间需求' })
    )
    expect(
      screen.getByRole('list', { name: 'xxx 空间需求' })
    ).toBeInTheDocument()
  })

  it('uses distinct space icons for expansion and requirement states', () => {
    render(<App />)

    const populatedSpace = screen.getByRole('link', { name: 'xxx 空间' })
    expect(populatedSpace.querySelector('svg')).toHaveClass(
      'lucide-folder-open-dot'
    )

    fireEvent.click(
      screen.getByRole('button', { name: '折叠 xxx 空间需求' })
    )
    expect(populatedSpace.querySelector('svg')).toHaveClass('lucide-folder-dot')

    fireEvent.click(screen.getByRole('button', { name: '空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建空间' }))
    fireEvent.change(screen.getByRole('textbox', { name: '空间名称' }), {
      target: { value: '空空间' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建空间' }))

    const emptySpace = screen.getByRole('link', { name: '空空间' })
    expect(emptySpace.querySelector('svg')).toHaveClass('lucide-folder-open')

    fireEvent.click(screen.getByRole('button', { name: '折叠 空空间需求' }))
    expect(emptySpace.querySelector('svg')).toHaveClass('lucide-folder-closed')
  })

  it('requires the exact space name before deleting the space and its requirements', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建需求' }))
    fireEvent.change(screen.getByRole('textbox', { name: '需求名称' }), {
      target: { value: '待删除需求' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建需求' }))

    fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除空间' }))

    const dialog = screen.getByRole('dialog', { name: '删除空间' })
    const confirmation = within(dialog).getByRole('textbox', {
      name: '输入空间名称以确认'
    })
    const confirm = within(dialog).getByRole('button', {
      name: '确认删除空间'
    })

    expect(
      within(dialog).getByText(
        '删除后，空间“xxx 空间”及空间下的所有需求都会被永久删除，且无法恢复。'
      )
    ).toBeInTheDocument()
    expect(confirm).toBeDisabled()

    fireEvent.change(confirmation, { target: { value: '错误名称' } })
    expect(confirm).toBeDisabled()

    fireEvent.change(confirmation, { target: { value: 'xxx 空间' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    expect(
      screen.queryByRole('link', { name: 'xxx 空间' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'xxx 空间需求' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('空间 (0)')).toBeInTheDocument()
  })

  it('updates a space name from its action menu', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '更新名称' }))

    const dialog = screen.getByRole('dialog', { name: '更新空间名称' })
    const input = within(dialog).getByRole('textbox', { name: '更新后' })
    const confirm = within(dialog).getByRole('button', {
      name: '确认更新空间名称'
    })

    expect(within(dialog).getByText('当前名称：xxx 空间')).toBeInTheDocument()
    expect(confirm).toBeDisabled()

    fireEvent.change(input, { target: { value: 'xxx 空间' } })
    expect(confirm).toBeDisabled()

    fireEvent.change(input, { target: { value: '研发空间' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    expect(
      screen.getByRole('link', { name: '研发空间' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'xxx 空间' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '研发空间操作' })
    ).toBeInTheDocument()
  })

  it('exposes space relocation from the space action menu', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))

    expect(
      screen.getByRole('menuitem', { name: '重新定位' })
    ).toBeInTheDocument()
  })

  it('exposes full space and requirement names as hover titles', () => {
    render(<App />)

    const longSpaceName = '这是一个用于验证超长名称省略展示的产品研发空间'
    const longRequirementName =
      '这是一个用于验证超长名称省略展示的登录流程优化需求'

    fireEvent.click(screen.getByRole('button', { name: '空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建空间' }))
    fireEvent.change(screen.getByRole('textbox', { name: '空间名称' }), {
      target: { value: longSpaceName }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建空间' }))

    expect(screen.getByTitle(longSpaceName)).toHaveTextContent(longSpaceName)

    fireEvent.click(
      screen.getByRole('button', { name: `${longSpaceName}操作` })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: '新建需求' }))
    fireEvent.change(screen.getByRole('textbox', { name: '需求名称' }), {
      target: { value: longRequirementName }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建需求' }))

    expect(screen.getByTitle(longRequirementName)).toHaveTextContent(
      longRequirementName
    )
  })

  it('groups requirement drag and menu controls in one hover overlay', () => {
    render(<App />)

    const requirementLink = screen.getByRole('link', { name: '测试需求' })
    const requirementRow = requirementLink.closest('li')
    const overlay = requirementRow?.querySelector('.requirement-row-actions')

    expect(overlay).not.toBeNull()
    expect(
      within(overlay as HTMLElement).getByLabelText('拖拽排序 测试需求')
    ).toBeInTheDocument()
    expect(
      within(overlay as HTMLElement).getByRole('button', {
        name: '测试需求操作'
      })
    ).toBeInTheDocument()
  })

  it('opens settings from the bottom user menu', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Qbian61/ }))
    const userMenu = screen.getByRole('menu', { name: '用户菜单' })
    expect(
      within(userMenu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim())
    ).toEqual([
      '语言简体中文',
      '主题跟随系统',
      '通用',
      '模型配置',
      '数据备份',
      'RealmFlow 官网',
      '检查更新',
      '帮助与反馈'
    ])

    fireEvent.click(screen.getByRole('menuitem', { name: '通用' }))

    expect(
      screen.getByRole('heading', { name: '通用', level: 2 })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '应用工作文件夹' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: '用户菜单' })).not.toBeInTheDocument()
  })

  it('routes update and help entries to their complete pages', () => {
    window.history.replaceState(null, '', '#/updates')
    const { unmount } = render(<App />)

    expect(
      screen.getByRole('heading', { name: '检查更新' })
    ).toBeInTheDocument()
    expect(screen.getByText('桌面更新服务当前不可用')).toBeInTheDocument()

    unmount()
    window.history.replaceState(null, '', '#/feedback')
    render(<App />)

    expect(
      screen.getByRole('heading', { name: '帮助与反馈' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '从空间开始' })).toBeInTheDocument()
  })

  it('removes dedicated appearance and language routes', () => {
    window.history.replaceState(null, '', '#/settings/appearance')

    const { unmount } = render(<App />)

    expect(
      screen.queryByRole('heading', { name: '设置' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '工作台' })).toHaveClass('active')

    unmount()
    window.history.replaceState(null, '', '#/settings/language')
    render(<App />)

    expect(
      screen.queryByRole('heading', { name: '设置' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '工作台' })).toHaveClass('active')
    window.history.replaceState(null, '', '#/')
  })

  it('hides the sidebar and keeps only its restore control visible', () => {
    render(<App />)

    const content = screen.getByTestId('app-content')
    const header = within(content).getByRole('banner', {
      name: '主工作区工具栏'
    })
    const body = content.querySelector('.app-content-body')
    const hideButton = screen.getByRole('button', { name: '隐藏菜单栏' })
    expect(header).toContainElement(hideButton)
    expect(body).not.toContainElement(hideButton)
    expect(hideButton.closest('.sidebar')).toBeNull()

    fireEvent.click(hideButton)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()

    const showButton = screen.getByRole('button', { name: '展示菜单栏' })
    expect(header).toContainElement(showButton)
    expect(showButton.closest('.sidebar')).toBeNull()

    fireEvent.click(showButton)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('places persistence status between the workspace header and page body', () => {
    render(<App degraded />)

    const content = screen.getByTestId('app-content')
    const regions = Array.from(content.children)

    expect(regions.map((region) => region.className)).toEqual([
      expect.stringContaining('app-content-header'),
      'persistence-notice',
      'app-content-body'
    ])
  })

  it('keeps schedule and requirement details mounted when the sidebar is hidden', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))
    fireEvent.click(screen.getByRole('button', { name: '隐藏菜单栏' }))

    const content = screen.getByTestId('app-content')
    expect(
      within(content).getByRole('tab', { name: '任务模板' })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展示菜单栏' }))
    fireEvent.click(screen.getByRole('link', { name: '测试需求' }))
    fireEvent.click(screen.getByRole('button', { name: '隐藏菜单栏' }))

    expect(
      within(content).getByRole('tab', { name: '测试需求' })
    ).toBeInTheDocument()
  })

  it('supports keyboard sidebar resizing and persists the width', () => {
    render(<App />)

    fireEvent.keyDown(screen.getByRole('separator', { name: '调整菜单栏宽度' }), {
      key: 'ArrowRight'
    })

    expect(screen.getByTestId('app-shell')).toHaveStyle({
      '--sidebar-width': '256px'
    })
    expect(window.localStorage.getItem('realmflow:sidebar-width')).toBe('256')
  })

  it('centers the sidebar drag target on the content border without width jumping', () => {
    render(<App />)

    const resizer = screen.getByRole('separator', { name: '调整菜单栏宽度' })
    expect(resizer.closest('.sidebar')).toBeNull()

    resizer.setPointerCapture = vi.fn()
    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 256
    })
    Object.defineProperty(pointerDown, 'pointerId', { value: 1 })
    fireEvent(resizer, pointerDown)
    fireEvent(
      resizer,
      new MouseEvent('pointermove', { bubbles: true, clientX: 300 })
    )

    expect(screen.getByTestId('app-shell')).toHaveStyle({
      '--sidebar-width': '292px'
    })
    expect(window.localStorage.getItem('realmflow:sidebar-width')).toBe('292')
  })

  it('keeps the middle workspace at least 320px wide while resizing the sidebar', () => {
    render(<App />)

    const shell = screen.getByTestId('app-shell')
    vi.spyOn(shell, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 700,
      height: 800,
      top: 0,
      right: 700,
      bottom: 800,
      left: 0,
      toJSON: () => ({})
    })

    const resizer = screen.getByRole('separator', { name: '调整菜单栏宽度' })
    resizer.setPointerCapture = vi.fn()
    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 256
    })
    Object.defineProperty(pointerDown, 'pointerId', { value: 1 })
    fireEvent(resizer, pointerDown)
    fireEvent(
      resizer,
      new MouseEvent('pointermove', { bubbles: true, clientX: 1000 })
    )

    expect(shell).toHaveStyle({ '--sidebar-width': '364px' })
  })

  it('opens the new chat composer and submits a prompt', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    expect(screen.queryByText('Code with RealmFlow')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '对话内容' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '审批模式' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '工作空间' })).toHaveValue('none')
    expect(screen.getByRole('combobox', { name: '权限模式' })).toHaveValue('default')

    fireEvent.change(screen.getByRole('textbox', { name: '对话内容' }), {
      target: { value: '帮我规划并开发一个应用' }
    })

    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))
    expect(
      await screen.findByRole('heading', { name: '帮我规划并开发一个应用' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/不使用空间知识 · AI 生成内容请核实/)
    ).toHaveClass('chat-session-subtitle-text')
  })

  it('shows templates directly in descending usage order', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '新对话' }))

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('toolbar', { name: '模板标签筛选' })).getAllByRole(
        'button'
      )[0]
    ).toHaveTextContent('全部')
    expect(
      within(screen.getByRole('region', { name: '热门模板' }))
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual([
      '创建模板',
      '代码审查助手',
      'API 文档生成器',
      '需求全流程自动化',
      '前端组件生成器',
      '项目日报 / 周报',
      '缺陷定位助手',
      '技术方案生成器',
      '数据库设计助手',
      '发布检查清单',
      '性能分析助手',
      '测试用例自动生成',
      '数据迁移方案'
    ])
    const codeReviewCard = screen
      .getByRole('heading', { name: '代码审查助手' })
      .closest('article')
    expect(codeReviewCard).not.toBeNull()
    expect(within(codeReviewCard!).getByText('代码审查')).toBeInTheDocument()
    expect(within(codeReviewCard!).getByText('· 使用 860 次')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建模板' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导入' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '使用代码审查助手' })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '技术方案' }))
    expect(
      within(screen.getByRole('region', { name: '热门模板' }))
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(['创建模板', '技术方案生成器'])
  })

  it('opens and closes the add-content menu', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '新对话' }))

    fireEvent.click(screen.getByRole('button', { name: '打开添加菜单' }))
    const menu = screen.getByRole('menu', { name: '添加内容' })
    expect(menu).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '添加文件' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '模式' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '技能' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '连接器' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '添加内容' })).not.toBeInTheDocument()
  })

  it('renders the schedule management sections', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))

    expect(
      screen.getByRole('heading', { level: 1, name: '定时任务' })
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '任务模板' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      screen.getByRole('tab', { name: '进行中任务 (0)' })
    ).toHaveAttribute('aria-selected', 'false')
    expect(
      screen.queryByRole('heading', { name: '为你推荐' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '工作周报' })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '进行中任务 (0)' }))
    expect(
      screen.queryByRole('heading', { name: '进行中' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('tabpanel', { name: '进行中任务 (0)' })
    ).toBeInTheDocument()
    const createButton = screen.getByRole('button', { name: '新建任务' })
    expect(
      screen.queryByRole('textbox', { name: '定时任务描述' })
    ).not.toBeInTheDocument()

    fireEvent.click(createButton)

    const dialog = screen.getByRole('dialog', { name: '新建定时任务' })
    expect(
      within(dialog).getByRole('textbox', { name: '定时任务描述' })
    ).toBeInTheDocument()
  })

  it('closes the schedule creation dialog with Escape and the backdrop', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))

    const createButton = screen.getByRole('button', { name: '新建任务' })
    fireEvent.click(createButton)
    expect(
      screen.getByRole('dialog', { name: '新建定时任务' })
    ).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.queryByRole('dialog', { name: '新建定时任务' })
    ).not.toBeInTheDocument()

    fireEvent.click(createButton)
    const reopenedDialog = screen.getByRole('dialog', {
      name: '新建定时任务'
    })
    fireEvent.mouseDown(reopenedDialog.parentElement!)
    expect(
      screen.queryByRole('dialog', { name: '新建定时任务' })
    ).not.toBeInTheDocument()
  })

  it('searches templates by name, content, and tag', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    const search = screen.getByRole('searchbox', { name: '搜索模板' })

    fireEvent.change(search, { target: { value: '数据库设计助手' } })
    expect(screen.getByRole('heading', { name: '数据库设计助手' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '代码审查助手' })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '安全风险' } })
    expect(screen.getByRole('heading', { name: '代码审查助手' })).toBeInTheDocument()

    fireEvent.change(search, { target: { value: '文档撰写' } })
    expect(screen.getByRole('heading', { name: '项目日报 / 周报' })).toBeInTheDocument()
  })

  it('creates a template with placeholders', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    fireEvent.click(screen.getByRole('button', { name: '新建模板' }))

    expect(screen.getByRole('dialog', { name: '创建模板' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '模板名称' }), {
      target: { value: '接口设计模板' }
    })
    const tagInput = screen.getByLabelText('所属标签')
    expect(tagInput).toHaveAttribute('list', 'existing-template-tags')
    expect(
      document.querySelector('#existing-template-tags option[value="技术方案"]')
    ).toBeInTheDocument()
    fireEvent.change(tagInput, {
      target: { value: '接口设计' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '模板提示词' }), {
      target: { value: '请分析' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '占位符名称' }), {
      target: { value: '接口需求' }
    })
    fireEvent.click(screen.getByRole('button', { name: '添加占位符' }))
    expect(screen.getByRole('textbox', { name: '模板提示词' })).toHaveValue(
      '请分析 {{接口需求}}'
    )

    fireEvent.click(screen.getByRole('button', { name: '保存模板' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '接口设计模板' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '接口设计' })).toBeInTheDocument()
  })

  it('replaces template placeholders and fills the composer', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '新对话' }))
    fireEvent.click(screen.getByRole('button', { name: '打开模板 代码审查助手' }))

    expect(screen.getByRole('dialog', { name: '代码审查助手' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '占位符 代码变更' }), {
      target: { value: '修改用户登录逻辑' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '占位符 审查重点' }), {
      target: { value: '安全性和异常处理' }
    })
    fireEvent.click(screen.getByRole('button', { name: '使用' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '对话内容' })).toHaveValue(
      '请审查以下代码变更：修改用户登录逻辑\n重点关注：安全性和异常处理'
    )
  })
})
