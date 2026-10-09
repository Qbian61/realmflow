import {
  Minus,
  Moon,
  Plus,
  SquareTerminal,
  Sun,
  Trash2
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ComponentType
} from 'react'
import type {
  TerminalApi,
  TerminalEvent,
  TerminalSession
} from '../../../../shared/terminal'
import { useLocalization } from '../../../localization/LocalizationProvider'
import {
  beginNativeDrag,
  finishNativeDrag
} from '../../drag/native-drag-feedback'
import { DragHandle } from '../../drag/DragHandle'
import type { TerminalSurfaceProps } from '../../workbench/TerminalSurface'
import { useTerminalDisplayPreferences } from '../../workbench/terminal-display-preferences'
import { WorkbenchNavigationItem } from '../WorkbenchNavigationItem'
import { WorkbenchSplitPage } from '../WorkbenchSplitPage'
import {
  createTerminalSessionState,
  terminalSessionReducer
} from './terminal-session-reducer'

const LazyTerminalSurface = lazy(() => import('../../workbench/TerminalSurface'))

export type { TerminalSurfaceProps }

type TerminalWorkbenchPageProps = {
  terminalApi?: TerminalApi
  Surface?: ComponentType<TerminalSurfaceProps>
  active?: boolean
}

export function TerminalWorkbenchPage({
  terminalApi = window.realmflow?.terminal,
  Surface,
  active = true
}: TerminalWorkbenchPageProps): JSX.Element {
  const { t } = useLocalization()
  const [state, dispatch] = useReducer(
    terminalSessionReducer,
    undefined,
    createTerminalSessionState
  )
  const [renamingId, setRenamingId] = useState<string>()
  const [renameValue, setRenameValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(false)
  const [draggedSessionId, setDraggedSessionId] = useState<string>()
  const [dropTargetSessionId, setDropTargetSessionId] = useState<string>()
  const { preferences, update: updatePreferences } =
    useTerminalDisplayPreferences()
  const runningIdsRef = useRef(new Set<string>())
  const bufferedEventsRef = useRef(new Map<string, TerminalEvent[]>())
  const terminalApiRef = useRef(terminalApi)
  terminalApiRef.current = terminalApi

  useEffect(() => {
    if (!terminalApi) return
    return terminalApi.onEvent((event) => {
      if (!runningIdsRef.current.has(event.sessionId)) {
        const buffered = bufferedEventsRef.current.get(event.sessionId) ?? []
        buffered.push(event)
        bufferedEventsRef.current.set(event.sessionId, buffered)
        return
      }
      if (event.type === 'exit') runningIdsRef.current.delete(event.sessionId)
      dispatch({ type: 'terminal-event-received', event })
    })
  }, [terminalApi])

  useEffect(
    () => () => {
      for (const sessionId of runningIdsRef.current) {
        void terminalApiRef.current?.destroy(sessionId)
      }
      runningIdsRef.current.clear()
      bufferedEventsRef.current.clear()
    },
    []
  )

  const createSession = async (): Promise<void> => {
    if (!terminalApi || creating) return
    setCreating(true)
    setError(false)
    try {
      const session = await terminalApi.createHome({
        cols: 80,
        rows: 24
      })
      runningIdsRef.current.add(session.id)
      dispatch({ type: 'session-opened', session })
      for (const event of bufferedEventsRef.current.get(session.id) ?? []) {
        if (event.type === 'exit') runningIdsRef.current.delete(session.id)
        dispatch({ type: 'terminal-event-received', event })
      }
      bufferedEventsRef.current.delete(session.id)
    } catch {
      setError(true)
    } finally {
      setCreating(false)
    }
  }

  const closeSession = async (session: TerminalSession & {
    status: 'running' | 'exited'
  }): Promise<void> => {
    if (session.status === 'running') {
      try {
        await terminalApi?.destroy(session.id)
      } catch {
        setError(true)
        return
      }
    }
    runningIdsRef.current.delete(session.id)
    bufferedEventsRef.current.delete(session.id)
    dispatch({ type: 'session-closed', sessionId: session.id })
  }

  const commitRename = (): void => {
    if (!renamingId) return
    dispatch({
      type: 'session-renamed',
      sessionId: renamingId,
      title: renameValue
    })
    setRenamingId(undefined)
  }

  const ActiveSurface = Surface ?? LazyTerminalSurface
  const activeSession = state.sessions.find(
    ({ id }) => id === state.activeSessionId
  )

  return (
    <WorkbenchSplitPage
      navigation={
        <div className="terminal-session-list">
          {state.sessions.map((session, index) => (
            <WorkbenchNavigationItem
              className="terminal-session-item"
              active={session.id === state.activeSessionId}
              editing={renamingId === session.id}
              dragging={draggedSessionId === session.id}
              dropTarget={dropTargetSessionId === session.id}
              key={session.id}
              primary={renamingId === session.id ? (
                <input name="workbench-hub-terminal-rename" autoComplete="off"
                  autoFocus
                  aria-label={t('workbenchHub.terminal.rename')}
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRename()
                    if (event.key === 'Escape') setRenamingId(undefined)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="terminal-session-select"
                  aria-label={`${session.title}, ${session.shell}, ${t(
                    session.status === 'running'
                      ? 'workbenchHub.terminal.running'
                      : 'workbenchHub.terminal.exited',
                    { code: session.exitCode ?? 0 }
                  )}`}
                  title={`${session.title}, ${session.shell}, ${t(
                    session.status === 'running'
                      ? 'workbenchHub.terminal.running'
                      : 'workbenchHub.terminal.exited',
                    { code: session.exitCode ?? 0 }
                  )}`}
                  onClick={() =>
                    dispatch({
                      type: 'session-selected',
                      sessionId: session.id
                    })
                  }
                  onDoubleClick={() => {
                    setRenamingId(session.id)
                    setRenameValue(session.title)
                  }}
                >
                  <SquareTerminal size={15} />
                  <span>
                    <strong>{session.title}</strong>
                    <small>{session.shell}</small>
                  </span>
                </button>
              )}
              actions={
                <>
                  <DragHandle
                    name={session.title}
                    draggable
                    onDragStart={(event) => {
                      beginNativeDrag(
                        event,
                        event.currentTarget.closest(
                          '.workbench-navigation-item'
                        )!
                      )
                      setDraggedSessionId(session.id)
                    }}
                    onDragEnd={(event) => {
                      finishNativeDrag(
                        event.currentTarget.closest<HTMLElement>(
                          '.workbench-navigation-item'
                        )
                      )
                      setDraggedSessionId(undefined)
                      setDropTargetSessionId(undefined)
                    }}
                  />
                  <button
                    type="button"
                    className="terminal-session-close danger"
                    aria-label={t('workbenchHub.terminal.close', {
                      name: session.title
                    })}
                    title={t("tooltip.delete")}
                    onClick={() => void closeSession(session)}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              }
              onDragOver={(event) => {
                event.preventDefault()
                setDropTargetSessionId(session.id)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (draggedSessionId) {
                  const sourceIndex = state.sessions.findIndex(
                    ({ id }) => id === draggedSessionId
                  )
                  dispatch({
                    type: 'session-moved',
                    sessionId: draggedSessionId,
                    targetIndex: sourceIndex < index ? index - 1 : index
                  })
                }
                finishNativeDrag(
                  event.currentTarget.parentElement?.querySelector(
                    '[data-dragging="true"]'
                  )
                )
                setDraggedSessionId(undefined)
                setDropTargetSessionId(undefined)
              }}
            />
          ))}
        </div>
      }
      createLabel={t('workbenchHub.terminal.create')}
      createIconOnly
      onCreate={() => void createSession()}
    >
      <div
        className="terminal-workbench-content"
        aria-busy={creating}
        data-terminal-color-scheme={preferences.colorScheme}
      >
        {error ? (
          <div className="terminal-workbench-error" role="alert">
            {t('workbenchHub.terminal.error')}
            {state.sessions.length > 0 ? (
              <span className="workbench-stale-note">
                {t('workbenchHub.stale')}
              </span>
            ) : null}
          </div>
        ) : null}
        {activeSession ? (
          <>
            <header className="terminal-workbench-header">
              <div className="terminal-workbench-title">
                <strong>{activeSession.title}</strong>
                <span>
                  {activeSession.status === 'running'
                    ? t('workbenchHub.terminal.localSession')
                    : t('workbenchHub.terminal.exited', {
                        code: activeSession.exitCode ?? 0
                      })}
                </span>
              </div>
              <div
                className="terminal-display-controls"
                role="group"
                aria-label={t('workbenchHub.terminal.displaySettings')}
              >
                <button
                  type="button"
                  aria-label={t('workbenchHub.terminal.lightTheme')}
                  title={t('workbenchHub.terminal.lightTheme')}
                  aria-pressed={preferences.colorScheme === 'light'}
                  onClick={() =>
                    updatePreferences({ colorScheme: 'light' })
                  }
                >
                  <Sun size={14} />
                </button>
                <button
                  type="button"
                  aria-label={t('workbenchHub.terminal.darkTheme')}
                  title={t('workbenchHub.terminal.darkTheme')}
                  aria-pressed={preferences.colorScheme === 'dark'}
                  onClick={() =>
                    updatePreferences({ colorScheme: 'dark' })
                  }
                >
                  <Moon size={14} />
                </button>
                <span className="terminal-display-divider" />
                <button
                  type="button"
                  aria-label={t('workbenchHub.terminal.decreaseFont')}
                  title={t('workbenchHub.terminal.decreaseFont')}
                  disabled={preferences.fontSize <= 10}
                  onClick={() =>
                    updatePreferences({
                      fontSize: preferences.fontSize - 1
                    })
                  }
                >
                  <Minus size={14} />
                </button>
                <output aria-label={t('workbenchHub.terminal.fontSize')}>
                  {preferences.fontSize}
                </output>
                <button
                  type="button"
                  aria-label={t('workbenchHub.terminal.increaseFont')}
                  title={t('workbenchHub.terminal.increaseFont')}
                  disabled={preferences.fontSize >= 20}
                  onClick={() =>
                    updatePreferences({
                      fontSize: preferences.fontSize + 1
                    })
                  }
                >
                  <Plus size={14} />
                </button>
              </div>
            </header>
            <div className="terminal-workbench-surfaces">
              {state.sessions.map((session) => (
                <div
                  className="terminal-workbench-surface"
                  hidden={session.id !== state.activeSessionId}
                  key={session.id}
                >
                  <Suspense
                    fallback={
                      <div className="terminal-workbench-loading">
                        {t('workbench.terminalStarting')}
                      </div>
                    }
                  >
                    <ActiveSurface
                      api={terminalApi!}
                      sessionId={session.id}
                      title={session.title}
                      output={session.output}
                      colorScheme={preferences.colorScheme}
                      fontSize={preferences.fontSize}
                      active={
                        active &&
                        session.id === state.activeSessionId &&
                        session.status === 'running'
                      }
                      className="terminal-workbench-xterm"
                    />
                  </Suspense>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="terminal-workbench-empty">
            <SquareTerminal size={28} />
            <strong>{t('workbenchHub.terminal.empty')}</strong>
            <span>{t('workbenchHub.terminal.emptyHint')}</span>
          </div>
        )}
      </div>
    </WorkbenchSplitPage>
  )
}
