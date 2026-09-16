import { fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { CHAT_SESSION_STORAGE_KEY } from './features/sessions/session-store'

describe('RealmFlow navigation', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the main navigation entries', () => {
    render(<App />)

    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAccessibleName('工作台')
    expect(links[1]).toHaveAccessibleName('新对话')
    expect(screen.getByRole('link', { name: '技能 · 连接器' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '统计分析' })).toBeInTheDocument()
    expect(screen.getByText('空间 (1)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'xxx 空间' })).toBeInTheDocument()
    expect(screen.queryByText('域流工作台')).not.toBeInTheDocument()
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

    for (const [linkName, headingName] of [
      ['定时任务', '进行中'],
      ['技能 · 连接器', '技能 · 连接器'],
      ['统计分析', '统计分析']
    ]) {
      fireEvent.click(screen.getByRole('link', { name: linkName }))
      expect(
        within(screen.getByTestId('app-content')).getByRole('heading', {
          name: headingName
        })
      ).toBeInTheDocument()
      expect(workbench).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '收起工作区' })).toBeInTheDocument()
    }
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

  it('opens a compact space overview with chat and requirement statistics', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: 'xxx 空间' }))

    const content = screen.getByTestId('app-content')
    expect(
      within(content).queryByRole('heading', { name: 'xxx 空间' })
    ).not.toBeInTheDocument()
    expect(
      within(content).queryByRole('button', { name: '空间详情操作' })
    ).not.toBeInTheDocument()
    expect(
      within(content).getByRole('tab', { name: 'xxx 空间 (1)' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      within(content).getByRole('tab', { name: '空间知识库 (0)' })
    ).toBeInTheDocument()
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
    expect(within(content).getByText('AI 生成内容请核实')).toBeInTheDocument()
    expect(within(messages).queryByText('你')).not.toBeInTheDocument()
    const executionInfo = within(messages).getByLabelText('RealmFlow 执行信息')
    expect(
      executionInfo.querySelector('img.chat-execution-logo')
    ).toHaveAttribute('src', expect.stringContaining('logo.png'))
    expect(within(executionInfo).getByText('RealmFlow')).toBeInTheDocument()
    expect(within(executionInfo).getByText('任务耗时 1s')).toBeInTheDocument()
    expect(
      within(messages).getAllByLabelText('RealmFlow 执行信息')
    ).toHaveLength(1)
    expect(
      within(content).getByText('如何设计空间内的需求管理流程？')
    ).toBeInTheDocument()
    expect(
      within(content).getByRole('button', { name: '如何调整需求优先级？' })
    ).toBeInTheDocument()

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

  it('repairs empty current session storage with test conversations', () => {
    window.localStorage.setItem(
      CHAT_SESSION_STORAGE_KEY,
      JSON.stringify({ version: 4, sessions: [] })
    )

    render(<App />)

    const recent = screen.getByRole('region', { name: '最近对话' })
    expect(within(recent).getByRole('link', { name: '测试对话' })).toBeInTheDocument()
    expect(
      within(recent).getByRole('link', { name: '测试对话 2' })
    ).toBeInTheDocument()
  })

  it('shows a non-blocking status when workspace persistence is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable')
    })

    render(<App />)

    expect(
      await screen.findByRole('status', { name: '本地存储状态' })
    ).toHaveTextContent('当前更改暂时无法保存')
    expect(screen.getByRole('link', { name: '新对话' })).toBeInTheDocument()
  })

  it('lists persisted conversations from every space under recent', () => {
    const { unmount } = render(<App />)

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
      screen.getByRole('heading', { name: '梳理登录流程优化方案' })
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('app-content')).getByText('xxx 空间')
    ).toBeInTheDocument()

    unmount()
    render(<App />)

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

  it('persists online documents and code repositories in a space', () => {
    const { unmount } = render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'xxx 空间' }))
    fireEvent.click(screen.getByRole('tab', { name: /^空间知识库/ }))

    fireEvent.click(screen.getByRole('button', { name: '添加在线文档' }))
    let dialog = screen.getByRole('dialog', { name: '添加在线文档' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '资源名称' }), {
      target: { value: 'RealmFlow 技术方案' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '文档地址' }), {
      target: { value: 'https://docs.example.com/realmflow' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认添加' }))

    fireEvent.click(screen.getByRole('button', { name: '关联代码仓库' }))
    dialog = screen.getByRole('dialog', { name: '关联代码仓库' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '资源名称' }), {
      target: { value: 'realmflow' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '仓库地址' }), {
      target: { value: 'https://github.com/example/realmflow' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认添加' }))

    expect(screen.getByText('RealmFlow 技术方案')).toBeInTheDocument()
    expect(screen.getByText('realmflow')).toBeInTheDocument()

    unmount()
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'xxx 空间' }))
    fireEvent.click(screen.getByRole('tab', { name: /^空间知识库/ }))

    expect(screen.getByText('RealmFlow 技术方案')).toBeInTheDocument()
    expect(screen.getByText('realmflow')).toBeInTheDocument()
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

    const researchHandle = screen.getByRole('button', {
      name: '拖动 研发空间'
    })
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

    const requirementBHandle = screen.getByRole('button', {
      name: '拖动 需求 B'
    })
    fireEvent.dragStart(requirementBHandle.closest('li') as HTMLElement)
    fireEvent.dragOver(requirementA as HTMLElement)
    fireEvent.drop(requirementA as HTMLElement)

    expect(
      within(screen.getByRole('list', { name: 'xxx 空间需求' }))
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['需求 A', '需求 B', '测试需求'])
  })

  it('restores sidebar spaces, requirements, and their order after remounting', () => {
    const { unmount } = render(<App />)

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
    const researchHandle = screen.getByRole('button', {
      name: '拖动 研发空间'
    })
    fireEvent.dragStart(researchHandle.closest('.space-entry') as HTMLElement)
    fireEvent.dragOver(productSpace as HTMLElement)
    fireEvent.drop(productSpace as HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: 'xxx 空间操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建需求' }))
    fireEvent.change(screen.getByRole('textbox', { name: '需求名称' }), {
      target: { value: '持久化需求' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认新建需求' }))

    unmount()
    render(<App />)

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
    const testRequirementHandle = screen.getByRole('button', {
      name: '拖动 测试需求'
    })
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

  it('repairs invalid persisted sidebar data with the default navigation', () => {
    window.localStorage.setItem(
      'realmflow:workspace-navigation:v1',
      '{"version":1,"spaces":"invalid"}'
    )

    render(<App />)

    expect(screen.getByRole('link', { name: 'xxx 空间' })).toBeInTheDocument()
    expect(
      window.localStorage.getItem('realmflow:workspace-navigation:v1')
    ).not.toContain('"spaces":"invalid"')
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
      within(main).getByRole('heading', { name: '登录流程优化' })
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
        expect(screen.getByRole('tab', { name: '登录流程优化' })).toBeInTheDocument()
  })

  it('renders the default test requirement and highlights it on selection', () => {
    render(<App />)

    const spaceLink = screen.getByRole('link', { name: 'xxx 空间' })
    const requirementLink = screen.getByRole('link', { name: '测试需求' })
    fireEvent.click(requirementLink)

    expect(spaceLink).not.toHaveClass('active')
    expect(requirementLink).toHaveClass('active')
    expect(
      within(screen.getByRole('main')).getByRole('heading', {
        name: '测试需求'
      })
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

  it('opens settings from the bottom user menu', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Qbian61/ }))
    expect(screen.getByRole('menu', { name: '用户菜单' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: '设置' }))

    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByText('调整应用与模型偏好')).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: '用户菜单' })).not.toBeInTheDocument()
  })

  it('hides the sidebar and keeps only its restore control visible', () => {
    render(<App />)

    const hideButton = screen.getByRole('button', { name: '隐藏菜单栏' })
    expect(hideButton.closest('.sidebar')).toBeNull()

    fireEvent.click(hideButton)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()

    const showButton = screen.getByRole('button', { name: '展示菜单栏' })
    expect(showButton.closest('.sidebar')).toBeNull()

    fireEvent.click(showButton)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('keeps schedule and requirement details mounted when the sidebar is hidden', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))
    fireEvent.click(screen.getByRole('button', { name: '隐藏菜单栏' }))

    const content = screen.getByTestId('app-content')
    expect(
      within(content).getByRole('heading', { name: '进行中' })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展示菜单栏' }))
    fireEvent.click(screen.getByRole('link', { name: '测试需求' }))
    fireEvent.click(screen.getByRole('button', { name: '隐藏菜单栏' }))

    expect(
      within(content).getByRole('heading', { name: '测试需求' })
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

  it('opens the new chat composer and submits a prompt', () => {
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
    expect(screen.getByText('已准备处理：帮我规划并开发一个应用')).toBeInTheDocument()
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

  it('renders the schedule list sections', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))

    expect(
      screen.queryByRole('heading', { name: '定时任务' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '进行中' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '为你推荐' })).toBeInTheDocument()
    expect(screen.getByText('每日项目摘要')).toBeInTheDocument()
    expect(screen.getByText('工作周报')).toBeInTheDocument()
    const createButton = screen.getByRole('button', { name: '新建定时任务' })
    expect(createButton).toHaveClass('schedule-create-fab')
    expect(createButton).toHaveAttribute('title', '新建定时任务')
    expect(createButton).not.toHaveTextContent('新建定时任务')
    expect(
      screen.queryByRole('textbox', { name: '定时任务描述' })
    ).not.toBeInTheDocument()

    fireEvent.click(createButton)

    const dialog = screen.getByRole('dialog', { name: '新建定时任务' })
    const taskPrompt = within(dialog).getByRole('textbox', {
      name: '定时任务描述'
    })
    fireEvent.change(taskPrompt, { target: { value: '每周五生成项目复盘' } })
    fireEvent.click(
      within(dialog).getByRole('button', { name: '创建定时任务' })
    )

    expect(
      screen.queryByRole('dialog', { name: '新建定时任务' })
    ).not.toBeInTheDocument()
    const activeSchedules = screen.getByRole('region', { name: '进行中' })
    expect(
      within(activeSchedules).getAllByRole('heading', { level: 3 })[0]
    ).toHaveTextContent('每周五生成项目复盘')
  })

  it('closes the schedule creation dialog with Escape and the backdrop', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '定时任务' }))

    const createButton = screen.getByRole('button', { name: '新建定时任务' })
    fireEvent.click(createButton)
    expect(
      screen.getByRole('dialog', { name: '新建定时任务' })
    ).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.queryByRole('dialog', { name: '新建定时任务' })
    ).not.toBeInTheDocument()

    fireEvent.click(createButton)
    fireEvent.click(screen.getByTestId('schedule-dialog-backdrop'))
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
