import { describe, expect, it, vi } from 'vitest'
import type { DshRunManifestDraft } from '../../../../domain/dsh-run-manifest'
import { createDshRunManifest, createDshRunManifestDraft } from '../test-manifest-fixture'
import { DshToolRuntime, type DshToolHandler } from '../tools/tool-runtime'
import {
  DshSkillRuntime,
  type DshSkillHandler,
  type DshSkillRuntimeEvent
} from './skill-runtime'

describe('DshSkillRuntime', () => {
  it('loads immutable instructions and executes nested tools through the same authority', async () => {
    const manifest = createDshRunManifest()
    const toolHandler = vi.fn(async () => ({ content: 'source text' }))
    const skillHandler = vi.fn(async (_input, context) => {
      expect(context.skill).toBe(manifest.skills[0])
      expect(context.instructions).toBe('Summarize with citations.')
      const readResult = await context.tools.execute('builtin.files.read', {
        path: '/workspace/brief.md'
      })
      return { summary: (readResult as { content: string }).content }
    })
    const events: DshSkillRuntimeEvent[] = []
    const runtime = skillRuntime({
      manifest,
      toolHandler,
      skillHandler,
      instructionText: 'Summarize with citations.',
      emitEvent: (event) => events.push(event)
    })

    const result = await runtime.execute({
      skillId: 'builtin.skills.summarize',
      callId: 'skill-call-1',
      idempotencyKey: 'skill-idem-1',
      input: { topic: 'brief' }
    })

    expect(result).toEqual({
      callId: 'skill-call-1',
      skillId: 'builtin.skills.summarize',
      output: { summary: 'source text' },
      replayed: false
    })
    expect(toolHandler).toHaveBeenCalledTimes(1)
    expect(skillHandler).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.kind)).toEqual([
      'skill.started',
      'skill.succeeded'
    ])
  })

  it('rejects a Skill whose required Tool reference is absent from the run manifest', async () => {
    const draft = createDshRunManifestDraft()
    const manifest = createDshRunManifest({
      skills: [
        {
          ...draft.skills[0],
          requiredToolRefs: [
            {
              kind: 'tool',
              id: 'builtin.files.write',
              version: '1.0.0',
              digest: '9'.repeat(64)
            }
          ]
        }
      ]
    })
    const skillHandler = vi.fn(async () => ({ ok: true }))
    const events: DshSkillRuntimeEvent[] = []
    const runtime = skillRuntime({
      manifest,
      skillHandler,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.execute({
        skillId: 'builtin.skills.summarize',
        callId: 'skill-call-1',
        idempotencyKey: 'skill-idem-1',
        input: {}
      })
    ).rejects.toThrow(/tool is not declared/i)

    expect(skillHandler).not.toHaveBeenCalled()
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'skill.denied',
        skillId: 'builtin.skills.summarize',
        reason: 'tool is not declared'
      })
    ])
  })

  it('prevents nested Tool calls from exceeding the run budget', async () => {
    const draft = createDshRunManifestDraft()
    const manifest = createDshRunManifest({
      budget: {
        ...draft.budget,
        maxToolCalls: 1
      }
    })
    const toolHandler = vi.fn(async () => ({ content: 'source text' }))
    const skillHandler = vi.fn(async (_input, context) => {
      await context.tools.execute('builtin.files.read', {
        path: '/workspace/brief.md'
      })
      await context.tools.execute('builtin.files.read', {
        path: '/workspace/brief.md'
      })
      return { ok: true }
    })
    const runtime = skillRuntime({
      manifest,
      toolHandler,
      skillHandler
    })

    await expect(
      runtime.execute({
        skillId: 'builtin.skills.summarize',
        callId: 'skill-call-1',
        idempotencyKey: 'skill-idem-1',
        input: {}
      })
    ).rejects.toThrow(/nested Tool budget/i)

    expect(toolHandler).toHaveBeenCalledTimes(1)
  })
})

function skillRuntime(input: {
  manifest: ReturnType<typeof createDshRunManifest>
  toolHandler?: DshToolHandler['execute']
  skillHandler: DshSkillHandler['execute']
  instructionText?: string
  emitEvent?: (event: DshSkillRuntimeEvent) => void
}): DshSkillRuntime {
  const toolRuntime = new DshToolRuntime({
    manifest: input.manifest,
    handlers: [
      {
        toolId: 'builtin.files.read',
        source: 'dsh-native',
        execute: input.toolHandler ?? (async () => ({ content: 'source text' }))
      }
    ]
  })
  return new DshSkillRuntime({
    manifest: input.manifest,
    toolRuntime,
    handlers: [
      {
        skillId: 'builtin.skills.summarize',
        source: 'instruction',
        execute: input.skillHandler
      }
    ],
    instructionLoader: {
      load: async () => input.instructionText ?? ''
    },
    emitEvent: input.emitEvent
  })
}
