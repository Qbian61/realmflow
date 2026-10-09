import { render, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import type { TerminalApi } from '../../../shared/terminal'
import { ThemeProvider } from '../../theme/ThemeProvider'
import TerminalSurface from './TerminalSurface'

const terminalMocks = vi.hoisted(() => {
  const instances: Array<{
    options: Record<string, unknown>
    focus: ReturnType<typeof vi.fn>
  }> = []
  return { instances, fit: vi.fn() }
})

vi.mock('@xterm/xterm', () => ({
  Terminal: class Terminal {
    options: Record<string, unknown>
    loadAddon = vi.fn()
    open = vi.fn()
    onData = vi.fn(() => ({ dispose: vi.fn() }))
    dispose = vi.fn()
    write = vi.fn()
    reset = vi.fn()
    focus = vi.fn()
    cols = 80
    rows = 24

    constructor(options: Record<string, unknown>) {
      this.options = options
      terminalMocks.instances.push(this)
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FitAddon {
    fit = terminalMocks.fit
  }
}))

function terminalApi(): TerminalApi {
  return {
    create: vi.fn(),
    createHome: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    onEvent: vi.fn()
  }
}

describe('TerminalSurface', () => {
  beforeEach(() => {
    terminalMocks.instances.length = 0
    terminalMocks.fit.mockClear()
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe = vi.fn()
        disconnect = vi.fn()
      }
    )
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  it('fits and focuses the existing terminal when it becomes active', async () => {
    const { rerender } = render(
      <ThemeProvider>
        <TerminalSurface
          api={terminalApi()}
          sessionId="terminal-1"
          title="Terminal"
          output=""
          active={false}
        />
      </ThemeProvider>
    )
    await waitFor(() => expect(terminalMocks.instances).toHaveLength(1))
    terminalMocks.fit.mockClear()

    rerender(
      <ThemeProvider>
        <TerminalSurface
          api={terminalApi()}
          sessionId="terminal-1"
          title="Terminal"
          output=""
          active
        />
      </ThemeProvider>
    )

    expect(terminalMocks.fit).toHaveBeenCalled()
    expect(terminalMocks.instances[0].focus).toHaveBeenCalled()
  })

  it('uses the approved dark canvas when embedded in the workbench hub', async () => {
    const props = {
      api: terminalApi(),
      sessionId: 'terminal-workbench',
      title: 'Workbench terminal',
      output: '',
      active: true,
      colorScheme: 'dark' as const
    }
    const { container } = render(
      <ThemeProvider>
        <TerminalSurface {...props} />
      </ThemeProvider>
    )

    await waitFor(() => expect(terminalMocks.instances).toHaveLength(1))
    expect(terminalMocks.instances[0].options.theme).toMatchObject({
      background: '#171717',
      foreground: '#ededed'
    })
    expect(container.firstElementChild).toHaveAttribute(
      'data-terminal-color-scheme',
      'dark'
    )
  })

  it('updates theme and font size without recreating the terminal', async () => {
    const api = terminalApi()
    const { container, rerender } = render(
      <ThemeProvider>
        <TerminalSurface
          api={api}
          sessionId="terminal-preferences"
          title="Preferences terminal"
          output=""
          active
          colorScheme="dark"
          fontSize={12}
        />
      </ThemeProvider>
    )
    await waitFor(() => expect(terminalMocks.instances).toHaveLength(1))
    terminalMocks.fit.mockClear()

    rerender(
      <ThemeProvider>
        <TerminalSurface
          api={api}
          sessionId="terminal-preferences"
          title="Preferences terminal"
          output=""
          active
          colorScheme="light"
          fontSize={14}
        />
      </ThemeProvider>
    )

    expect(terminalMocks.instances).toHaveLength(1)
    expect(terminalMocks.instances[0].options.theme).toMatchObject({
      background: '#ffffff'
    })
    expect(terminalMocks.instances[0].options.fontSize).toBe(14)
    expect(terminalMocks.fit).toHaveBeenCalled()
    expect(container.firstElementChild).toHaveAttribute(
      'data-terminal-font-size',
      '14'
    )
  })
})
