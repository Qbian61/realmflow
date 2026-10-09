import { describe, expect, it } from 'vitest'
import {
  createSkillExecution,
  finishSkillExecution,
  interruptSkillExecution,
  requestSkillExecutionCancellation,
  sanitizeSkillExecutionDiagnostic,
  type SkillExecution
} from './skill-execution'

function runningExecution(
  overrides: Partial<SkillExecution> = {}
): SkillExecution {
  return createSkillExecution({
    id: 'skill-execution-1',
    skillId: 'com.example.planning',
    skillVersionId: 'skill-version-1',
    skillVersionChecksum: 'a'.repeat(64),
    triggerSource: 'workflow',
    context: {
      scope: {
        kind: 'requirement',
        requirementId: ' requirement-1 '
      },
      requirementId: ' requirement-1 ',
      workspaceId: ' workspace-1 ',
      sessionId: ' session-1 ',
      nodeRunId: ' node-run-1 '
    },
    input: {
      title: 'Plan checkout',
      nested: { accepted: true }
    },
    startedAt: 100,
    ...overrides
  })
}

describe('Skill execution domain', () => {
  it('creates an immutable running snapshot with normalized ownership', () => {
    const input = {
      title: 'Plan checkout',
      nested: { accepted: true }
    }
    const execution = createSkillExecution({
      id: ' skill-execution-1 ',
      skillId: ' com.example.planning ',
      skillVersionId: ' skill-version-1 ',
      skillVersionChecksum: 'A'.repeat(64),
      triggerSource: 'workflow',
      context: {
        scope: {
          kind: 'requirement',
          requirementId: ' requirement-1 '
        },
        requirementId: ' requirement-1 ',
        workspaceId: ' workspace-1 ',
        sessionId: ' session-1 ',
        nodeRunId: ' node-run-1 '
      },
      input,
      startedAt: 100
    })

    input.nested.accepted = false

    expect(execution).toMatchObject({
      id: 'skill-execution-1',
      skillId: 'com.example.planning',
      skillVersionId: 'skill-version-1',
      skillVersionChecksum: 'a'.repeat(64),
      triggerSource: 'workflow',
      context: {
        scope: {
          kind: 'requirement',
          requirementId: 'requirement-1'
        },
        requirementId: 'requirement-1',
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        nodeRunId: 'node-run-1'
      },
      input: {
        title: 'Plan checkout',
        nested: { accepted: true }
      },
      status: 'running',
      revision: 1,
      startedAt: 100,
      updatedAt: 100
    })
    expect(execution.inputChecksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each([
    {
      name: 'missing scope',
      context: {
        workspaceId: 'workspace-1'
      }
    },
    {
      name: 'mismatched requirement scope',
      context: {
        scope: { kind: 'requirement', requirementId: 'requirement-2' },
        requirementId: 'requirement-1',
        workspaceId: 'workspace-1'
      }
    },
    {
      name: 'space scope without workspace',
      context: {
        scope: { kind: 'space', workspaceId: 'workspace-1' }
      }
    },
    {
      name: 'workflow without node run',
      context: {
        scope: { kind: 'space', workspaceId: 'workspace-1' },
        workspaceId: 'workspace-1'
      }
    }
  ])('rejects $name', ({ context }) => {
    expect(() =>
      createSkillExecution({
        id: 'skill-execution-1',
        skillId: 'com.example.planning',
        skillVersionId: 'skill-version-1',
        skillVersionChecksum: 'a'.repeat(64),
        triggerSource: 'workflow',
        context: context as never,
        input: {},
        startedAt: 100
      })
    ).toThrow(/Skill execution/)
  })

  it('rejects non-object input and unsafe identifiers', () => {
    expect(() =>
      createSkillExecution({
        id: 'skill execution',
        skillId: 'com.example.planning',
        skillVersionId: 'skill-version-1',
        skillVersionChecksum: 'a'.repeat(64),
        triggerSource: 'user',
        context: {
          scope: { kind: 'space', workspaceId: 'workspace-1' },
          workspaceId: 'workspace-1'
        },
        input: [] as never,
        startedAt: 100
      })
    ).toThrow(/Skill execution/)
  })

  it('finishes successfully with cloned output and bounded metrics', () => {
    const output = { text: 'Implementation plan' }
    const finished = finishSkillExecution(runningExecution(), {
      status: 'succeeded',
      output,
      metrics: {
        durationMs: 25,
        peakMemoryBytes: 1_024,
        outputBytes: 31
      },
      finishedAt: 125
    })

    output.text = 'changed'

    expect(finished).toMatchObject({
      status: 'succeeded',
      revision: 2,
      output: { text: 'Implementation plan' },
      metrics: {
        durationMs: 25,
        peakMemoryBytes: 1_024,
        outputBytes: 31
      },
      finishedAt: 125,
      updatedAt: 125
    })
    expect(finished.outputChecksum).toMatch(/^[a-f0-9]{64}$/)
    expect(finished.error).toBeUndefined()
  })

  it.each([
    'skill_output_invalid',
    'skill_sandbox_unavailable',
    'skill_timeout',
    'skill_memory_limit',
    'skill_output_limit',
    'skill_execution_failed',
    'skill_execution_unavailable'
  ] as const)('records a safe %s failure', (code) => {
    const failed = finishSkillExecution(runningExecution(), {
      status: 'failed',
      error: {
        code,
        message: '/Users/person/private/secret.py\n'.repeat(100)
      },
      metrics: {
        durationMs: 10,
        outputBytes: 0
      },
      finishedAt: 110
    })

    expect(failed.status).toBe('failed')
    expect(failed.error).toMatchObject({ code })
    expect(failed.error?.message).not.toContain('/Users/person')
    expect(Buffer.byteLength(failed.error?.message ?? '', 'utf8')).toBeLessThanOrEqual(
      1024
    )
  })

  it('records a cancellation request without inventing a terminal state', () => {
    const requested = requestSkillExecutionCancellation(
      runningExecution(),
      110
    )

    expect(requested).toMatchObject({
      status: 'running',
      revision: 2,
      cancellationRequestedAt: 110,
      updatedAt: 110
    })

    const cancelled = finishSkillExecution(requested, {
      status: 'cancelled',
      metrics: { durationMs: 20, outputBytes: 0 },
      finishedAt: 120
    })
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      revision: 3,
      finishedAt: 120
    })
  })

  it('interrupts only a running execution and preserves its unknown side effects', () => {
    const interrupted = interruptSkillExecution(
      runningExecution(),
      130,
      'Application restarted while the Skill was running'
    )

    expect(interrupted).toMatchObject({
      status: 'interrupted',
      revision: 2,
      error: {
        code: 'skill_execution_unavailable',
        message: 'Application restarted while the Skill was running'
      },
      finishedAt: 130,
      updatedAt: 130
    })
    expect(() =>
      interruptSkillExecution(interrupted, 140, 'again')
    ).toThrow('Skill execution is already terminal')
  })

  it('rejects invalid terminal payloads and backwards timestamps', () => {
    expect(() =>
      finishSkillExecution(runningExecution(), {
        status: 'succeeded',
        output: undefined as never,
        metrics: { durationMs: 10, outputBytes: 0 },
        finishedAt: 110
      })
    ).toThrow('Skill execution output is required')

    expect(() =>
      finishSkillExecution(runningExecution(), {
        status: 'failed',
        error: undefined as never,
        metrics: { durationMs: 10, outputBytes: 0 },
        finishedAt: 110
      })
    ).toThrow('Skill execution error is required')

    expect(() =>
      requestSkillExecutionCancellation(runningExecution(), 99)
    ).toThrow('Skill execution time cannot move backwards')
  })

  it('redacts absolute paths, tokens and authorization headers', () => {
    expect(
      sanitizeSkillExecutionDiagnostic(
        'failed /Users/alice/private.py Authorization: Bearer abc token=secret'
      )
    ).toBe(
      'failed [redacted-path] Authorization: [redacted] token=[redacted]'
    )
  })
})
