import { createHash } from 'node:crypto'
import type {
  DshRunOwner,
  KnowledgeRuntimeManifest
} from '../../../../domain/dsh-run-manifest'
import type { KnowledgeSearchScope } from '../../../../domain/knowledge-search'
import type { VectorIndexProfile } from '../../../../domain/vector-index-profile'
import type { RunContext } from '../../ai-run/application/ports'
import type { KnowledgeSearchStore } from '../knowledge/knowledge-search-store'

const KNOWLEDGE_LEASE_TTL_MS = 15 * 60 * 1000
const KNOWLEDGE_LIMITS: KnowledgeRuntimeManifest['limits'] = {
  maxQueries: 8,
  topKPerQuery: 8,
  maxReturnedChunks: 8,
  maxContextCharacters: 32_768
}

export type DshKnowledgeRuntimeManifestResolverDependencies = {
  profile: VectorIndexProfile | (() => VectorIndexProfile)
  scopes: Pick<KnowledgeSearchStore, 'resolveScope'>
  now?: () => number
}

export class DshKnowledgeRuntimeManifestResolver {
  private readonly now: () => number

  constructor(
    private readonly dependencies: DshKnowledgeRuntimeManifestResolverDependencies
  ) {
    this.now = dependencies.now ?? Date.now
  }

  async resolve(input: {
    runId: string
    owner: DshRunOwner
    context: RunContext
  }): Promise<KnowledgeRuntimeManifest> {
    const now = this.now()
    const scope = runtimeKnowledgeScope(input.owner, input.context)
    if (!scope) return emptyKnowledgeManifest(now)

    const profile = resolveProfile(this.dependencies.profile)
    const snapshot = await this.dependencies.scopes.resolveScope({
      scope,
      profileId: profile.id
    })
    if (snapshot.workspaces.length === 0 || snapshot.generations.length === 0) {
      return emptyKnowledgeManifest(now)
    }

    const workspaceIds = uniqueSorted(snapshot.workspaces.map(({ id }) => id))
    const generationIds = uniqueSorted(snapshot.generations.map(({ id }) => id))
    const sourceKinds = uniqueSorted(
      snapshot.generations.map(({ sourceKind }) => sourceKind)
    )
    const snapshotDigest = digestJson({
      scope,
      profileId: profile.id,
      workspaceIds,
      generationIds,
      sourceKinds
    })

    return {
      kind: 'knowledge-runtime',
      enabled: true,
      scope: runtimeManifestScope(scope),
      snapshotId: `knowledge-snapshot-${snapshotDigest.slice(0, 32)}`,
      workspaceIds,
      generationIds,
      sourceKinds,
      embeddingProfile: {
        provider: 'local',
        model: profile.embeddingModel,
        revision: profile.embeddingRevision,
        dimensions: profile.dimensions,
        normalization: 'L2',
        distance: 'Cosine',
        profileDigest: digestJson(profile)
      },
      indexLease: {
        leaseId: `knowledge-lease-${digestJson({
          runId: input.runId,
          snapshotDigest
        }).slice(0, 32)}`,
        collection: profile.workspaceCollection,
        expiresAt: now + KNOWLEDGE_LEASE_TTL_MS
      },
      limits: { ...KNOWLEDGE_LIMITS }
    }
  }
}

function runtimeKnowledgeScope(
  owner: DshRunOwner,
  context: RunContext
): KnowledgeSearchScope | undefined {
  const workspaceId =
    owner.workspaceId ??
    ('workspaceId' in context ? context.workspaceId : undefined)
  return workspaceId
    ? {
        kind: 'workspace',
        workspaceId
      }
    : undefined
}

function runtimeManifestScope(
  scope: KnowledgeSearchScope
): KnowledgeRuntimeManifest['scope'] {
  return scope.kind === 'workspace'
    ? {
        kind: 'workspace',
        workspaceId: scope.workspaceId
      }
    : { kind: 'all-spaces' }
}

function resolveProfile(
  profile: VectorIndexProfile | (() => VectorIndexProfile)
): VectorIndexProfile {
  return typeof profile === 'function' ? profile() : profile
}

function emptyKnowledgeManifest(now: number): KnowledgeRuntimeManifest {
  return {
    kind: 'knowledge-runtime',
    enabled: false,
    scope: {
      kind: 'none'
    },
    snapshotId: 'knowledge-empty',
    workspaceIds: [],
    generationIds: [],
    embeddingProfile: {
      provider: 'local',
      model: 'Alibaba-NLP/gte-multilingual-base',
      revision: '2024-08-01',
      dimensions: 768,
      normalization: 'L2',
      distance: 'Cosine',
      profileDigest: '6'.repeat(64)
    },
    indexLease: {
      leaseId: 'lease-empty',
      collection: 'realmflow-empty',
      expiresAt: now + KNOWLEDGE_LEASE_TTL_MS
    },
    limits: {
      maxQueries: 0,
      topKPerQuery: 0,
      maxReturnedChunks: 0,
      maxContextCharacters: 0
    }
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function digestJson(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value, sortedJson))
    .digest('hex')
}

function sortedJson(_key: string, value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      )
    : value
}
