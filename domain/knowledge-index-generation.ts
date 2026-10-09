export type KnowledgeIndexGenerationStatus =
  | 'staging'
  | 'current'
  | 'retired'
  | 'failed'

export type WorkspaceKnowledgePointPayload = {
  schemaVersion: 1
  profileId: string
  workspaceId: string
  generationId: string
  sourceKind:
    | 'file'
    | 'document'
    | 'repository'
    | 'artifact'
    | 'requirement_memory'
    | 'conversation_note'
    | 'decision'
    | 'retrospective'
  sourceId: string
  sourceVersion: string
  requirementId?: string
  nodeId?: string
  sessionId?: string
  documentId: string
  documentKey: string
  title: string
  content: string
  chunkId: string
  chunkOrdinal: number
  startOffset: number
  endOffset: number
  startLine: number
  endLine: number
  checksum: string
  createdAt: number
}

export type WorkspaceKnowledgePoint = {
  id: string
  vector: {
    dense: number[]
    bm25: {
      text: string
      model: 'qdrant/bm25'
    }
  }
  payload: WorkspaceKnowledgePointPayload
}

const GENERATION_TRANSITIONS: Readonly<
  Record<
    KnowledgeIndexGenerationStatus,
    readonly KnowledgeIndexGenerationStatus[]
  >
> = {
  staging: ['current', 'failed'],
  current: ['retired'],
  retired: [],
  failed: []
}

export function transitionKnowledgeIndexGeneration(
  current: KnowledgeIndexGenerationStatus,
  next: KnowledgeIndexGenerationStatus
): KnowledgeIndexGenerationStatus {
  if (!GENERATION_TRANSITIONS[current].includes(next)) {
    throw new Error(
      `Invalid knowledge index generation transition: ${current} -> ${next}`
    )
  }
  return next
}

export function createWorkspaceKnowledgePoint(input: {
  id: string
  dense: number[]
  payload: WorkspaceKnowledgePointPayload
}): WorkspaceKnowledgePoint {
  const { payload, dense } = input
  const magnitude = Math.sqrt(
    dense.reduce((sum, value) => sum + value * value, 0)
  )
  if (
    !UUID_PATTERN.test(input.id) ||
    dense.length !== 768 ||
    dense.some((value) => !Number.isFinite(value)) ||
    !Number.isFinite(magnitude) ||
    Math.abs(magnitude - 1) > 1e-4 ||
    payload.schemaVersion !== 1 ||
    !requiredStrings(payload).every((value) => value.length > 0) ||
    !Number.isSafeInteger(payload.chunkOrdinal) ||
    payload.chunkOrdinal < 0 ||
    !Number.isSafeInteger(payload.startOffset) ||
    !Number.isSafeInteger(payload.endOffset) ||
    payload.startOffset < 0 ||
    payload.endOffset <= payload.startOffset ||
    !Number.isSafeInteger(payload.startLine) ||
    !Number.isSafeInteger(payload.endLine) ||
    payload.startLine < 1 ||
    payload.endLine < payload.startLine ||
    !SHA256_PATTERN.test(payload.checksum) ||
    !Number.isSafeInteger(payload.createdAt) ||
    payload.createdAt < 0
  ) {
    throw new Error('Workspace knowledge point is invalid')
  }
  return {
    id: input.id,
    vector: {
      dense: [...dense],
      bm25: {
        text: payload.content,
        model: 'qdrant/bm25'
      }
    },
    payload: { ...payload }
  }
}

const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/

function requiredStrings(
  payload: WorkspaceKnowledgePointPayload
): string[] {
  return [
    payload.profileId,
    payload.workspaceId,
    payload.generationId,
    payload.sourceKind,
    payload.sourceId,
    payload.sourceVersion,
    payload.documentId,
    payload.documentKey,
    payload.title,
    payload.content,
    payload.chunkId
  ]
}
