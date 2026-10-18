import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DshInteractionDecision,
  DshInteractionRequestRecord
} from '../../../shared/dsh-interaction-contract'
import type { ModelExecutionConfig } from '../../../domain/model'
import type { ToolCatalogState } from '../../../domain/tool-catalog'
import type { ToolDefinition } from '../../../domain/tool-definition'
import { DEFAULT_VECTOR_INDEX_PROFILE } from '../../../domain/vector-index-profile'
import { createDshRunManifest } from '../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../infrastructure/sqlite/database'
import type {
  DshRuntimePermissionHandler,
  DshRuntimeSupervisor
} from '../infrastructure/dsh/dsh-runtime-supervisor'
import {
  DSH_RUNTIME_INSTANCE_ID,
  createDshControlPlaneBootstrap
} from './dsh-control-plane-bootstrap'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-control-plane-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  if (database.open) database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('createDshControlPlaneBootstrap', () => {
  it('publishes workspace-scoped DSH knowledge runtime manifests from the current vector index scope', async () => {
    const runtime = fakeRuntime()
    const resolveScope = vi.fn(async () => ({
      workspaces: [{ id: 'workspace-1', name: 'Workspace One' }],
      generations: [
        {
          id: 'generation-1',
          workspaceId: 'workspace-1',
          sourceKind: 'file',
          sourceId: 'source-1',
          sourceVersion: '1',
          sourceChecksum: 'sha256:source'
        }
      ]
    }))
    const controlPlane = createDshControlPlaneBootstrap({
      database,
      runtime: runtime as unknown as DshRuntimeSupervisor,
      userDataPath: '/user-data',
      toolCatalog: {
        list: vi.fn(async () => processToolCatalog())
      },
      knowledgeRuntime: {
        profile: DEFAULT_VECTOR_INDEX_PROFILE,
        scopes: { resolveScope }
      },
      now: () => 1_000
    })

    const run = await controlPlane.gateway.createRun(
      {
        conversationId: 'conversation-space',
        workspaceId: 'workspace-1',
        messages: [{ role: 'user', content: 'Use Space knowledge' }]
      },
      modelConfig()
    )

    expect(resolveScope).toHaveBeenCalledWith({
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
    })
    const publication = await controlPlane.manifests.getByRunId(run.runId)
    expect(publication?.manifest.knowledge).toMatchObject({
      enabled: true,
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      workspaceIds: ['workspace-1'],
      generationIds: ['generation-1'],
      sourceKinds: ['file'],
      embeddingProfile: {
        provider: 'local',
        model: DEFAULT_VECTOR_INDEX_PROFILE.embeddingModel,
        revision: DEFAULT_VECTOR_INDEX_PROFILE.embeddingRevision,
        dimensions: DEFAULT_VECTOR_INDEX_PROFILE.dimensions,
        normalization: 'L2',
        distance: 'Cosine'
      },
      indexLease: {
        collection: DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection,
        expiresAt: 901_000
      },
      limits: {
        maxQueries: 8,
        topKPerQuery: 8,
        maxReturnedChunks: 8,
        maxContextCharacters: 32_768
      }
    })
  })

  it('uses the resolved application work root as the default DSH cwd for general runs', async () => {
    const runtime = fakeRuntime()
    const controlPlane = createDshControlPlaneBootstrap({
      database,
      runtime: runtime as unknown as DshRuntimeSupervisor,
      userDataPath: '/user-data',
      toolCatalog: {
        list: vi.fn(async () => processToolCatalog())
      },
      runtimeInput: {
        resolve: vi.fn(async () => ({
          cwd: '/work/current',
          contextRootIds: ['root-current']
        }))
      }
    })

    const run = await controlPlane.gateway.createRun(
      {
        conversationId: 'conversation-general',
        messages: [{ role: 'user', content: 'Write inside the work root' }]
      },
      modelConfig()
    )

    expect(runtime.newSession).toHaveBeenCalledWith({
      cwd: '/work/current',
      mcpServers: []
    })
    const publication = await controlPlane.manifests.getByRunId(run.runId)
    expect(publication?.manifest.context).toMatchObject({
      scope: { kind: 'global' },
      roots: [
        {
          rootId: 'root-current',
          path: '/work/current',
          access: 'read-write'
        }
      ]
    })
  })

  it('resolves DSH model credential leases through the injected model credential resolver', async () => {
    const runtime = fakeRuntime()
    const resolveProviderCredentialMaterial = vi.fn(async () => ({
      apiKey: 'sk-live-secret',
      customHeaders: {
        'X-Tenant': 'tenant-secret'
      }
    }))
    const controlPlane = createDshControlPlaneBootstrap({
      database,
      runtime: runtime as unknown as DshRuntimeSupervisor,
      userDataPath: '/user-data',
      toolCatalog: {
        list: vi.fn(async () => ({} as ToolCatalogState))
      },
      modelCredentials: {
        resolveProviderCredentialMaterial
      }
    })
    const manifest = createDshRunManifest({
      model: {
        kind: 'model',
        providerId: 'provider-openai',
        providerType: 'openai_responses',
        profileId: 'profile-gpt',
        modelId: 'gpt-4.1',
        credentialRef: 'credential-model-provider:provider-openai',
        options: {}
      },
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-model-provider:provider-openai',
          purpose: 'model'
        }
      ]
    })

    await controlPlane.resumeSession({ manifest })
    const lease = await controlPlane.credentialBroker.issueLease({
      schemaVersion: 1,
      runtimeInstanceId: DSH_RUNTIME_INSTANCE_ID,
      sessionId: manifest.sessionId,
      runId: manifest.runId,
      manifestDigest: manifest.digest,
      credentialRef: 'credential-model-provider:provider-openai',
      purpose: 'model',
      capabilityId: 'model:provider-openai',
      operation: 'model.invoke',
      scopeDigest: '2'.repeat(64),
      effectDigest: '3'.repeat(64)
    })

    await expect(
      controlPlane.credentialBroker.exchangeLease({
        schemaVersion: 1,
        runtimeInstanceId: DSH_RUNTIME_INSTANCE_ID,
        sessionId: manifest.sessionId,
        runId: manifest.runId,
        manifestDigest: manifest.digest,
        leaseId: lease.leaseId,
        exchangeToken: lease.exchangeToken,
        credentialRef: 'credential-model-provider:provider-openai',
        purpose: 'model',
        capabilityId: 'model:provider-openai',
        operation: 'model.invoke',
        scopeDigest: '2'.repeat(64),
        effectDigest: '3'.repeat(64)
      })
    ).resolves.toMatchObject({
      material: {
        apiKey: 'sk-live-secret',
        customHeaders: {
          'X-Tenant': 'tenant-secret'
        }
      }
    })
    expect(resolveProviderCredentialMaterial).toHaveBeenCalledWith(
      'provider-openai'
    )
  })

  it('bridges ACP permission requests through persisted RealmFlow interactions and returns allow-once to DSH', async () => {
    const runtime = fakeRuntime()
    const projected: DshInteractionRequestRecord[] = []
    const decisionEffects = {
      apply: vi.fn(async (_decision: DshInteractionDecision) => {})
    }
    const controlPlane = createDshControlPlaneBootstrap({
      database,
      runtime: runtime as unknown as DshRuntimeSupervisor,
      userDataPath: '/user-data',
      toolCatalog: {
        list: vi.fn(async () => ({} as ToolCatalogState))
      },
      interactionPresenter: {
        project: vi.fn(async (record: DshInteractionRequestRecord) => {
          projected.push(record)
        })
      },
      interactionDecisionEffects: decisionEffects,
      createInteractionNonce: () => 'nonce-1'
    })

    const pendingPermission = runtime.permissionHandler?.({
      sessionId: 'session-1',
      toolCall: {
        toolCallId: 'tool-call-1',
        runId: 'run-1',
        activityId: 'activity-1',
        capabilityId: 'builtin.files.write',
        scopeDigest: '2'.repeat(64),
        effectDigest: '3'.repeat(64),
        title: 'Allow file write?',
        message: 'DSH requested permission to write a file.',
        approvalProfileId: 'protected',
        maxGrant: 'space'
      },
      options: [
        { optionId: 'deny', name: 'Deny', kind: 'reject' },
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow' }
      ]
    })

    await flush()
    expect(projected).toHaveLength(1)
    const record = projected[0]
    expect(record).toMatchObject({
      kind: 'permission_approval',
      runtimeInstanceId: DSH_RUNTIME_INSTANCE_ID,
      sessionId: 'session-1',
      runId: 'run-1',
      requestId: 'session-1:tool-call-1',
      activityId: 'activity-1',
      capabilityId: 'builtin.files.write',
      payload: {
        maxGrant: 'space',
        options: ['deny', 'allow_once']
      }
    })

    await expect(
      controlPlane.interactionBridge.respond({
        runtimeInstanceId: record.runtimeInstanceId,
        sessionId: record.sessionId,
        runId: record.runId,
        requestId: record.requestId,
        activityId: record.activityId,
        capabilityId: record.capabilityId,
        scopeDigest: record.scopeDigest,
        effectDigest: record.effectDigest,
        expectedRevision: record.requestRevision,
        nonce: record.nonce,
        response: {
          kind: 'permission_approval',
          decision: 'allow_space'
        }
      })
    ).resolves.toMatchObject({
      response: {
        kind: 'permission_approval',
        decision: 'allow_space'
      }
    })

    await expect(pendingPermission).resolves.toEqual({
      outcome: {
        outcome: 'selected',
        optionId: 'allow-once'
      }
    })
    expect(decisionEffects.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: record.requestId,
        response: {
          kind: 'permission_approval',
          decision: 'allow_space'
        }
      })
    )
  })

  it('uses the accepted manifest run id when ACP permission requests omit run id', async () => {
    const runtime = fakeRuntime()
    const projected: DshInteractionRequestRecord[] = []
    const controlPlane = createDshControlPlaneBootstrap({
      database,
      runtime: runtime as unknown as DshRuntimeSupervisor,
      userDataPath: '/user-data',
      toolCatalog: {
        list: vi.fn(async () => ({} as ToolCatalogState))
      },
      interactionPresenter: {
        project: vi.fn(async (record: DshInteractionRequestRecord) => {
          projected.push(record)
        })
      },
      createInteractionNonce: () => 'nonce-1'
    })
    const manifest = createDshRunManifest({
      manifestId: 'manifest-permission-run-map',
      runId: 'realmflow-run-1',
      sessionId: 'dsh-session-1'
    })

    await controlPlane.resumeSession({ manifest })
    runtime.permissionHandler?.({
      sessionId: manifest.sessionId,
      toolCall: {
        toolCallId: 'tool-call-1',
        activityId: 'activity-1',
        name: 'bash',
        reason: 'escalate sandbox to danger-full-access: test reason'
      },
      options: [
        { optionId: 'deny', name: 'Deny', kind: 'reject' },
        { optionId: 'allow_once', name: 'Allow once', kind: 'allow' }
      ]
    })

    await flush()

    expect(projected[0]).toMatchObject({
      sessionId: 'dsh-session-1',
      runId: 'realmflow-run-1',
      requestId: 'dsh-session-1:tool-call-1',
      activityId: 'activity-1',
      capabilityId: 'bash',
      payload: {
        title: 'Allow bash?',
        message: 'escalate sandbox to danger-full-access: test reason'
      }
    })
  })

  it('exposes pending ACP permission requests through the Tool permission IPC adapter and resolves deny decisions', async () => {
    const runtime = fakeRuntime()
    const controlPlane = createDshControlPlaneBootstrap({
      database,
      runtime: runtime as unknown as DshRuntimeSupervisor,
      userDataPath: '/user-data',
      toolCatalog: {
        list: vi.fn(async () => ({} as ToolCatalogState))
      },
      interactionPresenter: {
        project: vi.fn(async () => undefined)
      },
      createInteractionNonce: () => 'nonce-deny',
      now: () => 1_000
    })

    const pendingPermission = runtime.permissionHandler?.({
      sessionId: 'session-deny',
      toolCall: {
        toolCallId: 'tool-call-deny',
        runId: 'run-deny',
        activityId: 'activity-deny',
        capabilityId: 'bash',
        title: 'bash',
        message: 'Run denied command.'
      },
      options: [
        { optionId: 'deny', name: 'Deny', kind: 'reject' },
        { optionId: 'allow_once', name: 'Allow once', kind: 'allow' }
      ]
    })

    await flush()
    const pending = await controlPlane.interactionPermissions.listPendingPermissions()
    expect(pending).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^dsh-[a-f0-9]{64}$/),
        runId: 'run-deny',
        toolId: 'bash',
        toolName: 'bash',
        status: 'requested'
      })
    ])

    await expect(
      controlPlane.interactionPermissions.resolve({
        requestId: pending[0].id,
        expectedRevision: pending[0].requestRevision,
        decision: 'deny'
      })
    ).resolves.toMatchObject({
      id: pending[0].id,
      status: 'denied',
      decision: 'deny'
    })
    await expect(pendingPermission).resolves.toEqual({
      outcome: {
        outcome: 'cancelled'
      }
    })
  })
})

type FakeRuntime = {
  permissionHandler?: DshRuntimePermissionHandler
  setPermissionHandler(handler: DshRuntimePermissionHandler | undefined): void
  start(): Promise<void>
  newSession(input: { cwd: string; mcpServers?: unknown[] }): Promise<{ sessionId: string }>
  prompt(): Promise<{ stopReason: string }>
  setConfigOption(): Promise<Record<string, never>>
  getSessionUpdateCursor(): Promise<number>
  resumeSession(): Promise<Record<string, never>>
  cancel(): Promise<void>
  stop(): Promise<void>
}

function fakeRuntime(): FakeRuntime {
  const runtime = {
    permissionHandler: undefined as DshRuntimePermissionHandler | undefined,
    setPermissionHandler: vi.fn((handler: DshRuntimePermissionHandler | undefined) => {
      runtime.permissionHandler = handler
    }),
    start: vi.fn(async () => {}),
    newSession: vi.fn(async () => ({ sessionId: 'dsh-session-1' })),
    prompt: vi.fn(async () => ({ stopReason: 'end_turn' })),
    setConfigOption: vi.fn(async () => ({})),
    getSessionUpdateCursor: vi.fn(async () => 0),
    resumeSession: vi.fn(async () => ({})),
    cancel: vi.fn(async () => {}),
    stop: vi.fn(async () => {})
  }
  return runtime
}

function modelConfig(): ModelExecutionConfig {
  return {
    providerId: 'provider-openai',
    providerType: 'openai_responses',
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-4.1',
    modelProfileId: 'profile-gpt',
    timeoutMs: 120_000,
    maxRetries: 2,
    maxConcurrency: 4
  }
}

function processToolCatalog(): ToolCatalogState {
  const tool = processToolDefinition()
  return {
    packages: [
      {
        packageId: 'realmflow.builtin.process',
        version: '1.0.4',
        packageDigest:
          '1ecff8f37807de36e4751f68af5787d61586c31a8c0fcd6c08392ae0c4fb1c6f',
        origin: 'builtin',
        name: 'Process',
        description: 'Built-in process tools.',
        enabledPreference: true,
        status: 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1
      }
    ],
    tools: [
      {
        kind: 'tool',
        id: tool.id,
        version: tool.version,
        definitionDigest: tool.definitionDigest,
        definition: tool,
        enabledPreference: true,
        status: 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1
      }
    ],
    skills: []
  }
}

function processToolDefinition(): ToolDefinition {
  return {
    schemaVersion: 1,
    id: 'builtin.process.run',
    version: '1.0.4',
    definitionDigest:
      'd1c24c0ca22034b1e63771ec94f8aa10a1033d36914593f0754d05cc8798b86b',
    package: {
      packageId: 'realmflow.builtin.process',
      packageVersion: '1.0.4',
      packageDigest:
        '1ecff8f37807de36e4751f68af5787d61586c31a8c0fcd6c08392ae0c4fb1c6f'
    },
    origin: 'builtin',
    name: 'Run Process',
    description: 'Run a local process.',
    tags: ['process'],
    executor: {
      kind: 'builtin',
      handler: 'process.run',
      handlerVersion: '1.0.0'
    },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities: ['process.execute'],
    effects: ['process.execute'],
    risk: 'high',
    invocation: {
      mode: 'unary',
      idempotency: 'none',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 30_000,
      maxOutputBytes: 1_000_000,
      maxAttempts: 1
    },
    discovery: {
      intents: ['process'],
      contexts: ['general', 'space']
    }
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
