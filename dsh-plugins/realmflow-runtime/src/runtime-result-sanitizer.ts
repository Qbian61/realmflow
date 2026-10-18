const SENSITIVE_RESULT_KEY =
  /^(?:authorization|cookie|credential|password|secret|token|api[-_]?key|access[-_]?token|refresh[-_]?token)$/i

export function sanitizeRuntimeResult(value: unknown, key = ''): unknown {
  if (SENSITIVE_RESULT_KEY.test(key)) return '[redacted]'
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRuntimeResult(item))
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeRuntimeResult(entryValue, entryKey)
      ])
    )
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}
