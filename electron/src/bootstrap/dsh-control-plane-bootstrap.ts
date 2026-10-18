import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { createAgentRunSnapshot } from '../../../domain/agent-runtime'
import {
  modelProviderIdFromCredentialRef,
  type DshRunManifest
} from '../../../domain/dsh-run-manifest'
import type { DshSessionBinding } from '../../../domain/dsh-session-binding'
import type { JsonObject } from '../../../domain/tool-protocol-validation'
import type { ToolCatalogState } from '../../../domain/tool-catalog'
import { DshAiRunGateway } from '../ai-run/infrastructure/dsh-ai-run-gateway'
import {
  DshAgentRunAdmissionCompiler,
  type DshAgentRunAdmissionCompilerDependencies
} from '../application/dsh/dsh-agent-run-compiler'
import {
  DshKnowledgeRuntimeManifestResolver,
  type DshKnowledgeRuntimeManifestResolverDependencies
} from '../application/dsh/dsh-knowledge-runtime-manifest-resolver'
import {
  DshCredentialBroker,
  type DshCredentialResolutionRequest
} from '../application/dsh/dsh-credential-broker'
import {
  DshInteractionService,
  type DshInteractionDecisionEffects,
  type DshInteractionPresenter,
  type DshInteractionRepository,
} from '../application/dsh/dsh-interaction-service'
import { DshToolPermissionAdapter } from '../application/dsh/dsh-tool-permission-adapter'
import { DshProductCommandRegistry } from '../application/dsh/dsh-product-command-registry'
import { DshRunManifestPublisher } from '../application/dsh/dsh-run-manifest-publisher'
import { DshRuntimeEventIngestor } from '../application/dsh/dsh-runtime-event-ingestor'
import { DshRuntimeEventProjector } from '../application/dsh/dsh-runtime-event-projector'
import { SqliteDshRunManifestPublicationRepository } from '../infrastructure/sqlite/dsh-run-manifest-publication-repository'
import { SqliteDshSessionBindingRepository } from '../infrastructure/sqlite/dsh-session-binding-repository'
import { SqliteAgentRuntimeRunRepository } from '../infrastructure/sqlite/agent-runtime-run-repository'
import { DshProductCommandServer } from '../network/dsh-product-command-server'
import type {
  DshRuntimePermissionHandler,
  DshRuntimeSupervisor,
} from '../infrastructure/dsh/dsh-runtime-supervisor'
import type {
  DshInteractionDecision,
  DshInteractionRequest,
  DshInteractionRequestRecord,
  DshInteractionResponseCommand,
  DshPermissionApprovalPayload,
} from '../../../shared/dsh-interaction-contract'
import { DSH_INTERACTION_SCHEMA_VERSION } from '../../../shared/dsh-interaction-contract'
import type {
  DshCredentialLeaseExchangeRequest,
  DshCredentialLeaseRequest,
  DshCredentialLeaseRevocation,
} from '../../../shared/dsh-credential-broker-contract'

export const DSH_RUNTIME_INSTANCE_ID = 'realmflow-dsh-main'

export type DshControlPlaneBootstrapInput = {
  database: Database.Database
  runtime: DshRuntimeSupervisor
  userDataPath: string
  toolCatalog: {
    list(): Promise<ToolCatalogState>
  }
  runtimeInput?: DshAgentRunAdmissionCompilerDependencies['runtime']
  knowledgeRuntime?: Omit<
    DshKnowledgeRuntimeManifestResolverDependencies,
    'now'
  >
  modelCredentials?: {
    resolveProviderCredentialMaterial(
      providerId: string
    ): Promise<JsonObject> | JsonObject
  }
  interactionPresenter?: DshInteractionPresenter
  interactionDecisionEffects?: DshInteractionDecisionEffects
  createInteractionNonce?: () => string
  now?: () => number
}

export type DshControlPlaneBootstrap = {
  gateway: DshAiRunGateway
  sessions: SqliteDshSessionBindingRepository
  manifests: SqliteDshRunManifestPublicationRepository
  runtimeEvents: DshRuntimeEventIngestor
  interactionBridge: {
    requestInteraction(
      input: DshInteractionRequest
    ): Promise<DshInteractionRequestRecord>
    respond(input: DshInteractionResponseCommand): Promise<DshInteractionDecision>
  }
  interactionPermissions: Pick<
    DshToolPermissionAdapter,
    'listPendingPermissions' | 'resolve'
  >
  credentialBroker: {
    issueLease(input: DshCredentialLeaseRequest): ReturnType<DshCredentialBroker['issueLease']>
    exchangeLease(
      input: DshCredentialLeaseExchangeRequest
    ): ReturnType<DshCredentialBroker['exchangeLease']>
    revokeLeases(scope: DshCredentialLeaseRevocation): number
  }
  productCommandRegistry: DshProductCommandRegistry
  productCommandApi: DshProductCommandServer
  resumeSession(input: { manifest: DshRunManifest; cwd?: string }): Promise<void>
  cancelSession(binding: DshSessionBinding): Promise<void>
  drain(): Promise<void>
  drainAndStop(): Promise<void>
}

export function createDshControlPlaneBootstrap(
  input: DshControlPlaneBootstrapInput
): DshControlPlaneBootstrap {
  const sessions = new SqliteDshSessionBindingRepository(input.database)
  const manifests = new SqliteDshRunManifestPublicationRepository(input.database)
  const agentRuntimeRuns = new SqliteAgentRuntimeRunRepository(input.database)
  const runtimeEvents = new DshRuntimeEventIngestor({
    sessions,
    projector: new DshRuntimeEventProjector(),
  })
  const dshRunManifestPublisher = new DshRunManifestPublisher({
    catalog: {
      getCatalog: () => input.toolCatalog.list(),
    },
    publications: {
      save: (publication) => manifests.save(publication),
    },
  })
  const requestTracker = new DshBridgeRequestTracker()
  const pendingPermissions = new Map<string, PendingAcpPermission>()
  const acceptedManifestsBySessionId = new Map<string, DshRunManifest>()
  const now = input.now ?? Date.now
  const interactions = new InMemoryDshInteractionRepository()
  const interactionService = new DshInteractionService({
    repository: interactions,
    presenter: input.interactionPresenter ?? {
      project: async () => undefined,
    },
    runtime: {
      resumeInteraction: async (decision) => {
        resolvePendingAcpPermission(pendingPermissions, decision)
      },
    },
    decisionEffects: input.interactionDecisionEffects,
    now,
    createNonce: input.createInteractionNonce,
  })
  const interactionPermissions = new DshToolPermissionAdapter({
    interactions,
    responder: interactionService,
    now,
  })
  input.runtime.setPermissionHandler((request) =>
    requestAcpPermissionViaInteraction({
      interactionService,
      now,
      pendingPermissions,
      resolveRunId: (sessionId) =>
        acceptedManifestsBySessionId.get(sessionId)?.runId,
      request,
    })
  )
  const credentialBroker = new DshCredentialBroker({
    resolver: {
      resolve: (request) => resolveCredentialMaterial(input, request),
    },
  })
  const productCommandRegistry = new DshProductCommandRegistry()
  const productCommandApi = new DshProductCommandServer({
    registry: productCommandRegistry,
  })
  const acceptedManifestTracker = {
    acceptRunManifest: (accepted: {
      runtimeInstanceId: string
      manifest: DshRunManifest
    }) => {
      acceptedManifestsBySessionId.set(
        accepted.manifest.sessionId,
        accepted.manifest
      )
    },
  }
  const manifestAcceptors = [
    acceptedManifestTracker,
    runtimeEvents,
    credentialBroker,
    productCommandRegistry,
  ]
  const runtimeIdentity = {
    runtimeInstanceId: DSH_RUNTIME_INSTANCE_ID,
    runtimeBuildDigest: createHash('sha256')
      .update('realmflow-dsh-runtime-supervisor')
      .digest('hex'),
  }
  const gateway = new DshAiRunGateway({
    runtime: input.runtime,
    runtimeIdentity,
    compiler: new DshAgentRunAdmissionCompiler({
      defaultCwd: input.userDataPath,
      runtime: input.runtimeInput,
      ...(input.knowledgeRuntime
        ? {
            knowledge: new DshKnowledgeRuntimeManifestResolver({
              ...input.knowledgeRuntime,
              now
            })
          }
        : {})
    }),
    manifestPublisher: dshRunManifestPublisher,
    sessions,
    runtimeRuns: {
      create: async ({ runId, context, manifest, createdAt }) => {
        const agent = manifest.agents[0]
        if (!agent) {
          throw new Error('DSH run manifest requires a root agent')
        }
        const runtimeDelegation = context.runtimeDelegation
        const runtimeBranch = context.runtimeBranch
        const snapshot = createAgentRunSnapshot(context, {
          runId,
          agentProfileId: agent.id,
          agentProfileVersion: agent.version,
          agentProfileDigest: agent.profileDigest,
          promptDigest: agent.promptDigest,
          policyDigest: agent.policyDigest,
          capabilityCatalogDigest: manifest.digest,
          capabilityBindingDigest: manifest.digest,
          permissionSnapshotDigest: manifest.policy.toolPolicyDigest,
          modelProfileId: manifest.model.profileId,
          maxToolCalls: manifest.budget.maxToolCalls,
          maxSubagents: manifest.budget.maxSubagents,
          timeoutMs: manifest.budget.maxRuntimeMs,
          maxRetries: manifest.budget.maxRetries,
          ...('pipelineVersion' in context && context.pipelineVersion
            ? { pipelineVersion: context.pipelineVersion }
            : {}),
          ...(runtimeDelegation
            ? {
                lineage: {
                  rootRunId: runtimeDelegation.rootRunId,
                  parentRunId: runtimeDelegation.parentRunId,
                  delegationDepth: runtimeDelegation.delegationDepth,
                  delegationOrdinal: runtimeDelegation.delegationOrdinal,
                },
              }
            : runtimeBranch
              ? {
                  lineage: {
                    rootRunId: runtimeBranch.rootRunId,
                    parentRunId: runtimeBranch.parentRunId,
                    delegationDepth: runtimeBranch.depth,
                    delegationOrdinal: runtimeBranch.ordinal,
                  },
                  sourceCheckpoint: runtimeBranch.sourceCheckpoint,
                }
              : {}),
          createdAt,
        })
        await agentRuntimeRuns.create({
          id: runId,
          status: 'running',
          snapshot,
          createdAt,
          updatedAt: createdAt,
        })
      },
      transition: ({ runId, status, updatedAt, error }) =>
        agentRuntimeRuns.transition(runId, status, updatedAt, error),
    },
    runtimeEvents,
    manifestAcceptors,
  })

  const acceptRunManifest = async (manifest: DshRunManifest): Promise<void> => {
    for (const acceptor of manifestAcceptors) {
      await acceptor.acceptRunManifest({
        runtimeInstanceId: DSH_RUNTIME_INSTANCE_ID,
        manifest,
      })
    }
  }

  return {
    gateway,
    sessions,
    manifests,
    runtimeEvents,
    interactionBridge: {
      requestInteraction: (request) =>
        requestTracker.track(() =>
          interactionService.requestInteraction(request)
        ),
      respond: (response) =>
        requestTracker.track(() => interactionService.respond(response)),
    },
    interactionPermissions: {
      listPendingPermissions: () =>
        requestTracker.track(() =>
          interactionPermissions.listPendingPermissions()
        ),
      resolve: (command) =>
        requestTracker.track(() => interactionPermissions.resolve(command)),
    },
    credentialBroker: {
      issueLease: (request) =>
        requestTracker.track(() => credentialBroker.issueLease(request)),
      exchangeLease: (request) =>
        requestTracker.track(() => credentialBroker.exchangeLease(request)),
      revokeLeases: (scope) => credentialBroker.revokeLeases(scope),
    },
    productCommandRegistry,
    productCommandApi,
    resumeSession: async ({ manifest, cwd }) => {
      await acceptRunManifest(manifest)
      await input.runtime.start()
      await input.runtime.resumeSession({
        sessionId: manifest.sessionId,
        cwd: cwd ?? input.userDataPath,
      })
    },
    cancelSession: async (binding) => {
      await input.runtime.start()
      await input.runtime.cancel({ sessionId: binding.dshSessionId })
    },
    drain: () => requestTracker.drain(),
    drainAndStop: async () => {
      await requestTracker.drain()
      credentialBroker.revokeLeases({
        runtimeInstanceId: DSH_RUNTIME_INSTANCE_ID,
        reason: 'runtime_exit',
      })
      await input.runtime.stop()
    },
  }
}

class DshBridgeRequestTracker {
  private readonly pending = new Set<Promise<unknown>>()

  track<T>(operation: () => Promise<T> | T): Promise<T> {
    const pending = Promise.resolve().then(operation)
    this.pending.add(pending)
    void pending.finally(() => {
      this.pending.delete(pending)
    })
    return pending
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending])
  }
}

async function resolveCredentialMaterial(
  input: DshControlPlaneBootstrapInput,
  request: DshCredentialResolutionRequest
): Promise<JsonObject> {
  if (request.purpose !== 'model') {
    throw new Error(
      `Credential resolver is not registered for ${request.credentialRef}`
    )
  }
  const providerId = modelProviderIdFromCredentialRef(request.credentialRef)
  if (!providerId) {
    throw new Error(
      `Model credential reference is unknown: ${request.credentialRef}`
    )
  }
  if (!input.modelCredentials) {
    throw new Error(
      `Credential resolver is not registered for ${request.credentialRef}`
    )
  }
  return input.modelCredentials.resolveProviderCredentialMaterial(providerId)
}

type AcpPermissionRequest = Parameters<DshRuntimePermissionHandler>[0]
type AcpPermissionResponse = Awaited<ReturnType<DshRuntimePermissionHandler>>

type PendingAcpPermission = {
  acpOptions: AcpPermissionRequest['options']
  resolve(response: AcpPermissionResponse): void
  reject(error: Error): void
}

async function requestAcpPermissionViaInteraction(input: {
  interactionService: DshInteractionService
  now: () => number
  pendingPermissions: Map<string, PendingAcpPermission>
  resolveRunId(sessionId: string): string | undefined
  request: AcpPermissionRequest
}): Promise<AcpPermissionResponse> {
  const interaction = acpPermissionToInteractionRequest(
    input.request,
    input.now(),
    input.resolveRunId(input.request.sessionId)
  )
  if (input.pendingPermissions.has(interaction.requestId)) {
    throw new Error('DSH ACP permission request is already pending')
  }
  return new Promise<AcpPermissionResponse>((resolve, reject) => {
    input.pendingPermissions.set(interaction.requestId, {
      acpOptions: input.request.options,
      resolve,
      reject
    })
    input.interactionService.requestInteraction(interaction).catch((error) => {
      input.pendingPermissions.delete(interaction.requestId)
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

function resolvePendingAcpPermission(
  pendingPermissions: Map<string, PendingAcpPermission>,
  decision: DshInteractionDecision
): void {
  const pending = pendingPermissions.get(decision.requestId)
  if (pending === undefined) {
    throw new Error('DSH ACP permission request is not pending')
  }
  pendingPermissions.delete(decision.requestId)
  pending.resolve(acpPermissionResponseFromDecision(decision, pending.acpOptions))
}

function acpPermissionToInteractionRequest(
  request: AcpPermissionRequest,
  now: number,
  fallbackRunId?: string
): DshInteractionRequest {
  const toolCall = request.toolCall as Record<string, unknown>
  const toolCallId = request.toolCall.toolCallId
  const requestId = textOr(toolCall.requestId, `${request.sessionId}:${toolCallId}`)
  const activityId = textOr(toolCall.activityId, toolCallId)
  const capabilityId = textOr(
    toolCall.capabilityId,
    textOr(toolCall.toolName, textOr(toolCall.name, toolCallId))
  )
  const runId = textOr(toolCall.runId, textOr(fallbackRunId, request.sessionId))
  const permissionMessage = textOr(
    toolCall.message,
    textOr(
      toolCall.reason,
      textOr(
        toolCall.justification,
        'DSH requested permission to continue this tool call.'
      )
    )
  )
  return {
    schemaVersion: DSH_INTERACTION_SCHEMA_VERSION,
    kind: 'permission_approval',
    runtimeInstanceId: DSH_RUNTIME_INSTANCE_ID,
    sessionId: request.sessionId,
    runId,
    requestId,
    activityId,
    capabilityId,
    scopeDigest: digestOr(
      toolCall.scopeDigest,
      { sessionId: request.sessionId, toolCallId, scope: toolCall.scope }
    ),
    effectDigest: digestOr(toolCall.effectDigest, {
      toolCall,
      options: request.options
    }),
    expiresAt: integerOr(toolCall.expiresAt, now + 5 * 60_000),
    payload: {
      title: textOr(toolCall.title, `Allow ${capabilityId}?`),
      message: permissionMessage,
      approvalProfileId: approvalProfileIdOr(toolCall.approvalProfileId),
      maxGrant: grantCeilingOr(toolCall.maxGrant),
      options: permissionDecisionOptions(request.options)
    }
  }
}

function acpPermissionResponseFromDecision(
  decision: DshInteractionDecision,
  acpOptions: AcpPermissionRequest['options']
): AcpPermissionResponse {
  if (
    decision.kind !== 'permission_approval' ||
    decision.response.kind !== 'permission_approval' ||
    decision.response.decision === 'deny'
  ) {
    return {
      outcome: {
        outcome: 'cancelled'
      }
    }
  }
  const optionIds = new Map(
    acpOptions.map((option) => [
      option.optionId.replace(/-/g, '_'),
      option.optionId
    ])
  )
  const selectedDecision =
    decision.response.decision === 'allow_once'
      ? 'allow_once'
      : 'allow_once'
  const selected = optionIds.get(selectedDecision)
  if (!selected) {
    return {
      outcome: {
        outcome: 'cancelled'
      }
    }
  }
  return {
    outcome: {
      outcome: 'selected',
      optionId: selected
    }
  }
}

const PERMISSION_DECISIONS = new Set([
  'deny',
  'allow_once',
  'allow_session',
  'allow_requirement',
  'allow_space',
  'allow_always'
])

function permissionDecisionOptions(
  options: AcpPermissionRequest['options']
): DshPermissionApprovalPayload['options'] {
  const decisions = options
    .map((option) => option.optionId.replace(/-/g, '_'))
    .filter((optionId) => PERMISSION_DECISIONS.has(optionId))
  return (decisions.includes('deny') ? decisions : ['deny', ...decisions]) as
    DshPermissionApprovalPayload['options']
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function integerOr(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) ? (value as number) : fallback
}

function digestOr(value: unknown, fallback: unknown): string {
  if (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) return value
  return digestJson(fallback)
}

function approvalProfileIdOr(
  value: unknown
): DshPermissionApprovalPayload['approvalProfileId'] {
  return value === 'cautious' ||
    value === 'protected' ||
    value === 'trusted' ||
    value === 'manual'
    ? value
    : 'protected'
}

function grantCeilingOr(
  value: unknown
): DshPermissionApprovalPayload['maxGrant'] {
  return value === 'session' || value === 'space' || value === 'persistent'
    ? value
    : 'once'
}

function digestJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`
}

class InMemoryDshInteractionRepository implements DshInteractionRepository {
  private readonly records = new Map<string, DshInteractionRequestRecord>()

  async get(
    requestId: string
  ): Promise<DshInteractionRequestRecord | undefined> {
    return this.records.get(requestId)
  }

  async savePending(record: DshInteractionRequestRecord): Promise<void> {
    if (this.records.has(record.requestId)) {
      throw new Error('DSH interaction request already exists')
    }
    this.records.set(record.requestId, record)
  }

  async listPending(): Promise<DshInteractionRequestRecord[]> {
    return [...this.records.values()].filter(
      (record) => record.status === 'pending'
    )
  }

  async saveResolved(
    record: DshInteractionRequestRecord,
    expectedRevision: number
  ): Promise<void> {
    const current = this.records.get(record.requestId)
    if (!current || current.requestRevision !== expectedRevision) {
      throw new Error('DSH interaction revision conflict')
    }
    this.records.set(record.requestId, record)
  }
}
