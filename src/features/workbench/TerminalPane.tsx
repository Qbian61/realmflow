import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { TerminalApi } from '../../../shared/terminal'

type TerminalPaneProps = {
  api: TerminalApi
  sessionId: string
  title: string
  output: string
  active: boolean
}

export default function TerminalPane({
  api,
  sessionId,
  title,
  output,
  active
}: TerminalPaneProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal>()
  const fitAddonRef = useRef<FitAddon>()
  const writtenLengthRef = useRef(0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily:
        '"SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: '#ffffff',
        foreground: '#242424',
        cursor: '#242424',
        selectionBackground: '#d9d9d9',
        black: '#2b2b2b',
        red: '#c54242',
        green: '#4b8b3b',
        yellow: '#a57522',
        blue: '#3366a8',
        magenta: '#8b4f96',
        cyan: '#27858b',
        white: '#d8d8d8',
        brightBlack: '#777777',
        brightWhite: '#222222'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    const inputDisposable = terminal.onData((data) => {
      void api.write(sessionId, data)
    })

    const fit = (): void => {
      if (!host.isConnected || host.clientWidth === 0 || host.clientHeight === 0) {
        return
      }
      fitAddon.fit()
      void api.resize(sessionId, {
        cols: terminal.cols,
        rows: terminal.rows
      })
    }
    const resizeObserver = new ResizeObserver(fit)
    resizeObserver.observe(host)
    requestAnimationFrame(fit)

    return () => {
      resizeObserver.disconnect()
      inputDisposable.dispose()
      terminal.dispose()
      terminalRef.current = undefined
      fitAddonRef.current = undefined
      writtenLengthRef.current = 0
    }
  }, [api, sessionId])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    if (output.length < writtenLengthRef.current) {
      terminal.reset()
      writtenLengthRef.current = 0
    }
    const nextOutput = output.slice(writtenLengthRef.current)
    if (nextOutput) terminal.write(nextOutput)
    writtenLengthRef.current = output.length
  }, [output])

  useLayoutEffect(() => {
    if (!active) return
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      terminalRef.current?.focus()
    })
  }, [active])

  return (
    <div
      className="global-terminal-pane"
      aria-label={title}
      ref={hostRef}
    />
  )
}
