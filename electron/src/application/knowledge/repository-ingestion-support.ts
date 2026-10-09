import { createHash } from 'node:crypto'
import { createKnowledgeSource, type KnowledgeSource } from '../../../../domain/knowledge-source'
import type { RepositorySource } from '../../../../domain/repository-source'
import type {
  RepositoryBeginResult,
  RepositoryCompletionResult,
  RepositorySyncResult
} from './repository-ingestion-store'

export function createRepositoryKnowledgeSource(
  repository: RepositorySource,
  name: string,
  sortOrder: number,
  at: number
): KnowledgeSource {
  return createKnowledgeSource({
    id: repository.sourceId,
    workspaceId: repository.workspaceId,
    name,
    type: 'repository',
    locator: repository.locator,
    detail: repository.mode === 'local' ? '本地仓库' : '远程仓库',
    sortOrder,
    at
  })
}

export function unwrapRepositoryBegin(
  result: Exclude<RepositoryBeginResult, { status: 'started' }>
): RepositorySyncResult {
  if (result.status === 'replayed') return result.result
  if (result.status === 'revision_conflict') {
    throw new Error('Repository revision conflict')
  }
  if (result.status === 'not_found') throw new Error('Repository source not found')
  throw new Error('Repository idempotency conflict')
}

export function unwrapRepositoryCompletion(
  result: RepositoryCompletionResult
): RepositorySyncResult {
  if (result.status === 'applied' || result.status === 'replayed') {
    return result.result
  }
  if (result.status === 'revision_conflict') {
    throw new Error('Repository revision conflict')
  }
  if (result.status === 'not_found') throw new Error('Repository source not found')
  throw new Error('Repository idempotency conflict')
}

export function validateRepositoryCreateCommand(command: {
  id: string
  workspaceId: string
  name: string
  sortOrder: number
  idempotencyKey: string
}): void {
  validateRepositoryId(command.id, 'Repository source id')
  validateRepositoryId(command.workspaceId, 'Workspace id')
  validateRepositoryIdempotencyKey(command.idempotencyKey)
  if (!command.name.trim()) throw new Error('Repository name is required')
  if (!Number.isSafeInteger(command.sortOrder)) {
    throw new Error('Repository sort order is invalid')
  }
}

export function validateRepositoryId(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error(`${label} is invalid`)
  }
}

export function validateRepositoryIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error('Repository idempotency key is invalid')
  }
}

export function validateRepositoryRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Repository revision is invalid')
  }
}

export function repositoryFingerprint(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function errorCodeForRepositoryFailure(
  error: unknown
):
  | 'source_unavailable'
  | 'permission_denied'
  | 'unsupported_format'
  | 'connector_unavailable'
  | 'indexing_failed' {
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'EACCES' || code === 'EPERM') return 'permission_denied'
  if (
    error instanceof Error &&
    (error.message.includes('not a Git work tree') ||
      error.message.includes('ENOENT'))
  ) {
    return 'source_unavailable'
  }
  return 'indexing_failed'
}
