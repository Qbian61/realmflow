import {
  AI_RUN_EVENT_TYPES,
  createAiRun,
  transitionAiRun,
  type AiRunStatus
} from './ai-run'

describe('AiRun', () => {
  it('defines semantic answer and Tool Loop lifecycle events', () => {
    expect(AI_RUN_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'answer.delta',
        'execution.summary.delta',
        'reference.added',
        'tool.call.requested',
        'tool.call.started',
        'tool.call.progress',
        'tool.call.completed',
        'tool.call.failed',
        'tool.call.permission_required'
      ])
    )
    expect(AI_RUN_EVENT_TYPES).not.toContain('content.delta')
  })

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
