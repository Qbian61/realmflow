import { describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import type { ModelExecutionConfig } from '../../../../domain/model'
import { createSchedule } from '../../../../domain/schedule'
import { ModelSkillExecutionRuntime } from './model-skill-execution-runtime'

const schedule = createSchedule({
  id: 'schedule-1',
  definition: {
    name: 'Daily summary',
    description: 'Summarize project status',
    cronExpression: '0 9 * * 1-5',
    timeZone: 'Asia/Shanghai',
    missedRunPolicy: 'skip',
    workspaceId: 'workspace-1',
    modelProfileId: 'profile-1',
    executionTarget: {
      kind: 'skill',
      id: 'com.example.summary',
      version: '1.0.0',
      digest: 'a'.repeat(64)
    },
    skillInput: { audience: 'team' },
    connectorBindings: [
      { service: 'issues', connectorId: 'connector-1' }
    ],
    permissions: ['filesystem.read']
  },
  at: 100
})

const model: ModelExecutionConfig = {
  providerType: 'local',
  providerId: 'provider-1',
  modelProfileId: 'profile-1',
  baseUrl: 'http://127.0.0.1',
  modelId: 'local-model',
  timeoutMs: 30_000,
  maxRetries: 1,
  maxConcurrency: 1
}

function terminal(
  type: 'run.completed' | 'run.failed' | 'run.cancelled',
  data: AiRunEvent['data'] = {}
): AiRunEvent {
  return {
    id: `run-1:${type}`,
    runId: 'run-1',
    sequence: 2,
    type,
    timestamp: new Date(130).toISOString(),
    data
  }
}

describe('ModelSkillExecutionRuntime', () => {
  it('preflights the selected model and Skill without starting a run', async () => {
    const resolveExecution = vi.fn().mockResolvedValue(model)
    const prepare = vi.fn().mockResolvedValue(undefined)
    const createRun = vi.fn()
    const runtime = new ModelSkillExecutionRuntime({
      models: { resolveExecution },
      gateway: {
        prepare,
        createRun,
        streamEvents: vi.fn(),
        cancelRun: vi.fn()
      }
    })

    await expect(
      runtime.prepare({ schedule, scheduleRunId: 'schedule-preflight' })
    ).resolves.toEqual({ outcome: 'ready', permissionRequests: [] })

    expect(resolveExecution).toHaveBeenCalledWith('profile-1')
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'schedule:schedule-1:schedule-preflight',
        workspaceId: 'workspace-1',
        scheduleRunId: 'schedule-preflight',
        skill: schedule.executionTarget
      })
    )
    expect(createRun).not.toHaveBeenCalled()
  })

  it.each([
    ['run.completed', 'succeeded', undefined],
    ['run.failed', 'failed', 'provider_timeout'],
    ['run.cancelled', 'cancelled', undefined]
  ] as const)(
    'maps %s to a terminal %s execution',
    async (eventType, status, errorCode) => {
      const gateway = {
        prepare: vi.fn(),
        createRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield terminal(
            eventType,
            errorCode
              ? {
                  errorCode,
                  message: '/private/provider details'
                }
              : {}
          )
        }),
        cancelRun: vi.fn()
      }
      const runtime = new ModelSkillExecutionRuntime({
        models: { resolveExecution: vi.fn().mockResolvedValue(model) },
        gateway
      })

      await expect(
        runtime.execute({ schedule, scheduleRunId: 'schedule-run-1' })
      ).resolves.toEqual({
        outcome: 'executed',
        execution: {
          id: 'run-1',
          status,
          ...(errorCode
            ? {
                error: {
                  code: errorCode,
                  message: 'Skill execution failed'
                }
              }
            : {}),
          finishedAt: 130
        }
      })

      expect(gateway.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'schedule:schedule-1:schedule-run-1',
          workspaceId: 'workspace-1',
          scheduleRunId: 'schedule-run-1',
          triggerBindingId: 'schedule:schedule-1:revision:1',
          triggerEventId: 'schedule-run:schedule-run-1',
          connectorBindings: schedule.connectorBindings,
          skill: schedule.executionTarget,
          messages: [
            {
              role: 'user',
              content:
                'Summarize project status\n\n' +
                'Input:\n{"audience":"team"}'
            }
          ]
        }),
        model
      )
    }
  )
})
