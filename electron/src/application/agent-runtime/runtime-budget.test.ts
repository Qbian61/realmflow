import { describe, expect, it } from 'vitest'
import type { RuntimeBudgetManifest } from '../../../../domain/dsh-run-manifest'
import {
  RuntimeBudgetHardLimitExhaustedError,
  assertDshRuntimeBudgetBoundary,
  authorDshRuntimeBudgetPolicy
} from './runtime-budget'

describe('DSH runtime budget policy', () => {
  it('keeps RealmFlow as the policy author and exposes remaining limits for DSH boundaries', () => {
    const policy = authorDshRuntimeBudgetPolicy({
      runId: 'run-1',
      budget: budget(),
      usage: {
        modelRequests: 1,
        toolCalls: 2,
        subagents: 0,
        runtimeMs: 1_000,
        retries: 1,
        inputTokens: 100,
        outputTokens: 200,
        costUsd: 0
      }
    })

    expect(policy).toMatchObject({
      runId: 'run-1',
      author: 'realmflow',
      remaining: {
        modelRequests: 1,
        toolCalls: 0,
        subagents: 1,
        runtimeMs: 4_000,
        retries: 0,
        inputTokens: 900,
        outputTokens: 800,
        costUsd: 0
      },
      boundaries: {
        model: { boundary: 'model', allowed: true },
        tool: {
          boundary: 'tool',
          allowed: false,
          reason: 'runtime_budget_exhausted',
          stopDshWork: true
        },
        goal: { boundary: 'goal', allowed: true },
        subagent: { boundary: 'subagent', allowed: true }
      }
    })
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.boundaries.tool)).toBe(true)
  })

  it('stops DSH work at model, Tool, Goal, and Subagent boundaries when hard limits are exhausted', () => {
    const policy = authorDshRuntimeBudgetPolicy({
      runId: 'run-1',
      budget: budget({ maxModelRequests: 1, maxToolCalls: 1, maxSubagents: 0 }),
      usage: {
        modelRequests: 1,
        toolCalls: 1,
        subagents: 0,
        runtimeMs: 0,
        retries: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      }
    })

    for (const boundary of ['model', 'tool', 'goal', 'subagent'] as const) {
      expect(policy.boundaries[boundary]).toMatchObject({
        allowed: false,
        reason: 'runtime_budget_exhausted',
        stopDshWork: true
      })
      expect(() => assertDshRuntimeBudgetBoundary(policy, boundary)).toThrow(
        RuntimeBudgetHardLimitExhaustedError
      )
    }
  })
})

function budget(
  overrides: Partial<RuntimeBudgetManifest> = {}
): RuntimeBudgetManifest {
  return {
    kind: 'runtime-budget',
    maxModelRequests: 2,
    maxToolCalls: 2,
    maxSubagents: 1,
    maxRuntimeMs: 5_000,
    maxRetries: 1,
    maxInputTokens: 1_000,
    maxOutputTokens: 1_000,
    maxCostUsd: 0,
    ...overrides
  }
}
