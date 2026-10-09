import type { JsonObject } from '../../../../domain/tool-protocol-validation'

const SENSITIVE_KEY =
  /(?:authorization|cookie|credential|password|secret|token|api.?key)/i
const SENSITIVE_TEXT =
  /\b(token|secret|password|api[_-]?key)=([^\s,;]+)/gi
const PROMPT_INJECTION =
  /\b(?:ignore|disregard|override)\b.{0,80}\b(?:instructions?|prompt|system|developer)\b/i

export function sanitizeConnectorResult(
  value: JsonObject,
  maximumBytes: number
): JsonObject {
  const redacted = redact(value) as JsonObject
  const promptInjectionSuspected = containsPromptInjection(redacted)
  const output = {
    ...redacted,
    _realmflow: {
      untrusted: true,
      promptInjectionSuspected
    }
  } satisfies JsonObject
  if (Buffer.byteLength(JSON.stringify(output)) > maximumBytes) {
    throw new Error('Connector result exceeded its size limit')
  }
  return output
}

function redact(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[redacted]'
  if (Array.isArray(value)) {
    return value.map((item) => redact(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, item]) => [
        itemKey,
        redact(item, itemKey)
      ])
    )
  }
  return typeof value === 'string'
    ? value.replace(SENSITIVE_TEXT, '$1=[redacted]')
    : value
}

function containsPromptInjection(value: unknown): boolean {
  if (typeof value === 'string') return PROMPT_INJECTION.test(value)
  if (Array.isArray(value)) return value.some(containsPromptInjection)
  if (value && typeof value === 'object') {
    return Object.values(value).some(containsPromptInjection)
  }
  return false
}
