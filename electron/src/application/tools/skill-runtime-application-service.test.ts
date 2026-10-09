import { vi } from 'vitest'
import type { SkillDefinition } from '../../../../domain/skill-definition'
import { SkillRuntimeApplicationService } from './skill-runtime-application-service'

const baseDefinition: SkillDefinition = {
  schemaVersion: 1,
  id: 'builtin.skill.review',
  version: '1.0.0',
  definitionDigest: 'a'.repeat(64),
  package: {
    packageId: 'realmflow.builtin.skills',
    packageVersion: '1.0.0',
    packageDigest: 'b'.repeat(64),
  },
  origin: 'builtin',
  name: 'Review',
  description: 'Review a change.',
  instructionsPath: 'instructions/review.md',
  runtime: { kind: 'instruction' },
  inputSchema: {
    type: 'object',
    properties: { focus: { type: 'string' } },
    required: ['focus'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object', additionalProperties: true },
  requiredTools: [
    {
      toolId: 'builtin.files.read',
      versionRange: '^1.0.0',
      required: true,
    },
  ],
  activation: { intents: ['review'], contexts: ['general'] },
  limits: { maxToolCalls: 4, timeoutMs: 5_000 },
}

function command(definition: SkillDefinition = baseDefinition) {
  return {
    definition,
    parentRunId: 'run-1',
    callId: 'call-1',
    context: {
      scope: {
        kind: 'conversation' as const,
        conversationId: 'conversation-1',
      },
      conversationId: 'conversation-1',
    },
    input: { focus: 'correctness' },
  }
}

describe('SkillRuntimeApplicationService', () => {
  it('loads an instruction Skill as a version-fixed child execution', async () => {
    const readInstructions = vi.fn().mockResolvedValue('Inspect correctness.')
    const service = new SkillRuntimeApplicationService({
      instructions: { readInstructions },
      executable: {
        execute: vi.fn(),
        cancel: vi.fn(),
      },
      createId: () => 'skill-execution-1',
    })

    await expect(service.execute(command())).resolves.toEqual({
      outcome: 'executed',
      execution: {
        id: 'skill-execution-1',
        skillId: baseDefinition.id,
        skillVersion: baseDefinition.version,
        skillDigest: baseDefinition.definitionDigest,
        status: 'succeeded',
        output: {
          kind: 'instruction',
          skillId: baseDefinition.id,
          skillName: baseDefinition.name,
          instructions: 'Inspect correctness.',
          input: { focus: 'correctness' },
        },
      },
    })
    expect(readInstructions).toHaveBeenCalledWith(baseDefinition)
  })

  it('returns only declared steps from a workflow Skill', async () => {
    const definition: SkillDefinition = {
      ...baseDefinition,
      runtime: {
        kind: 'workflow',
        steps: [
          {
            id: 'inspect',
            instruction: 'Inspect the requested files.',
            toolId: 'builtin.files.read',
          },
          {
            id: 'summarize',
            instruction: 'Summarize the findings.',
          },
        ],
      },
    }
    const service = new SkillRuntimeApplicationService({
      instructions: { readInstructions: vi.fn() },
      executable: {
        execute: vi.fn(),
        cancel: vi.fn(),
      },
      createId: () => 'skill-execution-workflow',
    })

    const result = await service.execute(command(definition))

    expect(result).toEqual({
      outcome: 'executed',
      execution: expect.objectContaining({
        id: 'skill-execution-workflow',
        status: 'succeeded',
        output: {
          kind: 'workflow',
          skillId: definition.id,
          skillName: definition.name,
          steps:
            definition.runtime.kind === 'workflow'
              ? definition.runtime.steps
              : [],
        },
      }),
    })
  })

  it('requires permission before an executable Skill enters the sandbox', async () => {
    const execute = vi.fn()
    const definition: SkillDefinition = {
      ...baseDefinition,
      runtime: {
        kind: 'executable',
        runtime: 'python',
        entryPath: 'runtime/main.py',
        capabilities: ['filesystem.read', 'process.execute'],
        connectorServices: [],
        resources: { maxMemoryMb: 128, maxOutputBytes: 4096 },
      },
    }
    const service = new SkillRuntimeApplicationService({
      instructions: { readInstructions: vi.fn() },
      executable: { execute, cancel: vi.fn() },
    })

    await expect(service.execute(command(definition))).resolves.toEqual({
      outcome: 'permission_required',
      permissionRequests: [
        { capability: 'filesystem.read', risk: 'high' },
        { capability: 'process.execute', risk: 'high' },
      ],
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('validates executable input and output schemas', async () => {
    const definition: SkillDefinition = {
      ...baseDefinition,
      outputSchema: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
        additionalProperties: false,
      },
      runtime: {
        kind: 'executable',
        runtime: 'python',
        entryPath: 'runtime/main.py',
        capabilities: [],
        connectorServices: [],
        resources: { maxMemoryMb: 128, maxOutputBytes: 4096 },
      },
    }
    const executable = {
      execute: vi.fn().mockResolvedValue({
        output: { unexpected: true },
        metrics: { durationMs: 1, outputBytes: 10 },
      }),
      cancel: vi.fn(),
    }
    const service = new SkillRuntimeApplicationService({
      instructions: { readInstructions: vi.fn() },
      executable,
      createId: () => 'skill-execution-schema',
    })

    await expect(
      service.execute({
        ...command(definition),
        permissionDecisions: [],
      }),
    ).resolves.toEqual({
      outcome: 'executed',
      execution: expect.objectContaining({
        status: 'failed',
        error: {
          code: 'skill_output_invalid',
          message: 'Skill output does not match the output schema',
        },
      }),
    })
  })

  it('cancels active executable Skills by parent Run', async () => {
    let release!: () => void
    const execute = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              output: { summary: 'done' },
              metrics: { durationMs: 1, outputBytes: 18 },
            })
        }),
    )
    const cancel = vi.fn().mockResolvedValue(true)
    const definition: SkillDefinition = {
      ...baseDefinition,
      runtime: {
        kind: 'executable',
        runtime: 'python',
        entryPath: 'runtime/main.py',
        capabilities: [],
        connectorServices: [],
        resources: { maxMemoryMb: 128, maxOutputBytes: 4096 },
      },
    }
    const service = new SkillRuntimeApplicationService({
      instructions: { readInstructions: vi.fn() },
      executable: { execute, cancel },
      createId: () => 'skill-execution-active',
    })

    const pending = service.execute(command(definition))
    await vi.waitFor(() => expect(execute).toHaveBeenCalled())
    await expect(service.cancelByParent('run-1')).resolves.toBe(1)
    expect(cancel).toHaveBeenCalledWith('skill-execution-active')
    release()
    await pending
  })
})
