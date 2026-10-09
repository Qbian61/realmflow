import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import { vi } from 'vitest'
import type {
  TerminalApi,
  TerminalEvent,
  TerminalSession
} from '../../../../shared/terminal'
import type { WorkspaceApi } from '../../../../shared/workspace'
import { LocalizationProvider } from '../../../localization/LocalizationProvider'
import {
  TerminalWorkbenchPage,
  type TerminalSurfaceProps
} from './TerminalWorkbenchPage'

const TestSurface: ComponentType<TerminalSurfaceProps> = ({
  title,
  output,
  active,
  colorScheme,
  fontSize
}) => (
  <div
    aria-label={title}
    data-active={active}
    data-color-scheme={colorScheme}
    data-font-size={fontSize}
  >
    {output}
  </div>
)

describe('TerminalWorkbenchPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('opens the user home folder session only after Main confirms it', async () => {
    let resolveCreate:
      | ((session: Awaited<ReturnType<TerminalApi['createHome']>>) => void)
      | undefined
    const workspace = workspaceApi()
    const terminal = terminalApi({
      createHome: vi.fn(
        () =>
          new Promise<TerminalSession>((resolve) => {
            resolveCreate = resolve
          })
      )
    })
    renderPage(workspace, terminal)

    fireEvent.click(screen.getByRole('button', { name: '新建终端会话' }))
    expect(workspace.chooseFolder).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(terminal.createHome).toHaveBeenCalledWith({
        cols: 80,
        rows: 24
      })
    )
    expect(screen.queryByRole('button', { name: /project/ })).toBeNull()

    await act(async () => {
      resolveCreate?.({
        id: 'terminal-1',
        title: 'project',
        cwd: '/tmp/project',
        shell: 'zsh'
      })
    })
    expect(
      screen.getByRole('button', { name: /^project,/ })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^project,/ })
      .closest('.workbench-navigation-item')).toHaveAttribute(
        'data-active',
        'true'
      )
    expect(
      screen.getByLabelText('拖拽排序 project')
    ).toBeInTheDocument()
    const close = screen.getByRole('button', { name: '关闭 project' })
    expect(close).toHaveClass('danger')
    expect(close).toHaveAttribute('title', '删除')
    expect(close.querySelector('svg')).toHaveAttribute('height', '13')
    expect(close.querySelector('.lucide-trash2')).toBeInTheDocument()
    expect(close.querySelector('.lucide-x')).toBeNull()
  })

  it('keeps per-session output, renames locally, reports exit, and destroys on close', async () => {
    let emit: (event: TerminalEvent) => void = () => undefined
    const terminal = terminalApi({
      onEvent: vi.fn((listener) => {
        emit = listener
        return vi.fn()
      })
    })
    renderPage(workspaceApi(), terminal)
    fireEvent.click(screen.getByRole('button', { name: '新建终端会话' }))
    await screen.findByRole('button', { name: /^project,/ })

    act(() => emit({ sessionId: 'terminal-1', type: 'data', data: 'ready' }))
    expect(screen.getByLabelText('project')).toHaveTextContent('ready')

    fireEvent.doubleClick(
      screen.getByRole('button', { name: /^project,/ })
    )
    const input = screen.getByRole('textbox', { name: '重命名终端会话' })
    fireEvent.change(input, { target: { value: 'API server' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(
      screen.getByRole('button', { name: /^API server,/ })
    ).toBeInTheDocument()

    act(() =>
      emit({ sessionId: 'terminal-1', type: 'exit', exitCode: 7 })
    )
    expect(screen.getByText('已退出 (7)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭 API server' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^API server,/ })).toBeNull()
    )
    expect(terminal.destroy).not.toHaveBeenCalled()
  })

  it('destroys running sessions when closed or when the page unmounts', async () => {
    const terminal = terminalApi()
    const { unmount } = renderPage(workspaceApi(), terminal)
    fireEvent.click(screen.getByRole('button', { name: '新建终端会话' }))
    await screen.findByRole('button', { name: /^project,/ })

    fireEvent.click(screen.getByRole('button', { name: '关闭 project' }))
    await waitFor(() =>
      expect(terminal.destroy).toHaveBeenCalledWith('terminal-1')
    )

    vi.mocked(terminal.createHome).mockResolvedValueOnce({
      id: 'terminal-2',
      title: 'worker',
      cwd: '/tmp/worker',
      shell: 'zsh'
    })
    fireEvent.click(screen.getByRole('button', { name: '新建终端会话' }))
    await screen.findByRole('button', { name: /^worker,/ })
    unmount()
    expect(terminal.destroy).toHaveBeenCalledWith('terminal-2')
  })

  it('requests the approved dark terminal canvas for workbench sessions', async () => {
    const Surface: ComponentType<TerminalSurfaceProps> = (props) => (
      <div
        aria-label={props.title}
        data-color-scheme={
          (props as TerminalSurfaceProps & { colorScheme?: string }).colorScheme
        }
      />
    )
    render(
      <LocalizationProvider>
        <TerminalWorkbenchPage
          terminalApi={terminalApi()}
          Surface={Surface}
          active
        />
      </LocalizationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '新建终端会话' }))
    expect(await screen.findByLabelText('project')).toHaveAttribute(
      'data-color-scheme',
      'dark'
    )
  })

  it('shares persisted theme and font size controls across sessions', async () => {
    renderPage(workspaceApi(), terminalApi())
    fireEvent.click(screen.getByRole('button', { name: '新建终端会话' }))
    const surface = await screen.findByLabelText('project')

    expect(surface).toHaveAttribute('data-color-scheme', 'dark')
    expect(surface).toHaveAttribute('data-font-size', '12')
    fireEvent.click(screen.getByRole('button', { name: '亮色终端主题' }))
    fireEvent.click(screen.getByRole('button', { name: '增大终端字体' }))

    expect(surface).toHaveAttribute('data-color-scheme', 'light')
    expect(surface).toHaveAttribute('data-font-size', '13')
    expect(screen.getByRole('region', { name: '工具内容' })
      .querySelector('.terminal-workbench-content')).toHaveAttribute(
        'data-terminal-color-scheme',
        'light'
      )
    expect(
      JSON.parse(
        window.localStorage.getItem(
          'realmflow:terminal-display-preferences:v1'
        )!
      )
    ).toMatchObject({ colorScheme: 'light', fontSize: 13 })
  })

  it('uses an icon-only create button in the split footer', () => {
    renderPage(workspaceApi(), terminalApi())

    expect(screen.getByRole('button', { name: '新建终端会话' }))
      .toHaveTextContent(/^$/)
  })

  it('does not open a reorder menu when the drag handle is clicked', async () => {
    const terminal = terminalApi({
      createHome: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'terminal-1',
          title: 'project',
          cwd: '/Users/tester',
          shell: 'zsh'
        })
        .mockResolvedValueOnce({
          id: 'terminal-2',
          title: 'worker',
          cwd: '/Users/tester',
          shell: 'zsh'
        })
    })
    renderPage(workspaceApi(), terminal)
    fireEvent.click(screen.getByRole('button', { name: '新建终端会话' }))
    await screen.findByRole('button', { name: /^project,/ })
    fireEvent.click(screen.getByRole('button', { name: '新建终端会话' }))
    await screen.findByRole('button', { name: /^worker,/ })
    const handle = screen.getByLabelText('拖拽排序 project')

    fireEvent.click(handle)

    expect(handle.tagName).toBe('SPAN')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(
      screen.getAllByRole('button', { name: /^(project|worker),/ })
        .map((button) => button.getAttribute('aria-label')?.split(',')[0])
    ).toEqual(['project', 'worker'])
  })
})

function renderPage(workspace: WorkspaceApi, terminal: TerminalApi) {
  void workspace
  return render(
    <LocalizationProvider>
      <TerminalWorkbenchPage
        terminalApi={terminal}
        Surface={TestSurface}
        active
      />
    </LocalizationProvider>
  )
}

function workspaceApi(): WorkspaceApi {
  return {
    chooseFolder: vi.fn().mockResolvedValue({
      requirementId: 'session-folder',
      rootName: 'project',
      rootPath: '/tmp/project'
    })
  } as unknown as WorkspaceApi
}

function terminalApi(overrides: Partial<TerminalApi> = {}): TerminalApi {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'terminal-1',
      title: 'project',
      cwd: '/tmp/project',
      shell: 'zsh'
    }),
    createHome: vi.fn().mockResolvedValue({
      id: 'terminal-1',
      title: 'project',
      cwd: '/Users/tester',
      shell: 'zsh'
    }),
    write: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    onEvent: vi.fn(() => vi.fn()),
    ...overrides
  }
}
