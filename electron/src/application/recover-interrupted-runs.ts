import { transitionAiRun } from '../../../domain/ai-run'
import type { AiRunRepository } from './ports/business-repositories'

const INTERRUPTION_MESSAGE =
  'Application restarted before the AI run completed'

export class RecoverInterruptedRunsUseCase {
  constructor(private readonly runs: AiRunRepository) {}

  async execute(): Promise<number> {
    const unfinished = await this.runs.listUnfinished()
    let recovered = 0
    for (const run of unfinished) {
      const updated = await this.runs.update(run.id, (current) => ({
        ...transitionAiRun(current, 'interrupted'),
        error: INTERRUPTION_MESSAGE
      }))
      if (updated?.status === 'interrupted') recovered += 1
    }
    return recovered
  }
}
