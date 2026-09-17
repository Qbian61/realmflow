import {
  isTerminalAiRunStatus,
  type AiRunEvent,
  type AiRunStatus
} from '../../../../domain/ai-run'
import { IPC_EVENT_CHANNELS } from '../../../../shared/ipc-contract'
import type { RunEventPublisher } from '../application/ports'

type EventTarget = {
  id: number
  isDestroyed: () => boolean
  send: (channel: string, event: AiRunEvent) => void
  once?: (event: 'destroyed', listener: () => void) => void
}

export class RendererRunEventPublisher implements RunEventPublisher {
  private readonly subscribers = new Map<string, Set<EventTarget>>()
  private readonly pending = new Map<string, AiRunEvent[]>()

  subscribe(runId: string, target: EventTarget): void {
    const targets = this.subscribers.get(runId) ?? new Set<EventTarget>()
    targets.add(target)
    this.subscribers.set(runId, targets)
    target.once?.('destroyed', () => this.unsubscribeTarget(target.id))

    const pending = this.pending.get(runId) ?? []
    for (const event of pending) {
      if (!target.isDestroyed()) {
        target.send(IPC_EVENT_CHANNELS.aiRunEvent, event)
      }
    }
    if (pending.some((event) => isTerminalEvent(event))) {
      this.subscribers.delete(runId)
    }
    this.pending.delete(runId)
  }

  publish(event: AiRunEvent): void {
    const targets = this.subscribers.get(event.runId)
    if (!targets || targets.size === 0) {
      const pending = this.pending.get(event.runId) ?? []
      pending.push(event)
      this.pending.set(event.runId, pending)
      return
    }
    for (const target of targets) {
      if (!target.isDestroyed()) {
        target.send(IPC_EVENT_CHANNELS.aiRunEvent, event)
      }
    }
    if (isTerminalEvent(event)) this.subscribers.delete(event.runId)
  }

  private unsubscribeTarget(targetId: number): void {
    for (const [runId, targets] of this.subscribers) {
      for (const target of targets) {
        if (target.id === targetId) targets.delete(target)
      }
      if (targets.size === 0) this.subscribers.delete(runId)
    }
  }
}

function isTerminalEvent(event: AiRunEvent): boolean {
  const statusByType: Partial<Record<AiRunEvent['type'], AiRunStatus>> = {
    'run.completed': 'completed',
    'run.failed': 'failed',
    'run.cancelled': 'cancelled'
  }
  const status = statusByType[event.type]
  return status ? isTerminalAiRunStatus(status) : false
}
