import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { vi } from 'vitest'
import type { RealmFlowApi } from '../../../shared/types'
import {
  WorkbenchProvider,
  useWorkbench
} from './WorkbenchProvider'

vi.mock('../artifacts/ArtifactWorkbench', () => ({
  default: () => <textarea aria-label="工作区编辑内容" defaultValue="" />
}))

vi.mock('./TerminalPane', () => ({
  default: ({ title }: { title: string }) => (
    <div aria-label={title}>Terminal</div>
  )
}))

function TestPage(): JSX.Element {
  const navigate = useNavigate()
  const workbench = useWorkbench()
  return (
    <main>
      <button type="button" onClick={() => void workbench.openFiles()}>
        打开测试文件
      </button>
      <button type="button" onClick={() => void workbench.openFolder()}>
        打开测试文件夹
      </button>
      <button type="button" onClick={() => void workbench.openUrl('example.com')}>
        打开测试网页
      </button>
      <button type="button" onClick={() => void workbench.openUrl()}>
        请求打开网页
      </button>
      <a href="https://realmflow.example/docs">网页产物</a>
      <a href="#/next">应用菜单</a>
      <button type="button" onClick={() => navigate('/next')}>
        切换页面
      </button>
    </main>
  )
}

function createApi(): RealmFlowApi {
  return {
    platform: 'darwin',
    getSidecarStatus: vi.fn().mockResolvedValue('ready'),
    quitApp: vi.fn().mockResolvedValue(undefined),
    workspace: {
      chooseFiles: vi.fn().mockResolvedValue({
        binding: {
          requirementId: 'session-files',
          rootName: 'selected',
          rootPath: '/tmp/selected'
        },
        files: [
          {
            name: 'notes.md',
            path: 'notes.md',
            content: '# Notes',
            kind: 'markdown',
            language: 'markdown',
            size: 7,
            modifiedAt: 1,
            version: '1:7'
          }
        ]
      }),
      chooseFolder: vi.fn().mockResolvedValue({
        requirementId: 'session-folder',
        rootName: 'project',
        rootPath: '/tmp/project'
      }),
      chooseDirectory: vi.fn().mockResolvedValue(null),
      getBinding: vi.fn().mockResolvedValue(null),
      listDirectory: vi.fn().mockResolvedValue([]),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readManifest: vi.fn().mockResolvedValue({
        version: 1,
        requirementId: 'session-files',
        stages: {}
      }),
      writeManifest: vi.fn(),
      getPreviewUrl: vi.fn(),
      showItem: vi.fn()
    },
    webWorkbench: {
      create: vi.fn().mockResolvedValue({
        id: 'web-1',
        title: 'Example',
        url: 'https://example.com/',
        loading: false,
        canGoBack: false,
        canGoForward: false
      }),
      show: vi.fn().mockResolvedValue(undefined),
      hideAll: vi.fn().mockResolvedValue(undefined),
      setBounds: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      destroy: vi.fn(),
      openExternal: vi.fn(),
      onStateChange: vi.fn().mockReturnValue(() => undefined)
    },
    terminal: {
      create: vi.fn().mockResolvedValue({
        id: 'terminal-1',
        title: '终端 · project',
        cwd: '/tmp/project'
      }),
      write: vi.fn().mockResolvedValue(undefined),
      resize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn().mockReturnValue(() => undefined)
    }
  }
}

function addNativeOverlayApi(api: RealmFlowApi) {
  const nativeOverlay = {
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn().mockReturnValue(() => undefined)
  }
  return {
    api: Object.assign(api, { nativeOverlay }),
    nativeOverlay
  }
}

describe('WorkbenchProvider', () => {
  it('keeps the page-edge toggle visible and opens an empty global dock', async () => {
    const api = createApi()
    render(
      <MemoryRouter initialEntries={['/']}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route path="/" element={<TestPage />} />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>
    )

    expect(
      screen.queryByRole('complementary', { name: '全局工作区' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '打开文件' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '打开文件夹' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '打开网页' })
    ).not.toBeInTheDocument()

    const openButton = screen.getByRole('button', { name: '打开工作区' })
    expect(openButton.closest('.global-workbench-page')).not.toBeNull()
    expect(openButton.querySelector('svg')).toHaveAttribute('width', '18')
    expect(openButton.querySelector('svg')).toHaveAttribute('stroke-width', '1.8')
    fireEvent.click(openButton)

    expect(
      screen.getByRole('complementary', { name: '全局工作区' })
    ).toBeInTheDocument()
    expect(screen.getByText('从这里开始')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '文件 浏览和预览文件' }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: '文件夹 浏览文件夹目录' }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: '浏览器 浏览及调试网页' }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: '终端 运行命令及脚本' }))
      .toBeInTheDocument()

    const closeButton = screen.getByRole('button', { name: '收起工作区' })
    expect(closeButton.closest('.global-workbench-page')).not.toBeNull()
    expect(closeButton.closest('.global-workbench-header')).toBeNull()
    expect(closeButton.querySelector('svg')).toHaveAttribute('width', '18')
    expect(closeButton.querySelector('svg')).toHaveAttribute('stroke-width', '1.8')
    fireEvent.click(closeButton)

    expect(
      screen.queryByRole('complementary', { name: '全局工作区' })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开测试文件' }))

    expect(
      await screen.findByRole('complementary', { name: '全局工作区' })
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'selected' })).toBeInTheDocument()
  })

  it('keeps the middle and right workspaces above their minimum widths while resizing', () => {
    const api = createApi()
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <WorkbenchProvider api={api}>
          <div className="app-shell">
            <aside className="sidebar" />
            <main
              className="app-content"
              style={{ marginLeft: 8, marginRight: 0 }}
            />
          </div>
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开工作区' }))

    const layout = container.querySelector(
      '.global-workbench-layout'
    ) as HTMLDivElement
    vi.spyOn(layout, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
      top: 0,
      right: 1200,
      bottom: 800,
      left: 0,
      toJSON: () => ({})
    })
    const sidebar = container.querySelector('.sidebar') as HTMLElement
    vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 248,
      height: 800,
      top: 0,
      right: 248,
      bottom: 800,
      left: 0,
      toJSON: () => ({})
    })

    const resizer = screen.getByRole('separator', {
      name: '调整全局工作区宽度'
    })
    fireEvent.mouseDown(resizer, { clientX: 560 })
    fireEvent.mouseMove(window, { clientX: 0 })
    expect(layout).toHaveStyle({ '--global-workbench-width': '620px' })

    fireEvent.mouseMove(window, { clientX: 1000 })
    expect(layout).toHaveStyle({ '--global-workbench-width': '448px' })
    fireEvent.mouseUp(window)
  })

  it('opens folders and web pages as reusable tabs', async () => {
    const api = createApi()
    render(
      <MemoryRouter initialEntries={['/']}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route path="/" element={<TestPage />} />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开测试文件夹' }))
    expect(await screen.findByRole('tab', { name: 'project' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开测试网页' }))
    expect(await screen.findByRole('tab', { name: 'Example' })).toBeInTheDocument()
    expect(api.webWorkbench.create).toHaveBeenCalledWith('example.com')
  })

  it('keeps the add button fixed after the scrollable tab list', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开测试文件夹' }))
    await screen.findByRole('tab', { name: 'project' })

    const tabList = screen.getByRole('tablist')
    const addButton = screen.getByRole('button', { name: '添加工作区内容' })
    const tabBar = tabList.closest('.global-workbench-tabbar')
    const maximizeButton = screen.getByRole('button', {
      name: '最大化工作区'
    })

    expect(tabBar).not.toBeNull()
    expect(tabBar?.closest('.global-workbench-header')).not.toBeNull()
    expect(addButton.parentElement?.parentElement).toBe(tabBar)
    expect(addButton.closest('.global-workbench-tabs')).toBeNull()
    expect(maximizeButton.closest('.global-workbench-header')).not.toBeNull()
  })

  it('opens the native workbench menu from the plus button', async () => {
    const { api, nativeOverlay } = addNativeOverlayApi(createApi())
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开工作区' }))
    const addButton = screen.getByRole('button', {
      name: '添加工作区内容'
    })
    vi.spyOn(addButton, 'getBoundingClientRect').mockReturnValue({
      x: 651,
      y: 16,
      width: 34,
      height: 34,
      top: 16,
      right: 685,
      bottom: 50,
      left: 651,
      toJSON: () => ({})
    })
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(nativeOverlay.show).toHaveBeenCalledWith({
        kind: 'workbench-menu',
        anchor: {
          x: 651,
          y: 16,
          width: 34,
          height: 34
        }
      })
    })
    expect(
      screen.queryByRole('menu', { name: '添加工作区内容' })
    ).not.toBeInTheDocument()
  })

  it('keeps the native web view visible while the plus menu is open', async () => {
    const { api, nativeOverlay } = addNativeOverlayApi(createApi())
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开测试网页' }))
    await screen.findByRole('tab', { name: 'Example' })
    await waitFor(() => {
      expect(api.webWorkbench.show).toHaveBeenCalled()
    })
    vi.mocked(api.webWorkbench.hideAll).mockClear()
    vi.mocked(api.webWorkbench.show).mockClear()

    const addButton = screen.getByRole('button', {
      name: '添加工作区内容'
    })
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(nativeOverlay.show).toHaveBeenCalledTimes(1)
    })
    expect(api.webWorkbench.hideAll).not.toHaveBeenCalled()
  })

  it('opens the native workbench action menu with Cmd+P', async () => {
    const { api, nativeOverlay } = addNativeOverlayApi(createApi())
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开工作区' }))
    fireEvent.keyDown(window, { key: 'p', metaKey: true })

    await waitFor(() => {
      expect(nativeOverlay.show).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'workbench-menu' })
      )
    })
  })

  it('opens an interactive terminal in a newly authorized folder', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开工作区' }))
    fireEvent.click(screen.getByRole('button', { name: '终端 运行命令及脚本' }))

    await waitFor(() => {
      expect(api.workspace.chooseFolder).toHaveBeenCalledTimes(1)
      expect(api.terminal.create).toHaveBeenCalledWith('session-folder', {
        cols: 80,
        rows: 24
      })
    })
    expect(screen.getByRole('tab', { name: '终端 · project' }))
      .toBeInTheDocument()
    expect(screen.getByLabelText('终端 · project')).toBeInTheDocument()
  })

  it('maximizes and restores the workbench panel', () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开工作区' }))
    const panel = screen.getByRole('complementary', { name: '全局工作区' })
    fireEvent.click(screen.getByRole('button', { name: '最大化工作区' }))
    expect(panel.closest('.global-workbench-layout')).toHaveClass('maximized')

    fireEvent.click(screen.getByRole('button', { name: '还原工作区' }))
    expect(panel.closest('.global-workbench-layout')).not.toHaveClass('maximized')
  })

  it('opens page web links inside the global workbench', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('link', { name: '网页产物' }))

    await waitFor(() => {
      expect(api.webWorkbench.create).toHaveBeenCalledWith(
        'https://realmflow.example/docs'
      )
    })
    expect(screen.getByRole('tab', { name: 'Example' })).toBeInTheDocument()
  })

  it('does not intercept application hash routes', () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('link', { name: '应用菜单' }))

    expect(api.webWorkbench.create).not.toHaveBeenCalled()
  })

  it('collects a web address in an application dialog', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <WorkbenchProvider api={api}>
          <TestPage />
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '请求打开网页' }))
    const dialog = screen.getByRole('dialog', { name: '打开网页' })
    fireEvent.change(screen.getByRole('textbox', { name: '网页地址' }), {
      target: { value: 'https://example.com' }
    })
    fireEvent.click(screen.getByRole('button', { name: '打开' }))

    await waitFor(() => {
      expect(api.webWorkbench.create).toHaveBeenCalledWith('https://example.com')
    })
    expect(dialog).not.toBeInTheDocument()
  })

  it('keeps the workbench open with its tabs and edited content after route navigation', async () => {
    const api = createApi()
    render(
      <MemoryRouter initialEntries={['/']}>
        <WorkbenchProvider api={api}>
          <Routes>
            <Route path="/" element={<TestPage />} />
            <Route path="/next" element={<TestPage />} />
          </Routes>
        </WorkbenchProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开测试文件' }))
    await screen.findByRole('tab', { name: 'selected' })
    fireEvent.change(screen.getByRole('textbox', { name: '工作区编辑内容' }), {
      target: { value: '未保存内容' }
    })
    vi.mocked(api.webWorkbench.hideAll).mockClear()
    fireEvent.click(screen.getByRole('button', { name: '切换页面' }))

    await waitFor(() => {
      expect(
        screen.getByRole('complementary', { name: '全局工作区' })
      ).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'selected' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '工作区编辑内容' })).toHaveValue(
      '未保存内容'
    )
    expect(api.webWorkbench.hideAll).not.toHaveBeenCalled()
  })
})
