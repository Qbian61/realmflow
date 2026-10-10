import { describe, expect, it, vi } from 'vitest'
import { createRuntimeToolBindings } from './runtime-tool-bindings'

function fixture() {
  const runGatewayCommand = vi.fn(async (
    input: Record<string, unknown>,
    context: { runId: string; requestId: string }
  ) => ({
    status: 'completed',
    input,
    trustedRunId: context.runId,
    requestId: context.requestId
  }))
  const runAutomationCommand = vi.fn(async (
    input: Record<string, unknown>,
    context: { runId: string; requestId: string }
  ) => ({
    status: 'completed',
    input,
    trustedRunId: context.runId,
    requestId: context.requestId
  }))
  const runMediaCommand = vi.fn(async (
    input: Record<string, unknown>,
    context: { runId: string; requestId: string }
  ) => ({
    output: input,
    trustedRunId: context.runId,
    requestId: context.requestId
  }))
  const resolveRun = vi.fn(async (id: string) => id === 'provider-run-1'
    ? {
        id: 'runtime-run-1',
        snapshot: { conversationId: 'conversation-1' }
      }
    : undefined)
  const bindings = createRuntimeToolBindings({
    orchestrator: { command: vi.fn() } as never,
    resolveRun: resolveRun as never,
    sensitive: {
      resolveCredential: vi.fn(),
      runCapabilityCommand: vi.fn(),
      runGatewayCommand,
      runAutomationCommand,
      runMediaCommand
    }
  })
  return {
    bindings,
    resolveRun,
    runGatewayCommand,
    runAutomationCommand,
    runMediaCommand
  }
}

describe('createRuntimeToolBindings Gateway binding', () => {
  it('binds Gateway commands to the trusted Main-owned Run identity', async () => {
    const { bindings, runGatewayCommand } = fixture()

    await expect(bindings.runGatewayCommand(
      { action: 'health' },
      {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'provider-run-1'
      },
      'gateway-request-1'
    )).resolves.toEqual({
      status: 'completed',
      input: { action: 'health' },
      trustedRunId: 'runtime-run-1',
      requestId: 'gateway-request-1'
    })
    expect(runGatewayCommand).toHaveBeenCalledWith(
      { action: 'health' },
      { runId: 'runtime-run-1', requestId: 'gateway-request-1' }
    )
  })

  it('rejects a Gateway command when the trusted Run scope differs', async () => {
    const { bindings, runGatewayCommand } = fixture()

    await expect(bindings.runGatewayCommand(
      { action: 'health' },
      {
        scope: { kind: 'conversation', conversationId: 'forged' },
        conversationId: 'forged',
        parentExecutionId: 'provider-run-1'
      },
      'gateway-request-1'
    )).rejects.toThrow('runtime_scope_denied')
    expect(runGatewayCommand).not.toHaveBeenCalled()
  })

  it('binds Automation commands to the trusted Main-owned Run identity', async () => {
    const { bindings, runAutomationCommand } = fixture()

    await expect(bindings.runAutomationCommand(
      { action: 'heartbeat' },
      {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'provider-run-1'
      },
      'automation-request-1'
    )).resolves.toEqual({
      status: 'completed',
      input: { action: 'heartbeat' },
      trustedRunId: 'runtime-run-1',
      requestId: 'automation-request-1'
    })
    expect(runAutomationCommand).toHaveBeenCalledWith(
      { action: 'heartbeat' },
      { runId: 'runtime-run-1', requestId: 'automation-request-1' }
    )
  })

  it('binds media generation to the trusted Main-owned Run identity', async () => {
    const { bindings, runMediaCommand } = fixture()
    const signal = new AbortController().signal

    await expect(bindings.runMediaCommand(
      { prompt: 'local image' },
      {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'provider-run-1'
      },
      'media-request-1',
      signal
    )).resolves.toEqual({
      output: { prompt: 'local image' },
      trustedRunId: 'runtime-run-1',
      requestId: 'media-request-1'
    })
    expect(runMediaCommand).toHaveBeenCalledWith(
      { prompt: 'local image' },
      { runId: 'runtime-run-1', requestId: 'media-request-1' },
      signal
    )
  })
})
