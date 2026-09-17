import {
  createAiRun,
  transitionAiRun,
  type AiRunStatus
} from './ai-run'

describe('AiRun', () => {
  it.each<[AiRunStatus, AiRunStatus]>([
    ['created', 'running'],
    ['created', 'cancelling'],
    ['created', 'failed'],
    ['running', 'cancelling'],
    ['running', 'completed'],
    ['running', 'failed'],
    ['running', 'cancelled'],
    ['created', 'interrupted'],
    ['running', 'interrupted'],
    ['cancelling', 'cancelled'],
    ['cancelling', 'failed'],
    ['cancelling', 'interrupted']
  ])('allows %s -> %s', (from, to) => {
    const run = { ...createAiRun('run-1', 'requirement-1', 'analysis'), status: from }

    expect(transitionAiRun(run, to).status).toBe(to)
  })

  it.each<[AiRunStatus, AiRunStatus]>([
    ['created', 'completed'],
    ['cancelling', 'completed'],
    ['completed', 'running'],
    ['failed', 'running'],
    ['cancelled', 'running'],
    ['interrupted', 'running']
  ])('rejects %s -> %s', (from, to) => {
    const run = { ...createAiRun('run-1', 'requirement-1', 'analysis'), status: from }

    expect(() => transitionAiRun(run, to)).toThrow(
      `Invalid AI run transition: ${from} -> ${to}`
    )
  })
})
