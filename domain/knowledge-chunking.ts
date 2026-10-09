import { createHash } from 'node:crypto'
import {
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION,
  VECTOR_INDEX_CHUNKER_VERSION
} from './vector-index-profile'

export const KNOWLEDGE_CHUNKER_PROFILE = Object.freeze({
  version: VECTOR_INDEX_CHUNKER_VERSION,
  targetTokens: 384,
  maxTokens: 512,
  overlapTokens: 64
} as const)

export type WorkspaceKnowledgeSourceKind =
  | 'file'
  | 'document'
  | 'repository'
  | 'artifact'
  | 'requirement_memory'
  | 'conversation_note'
  | 'decision'
  | 'retrospective'

export type KnowledgeChunkSourceDocument = Readonly<{
  documentKey: string
  content: string
}>

export type CodeChunkLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'

export type CodeChunkKind =
  | 'module'
  | 'class'
  | 'function'
  | 'method'
  | 'struct'

export type ChunkedKnowledgeChunk = Readonly<{
  ordinal: number
  content: string
  tokenCount: number
  startOffset: number
  endOffset: number
  startLine: number
  endLine: number
  checksum: string
  language?: CodeChunkLanguage
  symbol?: string
  kind?: CodeChunkKind
}>

export type ChunkedKnowledgeDocument = Readonly<{
  documentKey: string
  chunks: readonly ChunkedKnowledgeChunk[]
}>

export type ChunkedKnowledgeResult = Readonly<{
  chunkerVersion: typeof VECTOR_INDEX_CHUNKER_VERSION
  embeddingModel: typeof GTE_EMBEDDING_MODEL
  embeddingRevision: typeof GTE_EMBEDDING_REVISION
  documents: readonly ChunkedKnowledgeDocument[]
}>

const KNOWLEDGE_ID_NAMESPACE = '8f6ed3e0-b722-5235-a91c-4ac68847a023'

export function validateChunkedKnowledgeDocuments(
  sources: readonly KnowledgeChunkSourceDocument[],
  value: unknown
): ChunkedKnowledgeDocument[] {
  if (!isRecord(value) || !Array.isArray(value.documents)) {
    throw invalidChunks()
  }
  if (
    value.chunkerVersion !== KNOWLEDGE_CHUNKER_PROFILE.version ||
    value.embeddingModel !== GTE_EMBEDDING_MODEL ||
    value.embeddingRevision !== GTE_EMBEDDING_REVISION ||
    value.documents.length !== sources.length ||
    !value.documents.every(
      (document) =>
        isRecord(document) &&
        typeof document.documentKey === 'string' &&
        Array.isArray(document.chunks)
    )
  ) {
    throw invalidChunks()
  }
  const result = value as ChunkedKnowledgeResult
  const sourceByKey = uniqueByDocumentKey(sources)
  const documentsByKey = uniqueByDocumentKey(result.documents)
  if (documentsByKey.size !== sourceByKey.size) throw invalidChunks()

  return sources.map((source) => {
    const document = documentsByKey.get(source.documentKey)
    if (!document || !Array.isArray(document.chunks)) throw invalidChunks()
    validateChunks(source.content, document.chunks)
    return {
      documentKey: document.documentKey,
      chunks: document.chunks.map((chunk) => ({ ...chunk }))
    }
  })
}

export function createKnowledgeDocumentId(input: {
  sourceKind: WorkspaceKnowledgeSourceKind
  sourceId: string
  documentKey: string
}): string {
  return uuidV5(
    KNOWLEDGE_ID_NAMESPACE,
    canonicalTuple([
      'document',
      input.sourceKind,
      input.sourceId,
      input.documentKey
    ])
  )
}

export function createKnowledgeChunkId(input: {
  documentId: string
  ordinal: number
  checksum: string
}): string {
  return uuidV5(
    input.documentId,
    canonicalTuple([
      'chunk',
      KNOWLEDGE_CHUNKER_PROFILE.version,
      input.ordinal,
      input.checksum
    ])
  )
}

export function createKnowledgePointId(input: {
  profileId: string
  generationId: string
  chunkId: string
}): string {
  return uuidV5(
    KNOWLEDGE_ID_NAMESPACE,
    canonicalTuple([
      'point',
      input.profileId,
      input.generationId,
      input.chunkId
    ])
  )
}

function validateChunks(
  source: string,
  chunks: readonly ChunkedKnowledgeChunk[]
): void {
  if (!source.trim()) {
    if (chunks.length !== 0) throw invalidChunks()
    return
  }
  if (chunks.length === 0) throw invalidChunks()

  let previousStart = -1
  let previousEnd = 0
  chunks.forEach((chunk, ordinal) => {
    if (
      !isRecord(chunk) ||
      chunk.ordinal !== ordinal ||
      typeof chunk.content !== 'string' ||
      !Number.isSafeInteger(chunk.tokenCount) ||
      chunk.tokenCount < 1 ||
      chunk.tokenCount > KNOWLEDGE_CHUNKER_PROFILE.maxTokens ||
      !validRange(source, chunk.startOffset, chunk.endOffset) ||
      source.slice(chunk.startOffset, chunk.endOffset) !== chunk.content ||
      typeof chunk.checksum !== 'string' ||
      chunk.checksum !== checksum(chunk.content) ||
      !validCodeMetadata(chunk) ||
      !Number.isSafeInteger(chunk.startLine) ||
      !Number.isSafeInteger(chunk.endLine) ||
      chunk.startLine !== lineAt(source, chunk.startOffset) ||
      chunk.endLine !== lineAt(source, chunk.endOffset - 1) ||
      chunk.startOffset <= previousStart ||
      chunk.startOffset > previousEnd ||
      chunk.endOffset <= previousEnd
    ) {
      throw invalidChunks()
    }
    previousStart = chunk.startOffset
    previousEnd = chunk.endOffset
  })
  if (chunks[0]?.startOffset !== 0 || previousEnd !== source.length) {
    throw invalidChunks()
  }
}

function validCodeMetadata(chunk: Record<string, unknown>): boolean {
  const { language, symbol, kind } = chunk
  if (language === undefined && symbol === undefined && kind === undefined) {
    return true
  }
  if (
    ![
      'typescript',
      'javascript',
      'python',
      'go',
      'rust',
      'java'
    ].includes(String(language)) ||
    !['module', 'class', 'function', 'method', 'struct'].includes(
      String(kind)
    )
  ) {
    return false
  }
  return kind === 'module'
    ? symbol === undefined
    : typeof symbol === 'string' && symbol.length > 0
}

function validRange(source: string, start: number, end: number): boolean {
  return (
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= source.length &&
    isUtf16Boundary(source, start) &&
    isUtf16Boundary(source, end)
  )
}

function isUtf16Boundary(source: string, offset: number): boolean {
  if (offset <= 0 || offset >= source.length) return true
  const before = source.charCodeAt(offset - 1)
  const after = source.charCodeAt(offset)
  return !(
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff
  )
}

function uniqueByDocumentKey<
  T extends Readonly<{ documentKey: string }>
>(documents: readonly T[]): Map<string, T> {
  const byKey = new Map<string, T>()
  for (const document of documents) {
    if (
      !document.documentKey ||
      document.documentKey.includes('\0') ||
      byKey.has(document.documentKey)
    ) {
      throw invalidChunks()
    }
    byKey.set(document.documentKey, document)
  }
  return byKey
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function canonicalTuple(values: readonly (string | number)[]): string {
  return JSON.stringify(values)
}

function uuidV5(namespace: string, name: string): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll('-', ''), 'hex')
  if (namespaceBytes.length !== 16) {
    throw new Error('Knowledge UUID namespace is invalid')
  }
  const digest = createHash('sha1')
    .update(namespaceBytes)
    .update(name, 'utf8')
    .digest()
    .subarray(0, 16)
  digest[6] = (digest[6] & 0x0f) | 0x50
  digest[8] = (digest[8] & 0x3f) | 0x80
  const hex = digest.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-')
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function lineAt(content: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1
  }
  return line
}

function invalidChunks(): Error {
  return new Error('Knowledge chunks are invalid')
}
