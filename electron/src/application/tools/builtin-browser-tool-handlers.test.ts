import { describe, expect, it, vi } from 'vitest'
import { createBrowserToolHandlers } from './builtin-browser-tool-handlers'

describe('builtin browser Tool handlers', () => {
  it('attributes a created browser to the trusted parent run', async () => {
    const createSession = vi.fn().mockResolvedValue({
      id: 'browser-session',
      profileId: 'browser-profile',
      ownerKey: 'owner',
      status: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      executionId: 'execution-1'
    })
    const handler = createBrowserToolHandlers({
      createSession,
      attachSession: vi.fn(),
      closeSession: vi.fn(),
      execute: vi.fn()
    }).find(({ name }) => name === 'browser.create')!

    await handler.execute({
      arguments: {},
      executionId: 'execution-1',
      requestedBy: { type: 'model', id: 'conversation-1' },
      context: {
        owner: { type: 'conversation', id: 'conversation-1' },
        parentExecutionId: 'run-1',
        correlationId: 'correlation-1',
        causationId: 'causation-1'
      },
      scopeRoots: [],
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      executionId: 'execution-1'
    }))
  })

  it('executes normal actions through the current run without a model session id', async () => {
    const executeCurrent = vi.fn().mockResolvedValue({ text: 'ready' })
    const handler = createBrowserToolHandlers({
      createSession: vi.fn(),
      attachSession: vi.fn(),
      closeSession: vi.fn(),
      execute: vi.fn(),
      executeCurrent
    } as never).find(({ name }) => name === 'browser.snapshot')!

    await expect(
      handler.execute({
        arguments: { target: { kind: 'current_run' } },
        executionId: 'execution-1',
        requestedBy: { type: 'model', id: 'conversation-1' },
        context: {
          owner: { type: 'conversation', id: 'conversation-1' },
          conversationId: 'conversation-1',
          parentExecutionId: 'run-1',
          correlationId: 'correlation-1',
          causationId: 'causation-1'
        },
        scopeRoots: [],
        signal: new AbortController().signal,
        sink: { emit: vi.fn() }
      })
    ).resolves.toEqual({ text: 'ready' })

    expect(executeCurrent).toHaveBeenCalledWith(
      'snapshot',
      { target: { kind: 'current_run' } },
      expect.objectContaining({
        runId: 'run-1',
        conversationId: 'conversation-1',
        authorityDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    )
  })
})
