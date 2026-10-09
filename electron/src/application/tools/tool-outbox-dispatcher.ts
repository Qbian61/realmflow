import type {
  ToolOutboxMessage,
  ToolOutboxRepository
} from './tool-outbox'

type Dependencies = {
  repository: ToolOutboxRepository
  publish: (message: ToolOutboxMessage) => Promise<void>
  owner: string
  now?: () => number
  leaseMs?: number
  batchSize?: number
  baseRetryMs?: number
  maxRetryMs?: number
  maxAttempts?: number
}

export class ToolOutboxDispatcher {
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async dispatchBatch(): Promise<{
    claimed: number
    published: number
    failed: number
  }> {
    const claimed = await this.dependencies.repository.claim({
      owner: this.dependencies.owner,
      now: this.now(),
      leaseMs: this.dependencies.leaseMs ?? 30_000,
      limit: this.dependencies.batchSize ?? 20
    })
    let published = 0
    let failed = 0
    for (const message of claimed) {
      try {
        await this.dependencies.publish(message)
        const result = await this.dependencies.repository.markPublished({
          id: message.id,
          owner: this.dependencies.owner,
          at: this.now()
        })
        if (result === 'published') published += 1
      } catch (error) {
        failed += 1
        const at = this.now()
        await this.dependencies.repository.recordFailure({
          id: message.id,
          owner: this.dependencies.owner,
          at,
          retryAt: at + this.retryDelay(message.attempts),
          maxAttempts: this.dependencies.maxAttempts ?? 5,
          errorSummary: safeErrorSummary(error)
        })
      }
    }
    return { claimed: claimed.length, published, failed }
  }

  private retryDelay(attempts: number): number {
    const base = this.dependencies.baseRetryMs ?? 1_000
    const maximum = this.dependencies.maxRetryMs ?? 60_000
    return Math.min(maximum, base * 2 ** Math.max(0, attempts - 1))
  }
}

function safeErrorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Dispatch failed'
  return message
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(authorization|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi,
      '$1=[REDACTED]'
    )
    .slice(0, 1_000)
}
