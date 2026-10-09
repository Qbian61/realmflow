import {
  requireInteger,
  requireText
} from './tool-protocol-validation'
import {
  cloneToolDomainEvent,
  type ToolDomainEvent
} from './tool-domain-event'

export function upcastToolDomainEvent(
  event: ToolDomainEvent
): ToolDomainEvent {
  const currentVersion =
    event.eventType === 'tool.progress_reported' ? 2 : 1
  if (event.eventSchemaVersion > currentVersion) {
    throw new Error('Tool event schema version is unsupported')
  }
  if (
    event.eventType !== 'tool.progress_reported' ||
    event.eventSchemaVersion === 2
  ) {
    return cloneToolDomainEvent(event)
  }
  const percent = requireInteger(
    event.payload.percent,
    'progress percent',
    0,
    100
  )
  const attempt = requireInteger(
    event.payload.attempt,
    'progress attempt',
    1,
    Number.MAX_SAFE_INTEGER
  )
  const message =
    event.payload.message === undefined
      ? undefined
      : requireText(event.payload.message, 'progress message', true)
  return {
    ...cloneToolDomainEvent(event),
    eventSchemaVersion: 2,
    payload: {
      attempt,
      completed: percent,
      total: 100,
      ...(message === undefined ? {} : { message })
    }
  }
}
