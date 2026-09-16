import { useCallback, useEffect, useRef, type Dispatch } from 'react'
import type { RealmFlowApi } from '../../../../shared/types'
import type { TerminalEvent } from '../../../../shared/terminal'
import type {
  WorkbenchAction,
  WorkbenchTab
} from '../../../application/workbench/workbench-reducer'

export function useTerminalSessions({
  api,
  dispatch,
  activateTab
}: {
  api?: RealmFlowApi
  dispatch: Dispatch<WorkbenchAction>
  activateTab: (tab: WorkbenchTab) => void
}): {
  openTerminal: () => Promise<void>
  closeTerminal: (id: string, exited: boolean) => Promise<void>
} {
  const terminalBufferRef = useRef(new Map<string, string>())
  const terminalIdsRef = useRef(new Set<string>())

  useEffect(
    () =>
      api?.terminal.onEvent((event: TerminalEvent) => {
        if (
          event.type === 'data' &&
          !terminalIdsRef.current.has(event.sessionId)
        ) {
          const buffered =
            terminalBufferRef.current.get(event.sessionId) ?? ''
          terminalBufferRef.current.set(
            event.sessionId,
            `${buffered}${event.data}`.slice(-1024 * 1024)
          )
          return
        }
        dispatch({ type: 'terminal-event-received', event })
      }),
    [api, dispatch]
  )

  const openTerminal = useCallback(async (): Promise<void> => {
    if (!api) return
    const binding = await api.workspace.chooseFolder()
    if (!binding) return
    const session = await api.terminal.create(binding.requirementId, {
      cols: 80,
      rows: 24
    })
    terminalIdsRef.current.add(session.id)
    const output = terminalBufferRef.current.get(session.id) ?? ''
    terminalBufferRef.current.delete(session.id)
    activateTab({
      id: session.id,
      type: 'terminal',
      label: session.title,
      session,
      output,
      exited: false
    })
  }, [activateTab, api])

  const closeTerminal = useCallback(
    async (id: string, exited: boolean): Promise<void> => {
      if (!exited) await api?.terminal.destroy(id)
      terminalIdsRef.current.delete(id)
      terminalBufferRef.current.delete(id)
    },
    [api]
  )

  return { openTerminal, closeTerminal }
}
