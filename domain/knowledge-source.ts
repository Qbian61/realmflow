export type KnowledgeSourceType = 'file' | 'document' | 'repository'

export type KnowledgeSourceStatus =
  | 'registered'
  | 'syncing'
  | 'indexed'
  | 'stale'
  | 'failed'
  | 'removed'

export type KnowledgeSourceErrorCode =
  | 'source_unavailable'
  | 'permission_denied'
  | 'unsupported_format'
  | 'connector_unavailable'
  | 'indexing_failed'
  | 'interrupted'

export type KnowledgeSourceOperation =
  | 'start_sync'
  | 'complete_index'
  | 'mark_stale'
  | 'fail_sync'
  | 'retry_sync'
  | 'remove'
  | 'interrupt'

export type KnowledgeSource = {
  id: string
  workspaceId: string
  name: string
  type: KnowledgeSourceType
  locator: string
  detail: string
  sortOrder: number
  status: KnowledgeSourceStatus
  syncStartedAt?: number
  indexedAt?: number
  errorCode?: KnowledgeSourceErrorCode
  errorMessage?: string
  revision: number
  createdAt: number
  updatedAt: number
}

export type CreateKnowledgeSourceInput = Omit<
  KnowledgeSource,
  | 'name'
  | 'locator'
  | 'detail'
  | 'status'
  | 'revision'
  | 'createdAt'
  | 'updatedAt'
> & {
  name: string
  locator: string
  detail: string
  at: number
}

export type KnowledgeSourceTransition = {
  operation: KnowledgeSourceOperation
  at: number
  errorCode?: KnowledgeSourceErrorCode
}

const nextStatus: Record<
  KnowledgeSourceStatus,
  Partial<Record<KnowledgeSourceOperation, KnowledgeSourceStatus>>
> = {
  registered: { start_sync: 'syncing', remove: 'removed' },
  syncing: {
    complete_index: 'indexed',
    fail_sync: 'failed',
    interrupt: 'failed',
    remove: 'removed'
  },
  indexed: {
    start_sync: 'syncing',
    mark_stale: 'stale',
    remove: 'removed'
  },
  stale: { retry_sync: 'syncing', remove: 'removed' },
  failed: { retry_sync: 'syncing', remove: 'removed' },
  removed: {}
}

const errorMessages: Record<KnowledgeSourceErrorCode, string> = {
  source_unavailable: '无法读取知识源',
  permission_denied: '没有访问知识源的权限',
  unsupported_format: '暂不支持此知识源格式',
  connector_unavailable: '知识源连接器不可用',
  indexing_failed: '知识源索引失败',
  interrupted: '上次同步因应用中断而停止'
}

export function createKnowledgeSource(
  input: CreateKnowledgeSourceInput
): KnowledgeSource {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    type: input.type,
    locator: input.locator.trim(),
    detail: input.detail.trim(),
    sortOrder: input.sortOrder,
    status: 'registered',
    revision: 1,
    createdAt: input.at,
    updatedAt: input.at
  }
}

export function transitionKnowledgeSource(
  source: KnowledgeSource,
  transition: KnowledgeSourceTransition
): KnowledgeSource {
  const status = nextStatus[source.status][transition.operation]
  if (!status) {
    throw new Error(
      `Invalid knowledge source transition: ${source.status} -> ${transition.operation}`
    )
  }
  const errorCode =
    transition.operation === 'interrupt'
      ? 'interrupted'
      : transition.operation === 'fail_sync'
        ? transition.errorCode
        : undefined
  if (status === 'failed' && !errorCode) {
    throw new Error('Knowledge source failure requires an error code')
  }

  return {
    ...source,
    status,
    updatedAt: transition.at,
    ...(status === 'syncing'
      ? {
          syncStartedAt: transition.at,
          errorCode: undefined,
          errorMessage: undefined
        }
      : {}),
    ...(status === 'indexed'
      ? {
          indexedAt: transition.at,
          errorCode: undefined,
          errorMessage: undefined
        }
      : {}),
    ...(errorCode
      ? {
          errorCode,
          errorMessage: errorMessages[errorCode]
        }
      : {})
  }
}
