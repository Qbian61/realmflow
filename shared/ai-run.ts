import type { AiRun, AiRunEvent } from '../domain/ai-run'
import type { RequirementStageId } from '../domain/requirement'

type StartAiRunBase = {
  requirementId: string
  modelProfileId?: string
}

export type StartAiRunInput =
  | (StartAiRunBase & {
      nodeId: string
      nodeRunId: string
      stageId?: RequirementStageId
    })
  | (StartAiRunBase & {
      stageId: RequirementStageId
      nodeId?: never
      nodeRunId?: string
    })

export type CancelAiRunInput = {
  runId: string
}

export type GetAiRunInput = {
  runId: string
}

export type ListAiRunEventsInput = {
  runId: string
}

export interface AiRunApi {
  start: (input: StartAiRunInput) => Promise<{ runId: string }>
  cancel: (runId: string) => Promise<void>
  get: (runId: string) => Promise<AiRun | undefined>
  attach: (
    runId: string
  ) => Promise<{ run: AiRun | undefined; events: AiRunEvent[] }>
  listEvents: (runId: string) => Promise<AiRunEvent[]>
  onEvent: (listener: (event: AiRunEvent) => void) => () => void
}

export type { AiRunEvent } from '../domain/ai-run'
