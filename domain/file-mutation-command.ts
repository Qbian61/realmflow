import type { JsonObject } from './tool-protocol-validation'

export type FileMutationMode = 'preview' | 'commit'

export type FileMutationPrecondition =
  | { kind: 'revision'; target: string; value: number }
  | { kind: 'checksum'; target: string; value: string }
  | { kind: 'absence'; target: string }

export type FileMutationOperation = {
  kind: string
  target: string
  source?: string
}

export type FileMutationCommand = {
  mutationId: string
  idempotencyKey: string
  toolId: string
  mode: FileMutationMode
  preconditions: FileMutationPrecondition[]
  operations: FileMutationOperation[]
}

export function createFileMutationCommand(input: {
  mutationId: string
  idempotencyKey: string
  toolId: string
  mode: FileMutationMode
  arguments: JsonObject
}): FileMutationCommand {
  requireNonEmpty(input.mutationId, 'File mutation ID')
  requireNonEmpty(input.idempotencyKey, 'File mutation idempotency key')
  requireNonEmpty(input.toolId, 'File mutation Tool ID')

  const target = mutationTarget(input.arguments)
  const preconditions = collectPreconditions(input.arguments, target)
  if (preconditions.length === 0) {
    throw new Error('File mutation requires a version or absence precondition')
  }

  return {
    mutationId: input.mutationId,
    idempotencyKey: input.idempotencyKey,
    toolId: input.toolId,
    mode: input.mode,
    preconditions,
    operations: [
      {
        kind: input.toolId.replace(/^builtin\./, ''),
        target,
        ...(typeof input.arguments.sourcePath === 'string'
          ? { source: input.arguments.sourcePath }
          : {})
      }
    ]
  }
}

function collectPreconditions(
  args: JsonObject,
  target: string
): FileMutationPrecondition[] {
  const preconditions: FileMutationPrecondition[] = []
  if (Number.isSafeInteger(args.expectedRevision)) {
    preconditions.push({
      kind: 'revision',
      target: requireString(args.sessionId, 'File mutation session'),
      value: args.expectedRevision as number
    })
  }
  if (typeof args.expectedChecksum === 'string') {
    preconditions.push({
      kind: 'checksum',
      target:
        typeof args.sourcePath === 'string'
          ? args.sourcePath
          : requireString(args.path, 'File mutation path'),
      value: requireChecksum(args.expectedChecksum)
    })
  }
  if (Array.isArray(args.sources)) {
    for (const source of args.sources) {
      if (!isRecord(source)) continue
      preconditions.push({
        kind: 'checksum',
        target: requireString(source.path, 'File mutation source path'),
        value: requireChecksum(source.expectedChecksum)
      })
    }
  }
  if (requiresAbsentTarget(args)) {
    preconditions.push({ kind: 'absence', target })
  }
  return preconditions
}

function mutationTarget(args: JsonObject): string {
  for (const key of ['outputPath', 'targetPath', 'path', 'sessionId']) {
    if (typeof args[key] === 'string' && args[key].length > 0) {
      return args[key]
    }
  }
  throw new Error('File mutation target is required')
}

function requiresAbsentTarget(args: JsonObject): boolean {
  return (
    typeof args.outputPath === 'string' ||
    typeof args.targetPath === 'string' ||
    args.mode === 'create' ||
    args.expectedAbsent === true
  )
}

function requireChecksum(value: unknown): string {
  const checksum = requireString(value, 'File mutation checksum')
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error('File mutation checksum is invalid')
  }
  return checksum
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`)
  }
  return value
}

function requireNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
