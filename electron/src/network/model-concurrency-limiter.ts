import type { ModelExecutionConfig } from '../../../domain/model'

type Waiter = {
  signal: AbortSignal
  resolve: (release: () => void) => void
  reject: (error: Error) => void
  onAbort: () => void
}

type ConcurrencyState = {
  active: number
  queue: Waiter[]
}

export class ModelConcurrencyLimiter {
  private readonly states = new Map<string, ConcurrencyState>()

  acquire(
    model: ModelExecutionConfig,
    signal: AbortSignal
  ): Promise<() => void> {
    if (signal.aborted) return Promise.reject(cancelled())
    const key = executionKey(model)
    const state = this.states.get(key) ?? { active: 0, queue: [] }
    this.states.set(key, state)
    if (state.active < model.maxConcurrency) {
      state.active += 1
      return Promise.resolve(this.release(key, state))
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        signal,
        resolve,
        reject,
        onAbort: () => {
          const index = state.queue.indexOf(waiter)
          if (index >= 0) state.queue.splice(index, 1)
          reject(cancelled())
        }
      }
      state.queue.push(waiter)
      signal.addEventListener('abort', waiter.onAbort, { once: true })
    })
  }

  clear(): void {
    this.states.clear()
  }

  private release(key: string, state: ConcurrencyState): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      state.active -= 1
      while (state.queue.length > 0) {
        const waiter = state.queue.shift()
        if (!waiter || waiter.signal.aborted) continue
        waiter.signal.removeEventListener('abort', waiter.onAbort)
        state.active += 1
        waiter.resolve(this.release(key, state))
        return
      }
      if (state.active === 0) this.states.delete(key)
    }
  }
}

function executionKey(model: ModelExecutionConfig): string {
  return JSON.stringify([
    model.providerType,
    model.baseUrl.replace(/\/+$/, ''),
    model.modelId
  ])
}

function cancelled(): Error {
  return new Error('Model request cancelled')
}
