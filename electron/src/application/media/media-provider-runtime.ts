import { createHash } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type {
  MediaProviderOperation,
  PluginContributionSummary,
} from '../../../../domain/plugin-package'
import type {
  ToolCapability,
  ToolDefinition,
  ToolDefinitionReference,
} from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  PluginContributionAvailability,
  PluginContributionRegistry,
} from '../plugins/plugin-contribution-registry'

const HANDLER = 'media-provider-runtime'
const RISK_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const

export type MediaProviderAdapter = {
  providerId: string
  version: string
  operations: Partial<Record<
    MediaProviderOperation,
    {
      requiredCapabilities: ToolCapability[]
      costDisclosure: string
    }
  >>
  execute(input: {
    operation: MediaProviderOperation
    input: JsonObject
    credentialHandles: Record<string, string>
    outputRoot: string
    signal: AbortSignal
  }): Promise<{
    path: string
    mediaType: string
    usage?: JsonObject
  }>
}

export type MediaProviderExecutionResult = {
  output: JsonObject
  artifact: {
    path: string
    name: string
    mediaType: string
    sizeBytes: number
    kind: 'image' | 'video' | 'audio'
  }
  provenance: JsonObject
}

type MediaProviderRuntimeDependencies = {
  registry: PluginContributionRegistry
  adapters: readonly MediaProviderAdapter[]
  resolveCredentialHandle(
    reference: string
  ): Promise<string | undefined>
}

type EligibleMediaDefinition = {
  definition: ToolDefinition
  availability: PluginContributionAvailability
  adapter: MediaProviderAdapter
  operation: MediaProviderOperation
  credentialHandles: Record<string, string>
}

export class MediaProviderRuntime {
  constructor(private readonly dependencies: MediaProviderRuntimeDependencies) {}

  async definitions(catalog: ToolCatalogState): Promise<ToolDefinition[]> {
    return (await this.eligibleDefinitions(catalog)).map(
      ({ definition }) => definition
    )
  }

  async execute(command: {
    catalog: ToolCatalogState
    definition: ToolDefinitionReference
    input: JsonObject
    scopeRoots: readonly string[]
    signal: AbortSignal
  }): Promise<MediaProviderExecutionResult> {
    if (command.signal.aborted) {
      throw new Error('media_execution_cancelled')
    }
    const eligible = (await this.eligibleDefinitions(command.catalog)).find(
      ({ definition }) =>
        definition.id === command.definition.id &&
        definition.version === command.definition.version &&
        definition.definitionDigest === command.definition.digest
    )
    if (!eligible || command.definition.kind !== 'tool') {
      throw new Error('media_definition_stale')
    }
    const outputRoot = await authorizedOutputRoot(
      command.scopeRoots,
      eligible.availability.permissions.pathPrefixes
    )
    let adapterResult: Awaited<
      ReturnType<MediaProviderAdapter['execute']>
    >
    try {
      adapterResult = await eligible.adapter.execute({
        operation: eligible.operation,
        input: structuredClone(command.input),
        credentialHandles: structuredClone(eligible.credentialHandles),
        outputRoot,
        signal: command.signal,
      })
    } catch {
      if (command.signal.aborted) {
        throw new Error('media_execution_cancelled')
      }
      throw new Error('media_execution_failed')
    }
    if (command.signal.aborted) {
      throw new Error('media_execution_cancelled')
    }
    const artifact = await validateArtifact(
      adapterResult.path,
      adapterResult.mediaType,
      eligible.operation,
      outputRoot
    )
    const usage = sanitizeUsage(adapterResult.usage)
    const provenance: JsonObject = {
      operation: eligible.operation,
      packageId: eligible.availability.packageId,
      packageVersion: eligible.availability.packageVersion,
      packageDigest: eligible.availability.packageDigest,
      providerId: eligible.availability.contribution.id,
      adapterVersion: eligible.adapter.version,
      definitionDigest: eligible.definition.definitionDigest,
      ...(usage ? { usage } : {}),
    }
    return {
      output: {
        path: artifact.path,
        mediaType: artifact.mediaType,
        sizeBytes: artifact.sizeBytes,
        provenance,
      },
      artifact,
      provenance,
    }
  }

  private async eligibleDefinitions(
    catalog: ToolCatalogState
  ): Promise<EligibleMediaDefinition[]> {
    const candidates: EligibleMediaDefinition[] = []
    for (const availability of this.dependencies.registry.effective(
      catalog,
      'media_provider'
    )) {
      const contribution = availability.contribution
      for (const operation of contribution.mediaOperations ?? []) {
        for (const adapter of this.dependencies.adapters) {
          if (adapter.providerId !== contribution.id) continue
          const operationContract = adapter.operations[operation]
          if (
            !operationContract ||
            !hasPermissionCeiling(
              availability,
              operationContract.requiredCapabilities
            )
          ) {
            continue
          }
          const credentialHandles = await this.resolveCredentialHandles(
            contribution
          )
          if (!credentialHandles) continue
          candidates.push({
            availability,
            adapter,
            operation,
            credentialHandles,
            definition: createDefinition({
              availability,
              adapter,
              operation,
              capabilities: operationContract.requiredCapabilities,
              costDisclosure: operationContract.costDisclosure,
            }),
          })
        }
      }
    }
    candidates.sort(compareEligibleDefinitions)
    const selected = new Map<MediaProviderOperation, EligibleMediaDefinition>()
    for (const candidate of candidates) {
      if (!selected.has(candidate.operation)) {
        selected.set(candidate.operation, candidate)
      }
    }
    return [...selected.values()].sort((left, right) =>
      left.operation.localeCompare(right.operation)
    )
  }

  private async resolveCredentialHandles(
    contribution: PluginContributionSummary
  ): Promise<Record<string, string> | undefined> {
    const handles: Record<string, string> = {}
    for (const reference of contribution.credentialRefs ?? []) {
      const handle =
        await this.dependencies.resolveCredentialHandle(reference)
      if (!handle) return undefined
      handles[reference] = handle
    }
    return handles
  }
}

function createDefinition(input: {
  availability: PluginContributionAvailability
  adapter: MediaProviderAdapter
  operation: MediaProviderOperation
  capabilities: ToolCapability[]
  costDisclosure: string
}): ToolDefinition {
  const content = {
    packageDigest: input.availability.packageDigest,
    contributionDigest:
      input.availability.contribution.definitionDigest,
    providerId: input.availability.contribution.id,
    operation: input.operation,
    adapterVersion: input.adapter.version,
    costDisclosure: input.costDisclosure,
  }
  return {
    schemaVersion: 1,
    id: input.operation,
    version: '1.0.0',
    definitionDigest: createHash('sha256')
      .update(stableJson(content))
      .digest('hex'),
    package: {
      packageId: input.availability.packageId,
      packageVersion: input.availability.packageVersion,
      packageDigest: input.availability.packageDigest,
    },
    origin: 'local_upload',
    name: mediaName(input.operation),
    description: mediaDescription(input.operation),
    tags: ['media'],
    executor: {
      kind: 'builtin',
      handler: HANDLER,
      handlerVersion: input.adapter.version,
    },
    inputSchema: inputSchema(input.operation),
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'mediaType', 'sizeBytes', 'provenance'],
      properties: {
        path: { type: 'string' },
        mediaType: { type: 'string' },
        sizeBytes: { type: 'integer', minimum: 0 },
        provenance: { type: 'object' },
      },
    },
    capabilities: [...new Set(input.capabilities)].sort(),
    effects: ['external.write', 'filesystem.write', 'media.generate'],
    risk: 'medium',
    invocation: {
      mode: 'unary',
      idempotency: 'supported',
      cancellable: true,
      resumable: false,
    },
    resources: {
      timeoutMs: 300_000,
      maxOutputBytes: 65_536,
      maxAttempts: 1,
    },
    discovery: {
      intents: [input.operation, 'media.generate'],
      contexts: ['general', 'space', 'requirement', 'workflow'],
    },
  }
}

function hasPermissionCeiling(
  availability: PluginContributionAvailability,
  requiredCapabilities: readonly ToolCapability[]
): boolean {
  return (
    RISK_RANK[availability.permissions.maximumRisk] >= RISK_RANK.medium &&
    requiredCapabilities.every((capability) =>
      availability.permissions.capabilities.includes(capability)
    )
  )
}

async function authorizedOutputRoot(
  scopeRoots: readonly string[],
  permissionPrefixes: readonly string[]
): Promise<string> {
  for (const root of scopeRoots) {
    try {
      const canonical = await realpath(root)
      for (const prefix of permissionPrefixes) {
        try {
          if (pathWithin(canonical, await realpath(prefix))) {
            return canonical
          }
        } catch {
          // Invalid permission prefixes do not authorize an output root.
        }
      }
    } catch {
      // Try the next authorized scope.
    }
  }
  throw new Error('media_output_unauthorized')
}

async function validateArtifact(
  outputPath: string,
  mediaType: string,
  operation: MediaProviderOperation,
  outputRoot: string
): Promise<MediaProviderExecutionResult['artifact']> {
  const candidate = isAbsolute(outputPath)
    ? resolve(outputPath)
    : resolve(outputRoot, outputPath)
  let authorizedCandidate: string
  try {
    authorizedCandidate = await realpath(candidate)
  } catch {
    try {
      authorizedCandidate = join(
        await realpath(dirname(candidate)),
        basename(candidate)
      )
    } catch {
      throw new Error('media_output_invalid')
    }
  }
  if (!pathWithin(authorizedCandidate, outputRoot)) {
    throw new Error('media_output_unauthorized')
  }
  let metadata
  let canonicalPath
  try {
    metadata = await lstat(candidate)
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error('invalid')
    }
    canonicalPath = await realpath(candidate)
  } catch {
    throw new Error('media_output_invalid')
  }
  if (!pathWithin(canonicalPath, outputRoot)) {
    throw new Error('media_output_unauthorized')
  }
  const kind = expectedKind(operation)
  if (!matchesMediaType(kind, mediaType)) {
    throw new Error('media_type_mismatch')
  }
  return {
    path: canonicalPath,
    name: basename(canonicalPath),
    mediaType,
    sizeBytes: metadata.size,
    kind,
  }
}

function sanitizeUsage(value: JsonObject | undefined): JsonObject | undefined {
  if (!value) return undefined
  const usage: JsonObject = {}
  for (const key of ['units', 'estimatedCostMicros'] as const) {
    const candidate = value[key]
    if (
      typeof candidate === 'number' &&
      Number.isSafeInteger(candidate) &&
      candidate >= 0
    ) {
      usage[key] = candidate
    }
  }
  return Object.keys(usage).length > 0 ? usage : undefined
}

function expectedKind(
  operation: MediaProviderOperation
): 'image' | 'video' | 'audio' {
  if (operation === 'image_generate') return 'image'
  if (operation === 'video_generate') return 'video'
  return 'audio'
}

function matchesMediaType(
  kind: 'image' | 'video' | 'audio',
  mediaType: string
): boolean {
  return mediaType.startsWith(`${kind}/`) && !mediaType.includes('\0')
}

function pathWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`)
}

function compareEligibleDefinitions(
  left: EligibleMediaDefinition,
  right: EligibleMediaDefinition
): number {
  return (
    left.operation.localeCompare(right.operation) ||
    left.availability.packageId.localeCompare(
      right.availability.packageId
    ) ||
    left.availability.contribution.id.localeCompare(
      right.availability.contribution.id
    ) ||
    left.adapter.version.localeCompare(right.adapter.version)
  )
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function mediaName(operation: MediaProviderOperation): string {
  return {
    image_generate: 'Generate image',
    video_generate: 'Generate video',
    music_generate: 'Generate music',
    tts: 'Text to speech',
  }[operation]
}

function mediaDescription(operation: MediaProviderOperation): string {
  return {
    image_generate: 'Generate an image as a local conversation artifact.',
    video_generate: 'Generate a video as a local conversation artifact.',
    music_generate: 'Generate music as a local conversation artifact.',
    tts: 'Generate speech audio as a local conversation artifact.',
  }[operation]
}

function inputSchema(operation: MediaProviderOperation): JsonObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['prompt'],
    properties: {
      prompt: {
        type: 'string',
        minLength: 1,
        maxLength: operation === 'tts' ? 20_000 : 4_000,
      },
    },
  }
}
