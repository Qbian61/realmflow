import { expect, it, vi } from 'vitest'
import type {
  ToolOutboxMessage,
  ToolOutboxRepository
} from './tool-outbox'
import { ToolOutboxDispatcher } from './tool-outbox-dispatcher'

const message: ToolOutboxMessage = {
  id: 'outbox-1',
  topic: 'tool.dispatch',
  messageKey: 'execution-1',
  payload: { executionId: 'execution-1' },
  headers: { correlationId: 'correlation-1' },
  status: 'leased',
  availableAt: 100,
  leaseOwner: 'dispatcher-1',
  leaseExpiresAt: 200,
  attempts: 1,
  createdAt: 100,
  updatedAt: 100
}

it('publishes claimed messages and confirms completion', async () => {
  const repository = repositoryMock()
  repository.claim.mockResolvedValue([message])
  repository.markPublished.mockResolvedValue('published')
  const publish = vi.fn().mockResolvedValue(undefined)
  const dispatcher = new ToolOutboxDispatcher({
    repository,
    publish,
    owner: 'dispatcher-1',
    now: () => 120
  })

  await expect(dispatcher.dispatchBatch()).resolves.toEqual({
    claimed: 1,
    published: 1,
    failed: 0
  })
  expect(publish).toHaveBeenCalledWith(message)
  expect(repository.markPublished).toHaveBeenCalledWith({
    id: 'outbox-1',
    owner: 'dispatcher-1',
    at: 120
  })
})

it('retries failures with bounded backoff and redacted summaries', async () => {
  const repository = repositoryMock()
  repository.claim.mockResolvedValue([{ ...message, attempts: 2 }])
  const publish = vi
    .fn()
    .mockRejectedValue(
      new Error('Authorization: Bearer top-secret token=private-value')
    )
  const dispatcher = new ToolOutboxDispatcher({
    repository,
    publish,
    owner: 'dispatcher-1',
    now: () => 120,
    baseRetryMs: 1_000,
    maxRetryMs: 10_000,
    maxAttempts: 5
  })

  await expect(dispatcher.dispatchBatch()).resolves.toEqual({
    claimed: 1,
    published: 0,
    failed: 1
  })
  expect(repository.recordFailure).toHaveBeenCalledWith({
    id: 'outbox-1',
    owner: 'dispatcher-1',
    at: 120,
    retryAt: 2_120,
    maxAttempts: 5,
    errorSummary: expect.not.stringMatching(/top-secret|private-value/)
  })
})

function repositoryMock() {
  return {
    claim: vi.fn(),
    markPublished: vi.fn(),
    recordFailure: vi.fn()
  } as unknown as ToolOutboxRepository & {
    claim: ReturnType<typeof vi.fn>
    markPublished: ReturnType<typeof vi.fn>
    recordFailure: ReturnType<typeof vi.fn>
  }
}
