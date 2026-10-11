import type { EventEmitter } from 'node:events'

export function registerTerminationSignals(source: Pick<EventEmitter, 'on' | 'off'>,
  shutdown: () => void): () => void {
  let requested = false
  const terminate = (): void => {
    if (requested) return
    requested = true
    shutdown()
  }
  source.on('SIGINT', terminate)
  source.on('SIGTERM', terminate)
  return () => {
    source.off('SIGINT', terminate)
    source.off('SIGTERM', terminate)
  }
}
