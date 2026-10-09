import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react'
import {
  initialToastState,
  toastReducer
} from './toast-reducer'
import type {
  ToastLevel,
  ToastRequest
} from './toast-types'
import { ToastViewport } from './ToastViewport'
import './toast.css'

const TOAST_DURATION_MS = 3_000

type ToastOptions = Omit<ToastRequest, 'level' | 'messageKey'>
type LevelPublisher = (
  messageKey: ToastRequest['messageKey'],
  options?: ToastOptions
) => string

export type ToastApi = {
  publish: (request: ToastRequest) => string
  success: LevelPublisher
  info: LevelPublisher
  warning: LevelPublisher
  error: LevelPublisher
  system: LevelPublisher
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({
  children
}: {
  children: ReactNode
}): JSX.Element {
  const [state, dispatch] = useReducer(toastReducer, initialToastState)
  const [pausedHeadId, setPausedHeadId] = useState<string>()
  const sequenceRef = useRef(0)
  const head = state.queue[0]

  const publish = useCallback((request: ToastRequest): string => {
    sequenceRef.current += 1
    const id = `toast-${Date.now()}-${sequenceRef.current}`
    dispatch({
      type: 'enqueue',
      message: {
        ...request,
        id,
        createdAt: Date.now()
      }
    })
    return id
  }, [])

  const dismiss = useCallback((id: string): void => {
    dispatch({ type: 'remove', id })
  }, [])

  const publishLevel = useCallback(
    (level: ToastLevel): LevelPublisher =>
      (messageKey, options = {}) =>
        publish({ ...options, level, messageKey }),
    [publish]
  )

  const value = useMemo<ToastApi>(
    () => ({
      publish,
      success: publishLevel('success'),
      info: publishLevel('info'),
      warning: publishLevel('warning'),
      error: publishLevel('error'),
      system: publishLevel('system'),
      dismiss
    }),
    [dismiss, publish, publishLevel]
  )

  useEffect(() => {
    if (!head || pausedHeadId === head.id) return
    const timeout = window.setTimeout(() => {
      dispatch({ type: 'remove-head' })
    }, TOAST_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [head, pausedHeadId])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        messages={state.queue}
        headId={head?.id}
        onDismiss={dismiss}
        onPauseHead={setPausedHeadId}
        onResumeHead={() => setPausedHeadId(undefined)}
      />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
