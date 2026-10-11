import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { registerTerminationSignals } from './termination-signals'

describe('termination signals', () => {
  it.each(['SIGINT', 'SIGTERM'])('requests graceful shutdown on %s', signal => {
    const source = new EventEmitter()
    const shutdown = vi.fn()
    registerTerminationSignals(source, shutdown)
    source.emit(signal)
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it('does not interrupt graceful shutdown when signals repeat', () => {
    const source = new EventEmitter()
    const shutdown = vi.fn()
    registerTerminationSignals(source, shutdown)
    source.emit('SIGTERM')
    source.emit('SIGINT')
    source.emit('SIGTERM')
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it('can detach handlers without removing other signal listeners', () => {
    const source = new EventEmitter()
    const shutdown = vi.fn()
    const other = vi.fn()
    source.on('SIGTERM', other)
    const dispose = registerTerminationSignals(source, shutdown)
    dispose()
    source.emit('SIGTERM')
    expect(shutdown).not.toHaveBeenCalled()
    expect(other).toHaveBeenCalledTimes(1)
  })
})
