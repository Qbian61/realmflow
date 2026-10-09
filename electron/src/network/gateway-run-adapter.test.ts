import { vi } from 'vitest'
import type { ModelExecutionConfig } from '../../../domain/model'
import type { SidecarModelExecutionConfig } from './network-gateway'
import { createGatewayRunAdapter } from './gateway-run-adapter'

const context = {
  requirementId: 'requirement-1',
  requirementTitle: 'Checkout',
  stageId: 'analysis' as const,
  workspaceId: 'workspace-1',
  workspaceName: 'shop',
  existingArtifacts: []
}

const model: ModelExecutionConfig = {
  providerType: 'openai_completions',
  baseUrl: 'https://api.example.com/v1',
  modelId: 'example-model',
  timeoutMs: 5000,
  maxRetries: 2,
  maxConcurrency: 1,
  apiKey: 'sk-secret'
}

const grant: SidecarModelExecutionConfig = {
  providerType: 'openai_completions',
  modelId: 'example-model',
  gateway: {
    url: 'http://127.0.0.1:43210/v1/model/stream',
    token: 'one-time-grant'
  }
}

describe('Gateway run adapter', () => {
  it('binds a created Sidecar run to its network grant', async () => {
    const gateway = gatewayMock()
    const sidecar = sidecarMock()
    const adapter = createGatewayRunAdapter(gateway, () => sidecar)

    await expect(adapter.createRun(context, model)).resolves.toEqual({
      runId: 'run-1'
    })

    expect(gateway.authorize).toHaveBeenCalledWith(model, {
      owner: { type: 'requirement', id: 'requirement-1' },
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1'
    })
    expect(sidecar.createRun).toHaveBeenCalledWith(context, grant)
    expect(gateway.bindRun).toHaveBeenCalledWith(grant, 'run-1')
    expect(gateway.revoke).not.toHaveBeenCalled()
  })

  it('revokes the grant when Sidecar run creation fails', async () => {
    const gateway = gatewayMock()
    const sidecar = sidecarMock()
    sidecar.createRun.mockRejectedValue(new Error('Sidecar unavailable'))
    const adapter = createGatewayRunAdapter(gateway, () => sidecar)

    await expect(adapter.createRun(context, model)).rejects.toThrow(
      'Sidecar unavailable'
    )

    expect(gateway.bindRun).not.toHaveBeenCalled()
    expect(gateway.revoke).toHaveBeenCalledWith(grant)
  })

  it('cancels Main network work before notifying Sidecar', async () => {
    const order: string[] = []
    const gateway = gatewayMock()
    gateway.cancelRun.mockImplementation(() => {
      order.push('gateway')
    })
    const sidecar = sidecarMock()
    sidecar.cancelRun.mockImplementation(async () => {
      order.push('sidecar')
    })
    const adapter = createGatewayRunAdapter(gateway, () => sidecar)

    await adapter.cancelRun('run-1')

    expect(order).toEqual(['gateway', 'sidecar'])
  })

  it('preserves node-run and conversation ownership for audit', async () => {
    const gateway = gatewayMock()
    const sidecar = sidecarMock()
    const adapter = createGatewayRunAdapter(gateway, () => sidecar)

    await adapter.createRun(
      {
        ...context,
        nodeId: 'node-1',
        nodeRunId: 'node-run-1',
        prompt: 'Build',
        artifactPath: 'artifacts/build.md'
      },
      model
    )
    await adapter.createRun(
      {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1',
        messages: [{ role: 'user', content: 'Hello' }]
      },
      model
    )

    expect(gateway.authorize).toHaveBeenNthCalledWith(1, model, {
      owner: { type: 'node_run', id: 'node-run-1' },
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeId: 'node-1',
      nodeRunId: 'node-run-1'
    })
    expect(gateway.authorize).toHaveBeenNthCalledWith(2, model, {
      owner: { type: 'conversation', id: 'conversation-1' },
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1'
    })
  })

  it('resumes a Provider attempt with a newly authorized model grant', async () => {
    const gateway = gatewayMock()
    const sidecar = sidecarMock()
    sidecar.resumeRun.mockResolvedValue({ runId: 'run-resumed' })
    const adapter = createGatewayRunAdapter(gateway, () => sidecar)
    const checkpoint = {
      resumeToken: 'a'.repeat(64),
      messageWindow: [
        {
          id: 'message-1',
          role: 'user' as const,
          content: 'Continue'
        },
        {
          id: 'message-2',
          role: 'assistant' as const,
          content: '',
          toolCalls: [
            {
              id: 'call-pending',
              name: 'files.write',
              arguments: '{"path":"result.txt"}'
            }
          ]
        }
      ],
      remainingBudgets: {
        toolCalls: 3,
        subagents: 0,
        retries: 1,
        timeoutMs: 5_000,
        tokens: 2_048
      },
      pendingCalls: [
        {
          callId: 'call-pending',
          toolName: 'files.write',
          executionId: 'execution-pending',
          requestId: 'permission-pending',
          effect: 'local_write' as const,
          idempotency: 'required' as const,
          status: 'permission_required' as const
        }
      ],
      toolConfiguration: {
        maxAgentTurns: 180,
        maxParallelToolsPerTurn: 16,
        tools: []
      }
    }
    const run = {
      id: 'runtime-run',
      snapshot: {
        scope: {
          kind: 'workspace' as const,
          workspaceId: 'workspace-1'
        },
        reasoningDecision: {
          effectiveMode: 'high' as const
        },
        executionPolicy: {
          maxTurnsPerSegment: 180,
          maxParallelToolsPerTurn: 16
        }
      }
    }

    await expect(
      adapter.resumeRun(run, checkpoint, model)
    ).resolves.toEqual({ runId: 'run-resumed' })
    expect(gateway.authorize).toHaveBeenCalledWith(model, {
      owner: { type: 'application', id: 'runtime-run' },
      workspaceId: 'workspace-1'
    })
    expect(sidecar.resumeRun).toHaveBeenCalledWith({
      resumeToken: 'a'.repeat(64),
      conversationId: 'runtime-run',
      workspaceId: 'workspace-1',
      messages: [
        { role: 'user', content: 'Continue' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call-pending',
              name: 'files.write',
              arguments: '{"path":"result.txt"}'
            }
          ]
        }
      ],
      maxAgentTurns: 180,
      maxParallelToolsPerTurn: 16,
      maxOutputTokens: 2_048,
      reasoning: 'high',
      model: grant,
      tools: [],
      pendingToolCalls: [
        {
          callId: 'call-pending',
          index: 0,
          name: 'files.write',
          arguments: '{"path":"result.txt"}',
          requestId: 'permission-pending',
          toolExecutionId: 'execution-pending'
        }
      ]
    })
    expect(gateway.bindRun).toHaveBeenCalledWith(grant, 'run-resumed')
  })
})

function gatewayMock() {
  return {
    authorize: vi.fn(() => grant),
    bindRun: vi.fn(),
    cancelRun: vi.fn(),
    revoke: vi.fn()
  }
}

function sidecarMock() {
  return {
    createRun: vi.fn(async () => ({ runId: 'run-1' })),
    resumeRun: vi.fn(async () => ({ runId: 'run-resumed' })),
    cancelRun: vi.fn(async () => undefined)
  }
}
