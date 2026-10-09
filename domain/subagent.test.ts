import type { AgentRunBudget, AgentRunScope } from './agent-runtime'
import {
  validateDelegationRequest,
  type DelegationPolicy,
  type DelegationRequest
} from './subagent'

const rootBudgets: AgentRunBudget = {
  maxToolCalls: 8,
  maxSubagents: 6,
  timeoutMs: 900_000,
  maxRetries: 2
}

describe('Subagent delegation policy', () => {
  it('accepts up to four unique read-only research tasks within the root budget', () => {
    const result = validateDelegationRequest(
      request(
        task('docs', 'Inspect the product requirements', 2),
        task('tests', 'Inspect the existing test coverage', 3),
        task('runtime', 'Inspect the runtime boundaries', 2)
      ),
      policy()
    )

    expect(result.concurrency).toBe(3)
    expect(result.reservation).toEqual({
      subagents: 3,
      toolCalls: 7
    })
    expect(result.tasks.map((item) => item.ordinal)).toEqual([1, 2, 3])
    expect(result.tasks.every((item) => item.scope.kind === 'workspace')).toBe(
      true
    )
  })

  it('rejects unsupported scenarios before reserving a child budget', () => {
    expect(() =>
      validateDelegationRequest(request(task('one', 'Inspect docs', 1)), {
        ...policy(),
        scenarioId: 'requirement-node'
      })
    ).toThrow('Subagent delegation is not allowed for this scenario')
  })

  it('rejects more than four tasks and duplicate normalized objectives', () => {
    expect(() =>
      validateDelegationRequest(
        request(
          task('one', 'Inspect one', 1),
          task('two', 'Inspect two', 1),
          task('three', 'Inspect three', 1),
          task('four', 'Inspect four', 1),
          task('five', 'Inspect five', 1)
        ),
        policy()
      )
    ).toThrow('Subagent delegation supports at most 4 tasks')

    expect(() =>
      validateDelegationRequest(
        request(
          task('one', ' Inspect   Runtime ', 1),
          task('two', 'inspect runtime', 1)
        ),
        policy()
      )
    ).toThrow('Subagent delegation contains a duplicate objective')
  })

  it('rejects depth and root budget bypass attempts', () => {
    expect(() =>
      validateDelegationRequest(request(task('one', 'Inspect docs', 1)), {
        ...policy(),
        delegationDepth: 2
      })
    ).toThrow('Subagent delegation depth exceeds 2')

    expect(() =>
      validateDelegationRequest(
        request(
          task('one', 'Inspect docs', 2),
          task('two', 'Inspect tests', 2)
        ),
        {
          ...policy(),
          consumedSubagents: 5,
          consumedToolCalls: 5
        }
      )
    ).toThrow('Subagent delegation exceeds the root budget')
  })

  it('rejects a child scope outside the parent workspace', () => {
    expect(() =>
      validateDelegationRequest(
        request({
          ...task('one', 'Inspect another workspace', 1),
          scope: { kind: 'workspace', workspaceId: 'workspace-2' }
        }),
        policy()
      )
    ).toThrow('Subagent scope must not expand the parent scope')
  })
})

function policy(
  parentScope: AgentRunScope = {
    kind: 'workspace',
    workspaceId: 'workspace-1'
  }
): DelegationPolicy {
  return {
    scenarioId: 'space',
    parentScope,
    delegationDepth: 0,
    maximumDepth: 2,
    maximumConcurrency: 4,
    rootBudgets,
    consumedSubagents: 0,
    consumedToolCalls: 0
  }
}

function request(
  ...tasks: DelegationRequest['tasks']
): DelegationRequest {
  return { tasks }
}

function task(id: string, objective: string, maxToolCalls: number) {
  return {
    id,
    objective,
    completionCriteria: [`Complete ${id}`],
    maxToolCalls,
    resultFormat: 'research_summary' as const,
    scope: { kind: 'workspace' as const, workspaceId: 'workspace-1' }
  }
}
