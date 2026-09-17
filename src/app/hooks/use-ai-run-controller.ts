import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiRun, AiRunEvent, AiRunStatus } from '../../../domain/ai-run'
import type { RequirementStageId } from '../../../domain/requirement'
import type { AiRunApi, StartAiRunInput } from '../../../shared/ai-run'

export type AiRunView = {
  runId: string
  requirementId: string
  nodeId?: string
  stageId?: RequirementStageId
  status: AiRunStatus
  progress: number
  content: string
  error: string
}

export type AiRunController = {
  runs: Record<string, AiRunView>
  start: (input: StartAiRunInput) => Promise<string>
  attach: (runId: string) => Promise<void>
  cancel: (runId: string) => Promise<void>
  findRun: (requirementId: string, nodeId: string) => AiRunView | undefined
}

export function useAiRunController(api?: AiRunApi): AiRunController {
  const [runs, setRuns] = useState<Record<string, AiRunView>>({})
  const runsRef = useRef(runs)
  const pendingEvents = useRef(new Map<string, AiRunEvent[]>())
  runsRef.current = runs

  useEffect(() => {
    if (!api) return
    return api.onEvent((event) => {
      setRuns((current) => {
        const run = current[event.runId]
        if (!run) {
          const pending = pendingEvents.current.get(event.runId) ?? []
          pending.push(event)
          pendingEvents.current.set(event.runId, pending)
          return current
        }
        return {
          ...current,
          [event.runId]: applyEvent(run, event)
        }
      })
    })
  }, [api])

  const start = useCallback(
    async (input: StartAiRunInput): Promise<string> => {
      if (!api) throw new Error('AI run service is unavailable')
      const { runId } = await api.start(input)
      setRuns((current) => {
        let run: AiRunView = current[runId] ?? {
          runId,
          requirementId: input.requirementId,
          ...('nodeId' in input && input.nodeId
            ? { nodeId: input.nodeId }
            : {}),
          ...('stageId' in input && input.stageId
            ? { stageId: input.stageId }
            : {}),
          status: 'created',
          progress: 0,
          content: '',
          error: ''
        }
        for (const event of pendingEvents.current.get(runId) ?? []) {
          run = applyEvent(run, event)
        }
        pendingEvents.current.delete(runId)
        return { ...current, [runId]: run }
      })
      return runId
    },
    [api]
  )

  const attach = useCallback(
    async (runId: string): Promise<void> => {
      if (!api) throw new Error('AI run service is unavailable')
      const snapshot = await api.attach(runId)
      if (!snapshot.run) return
      setRuns((current) => {
        let run = hydrateRun(snapshot.run!, snapshot.events)
        for (const event of pendingEvents.current.get(runId) ?? []) {
          if (event.sequence > snapshot.run!.lastSequence) {
            run = applyEvent(run, event)
          }
        }
        pendingEvents.current.delete(runId)
        return { ...current, [runId]: run }
      })
    },
    [api]
  )

  const cancel = useCallback(
    async (runId: string): Promise<void> => {
      if (!api) throw new Error('AI run service is unavailable')
      setRuns((current) => {
        const run = current[runId]
        if (!run || isTerminal(run.status)) return current
        return {
          ...current,
          [runId]: { ...run, status: 'cancelling' }
        }
      })
      await api.cancel(runId)
    },
    [api]
  )

  const findRun = useCallback(
    (requirementId: string, nodeId: string) =>
      Object.values(runs).find(
        (run) => run.requirementId === requirementId && run.nodeId === nodeId
      ),
    [runs]
  )

  return { runs, start, attach, cancel, findRun }
}

function hydrateRun(run: AiRun, events: AiRunEvent[]): AiRunView {
  const progress = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === 'run.progress' && typeof event.data.progress === 'number'
    )?.data.progress
  return {
    runId: run.id,
    requirementId: run.requirementId,
    ...(run.nodeId ? { nodeId: run.nodeId } : {}),
    ...(run.stageId ? { stageId: run.stageId } : {}),
    status: run.status,
    progress:
      run.status === 'completed'
        ? 100
        : typeof progress === 'number'
          ? progress
          : 0,
    content: run.content,
    error: run.error ?? ''
  }
}

function applyEvent(run: AiRunView, event: AiRunEvent): AiRunView {
  switch (event.type) {
    case 'run.started':
      return { ...run, status: 'running' }
    case 'run.progress':
      return {
        ...run,
        progress:
          typeof event.data.progress === 'number'
            ? event.data.progress
            : run.progress
      }
    case 'content.delta':
      return {
        ...run,
        content: run.content + (event.data.delta ?? '')
      }
    case 'run.completed':
      return { ...run, status: 'completed', progress: 100 }
    case 'run.failed':
      return {
        ...run,
        status: 'failed',
        error: event.data.message ?? '阶段产物生成失败'
      }
    case 'run.cancelled':
      return { ...run, status: 'cancelled' }
    case 'artifact.ready':
    case 'heartbeat':
      return run
  }
}

function isTerminal(status: AiRunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
