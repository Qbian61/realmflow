import { createHash } from 'node:crypto'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ToolExecutionError } from './tool-adapter'

export type ToolErrorCategory =
  | 'transient'
  | 'invalid_input'
  | 'unavailable'
  | 'scope'
  | 'conflict'
  | 'internal'

type ErrorDescriptor = {
  publicMessage: string
  category: ToolErrorCategory
  recoveryHint?: string
  retryable?: boolean
}

type ErrorEnvelopeOptions = {
  fallbackCode: string
  fallbackMessage: string
}

const DEFAULT_OPTIONS: ErrorEnvelopeOptions = {
  fallbackCode: 'tool_execution_failed',
  fallbackMessage: 'Tool execution failed'
}

const DIAGNOSTIC_ID = /^toolerr_[a-f0-9]{16}$/
const SAFE_ERROR_CODE =
  /^(?:tool|file|image|archive|artifact|document|fixed_layout|office|legacy_office|word|spreadsheet|presentation|pdf|process|web|browser|git|runtime|skill|connector|mcp|sandbox|permission|directory|direct|definition|arguments|binding|output)_[a-z0-9_]+$/
const ABSOLUTE_PATH = /(?:\/Users|\/home|\/tmp|[A-Za-z]:\\)[^\s"',}]*/g
const URL = /\bhttps?:\/\/[^\s"',}]+/gi
const INLINE_SECRET =
  /\b(?:authorization|cookie|credential|password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi

export function createToolExecutionError(
  error: unknown,
  options: Partial<ErrorEnvelopeOptions> = {}
): ToolExecutionError {
  const resolved = { ...DEFAULT_OPTIONS, ...options }
  const rawMessage = errorMessage(error) ?? resolved.fallbackMessage
  const code =
    safeErrorCode(error) ??
    inferErrorCode(rawMessage) ??
    resolved.fallbackCode
  return envelope({
    code,
    rawMessage,
    retryable: retryable(error),
    details: details(error)
  })
}

export function normalizeToolExecutionError(
  error: ToolExecutionError | undefined,
  options: Partial<ErrorEnvelopeOptions> = {}
): ToolExecutionError {
  const resolved = { ...DEFAULT_OPTIONS, ...options }
  if (!error) {
    return envelope({
      code: resolved.fallbackCode,
      rawMessage: resolved.fallbackMessage,
      retryable: false
    })
  }
  const rawMessage = error.message || error.publicMessage || resolved.fallbackMessage
  const code = SAFE_ERROR_CODE.test(error.code)
    ? error.code
    : inferErrorCode(rawMessage) ?? resolved.fallbackCode
  const normalized = envelope({
    code,
    rawMessage,
    retryable: error.retryable,
    details: error.details,
    diagnosticId: DIAGNOSTIC_ID.test(String(error.diagnosticId))
      ? error.diagnosticId
      : undefined
  })
  return {
    ...normalized,
    ...(error.publicMessage && !containsSensitiveText(error.publicMessage)
      ? { publicMessage: error.publicMessage.slice(0, 500) }
      : {}),
    ...(error.recoveryHint && !containsSensitiveText(error.recoveryHint)
      ? { recoveryHint: error.recoveryHint.slice(0, 500) }
      : {})
  }
}

export function sanitizeToolFailureMessage(value: string): string {
  return sanitizeText(value)
}

function envelope(input: {
  code: string
  rawMessage: string
  retryable: boolean
  details?: JsonObject
  diagnosticId?: string
}): ToolExecutionError {
  const descriptor = descriptorFor(input.code, input.rawMessage)
  const publicMessage = descriptor.publicMessage
  return {
    code: input.code,
    message: publicMessage,
    publicMessage,
    retryable: descriptor.retryable ?? input.retryable,
    category: descriptor.category,
    ...(descriptor.recoveryHint
      ? { recoveryHint: descriptor.recoveryHint }
      : {}),
    diagnosticId:
      input.diagnosticId ?? diagnosticId(input.code, input.rawMessage),
    ...(input.details ? { details: sanitizeJson(input.details) } : {})
  }
}

function descriptorFor(code: string, rawMessage: string): ErrorDescriptor {
  if (code === 'runtime_resource_stale') {
    return {
      publicMessage: 'Runtime resource is stale for the current run',
      category: 'transient',
      recoveryHint: 'Retry the tool after refreshing the runtime resource.',
      retryable: true
    }
  }
  if (code === 'git_not_repository') {
    return {
      publicMessage:
        'Selected folder is not a Git repository. Choose a Git repository folder or a folder inside one.',
      category: 'unavailable',
      recoveryHint: 'Choose a Git repository folder or a folder inside one.',
      retryable: false
    }
  }
  if (code === 'git_repository_outside_scope') {
    return {
      publicMessage:
        'Git repository is outside the authorized scope. Choose the repository folder as the scope root.',
      category: 'scope',
      recoveryHint: 'Choose the repository folder as the scope root.',
      retryable: false
    }
  }
  if (code === 'tool_scope_mismatch') {
    return {
      publicMessage: 'Tool path is outside the authorized scope',
      category: 'scope',
      recoveryHint: 'Use a path inside an authorized scope root.',
      retryable: false
    }
  }
  if (code === 'web_configuration_changed') {
    return {
      publicMessage: 'Web configuration changed; request authorization again',
      category: 'conflict',
      recoveryHint: 'Request authorization again with the current web provider settings.',
      retryable: false
    }
  }
  if (/_arguments?_invalid$|_input_invalid$|_schema_invalid$/.test(code)) {
    return {
      publicMessage: safePublicMessage(rawMessage, 'Tool arguments are invalid'),
      category: 'invalid_input',
      recoveryHint: 'Fix the tool arguments and call the tool again.',
      retryable: false
    }
  }
  if (/_denied$|^permission_|_policy_/.test(code)) {
    return {
      publicMessage: safePublicMessage(rawMessage, 'Tool execution was denied'),
      category: 'scope',
      retryable: false
    }
  }
  if (/_timeout$|_rate_limited$|_stale$/.test(code)) {
    return {
      publicMessage: safePublicMessage(rawMessage, 'Tool runtime is temporarily unavailable'),
      category: 'transient',
      retryable: true
    }
  }
  if (/_unavailable$/.test(code)) {
    return {
      publicMessage: safePublicMessage(rawMessage, 'Tool runtime is unavailable'),
      category: 'unavailable'
    }
  }
  return {
    publicMessage: safePublicMessage(rawMessage, 'Tool execution failed'),
    category: 'internal',
    retryable: false
  }
}

function safePublicMessage(value: string, fallback: string): string {
  if (!value.trim()) return fallback
  const sanitized = sanitizeText(value).slice(0, 500)
  return containsRedactionMarker(sanitized) ? fallback : sanitized
}

function inferErrorCode(message: string): string | undefined {
  if (/outside the bound workspace|outside the authorized scope/i.test(message)) {
    return 'tool_scope_mismatch'
  }
  return undefined
}

function safeErrorCode(error: unknown): string | undefined {
  if (
    isRecord(error) &&
    typeof error.code === 'string' &&
    SAFE_ERROR_CODE.test(error.code)
  ) {
    return error.code
  }
  return undefined
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim()) return error.message
  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }
  return undefined
}

function retryable(error: unknown): boolean {
  return isRecord(error) && error.retryable === true
}

function details(error: unknown): JsonObject | undefined {
  return isRecord(error) && isRecord(error.details)
    ? (error.details as JsonObject)
    : undefined
}

function sanitizeText(value: string): string {
  return value
    .replace(URL, '[url]')
    .replace(ABSOLUTE_PATH, '[local path]')
    .replace(INLINE_SECRET, '[REDACTED]')
}

function containsSensitiveText(value: string): boolean {
  return sanitizeText(value) !== value
}

function containsRedactionMarker(value: string): boolean {
  return value.includes('[url]') ||
    value.includes('[local path]') ||
    value.includes('[REDACTED]')
}

function sanitizeJson(value: JsonObject): JsonObject {
  return sanitizeUnknown(value) as JsonObject
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeText(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeUnknown(item))
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeUnknown(item)
      ])
    )
  }
  return value
}

function diagnosticId(code: string, rawMessage: string): string {
  return `toolerr_${createHash('sha256')
    .update(`${code}:${rawMessage}`)
    .digest('hex')
    .slice(0, 16)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
