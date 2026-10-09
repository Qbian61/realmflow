import { describe, expect, it, vi } from 'vitest'
import type { AgentRuntimeRun } from '../../../../domain/agent-runtime'
import { AgentRuntimeToolResultGateway } from './agent-runtime-tool-result-gateway'

const runtimeRun: AgentRuntimeRun = {
  id: 'public-run-1',
  providerRunId: 'provider-run-1',
  status: 'running',
  snapshot: {
    schemaVersion: 1,
    runId: 'public-run-1',
    conversationId: 'conversation-1',
    rootRunId: 'public-run-1',
    delegationDepth: 0,
    delegationOrdinal: 0,
    scenarioId: 'folder',
    pipelineVersion: 'p'.repeat(64),
    agentProfileId: 'profile-1',
    agentProfileVersion: '1.0.0',
    agentProfileDigest: 'a'.repeat(64),
    promptDigest: 'b'.repeat(64),
    policyDigest: 'c'.repeat(64),
    capabilityCatalogDigest: 'd'.repeat(64),
    capabilityBindingDigest: 'e'.repeat(64),
    permissionSnapshotDigest: 'f'.repeat(64),
    modelProfileId: 'model-1',
    reasoningDecision: {
      requestedMode: 'auto',
      selectedMode: 'medium',
      effectiveMode: 'medium',
      confidence: 0.8,
      reasonCodes: [],
      budgets: {
        maxOutputTokens: 1024,
        maxToolCalls: 4,
        timeoutMs: 60_000
      }
    },
    responseLanguage: {
      locale: 'zh-CN',
      source: 'latest_user_message',
      confidence: 0.9,
      allowMixedLanguage: false
    },
    scope: { kind: 'folder', folderPath: '/workspace' },
    executionPolicy: {
      policyVersion: 1,
      maxTurnsPerSegment: 180,
      maxContinuationAttempts: 2,
      maxParallelToolsPerTurn: 16,
      maxActiveRuntimeMs: 28_800_000,
      providerRequestTimeoutMs: 1_800_000,
      contextCompactionThreshold: 0.75,
      maxOutputTokens: 32_000,
      maxFileReadTokens: 25_000,
      maxRepeatedEquivalentCalls: 3,
      maxConsecutiveFailures: 5
    },
    budgetLedger: {
      segmentIndex: 0,
      agentTurns: 0,
      toolRequests: 0,
      toolExecutions: 0,
      permissionWaits: 0,
      sideEffects: 0,
      consecutiveFailures: 0,
      repeatedCallFingerprints: {},
      activeRuntimeMs: 0,
      remainingContinuationAttempts: 2
    },
    budgets: {
      maxToolCalls: 256,
      maxSubagents: 0,
      timeoutMs: 900_000,
      maxRetries: 2
    },
    createdAt: 100
  },
  createdAt: 100,
  updatedAt: 120
}

describe('AgentRuntimeToolResultGateway', () => {
  it('submits tool results to the current provider run for a public runtime run', async () => {
    const sidecar = {
      submitToolResult: vi.fn().mockResolvedValue(undefined),
      suspendToolCall: vi.fn().mockResolvedValue(undefined)
    }
    const gateway = new AgentRuntimeToolResultGateway({
      runs: {
        listByRootRunId: vi.fn().mockResolvedValue([runtimeRun])
      },
      sidecar
    })

    await gateway.submitToolResult('public-run-1', {
      callId: 'call-1',
      status: 'failed',
      errorCode: 'builtin_execution_failed',
      message: 'Path is outside the bound workspace',
      toolExecutionId: 'execution-1'
    })

    expect(sidecar.submitToolResult).toHaveBeenCalledWith('provider-run-1', {
      callId: 'call-1',
      status: 'failed',
      errorCode: 'builtin_execution_failed',
      message: 'Path is outside the bound workspace',
      toolExecutionId: 'execution-1'
    })
  })

  it('suspends tool calls against the current provider run for a public runtime run', async () => {
    const sidecar = {
      submitToolResult: vi.fn().mockResolvedValue(undefined),
      suspendToolCall: vi.fn().mockResolvedValue(undefined)
    }
    const gateway = new AgentRuntimeToolResultGateway({
      runs: {
        listByRootRunId: vi.fn().mockResolvedValue([runtimeRun])
      },
      sidecar
    })

    await gateway.suspendToolCall('public-run-1', {
      callId: 'call-1',
      requestId: 'request-1',
      toolExecutionId: 'execution-1'
    })

    expect(sidecar.suspendToolCall).toHaveBeenCalledWith('provider-run-1', {
      callId: 'call-1',
      requestId: 'request-1',
      toolExecutionId: 'execution-1'
    })
  })

  it('fails before contacting sidecar when no provider run is bound', async () => {
    const sidecar = {
      submitToolResult: vi.fn().mockResolvedValue(undefined),
      suspendToolCall: vi.fn().mockResolvedValue(undefined)
    }
    const gateway = new AgentRuntimeToolResultGateway({
      runs: {
        listByRootRunId: vi.fn().mockResolvedValue([
          { ...runtimeRun, providerRunId: undefined }
        ])
      },
      sidecar
    })

    await expect(
      gateway.submitToolResult('public-run-1', {
        callId: 'call-1',
        status: 'completed',
        output: {}
      })
    ).rejects.toThrow('AI provider run is not bound')
    expect(sidecar.submitToolResult).not.toHaveBeenCalled()
  })
})
