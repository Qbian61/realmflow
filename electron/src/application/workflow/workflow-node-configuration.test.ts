import { describe, expect, it } from 'vitest'
import type { WorkflowNodeConfiguration } from '../../../../domain/workflow'
import { normalizeNodeConfiguration } from './workflow-node-configuration'

describe('normalizeNodeConfiguration reasoning policy', () => {
  it('accepts a Tool node without a fixed execution target', () => {
    expect(normalizeNodeConfiguration(configuration(), 'tool')).toEqual({
      ...configuration(),
      reasoning: 'inherit'
    })
  })

  it.each(['inherit', 'off', 'low', 'medium', 'high'] as const)(
    'preserves the %s reasoning policy',
    (reasoning) => {
      expect(
        normalizeNodeConfiguration(
          { ...configuration(), reasoning },
          'ai_generate'
        ).reasoning
      ).toBe(reasoning)
    }
  )

  it('defaults missing reasoning policy to inherit', () => {
    expect(
      normalizeNodeConfiguration(configuration(), 'ai_generate').reasoning
    ).toBe('inherit')
  })

  it('rejects an unknown reasoning policy', () => {
    expect(() =>
      normalizeNodeConfiguration(
        {
          ...configuration(),
          reasoning: 'maximum'
        } as unknown as WorkflowNodeConfiguration,
        'ai_generate'
      )
    ).toThrow('Workflow node reasoning policy is invalid')
  })
})

function configuration(): WorkflowNodeConfiguration {
  return {
    input: {
      includeRequirementBody: true,
      predecessorArtifacts: 'direct',
      includeSpaceKnowledge: false,
      attachments: []
    },
    prompt: 'Analyze.',
    model: { strategy: 'inherit' },
    connectorIds: [],
    permissions: [],
    artifact: {
      required: true,
      relativePath: 'artifacts/analysis.md',
      kind: 'markdown'
    },
    todos: [],
    completionGate: { requireApproval: false },
    retry: { maxAttempts: 1, backoffMs: 0 },
    skip: { allowed: false, requireReason: false }
  }
}
