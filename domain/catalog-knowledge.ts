import { createHash } from 'node:crypto'
import {
  GTE_EMBEDDING_DIMENSIONS,
  type VectorIndexProfile
} from './vector-index-profile'

export const DEFAULT_CATALOG_SEARCH_TOP_K = 8
export const MAX_CATALOG_SEARCH_TOP_K = 20
export const MAX_CATALOG_SEARCH_QUERY_LENGTH = 2_000

export type CatalogKnowledgeKind = 'workflow_template' | 'skill'

export type CatalogKnowledgeDocument = Readonly<{
  kind: CatalogKnowledgeKind
  catalogId: string
  versionId: string
  sourceVersion: string
  title: string
  content: string
  checksum: string
  updatedAt: number
}>

export type CatalogKnowledgePointPayload = Readonly<{
  schemaVersion: 1
  profileId: string
  catalogKind: CatalogKnowledgeKind
  catalogId: string
  versionId: string
  sourceVersion: string
  title: string
  content: string
  checksum: string
  updatedAt: number
}>

export type CatalogKnowledgePoint = Readonly<{
  id: string
  vector: Readonly<{
    dense: number[]
    bm25: Readonly<{
      text: string
      model: 'qdrant/bm25'
    }>
  }>
  payload: CatalogKnowledgePointPayload
}>

export type QdrantCatalogMatch = {
  id: string
  score: number
  payload: CatalogKnowledgePointPayload
}

export type CatalogSearchResult = CatalogKnowledgePointPayload & {
  id: string
  denseScore?: number
  denseRank?: number
  bm25Score?: number
  bm25Rank?: number
  fusionScore: number
  fusionRank: number
}

export type CatalogSearchQueryInput = {
  query: string
  kind?: CatalogKnowledgeKind
  topK?: number
}

export type CatalogSearchQuery = {
  query: string
  kind?: CatalogKnowledgeKind
  topK: number
}

type WorkflowTemplateProjectionInput = {
  id: string
  name: string
  description: string
  status: 'draft' | 'published' | 'archived'
  updatedAt: number
  currentVersion: {
    id: string
    version: number
    status: 'draft' | 'published' | 'archived'
    nodes: Array<{
      id: string
      stableKey: string
      type: string
      name: string
      description: string
      order: number
      configuration?: {
        permissions?: Array<{ capability: string; scope: string }>
        artifact?: {
          required: boolean
          relativePath: string
          kind: string
        }
      }
    }>
    edges: Array<{
      sourceNodeId: string
      targetNodeId: string
    }>
  }
}

type SkillProjectionInput = {
  skill: {
    id: string
    enabled: boolean
    currentVersionId: string
    updatedAt: number
  }
  versions: Array<{
    version: {
      id: string
      version: string
      name: string
      description: string
      inputSchema: Record<string, unknown>
      outputSchema: Record<string, unknown>
      permissions: string[]
      network: { required: boolean; services: string[] }
    }
    integrity: {
      status: 'verified' | 'corrupted' | 'missing'
    }
  }>
}

const CATALOG_POINT_NAMESPACE = '52cdaa39-eeb4-5d21-8cce-3825a8257480'
const CATALOG_KINDS = new Set<CatalogKnowledgeKind>([
  'workflow_template',
  'skill'
])

export function projectWorkflowTemplateCatalogDocument(
  template: WorkflowTemplateProjectionInput
): CatalogKnowledgeDocument | null {
  if (
    template.status !== 'published' ||
    template.currentVersion.status !== 'published'
  ) {
    return null
  }
  const nodeKeyById = new Map(
    template.currentVersion.nodes.map((node) => [node.id, node.stableKey])
  )
  const nodes = [...template.currentVersion.nodes]
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.stableKey.localeCompare(right.stableKey)
    )
    .map(formatTemplateNode)
  const edges = [...template.currentVersion.edges]
    .map((edge) => ({
      source: nodeKeyById.get(edge.sourceNodeId) ?? edge.sourceNodeId,
      target: nodeKeyById.get(edge.targetNodeId) ?? edge.targetNodeId
    }))
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        left.target.localeCompare(right.target)
    )
    .map(({ source, target }) => `- ${source} -> ${target}`)
  const content = [
    `# ${template.name.trim()}`,
    template.description.trim(),
    '## Nodes',
    nodes.join('\n'),
    '## Edges',
    edges.length > 0 ? edges.join('\n') : 'none'
  ].join('\n\n')
  return createDocument({
    kind: 'workflow_template',
    catalogId: template.id,
    versionId: template.currentVersion.id,
    sourceVersion: String(template.currentVersion.version),
    title: template.name.trim(),
    content,
    updatedAt: template.updatedAt
  })
}

export function projectSkillCatalogDocument(
  record: SkillProjectionInput
): CatalogKnowledgeDocument | null {
  if (!record.skill.enabled) return null
  const current = record.versions.find(
    ({ version }) => version.id === record.skill.currentVersionId
  )
  if (!current || current.integrity.status !== 'verified') return null
  const { version } = current
  const permissions =
    [...version.permissions].sort().join(', ') || 'none'
  const network =
    version.network.required
      ? [...version.network.services].sort().join(', ') || 'required'
      : 'none'
  const content = [
    `# ${version.name.trim()}`,
    version.description.trim(),
    '## Input Schema',
    canonicalJson(version.inputSchema),
    '## Output Schema',
    canonicalJson(version.outputSchema),
    '## Permissions',
    permissions,
    '## Network',
    network
  ].join('\n\n')
  return createDocument({
    kind: 'skill',
    catalogId: record.skill.id,
    versionId: version.id,
    sourceVersion: version.version,
    title: version.name.trim(),
    content,
    updatedAt: record.skill.updatedAt
  })
}

export function createCatalogKnowledgePoint(input: {
  document: CatalogKnowledgeDocument
  profile: VectorIndexProfile
  dense: number[]
}): CatalogKnowledgePoint {
  const magnitude = Math.sqrt(
    input.dense.reduce((sum, value) => sum + value * value, 0)
  )
  if (
    input.dense.length !== GTE_EMBEDDING_DIMENSIONS ||
    input.dense.some((value) => !Number.isFinite(value)) ||
    !Number.isFinite(magnitude) ||
    Math.abs(magnitude - 1) > 1e-4
  ) {
    throw new Error('Catalog knowledge point is invalid')
  }
  const payload: CatalogKnowledgePointPayload = {
    schemaVersion: 1,
    profileId: input.profile.id,
    catalogKind: input.document.kind,
    catalogId: input.document.catalogId,
    versionId: input.document.versionId,
    sourceVersion: input.document.sourceVersion,
    title: input.document.title,
    content: input.document.content,
    checksum: input.document.checksum,
    updatedAt: input.document.updatedAt
  }
  return {
    id: createCatalogKnowledgePointId(
      payload.catalogKind,
      payload.catalogId
    ),
    vector: {
      dense: [...input.dense],
      bm25: { text: payload.content, model: input.profile.sparseModel }
    },
    payload
  }
}

export function createCatalogKnowledgePointId(
  kind: CatalogKnowledgeKind,
  catalogId: string
): string {
  if (!CATALOG_KINDS.has(kind) || !catalogId.trim()) {
    throw new Error('Catalog knowledge identity is invalid')
  }
  return uuidV5(
    CATALOG_POINT_NAMESPACE,
    JSON.stringify(['catalog', kind, catalogId])
  )
}

export function normalizeCatalogSearchQuery(
  value: unknown
): CatalogSearchQuery {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['query', 'kind', 'topK'].includes(key)
    )
  ) {
    throw invalidQuery()
  }
  const query = typeof value.query === 'string' ? value.query.trim() : ''
  const topK =
    value.topK === undefined ? DEFAULT_CATALOG_SEARCH_TOP_K : value.topK
  if (
    !query ||
    query.length > MAX_CATALOG_SEARCH_QUERY_LENGTH ||
    query.includes('\0') ||
    !Number.isSafeInteger(topK) ||
    (topK as number) < 1 ||
    (topK as number) > MAX_CATALOG_SEARCH_TOP_K ||
    (value.kind !== undefined &&
      !CATALOG_KINDS.has(value.kind as CatalogKnowledgeKind))
  ) {
    throw invalidQuery()
  }
  return {
    query,
    topK: topK as number,
    ...(value.kind === undefined
      ? {}
      : { kind: value.kind as CatalogKnowledgeKind })
  }
}

export function mergeCatalogSearchResults(input: {
  dense: readonly QdrantCatalogMatch[]
  bm25: readonly QdrantCatalogMatch[]
  fusion: readonly QdrantCatalogMatch[]
  topK: number
}): CatalogSearchResult[] {
  const dense = ranked(input.dense)
  const bm25 = ranked(input.bm25)
  const fusion = ranked(input.fusion)
  return [...fusion.entries()]
    .map(([id, fused]) => {
      const denseMatch = dense.get(id)
      const bm25Match = bm25.get(id)
      if (!denseMatch && !bm25Match) throw invalidResponse()
      return {
        id,
        ...fused.match.payload,
        ...(denseMatch
          ? {
              denseScore: denseMatch.match.score,
              denseRank: denseMatch.rank
            }
          : {}),
        ...(bm25Match
          ? {
              bm25Score: bm25Match.match.score,
              bm25Rank: bm25Match.rank
            }
          : {}),
        fusionScore: fused.match.score,
        fusionRank: fused.rank
      }
    })
    .sort(
      (left, right) =>
        right.fusionScore - left.fusionScore ||
        (left.denseRank ?? Number.POSITIVE_INFINITY) -
          (right.denseRank ?? Number.POSITIVE_INFINITY) ||
        (left.bm25Rank ?? Number.POSITIVE_INFINITY) -
          (right.bm25Rank ?? Number.POSITIVE_INFINITY) ||
        left.catalogKind.localeCompare(right.catalogKind) ||
        left.catalogId.localeCompare(right.catalogId)
    )
    .slice(0, input.topK)
}

function formatTemplateNode(
  node: WorkflowTemplateProjectionInput['currentVersion']['nodes'][number]
): string {
  const details: string[] = []
  const permissions = [...(node.configuration?.permissions ?? [])]
    .map(({ capability, scope }) => `${capability}:${scope}`)
    .sort()
  if (permissions.length > 0) {
    details.push(`permissions=${permissions.join(',')}`)
  }
  const artifact = node.configuration?.artifact
  details.push(
    artifact?.required
      ? `output=${artifact.relativePath} (${artifact.kind})`
      : 'output=none'
  )
  const description = node.description.trim()
  return `- ${node.name.trim()} [${node.type}]: ${
    description ? `${description}; ` : ''
  }${details.join('; ')}`
}

function createDocument(
  value: Omit<CatalogKnowledgeDocument, 'checksum'>
): CatalogKnowledgeDocument {
  if (
    !value.catalogId.trim() ||
    !value.versionId.trim() ||
    !value.sourceVersion.trim() ||
    !value.title ||
    !value.content ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < 0
  ) {
    throw new Error('Catalog knowledge document is invalid')
  }
  return {
    ...value,
    checksum: checksum(value.content)
  }
}

function ranked(
  matches: readonly QdrantCatalogMatch[]
): Map<string, { match: QdrantCatalogMatch; rank: number }> {
  const result = new Map<
    string,
    { match: QdrantCatalogMatch; rank: number }
  >()
  matches.forEach((match, index) => {
    if (!isValidCatalogMatch(match) || result.has(match.id)) {
      throw invalidResponse()
    }
    result.set(match.id, { match, rank: index + 1 })
  })
  return result
}

function isValidCatalogMatch(
  value: unknown
): value is QdrantCatalogMatch {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.score !== 'number' ||
    !Number.isFinite(value.score) ||
    !isRecord(value.payload)
  ) {
    return false
  }
  const payload = value.payload
  return (
    payload.schemaVersion === 1 &&
    typeof payload.profileId === 'string' &&
    payload.profileId.length > 0 &&
    CATALOG_KINDS.has(payload.catalogKind as CatalogKnowledgeKind) &&
    [
      payload.catalogId,
      payload.versionId,
      payload.sourceVersion,
      payload.title,
      payload.content
    ].every((item) => typeof item === 'string' && item.length > 0) &&
    typeof payload.checksum === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(payload.checksum) &&
    Number.isSafeInteger(payload.updatedAt) &&
    (payload.updatedAt as number) >= 0
  )
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function uuidV5(namespace: string, name: string): string {
  const bytes = createHash('sha1')
    .update(Buffer.from(namespace.replaceAll('-', ''), 'hex'))
    .update(name)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidQuery(): Error {
  return new Error('Catalog search query is invalid')
}

function invalidResponse(): Error {
  return new Error('Catalog search response is invalid')
}
