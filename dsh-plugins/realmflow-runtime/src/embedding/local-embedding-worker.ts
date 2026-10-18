import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, posix as posixPath } from 'node:path'
import type {
  ChunkedKnowledgeChunk,
  ChunkedKnowledgeResult,
  KnowledgeChunkSourceDocument
} from '../../../../domain/knowledge-chunking'
import {
  GTE_EMBEDDING_DIMENSIONS,
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION
} from '../../../../domain/vector-index-profile'
import type {
  DshEmbeddingProfile,
  DshEmbeddingWorkerRequest,
  DshEmbeddingWorkerResult
} from '../../../../shared/dsh-embedding-contract'

const LOCAL_EMBEDDING_RUNTIME = 'onnxruntime-cpu'
const MAX_MODEL_TOKENS = 512
const MAX_BATCH_TOKENS = 8_192
const MAX_DOCUMENTS = 128
const MAX_PAYLOAD_BYTES = 1024 * 1024
const TARGET_CHUNK_TOKENS = 384
const MAX_CHUNK_TOKENS = 512
const OVERLAP_TOKENS = 64
const MANIFEST_KEYS = new Set([
  'schemaVersion',
  'model',
  'revision',
  'dimensions',
  'runtime',
  'files'
])
const FILE_KEYS = new Set(['path', 'size', 'sha256'])
const REQUIRED_FILES = new Set([
  'model.onnx',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'config.json',
  'pooling.json',
  'configuration.py',
  'modeling.py',
  'LICENSE'
])
const SENSITIVE_DIRECTORIES = new Set([
  '.git',
  '.realmflow',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  'target',
  'vendor'
])
const SENSITIVE_FILES = new Set([
  '.env',
  'credentials.json',
  '.npmrc',
  '.pypirc'
])

export type LocalEmbeddingModelAsset = Readonly<{
  path: string
  size: number
  sha256: string
}>

export type LocalEmbeddingModelManifest = Readonly<{
  schemaVersion: 1
  model: typeof GTE_EMBEDDING_MODEL
  revision: typeof GTE_EMBEDDING_REVISION
  dimensions: typeof GTE_EMBEDDING_DIMENSIONS
  runtime: typeof LOCAL_EMBEDDING_RUNTIME
  files: readonly LocalEmbeddingModelAsset[]
}>

export type DshLocalEmbeddingHealth = Readonly<{
  status: 'ready'
  model: typeof GTE_EMBEDDING_MODEL
  revision: typeof GTE_EMBEDDING_REVISION
  dimensions: typeof GTE_EMBEDDING_DIMENSIONS
  normalize: 'L2'
  runtime: typeof LOCAL_EMBEDDING_RUNTIME
}>

export type TokenizerOffsets = Readonly<{
  tokenCount: number
  offsets: readonly (readonly [number, number])[]
}>

export type DshLocalEmbeddingBackend = {
  countTokens(text: string): number | Promise<number>
  tokenizeWithOffsets(text: string): TokenizerOffsets | Promise<TokenizerOffsets>
  tokenOffsets(text: string): readonly (readonly [number, number])[] | Promise<readonly (readonly [number, number])[]>
  infer(
    texts: readonly string[],
    maxTokens: number
  ): Promise<{
    hiddenStates: readonly (readonly (readonly number[])[])[]
    attentionMasks: readonly (readonly number[])[]
  }>
  chunkKnowledgeDocuments?(
    documents: readonly KnowledgeChunkSourceDocument[]
  ): Promise<ChunkedKnowledgeResult>
}

export type DshLocalEmbeddingBackendFactory = {
  load(input: {
    assetRoot: string
    profile: DshEmbeddingProfile
  }): Promise<DshLocalEmbeddingBackend>
}

export type DshLocalEmbeddingWorkerOptions = {
  assetRoot: string
  profile: DshEmbeddingProfile
  backendFactory: DshLocalEmbeddingBackendFactory
}

export class DshLocalEmbeddingWorker {
  private backendPromise: Promise<DshLocalEmbeddingBackend> | undefined

  constructor(private readonly options: DshLocalEmbeddingWorkerOptions) {
    assertLocalProfile(options.profile)
  }

  async health(): Promise<DshLocalEmbeddingHealth> {
    await this.backend()
    return localEmbeddingHealth()
  }

  async embed(
    request: DshEmbeddingWorkerRequest
  ): Promise<DshEmbeddingWorkerResult> {
    assertSameProfile(this.options.profile, request.profile)
    throwIfAborted(request.signal)
    assertEmbeddingTexts(request.texts)
    const backend = await this.backend()
    const tokenCounts = await Promise.all(
      request.texts.map((text) => backend.countTokens(text))
    )
    if (
      tokenCounts.some((count) => count < 1 || count > MAX_MODEL_TOKENS) ||
      tokenCounts.reduce((sum, count) => sum + count, 0) > MAX_BATCH_TOKENS
    ) {
      throw new Error('Embedding request limit exceeded')
    }
    throwIfAborted(request.signal)
    const output = await backend.infer(request.texts, MAX_MODEL_TOKENS)
    return {
      profile: request.profile,
      vectors: clsPoolAndNormalize(
        output.hiddenStates,
        output.attentionMasks
      )
    }
  }

  async chunkKnowledgeDocuments(request: {
    documents: readonly KnowledgeChunkSourceDocument[]
    signal?: AbortSignal
  }): Promise<ChunkedKnowledgeResult> {
    throwIfAborted(request.signal)
    assertChunkDocuments(request.documents)
    const backend = await this.backend()
    if (backend.chunkKnowledgeDocuments) {
      return backend.chunkKnowledgeDocuments(request.documents)
    }
    return chunkKnowledgeDocumentsWithTokenizer(request.documents, backend)
  }

  private backend(): Promise<DshLocalEmbeddingBackend> {
    this.backendPromise ??= (async () => {
      await verifyLocalEmbeddingModelAssets(this.options.assetRoot)
      return this.options.backendFactory.load({
        assetRoot: this.options.assetRoot,
        profile: this.options.profile
      })
    })()
    return this.backendPromise
  }
}

export function createLocalDshEmbeddingProfile(
  profileDigest: string
): DshEmbeddingProfile {
  return {
    provider: 'local',
    model: GTE_EMBEDDING_MODEL,
    revision: GTE_EMBEDDING_REVISION,
    dimensions: GTE_EMBEDDING_DIMENSIONS,
    normalization: 'L2',
    distance: 'Cosine',
    profileDigest
  }
}

export async function verifyLocalEmbeddingModelAssets(
  root: string
): Promise<LocalEmbeddingModelManifest> {
  const manifest = await readLocalEmbeddingModelManifest(root)
  for (const asset of manifest.files) {
    let content: Buffer
    try {
      content = await readFile(join(root, asset.path))
    } catch (error) {
      throw missingAssets(error)
    }
    if (
      content.byteLength !== asset.size ||
      createHash('sha256').update(content).digest('hex') !== asset.sha256
    ) {
      throw invalidAssets()
    }
  }
  return manifest
}

export async function readLocalEmbeddingModelManifest(
  root: string
): Promise<LocalEmbeddingModelManifest> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
  } catch (error) {
    throw missingAssets(error)
  }
  if (
    !isRecord(raw) ||
    !hasExactKeys(raw, MANIFEST_KEYS) ||
    raw.schemaVersion !== 1 ||
    raw.model !== GTE_EMBEDDING_MODEL ||
    raw.revision !== GTE_EMBEDDING_REVISION ||
    raw.dimensions !== GTE_EMBEDDING_DIMENSIONS ||
    raw.runtime !== LOCAL_EMBEDDING_RUNTIME ||
    !Array.isArray(raw.files)
  ) {
    throw invalidAssets()
  }
  const seen = new Set<string>()
  const files: LocalEmbeddingModelAsset[] = raw.files.map((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, FILE_KEYS)) {
      throw invalidAssets()
    }
    const path = entry.path
    const size = entry.size
    const sha256 = entry.sha256
    if (
      typeof path !== 'string' ||
      !isSafeRelativePath(path) ||
      seen.has(path) ||
      typeof size !== 'number' ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      typeof sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(sha256)
    ) {
      throw invalidAssets()
    }
    seen.add(path)
    return { path, size, sha256 }
  })
  for (const required of REQUIRED_FILES) {
    if (!seen.has(required)) throw invalidAssets()
  }
  return {
    schemaVersion: 1,
    model: GTE_EMBEDDING_MODEL,
    revision: GTE_EMBEDDING_REVISION,
    dimensions: GTE_EMBEDDING_DIMENSIONS,
    runtime: LOCAL_EMBEDDING_RUNTIME,
    files
  }
}

export function clsPoolAndNormalize(
  hiddenStates: readonly (readonly (readonly number[])[])[],
  attentionMasks: readonly (readonly number[])[]
): number[][] {
  if (hiddenStates.length !== attentionMasks.length) {
    throw invalidOutput()
  }
  return hiddenStates.map((tokens, index) => {
    const mask = attentionMasks[index]
    const cls = tokens[0]
    if (
      !mask ||
      tokens.length === 0 ||
      mask.length === 0 ||
      mask.length !== tokens.length ||
      mask[0] !== 1 ||
      !cls ||
      cls.length !== GTE_EMBEDDING_DIMENSIONS
    ) {
      throw invalidOutput()
    }
    const vector = cls.map((value) => Number(value))
    if (vector.some((value) => !Number.isFinite(value))) {
      throw invalidOutput()
    }
    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0)
    )
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      throw invalidOutput()
    }
    return vector.map((value) => value / magnitude)
  })
}

export async function chunkKnowledgeDocumentsWithTokenizer(
  documents: readonly KnowledgeChunkSourceDocument[],
  tokenizer: Pick<
    DshLocalEmbeddingBackend,
    'countTokens' | 'tokenizeWithOffsets' | 'tokenOffsets'
  >
): Promise<ChunkedKnowledgeResult> {
  assertChunkDocuments(documents)
  return {
    chunkerVersion: 'realmflow-token-aware-v1',
    embeddingModel: GTE_EMBEDDING_MODEL,
    embeddingRevision: GTE_EMBEDDING_REVISION,
    documents: await Promise.all(
      documents.map(async (document) => ({
        documentKey: document.documentKey,
        chunks: await chunkText(document.content, tokenizer)
      }))
    )
  }
}

async function chunkText(
  content: string,
  tokenizer: Pick<
    DshLocalEmbeddingBackend,
    'countTokens' | 'tokenizeWithOffsets' | 'tokenOffsets'
  >
): Promise<ChunkedKnowledgeChunk[]> {
  if (!content.trim()) return []
  const tokenized = await tokenizer.tokenizeWithOffsets(content)
  const tokenOffsets = tokenized.offsets
    .filter(([start, end]) => end > start)
    .map(([start, end]) => [start, end] as const)
  if (tokenized.tokenCount < 1 || tokenOffsets.length === 0) {
    throw new Error('Tokenizer did not produce content tokens')
  }
  const tokenOverhead = Math.max(0, tokenized.tokenCount - tokenOffsets.length)
  const tokenStarts = tokenOffsets.map(([start]) => start)
  const tokenEnds = tokenOffsets.map(([_start, end]) => end)
  const chunks: ChunkedKnowledgeChunk[] = []
  let start = 0
  while (start < content.length) {
    const firstToken = bisectRight(tokenEnds, start)
    const remainingTokens = tokenOffsets.length - firstToken
    const maxContentTokens = Math.max(1, MAX_CHUNK_TOKENS - tokenOverhead)
    let end: number
    if (remainingTokens <= maxContentTokens) {
      end = content.length
    } else {
      const maxEnd = tokenBudgetEnd(
        content,
        firstToken,
        MAX_CHUNK_TOKENS,
        tokenOffsets,
        tokenOverhead
      )
      const targetEnd = tokenBudgetEnd(
        content,
        firstToken,
        TARGET_CHUNK_TOKENS,
        tokenOffsets,
        tokenOverhead
      )
      end = preferredEnd(content, start, targetEnd, maxEnd)
    }
    if (end <= start) {
      throw new Error('Tokenizer did not produce a valid chunk boundary')
    }
    const fitted = await fitChunkToTokenLimit({
      content,
      start,
      end,
      firstToken,
      tokenOffsets,
      tokenStarts,
      tokenizer
    })
    end = fitted.end
    const text = content.slice(start, end)
    if (fitted.tokenCount < 1 || fitted.tokenCount > MAX_CHUNK_TOKENS) {
      throw new Error('Knowledge chunk token count is invalid')
    }
    chunks.push({
      ordinal: chunks.length,
      content: text,
      tokenCount: fitted.tokenCount,
      startOffset: start,
      endOffset: end,
      startLine: lineAt(content, start),
      endLine: lineAt(content, Math.max(start, end - 1)),
      checksum: checksum(text)
    })
    if (end === content.length) break
    const nextStart = overlapStart(
      content,
      start,
      end,
      tokenStarts,
      tokenEnds,
      tokenOverhead
    )
    start = nextStart <= start || nextStart >= end ? end : nextStart
  }
  return chunks
}

function tokenBudgetEnd(
  content: string,
  firstToken: number,
  budget: number,
  tokenOffsets: readonly (readonly [number, number])[],
  tokenOverhead: number
): number {
  const contentBudget = Math.max(1, budget - tokenOverhead)
  const lastToken = Math.min(
    firstToken + contentBudget - 1,
    tokenOffsets.length - 1
  )
  const tokenEnd = tokenOffsets[lastToken]![1]
  const nextStart =
    lastToken + 1 < tokenOffsets.length
      ? tokenOffsets[lastToken + 1]![0]
      : content.length
  return Math.max(tokenEnd, nextStart)
}

async function fitChunkToTokenLimit(input: {
  content: string
  start: number
  end: number
  firstToken: number
  tokenOffsets: readonly (readonly [number, number])[]
  tokenStarts: readonly number[]
  tokenizer: Pick<DshLocalEmbeddingBackend, 'countTokens'>
}): Promise<{ end: number; tokenCount: number }> {
  let end = input.end
  let tokenCount = await input.tokenizer.countTokens(
    input.content.slice(input.start, end)
  )
  while (tokenCount > MAX_CHUNK_TOKENS) {
    const tokensToRemove = Math.max(1, tokenCount - MAX_CHUNK_TOKENS)
    let lastToken =
      bisectLeft(input.tokenStarts, end, input.firstToken) - 1
    lastToken -= tokensToRemove
    if (lastToken < input.firstToken) {
      throw new Error('Knowledge chunk token count is invalid')
    }
    end = input.tokenOffsets[lastToken]![1]
    tokenCount = await input.tokenizer.countTokens(
      input.content.slice(input.start, end)
    )
  }
  return { end, tokenCount }
}

function preferredEnd(
  content: string,
  start: number,
  targetEnd: number,
  maxEnd: number
): number {
  const minimumPreferredEnd = start + Math.floor((targetEnd - start) * 0.75)
  const preferred = structuralBoundaries(content, start, maxEnd)
    .filter(({ position }) => position >= minimumPreferredEnd)
  if (preferred.length === 0) return targetEnd
  const highestPriority = Math.max(...preferred.map(({ priority }) => priority))
  return preferred
    .filter(({ priority }) => priority === highestPriority)
    .sort((left, right) =>
      Math.abs(left.position - targetEnd) - Math.abs(right.position - targetEnd) ||
      left.position - right.position
    )[0]!.position
}

function overlapStart(
  content: string,
  chunkStart: number,
  chunkEnd: number,
  tokenStarts: readonly number[],
  tokenEnds: readonly number[],
  tokenOverhead: number
): number {
  const firstToken = bisectRight(tokenEnds, chunkStart)
  const afterLastToken = bisectLeft(tokenStarts, chunkEnd, firstToken)
  const overlapContentTokens = Math.max(1, OVERLAP_TOKENS - tokenOverhead)
  const overlapFirstToken = Math.max(
    firstToken,
    afterLastToken - overlapContentTokens
  )
  const candidate = tokenStarts[overlapFirstToken] ?? chunkEnd
  const structuralStarts = structuralBoundaries(content, candidate, chunkEnd)
    .map(({ position }) => position)
    .filter((position) => position >= candidate)
  return structuralStarts.length > 0
    ? Math.min(...structuralStarts)
    : candidate
}

function structuralBoundaries(
  content: string,
  start: number,
  end: number
): Array<{ position: number; priority: number }> {
  const segment = content.slice(start, end)
  const boundaries = new Map<number, number>()
  const add = (position: number, priority: number): void => {
    if (start < position && position <= end) {
      boundaries.set(position, Math.max(boundaries.get(position) ?? 0, priority))
    }
  }
  for (const match of segment.matchAll(/(?=^#{1,6}\s)/gm)) {
    add(start + match.index, 4)
  }
  for (const match of segment.matchAll(/\n[ \t]*\n+/g)) {
    add(start + match.index + match[0].length, 3)
  }
  for (const match of segment.matchAll(/(?=^[ \t]*(?:[-*+]|\d+[.)])[ \t]+)/gm)) {
    add(start + match.index, 2)
  }
  for (const match of segment.matchAll(/\n/g)) {
    add(start + match.index + 1, 1)
  }
  return [...boundaries.entries()]
    .map(([position, priority]) => ({ position, priority }))
    .sort((left, right) => left.position - right.position)
}

function assertEmbeddingTexts(texts: readonly string[]): void {
  if (
    texts.length === 0 ||
    texts.length > MAX_DOCUMENTS ||
    texts.some(
      (text) =>
        typeof text !== 'string' ||
        text.trim().length === 0 ||
        text.includes('\0')
    ) ||
    texts.reduce((bytes, text) => bytes + Buffer.byteLength(text), 0) >
      MAX_PAYLOAD_BYTES
  ) {
    throw new Error('Embedding input is invalid')
  }
}

function assertChunkDocuments(
  documents: readonly KnowledgeChunkSourceDocument[]
): void {
  const keys = new Set<string>()
  if (
    documents.length === 0 ||
    documents.length > MAX_DOCUMENTS ||
    documents.some((document) => {
      if (
        typeof document.documentKey !== 'string' ||
        document.documentKey.length === 0 ||
        document.documentKey.includes('\0') ||
        keys.has(document.documentKey) ||
        typeof document.content !== 'string' ||
        document.content.includes('\0')
      ) {
        return true
      }
      keys.add(document.documentKey)
      return false
    })
  ) {
    throw new Error('Knowledge document is invalid')
  }
  for (const document of documents) {
    if (isSensitiveDocumentPath(document.documentKey)) {
      throw new Error('Knowledge document path is sensitive')
    }
  }
}

function isSensitiveDocumentPath(value: string): boolean {
  const segments = value.toLowerCase().replaceAll('\\', '/').split('/')
  if (segments.some((segment) => SENSITIVE_DIRECTORIES.has(segment))) {
    return true
  }
  const name = segments.at(-1) ?? ''
  return (
    SENSITIVE_FILES.has(name) ||
    name.startsWith('.env.') ||
    name.endsWith('.pem') ||
    name.endsWith('.key')
  )
}

function localEmbeddingHealth(): DshLocalEmbeddingHealth {
  return {
    status: 'ready',
    model: GTE_EMBEDDING_MODEL,
    revision: GTE_EMBEDDING_REVISION,
    dimensions: GTE_EMBEDDING_DIMENSIONS,
    normalize: 'L2',
    runtime: LOCAL_EMBEDDING_RUNTIME
  }
}

function assertLocalProfile(profile: DshEmbeddingProfile): void {
  if (
    profile.provider !== 'local' ||
    profile.model !== GTE_EMBEDDING_MODEL ||
    profile.revision !== GTE_EMBEDDING_REVISION ||
    profile.dimensions !== GTE_EMBEDDING_DIMENSIONS ||
    profile.normalization !== 'L2' ||
    profile.distance !== 'Cosine' ||
    !/^[a-f0-9]{64}$/.test(profile.profileDigest)
  ) {
    throw new Error('Embedding profile mismatch')
  }
}

function assertSameProfile(
  expected: DshEmbeddingProfile,
  actual: DshEmbeddingProfile
): void {
  if (
    expected.provider !== actual.provider ||
    expected.model !== actual.model ||
    expected.revision !== actual.revision ||
    expected.dimensions !== actual.dimensions ||
    expected.normalization !== actual.normalization ||
    expected.distance !== actual.distance ||
    expected.profileDigest !== actual.profileDigest
  ) {
    throw new Error('Embedding profile mismatch')
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error('Embedding request cancelled')
  }
}

function isSafeRelativePath(value: string): boolean {
  const normalized = posixPath.normalize(value)
  return (
    value.length > 0 &&
    normalized === value &&
    !isAbsolute(value) &&
    !value.includes('\\') &&
    !value.split('/').some((part) => part === '' || part === '.' || part === '..')
  )
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>
): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.size && actual.every((key) => keys.has(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function bisectLeft(
  values: readonly number[],
  target: number,
  lo = 0
): number {
  let left = lo
  let right = values.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (values[middle]! < target) left = middle + 1
    else right = middle
  }
  return left
}

function bisectRight(values: readonly number[], target: number): number {
  let left = 0
  let right = values.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (values[middle]! <= target) left = middle + 1
    else right = middle
  }
  return left
}

function lineAt(content: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1
  }
  return line
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function missingAssets(cause: unknown): Error {
  return new Error('Local embedding model assets are missing', {
    cause
  })
}

function invalidAssets(): Error {
  return new Error('Local embedding model assets are invalid')
}

function invalidOutput(): Error {
  return new Error('Local embedding model output is invalid')
}
