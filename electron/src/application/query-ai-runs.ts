import type { AiRun, AiRunEvent } from '../../../domain/ai-run'
import type { AiRunRepository } from './ports/business-repositories'

export class GetAiRunUseCase {
  constructor(private readonly runs: AiRunRepository) {}

  execute(runId: string): Promise<AiRun | undefined> {
    return this.runs.get(runId)
  }
}

export class ListAiRunEventsUseCase {
  constructor(private readonly runs: AiRunRepository) {}

  execute(runId: string): Promise<AiRunEvent[]> {
    return this.runs.listEvents(runId)
  }
}
