import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import type { TerminalApi } from '../../../shared/terminal'
import { ThemeProvider, useTheme } from '../../theme/ThemeProvider'
import TerminalPane from './TerminalPane'

const terminalMocks = vi.hoisted(() => {
  const instances: Array<{
    options: Record<string, unknown>
    loadAddon: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    onData: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    reset: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    cols: number
    rows: number
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

function ThemeToggle(): JSX.Element {
  const { setTheme } = useTheme()
  return (
    <button type="button" onClick={() => setTheme('dark')}>
      dark
    </button>
  )
}

function terminalApi(): TerminalApi {
  return {
    create: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    subscribe: vi.fn()
  } as unknown as TerminalApi
}

describe('TerminalPane theme', () => {
  beforeEach(() => {
    terminalMocks.instances.length = 0
    window.localStorage.setItem(
      'realmflow:terminal-display-preferences:v1',
      JSON.stringify({
        version: 1,
        colorScheme: 'light',
        fontSize: 12
      })
    )
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe = vi.fn()
        disconnect = vi.fn()
      }
    )
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  })

  it('creates xterm with the resolved light palette', async () => {
    render(
      <ThemeProvider>
        <TerminalPane
          api={terminalApi()}
          sessionId="terminal-1"
          title="Terminal"
          output=""
          active
        />
      </ThemeProvider>
    )

    await waitFor(() => expect(terminalMocks.instances).toHaveLength(1))
    expect(terminalMocks.instances[0].options.theme).toEqual(
      expect.objectContaining({
        background: '#ffffff',
        foreground: '#242424'
      })
    )
  })

  it('keeps the shared terminal palette independent from the app theme', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
        <TerminalPane
          api={terminalApi()}
          sessionId="terminal-1"
          title="Terminal"
          output=""
          active
        />
      </ThemeProvider>
    )
    await waitFor(() => expect(terminalMocks.instances).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'dark' }))

    expect(terminalMocks.instances).toHaveLength(1)
    expect(terminalMocks.instances[0].options.theme).toEqual(
      expect.objectContaining({
        background: '#ffffff',
        foreground: '#242424'
      })
    )
  })
})
