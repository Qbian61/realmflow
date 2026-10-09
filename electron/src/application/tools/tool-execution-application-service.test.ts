import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { ToolAdapter } from './tool-adapter'
import { ToolAdapterRegistry } from './tool-adapter-registry'
import { ToolExecutionApplicationService } from './tool-execution-application-service'
import { ToolOutboxDispatcher } from './tool-outbox-dispatcher'
import { ToolProjectionRunner } from './tool-projection-runner'
import { projectModelFacingToolCatalog } from './tool-model-facing-projection'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { SqliteToolEventStore } from '../../infrastructure/sqlite/tool-event-store'
import { SqliteToolOutboxRepository } from '../../infrastructure/sqlite/tool-outbox-repository'
import { SqliteToolProjectionStore } from '../../infrastructure/sqlite/tool-projection-store'
import { SqliteToolSnapshotStore } from '../../infrastructure/sqlite/tool-snapshot-store'
import { CredentialVault } from '../../models/credential-vault'
import { EncryptedPendingToolInvocationCheckpointStore } from './pending-tool-invocation-checkpoint-store'

let directory: string
let database: RealmFlowDatabase
let events: SqliteToolEventStore
let projections: SqliteToolProjectionStore
let projectionRunner: ToolProjectionRunner
let adapter: ToolAdapter
let adapters: ToolAdapterRegistry
let checkpoints: EncryptedPendingToolInvocationCheckpointStore
let service: ToolExecutionApplicationService
let externalDefinition: ToolDefinition | undefined
let suspendToolCall: ReturnType<typeof vi.fn>
let submitToolResult: ReturnType<typeof vi.fn>
let requestUserInput: ReturnType<typeof vi.fn>
let resolveCredential: ReturnType<typeof vi.fn>
let runSessionCommand: ReturnType<typeof vi.fn>
let updateProgressCard: ReturnType<typeof vi.fn>
let runCapabilityCommand: ReturnType<typeof vi.fn>

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-tool-execution-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  events = new SqliteToolEventStore(database)
  projections = new SqliteToolProjectionStore(database)
  projectionRunner = new ToolProjectionRunner(
    events,
    projections,
    () => 200
  )
  await seedCatalog(events)
  await projectionRunner.rebuildCatalogProjection()
  externalDefinition = undefined
  suspendToolCall = vi.fn().mockResolvedValue(undefined)
  submitToolResult = vi.fn().mockResolvedValue(undefined)
  requestUserInput = vi.fn().mockResolvedValue({
    requestId: 'question-1',
    status: 'waiting',
    prompt: 'Which path should I use?'
  })
  resolveCredential = vi.fn().mockResolvedValue({
    credentialHandle: 'credential:docs-api',
    name: 'docs-api',
    service: 'docs',
    status: 'available',
    value: 'raw-secret-must-not-leak'
  })
  runSessionCommand = vi.fn().mockResolvedValue({
    sessions: [
      {
        id: 'conversation-1',
        title: 'Planning',
        updatedAt: 123,
        messages: [{ content: 'full transcript must not leak' }]
      }
    ]
  })
  updateProgressCard = vi.fn().mockResolvedValue({
    cardId: 'card-1',
    status: 'running',
    message: 'Reading files',
    revision: 1
  })
  runCapabilityCommand = vi.fn().mockResolvedValue({
    action: 'enable',
    installationId: 'capability-installation-1',
    status: 'enabled',
    revision: 2
  })

  adapter = {
    kind: 'builtin',
    resolve: vi.fn().mockResolvedValue({
      definitionId: definition.id,
      definitionVersion: definition.version,
      definitionDigest: definition.definitionDigest,
      adapterKind: 'builtin',
      bindingId: 'binding-files-read',
      opaqueRuntimeHandle: {}
    }),
    prepare: vi.fn().mockResolvedValue({
      outcome: 'ready',
      sandboxAudit: {
        policyDigest: 'c'.repeat(64),
        executionLevel: 'controlled_file',
        enforcement: 'enforced',
        platformIsolation: 'sandbox-exec',
        readOnlyRootCount: 1,
        readWriteRootCount: 0,
        networkTargets: [],
        resources: {
          timeoutMs: 30_000,
          maxMemoryMb: 128,
          maxOutputBytes: 1_024
        }
      }
    }),
    planEffects: vi.fn().mockResolvedValue({
      outcome: 'planned',
      effects: [{ kind: 'filesystem.read', path: '/workspace/README.md' }]
    }),
    execute: vi.fn().mockImplementation(async (_binding, _invocation, sink) => {
      await sink.emit({
        type: 'progress',
        completed: 1,
        total: 1,
        message: 'done'
      })
      return {
        outcome: 'succeeded',
        output: { content: 'RealmFlow' },
        metrics: { durationMs: 5, outputBytes: 23 }
      }
    }),
    health: vi.fn().mockResolvedValue({ status: 'ready' })
  }
  const connectorAdapter: ToolAdapter = {
    ...adapter,
    kind: 'connector',
    resolve: vi.fn().mockImplementation(async (resolvedDefinition) => ({
      definitionId: resolvedDefinition.id,
      definitionVersion: resolvedDefinition.version,
      definitionDigest: resolvedDefinition.definitionDigest,
      adapterKind: 'connector',
      bindingId: 'binding-connector',
      opaqueRuntimeHandle: {}
    }))
  }
  adapters = new ToolAdapterRegistry([adapter, connectorAdapter])
  checkpoints = new EncryptedPendingToolInvocationCheckpointStore({
    snapshots: new SqliteToolSnapshotStore(database),
    vault: await CredentialVault.open(join(directory, 'credentials.key'))
  })
  let runtime!: ToolExecutionApplicationService
  const dispatcher = new ToolOutboxDispatcher({
    repository: new SqliteToolOutboxRepository(database),
    publish: (message) => runtime.dispatch(message),
    owner: 'tool-runtime',
    now: () => 200
  })
  runtime = new ToolExecutionApplicationService({
    events,
    projections,
    projectionRunner,
    adapters,
    pendingCheckpoints: checkpoints,
    dispatcher,
    aiRuns: {
      suspendToolCall,
      submitToolResult
    },
    now: () => 200,
    createId: idFactory(),
    resolveDefinition: async (reference) =>
      externalDefinition?.id === reference.id &&
      externalDefinition.version === reference.version &&
      externalDefinition.definitionDigest === reference.digest
        ? externalDefinition
        : undefined,
    assistantRuntime: {
      requestUserInput,
      resolveCredential,
      runSessionCommand,
      updateProgressCard,
      runCapabilityCommand
    },
    resolveScopeRoots: async () => ['/workspace'],
    resolveBoundScopes: async () => [
      {
        authorizationId: 'bound-scope-1',
        source: {
          kind: 'requirement',
          requirementId: 'requirement-1',
          workspaceId: 'workspace-1'
        },
        roots: [{ canonicalPath: '/workspace', access: 'read-write' }],
        bindingRevision: 1,
        status: 'active',
        createdAt: 100
      }
    ]
  })
  service = runtime
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ToolExecutionApplicationService', () => {
  it('dispatches a model-facing filesystem read facade through the primitive file read Tool', async () => {
    const facade = await facadeDefinition('filesystem_read')

    const result = await service.execute({
      definition: reference(facade),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        toolCallId: 'call-1'
      },
      input: {
        action: 'read',
        arguments: { path: 'README.md' }
      },
      idempotencyKey: 'facade-read'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded',
        output: { content: 'RealmFlow' }
      }
    })
    expect(adapter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'builtin.files.read' }),
      expect.anything()
    )
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        arguments: { path: 'README.md' }
      }),
      expect.anything(),
      expect.anything()
    )
    const stream = await events.loadStream(
      result.outcome === 'executed' ? result.execution.id : 'missing'
    )
    expect(stream[0]).toMatchObject({
      eventType: 'tool.invocation_requested',
      payload: {
        definition: { id: 'builtin.files.read' },
        modelFacingFacade: {
          id: 'filesystem_read',
          action: 'read',
          resolvedPrimitiveToolId: 'builtin.files.read'
        }
      }
    })
  })

  it('uses primitive delete risk and permission records for a filesystem delete facade', async () => {
    await seedToolDefinition(events, deleteDefinition, 'catalog-event-delete')
    await projectionRunner.rebuildCatalogProjection()
    vi.mocked(adapter.resolve).mockResolvedValueOnce({
      definitionId: deleteDefinition.id,
      definitionVersion: deleteDefinition.version,
      definitionDigest: deleteDefinition.definitionDigest,
      adapterKind: 'builtin',
      bindingId: 'binding-files-delete',
      opaqueRuntimeHandle: {}
    })
    vi.mocked(adapter.planEffects!).mockResolvedValueOnce({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.delete',
          path: '/workspace/obsolete.txt',
          permanent: true
        }
      ]
    })
    const facade = await facadeDefinition('filesystem_delete')

    const result = await service.execute({
      definition: reference(facade),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        toolCallId: 'call-delete'
      },
      input: {
        action: 'delete_permanently',
        arguments: {
          path: 'obsolete.txt',
          expectedChecksum: 'c'.repeat(64)
        }
      },
      idempotencyKey: 'facade-delete'
    })

    expect(result).toMatchObject({
      outcome: 'permission_required',
      permissionRequests: [
        expect.objectContaining({
          status: 'requested'
        })
      ]
    })
    expect(adapter.execute).not.toHaveBeenCalled()
    const stream = await events.loadStream(
      result.outcome === 'permission_required' ? result.executionId : 'missing'
    )
    expect(stream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'tool.invocation_requested',
          payload: expect.objectContaining({
            definition: expect.objectContaining({
              id: 'builtin.files.delete_permanently'
            }),
            modelFacingFacade: expect.objectContaining({
              id: 'filesystem_delete',
              action: 'delete_permanently',
              resolvedPrimitiveToolId: 'builtin.files.delete_permanently'
            })
          })
        }),
        expect.objectContaining({
          eventType: 'tool.permission_requested',
          payload: expect.objectContaining({
            toolId: 'builtin.files.delete_permanently',
            toolName: 'Delete permanently',
            risk: 'critical'
          })
        })
      ])
    )
  })

  it('dispatches a model-facing spreadsheet facade through the primitive spreadsheet Tool', async () => {
    await seedPackage(events, spreadsheetReadRangeDefinition, 'catalog-package-spreadsheet')
    await seedToolDefinition(
      events,
      spreadsheetReadRangeDefinition,
      'catalog-event-spreadsheet-read-range'
    )
    await projectionRunner.rebuildCatalogProjection()
    vi.mocked(adapter.resolve).mockResolvedValueOnce({
      definitionId: spreadsheetReadRangeDefinition.id,
      definitionVersion: spreadsheetReadRangeDefinition.version,
      definitionDigest: spreadsheetReadRangeDefinition.definitionDigest,
      adapterKind: 'builtin',
      bindingId: 'binding-spreadsheet-read-range',
      opaqueRuntimeHandle: {}
    })
    const facade = await facadeDefinition('spreadsheet')

    const result = await service.execute({
      definition: reference(facade),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        toolCallId: 'call-spreadsheet'
      },
      input: {
        action: 'read_range',
        arguments: {
          sessionId: '12345678-1234-1234-1234-123456789abc',
          sheet: 'Sheet1',
          range: 'A1:B2'
        }
      },
      idempotencyKey: 'facade-spreadsheet-read-range'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded'
      }
    })
    expect(adapter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'builtin.spreadsheet.read_range' }),
      expect.anything()
    )
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        arguments: {
          sessionId: '12345678-1234-1234-1234-123456789abc',
          sheet: 'Sheet1',
          range: 'A1:B2'
        }
      }),
      expect.anything(),
      expect.anything()
    )
    const stream = await events.loadStream(
      result.outcome === 'executed' ? result.execution.id : 'missing'
    )
    expect(stream[0]).toMatchObject({
      eventType: 'tool.invocation_requested',
      payload: {
        definition: { id: 'builtin.spreadsheet.read_range' },
        modelFacingFacade: {
          id: 'spreadsheet',
          action: 'read_range',
          resolvedPrimitiveToolId: 'builtin.spreadsheet.read_range'
        }
      }
    })
  })

  it('uses primitive image risk and permission records for an image redaction facade', async () => {
    await seedPackage(events, imageRedactDefinition, 'catalog-package-image')
    await seedToolDefinition(
      events,
      imageRedactDefinition,
      'catalog-event-image-redact'
    )
    await projectionRunner.rebuildCatalogProjection()
    vi.mocked(adapter.resolve).mockResolvedValueOnce({
      definitionId: imageRedactDefinition.id,
      definitionVersion: imageRedactDefinition.version,
      definitionDigest: imageRedactDefinition.definitionDigest,
      adapterKind: 'builtin',
      bindingId: 'binding-image-redact',
      opaqueRuntimeHandle: {}
    })
    vi.mocked(adapter.planEffects!).mockResolvedValueOnce({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.write',
          path: '/outside/redacted.png'
        }
      ]
    })
    const facade = await facadeDefinition('image')

    const result = await service.execute({
      definition: reference(facade),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        toolCallId: 'call-image'
      },
      input: {
        action: 'redact',
        arguments: {
          sessionId: '12345678-1234-1234-1234-123456789abc',
          expectedRevision: 1,
          regions: [{ left: 10, top: 20, width: 30, height: 40 }]
        }
      },
      idempotencyKey: 'facade-image-redact'
    })

    expect(result).toMatchObject({
      outcome: 'permission_required',
      permissionRequests: [
        expect.objectContaining({
          status: 'requested'
        })
      ]
    })
    expect(adapter.execute).not.toHaveBeenCalled()
    const stream = await events.loadStream(
      result.outcome === 'permission_required' ? result.executionId : 'missing'
    )
    expect(stream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'tool.invocation_requested',
          payload: expect.objectContaining({
            definition: expect.objectContaining({
              id: 'builtin.image.redact'
            }),
            modelFacingFacade: expect.objectContaining({
              id: 'image',
              action: 'redact',
              resolvedPrimitiveToolId: 'builtin.image.redact'
            })
          })
        }),
        expect.objectContaining({
          eventType: 'tool.permission_requested',
          payload: expect.objectContaining({
            toolId: 'builtin.image.redact',
            toolName: 'Redact image',
            risk: 'high'
          })
        })
      ])
    )
  })

  it('searches hidden directory tools with compact catalog results only', async () => {
    const control = await directoryDefinition('tool_search')

    const result = await service.execute({
      definition: reference(control),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        toolCallId: 'call-tool-search',
        parentExecutionId: 'run-directory'
      },
      input: { query: 'read file', limit: 5 },
      idempotencyKey: 'directory-search'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded',
        output: {
          candidates: [
            expect.objectContaining({
              id: 'builtin.files.read',
              name: 'Read file',
              source: 'builtin',
              risk: 'low',
              inputHint: 'path'
            })
          ]
        }
      }
    })
    expect(
      JSON.stringify(
        result.outcome === 'executed' ? result.execution.output : {}
      )
    ).not.toContain('inputSchema')
    expect(adapter.execute).not.toHaveBeenCalled()
    expect(submitToolResult).toHaveBeenCalledWith('run-directory', {
      callId: 'call-tool-search',
      status: 'completed',
      output: expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({ id: 'builtin.files.read' })
        ])
      }),
      toolExecutionId: expect.any(String),
      resultSummary: 'Tool directory control completed'
    })
  })

  it('describes a hidden directory tool with exact schemas and risk metadata', async () => {
    const control = await directoryDefinition('tool_describe')

    const result = await service.execute({
      definition: reference(control),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        toolCallId: 'call-tool-describe'
      },
      input: { id: 'builtin.files.read' },
      idempotencyKey: 'directory-describe'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded',
        output: {
          id: 'builtin.files.read',
          name: 'Read file',
          source: 'builtin',
          risk: 'low',
          capabilities: ['filesystem.read'],
          effects: ['local_data.read'],
          visibility: 'directory_only',
          definition: expect.objectContaining({
            id: 'builtin.files.read',
            inputSchema: definition.inputSchema,
            outputSchema: definition.outputSchema,
            definitionDigest: definition.definitionDigest
          })
        }
      }
    })
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('calls a hidden primitive through tool_call while preserving primitive execution', async () => {
    const control = await directoryDefinition('tool_call')

    const result = await service.execute({
      definition: reference(control),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        toolCallId: 'call-directory-hidden'
      },
      input: { id: 'builtin.files.read', args: { path: 'README.md' } },
      idempotencyKey: 'directory-call-hidden'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded',
        output: { content: 'RealmFlow' }
      }
    })
    expect(adapter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'builtin.files.read' }),
      expect.anything()
    )
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ arguments: { path: 'README.md' } }),
      expect.anything(),
      expect.anything()
    )
    const stream = await events.loadStream(
      result.outcome === 'executed' ? result.execution.id : 'missing'
    )
    expect(stream[0]).toMatchObject({
      eventType: 'tool.invocation_requested',
      payload: {
        definition: { id: 'builtin.files.read' },
        modelFacingDirectory: {
          id: 'tool_call',
          requestedToolId: 'builtin.files.read',
          resolvedToolId: 'builtin.files.read'
        }
      }
    })
  })

  it('returns direct-call guidance when tool_call targets a visible control tool', async () => {
    const control = await directoryDefinition('tool_call')

    const result = await service.execute({
      definition: reference(control),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        toolCallId: 'call-directory-direct'
      },
      input: { id: 'tool_search', args: { query: 'read' } },
      idempotencyKey: 'directory-call-direct'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'failed',
        error: {
          code: 'direct_tool_call_required',
          message: 'Tool tool_search is visible in directory mode; call it directly instead of using tool_call.'
        }
      }
    })
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('suspends ask_user once without invoking an adapter', async () => {
    const control = await runtimeDefinition('ask_user')
    const command = {
      definition: reference(control),
      triggerSource: 'model' as const,
      context: {
        scope: { kind: 'conversation' as const, conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'run-ask-user',
        toolCallId: 'call-ask-user'
      },
      input: {
        prompt: 'Which path should I use?',
        responseType: 'choice',
        choices: [{ id: 'docs', label: 'Docs' }]
      },
      idempotencyKey: 'ask-user-once'
    }

    const first = await service.execute(command)
    const second = await service.execute(command)

    expect(first).toMatchObject({
      outcome: 'permission_required',
      executionId: expect.any(String),
      permissionRequests: [
        expect.objectContaining({
          id: expect.any(String),
          reason: 'system',
          status: 'requested'
        })
      ]
    })
    expect(second).toEqual(first)
    expect(requestUserInput).toHaveBeenCalledOnce()
    expect(suspendToolCall).toHaveBeenCalledOnce()
    expect(suspendToolCall).toHaveBeenCalledWith('run-ask-user', {
      callId: 'call-ask-user',
      requestId: first.outcome === 'permission_required'
        ? first.permissionRequests[0]?.id
        : 'missing',
      toolExecutionId: first.outcome === 'permission_required' ? first.executionId : 'missing'
    })
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('resolves secrets to a credential handle without exposing secret values', async () => {
    const control = await runtimeDefinition('secrets')

    const result = await service.execute({
      definition: reference(control),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'run-secrets',
        toolCallId: 'call-secrets'
      },
      input: { action: 'resolve', name: 'docs-api', service: 'docs' },
      idempotencyKey: 'secrets-resolve'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded',
        output: {
          credentialHandle: 'credential:docs-api',
          name: 'docs-api',
          service: 'docs',
          status: 'available'
        }
      }
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('raw-secret-must-not-leak')
    expect(serialized).not.toContain('"value"')
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('returns compact sessions output without raw message history', async () => {
    const control = await runtimeDefinition('sessions')

    const result = await service.execute({
      definition: reference(control),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'run-sessions',
        toolCallId: 'call-sessions'
      },
      input: { action: 'search', query: 'plan', limit: 5 },
      idempotencyKey: 'sessions-search'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded',
        output: {
          sessions: [
            {
              id: 'conversation-1',
              title: 'Planning',
              updatedAt: 123
            }
          ]
        }
      }
    })
    expect(JSON.stringify(result)).not.toContain('full transcript must not leak')
    expect(runSessionCommand).toHaveBeenCalledWith({
      action: 'search',
      query: 'plan',
      limit: 5
    }, expect.objectContaining({ conversationId: 'conversation-1' }))
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('updates progress cards through the assistant runtime service', async () => {
    const control = await runtimeDefinition('progress_card')

    const result = await service.execute({
      definition: reference(control),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'run-progress',
        toolCallId: 'call-progress'
      },
      input: {
        cardId: 'card-1',
        status: 'running',
        message: 'Reading files',
        completed: 1,
        total: 3
      },
      idempotencyKey: 'progress-card'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded',
        output: {
          cardId: 'card-1',
          status: 'running',
          message: 'Reading files',
          revision: 1
        }
      }
    })
    expect(updateProgressCard).toHaveBeenCalledOnce()
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('delegates capability lifecycle commands transactionally', async () => {
    const control = await runtimeDefinition('capabilities')

    const result = await service.execute({
      definition: reference(control),
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'run-capabilities',
        toolCallId: 'call-capabilities'
      },
      input: {
        action: 'enable',
        installationId: 'capability-installation-1',
        expectedRevision: 1
      },
      idempotencyKey: 'capabilities-enable'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded',
        output: {
          action: 'enable',
          installationId: 'capability-installation-1',
          status: 'enabled',
          revision: 2
        }
      }
    })
    expect(runCapabilityCommand).toHaveBeenCalledWith({
      action: 'enable',
      installationId: 'capability-installation-1',
      expectedRevision: 1
    }, expect.objectContaining({ conversationId: 'conversation-1' }))
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('rejects invalid Tool arguments with a specific actionable error', async () => {
    await expect(
      service.execute({
        definition: {
          kind: 'tool',
          id: definition.id,
          version: definition.version,
          digest: definition.definitionDigest
        },
        triggerSource: 'model',
        context: {
          scope: { kind: 'conversation', conversationId: 'conversation-1' },
          conversationId: 'conversation-1'
        },
        input: { command: 'npm test' },
        idempotencyKey: 'invalid-arguments'
      })
    ).rejects.toMatchObject({
      code: 'tool_arguments_invalid',
      message: expect.stringContaining('unsupported property command')
    })
  })

  it('returns an adapter mutation preview without dispatching execution', async () => {
    vi.mocked(adapter.prepare).mockResolvedValueOnce({
      outcome: 'ready',
      preview: {
        mutationId: 'tool-preview',
        idempotencyKey: 'preview',
        toolId: 'builtin.files.write',
        mode: 'preview',
        preconditions: [{ kind: 'absence', target: 'notes.txt' }],
        operations: [{ kind: 'files.write', target: 'notes.txt' }]
      }
    })

    await expect(
      service.prepare({
        definition: {
          kind: 'tool',
          id: definition.id,
          version: definition.version,
          digest: definition.definitionDigest
        },
        triggerSource: 'user',
        context: {
          scope: { kind: 'conversation', conversationId: 'conversation-1' },
          conversationId: 'conversation-1'
        },
        input: { path: 'README.md' }
      })
    ).resolves.toEqual({
      outcome: 'ready',
      permissionRequests: [],
      preview: expect.objectContaining({
        mode: 'preview',
        operations: [{ kind: 'files.write', target: 'notes.txt' }]
      })
    })
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('resolves a scoped Connector Tool outside the legacy Tool Catalog', async () => {
    externalDefinition = {
      ...definition,
      id: 'com.example.docs.search',
      definitionDigest: 'f'.repeat(64),
      executor: {
        kind: 'connector',
        capabilityId: 'com.example.docs',
        capabilityVersion: '1.0.0',
        capabilityDigest: 'e'.repeat(64),
        actionId: 'search'
      }
    }

    await expect(
      service.prepare({
        definition: {
          kind: 'tool',
          id: externalDefinition.id,
          version: externalDefinition.version,
          digest: externalDefinition.definitionDigest
        },
        triggerSource: 'model',
        context: {
          scope: { kind: 'conversation', conversationId: 'conversation-1' },
          conversationId: 'conversation-1'
        },
        input: { path: 'README.md' }
      })
    ).resolves.toEqual({ outcome: 'ready', permissionRequests: [] })
  })

  it('executes a fixed workflow Tool through Outbox and projects the result', async () => {
    const command = {
      definition: {
        kind: 'tool' as const,
        id: definition.id,
        version: definition.version,
        digest: definition.definitionDigest
      },
      triggerSource: 'workflow' as const,
      context: {
        scope: {
          kind: 'requirement' as const,
          requirementId: 'requirement-1'
        },
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1'
      },
      input: { path: 'README.md' }
    }

    await expect(
      service.prepare(command)
    ).resolves.toEqual({ outcome: 'ready', permissionRequests: [] })
    const result = await service.execute({
      ...command,
      idempotencyKey: 'workflow:node-run-1:read'
    })

    expect(result).toMatchObject({
      outcome: 'executed',
      execution: {
        status: 'succeeded',
        output: { content: 'RealmFlow' }
      }
    })
    expect(adapter.execute).toHaveBeenCalledOnce()
    await expect(
      events.loadStream(
        result.outcome === 'executed' ? result.execution.id : 'missing'
      )
    ).resolves.toMatchObject([
      { eventType: 'tool.invocation_requested' },
      { eventType: 'tool.arguments_validated' },
      {
        eventType: 'tool.binding_resolved',
        payload: {
          sandboxAudit: {
            policyDigest: 'c'.repeat(64),
            executionLevel: 'controlled_file'
          }
        }
      },
      { eventType: 'tool.effects_planned' },
      { eventType: 'tool.authorization_auto_granted' },
      { eventType: 'tool.dispatch_enqueued' },
      { eventType: 'tool.attempt_started' },
      { eventType: 'tool.progress_reported' },
      { eventType: 'tool.attempt_succeeded' },
      { eventType: 'tool.completed' }
    ])
    await expect(
      service.list({ nodeRunId: 'node-run-1', limit: 10 })
    ).resolves.toMatchObject([
      {
        id: result.outcome === 'executed' ? result.execution.id : 'missing',
        status: 'succeeded'
      }
    ])
  })

  it('persists an out-of-scope write suspension without dispatching it', async () => {
    vi.mocked(adapter.planEffects!).mockResolvedValueOnce({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.write',
          path: '/outside/result.txt'
        }
      ]
    })

    const result = await service.execute({
      definition: {
        kind: 'tool',
        id: definition.id,
        version: definition.version,
        digest: definition.definitionDigest
      },
      triggerSource: 'model',
      context: {
        scope: {
          kind: 'requirement',
          requirementId: 'requirement-1'
        },
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        parentExecutionId: 'provider-run-1',
        toolCallId: 'call-outside'
      },
      input: { path: 'README.md' },
      idempotencyKey: 'workflow:node-run-1:outside-write'
    })

    expect(result).toMatchObject({
      outcome: 'permission_required',
      executionId: expect.any(String),
      permissionRequests: [
        expect.objectContaining({
          reason: 'out_of_scope',
          status: 'requested'
        })
      ]
    })
    const executionId =
      result.outcome === 'permission_required' ? result.executionId : 'missing'
    await expect(events.loadStream(executionId)).resolves.toMatchObject([
      { eventType: 'tool.invocation_requested' },
      { eventType: 'tool.arguments_validated' },
      { eventType: 'tool.binding_resolved' },
      { eventType: 'tool.effects_planned' },
      { eventType: 'tool.permission_requested' }
    ])
    expect(adapter.execute).not.toHaveBeenCalled()
    expect(suspendToolCall).toHaveBeenCalledWith('provider-run-1', {
      callId: 'call-outside',
      requestId: result.outcome === 'permission_required'
        ? result.permissionRequests[0]?.id
        : 'missing',
      toolExecutionId: executionId
    })
    const outbox = database
      .prepare(
        `SELECT topic, message_key
         FROM tool_outbox
         WHERE message_key = ?`
      )
      .get(executionId)
    expect(outbox).toEqual({
      topic: 'ai_run.suspend_tool_call',
      message_key: executionId
    })
    await expect(projections.listPendingPermissions()).resolves.toEqual([
      expect.objectContaining({
        id: result.outcome === 'permission_required'
          ? result.permissionRequests[0]?.id
          : 'missing',
        executionId
      })
    ])
  })

  it('allows a pending invocation once without changing its identity', async () => {
    vi.mocked(adapter.planEffects!).mockResolvedValue({
      outcome: 'planned',
      effects: [
        { kind: 'filesystem.write', path: '/outside/result.txt' }
      ]
    })
    const pending = await service.execute({
      definition: {
        kind: 'tool',
        id: definition.id,
        version: definition.version,
        digest: definition.definitionDigest
      },
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'run-1',
        toolCallId: 'call-1'
      },
      input: { path: 'README.md' },
      idempotencyKey: 'call-1'
    })
    if (pending.outcome !== 'permission_required') {
      throw new Error('Expected a pending permission')
    }

    await expect(
      service.resolvePermission({
        requestId: String(pending.permissionRequests[0]?.id),
        expectedRevision: 1,
        decision: 'allow_once'
      })
    ).resolves.toMatchObject({
      status: 'approved',
      executionId: pending.executionId
    })
    expect(
      (await events.loadStream(pending.executionId)).map(
        ({ eventType }) => eventType
      )
    ).toEqual([
      'tool.invocation_requested',
      'tool.arguments_validated',
      'tool.binding_resolved',
      'tool.effects_planned',
      'tool.permission_requested',
      'tool.permission_decided',
      'tool.dispatch_enqueued',
      'tool.attempt_started',
      'tool.progress_reported',
      'tool.attempt_succeeded',
      'tool.completed'
    ])
    expect(adapter.execute).toHaveBeenCalledOnce()
    expect(submitToolResult).toHaveBeenCalledWith('run-1', {
      callId: 'call-1',
      status: 'completed',
      output: { content: 'RealmFlow' },
      toolExecutionId: pending.executionId,
      resultSummary: 'Tool execution completed'
    })
    await expect(checkpoints.load(pending.executionId)).resolves.toBeUndefined()
  })

  it('restores an encrypted pending invocation and approves its original identity after restart', async () => {
    vi.mocked(adapter.planEffects!).mockResolvedValue({
      outcome: 'planned',
      effects: [
        { kind: 'filesystem.write', path: '/outside/private-result.txt' }
      ]
    })
    const pending = await service.execute({
      definition: {
        kind: 'tool',
        id: definition.id,
        version: definition.version,
        digest: definition.definitionDigest
      },
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'run-restarted',
        toolCallId: 'call-restarted'
      },
      input: { path: 'raw-argument-must-stay-private.txt' },
      idempotencyKey: 'run-restarted:call-restarted'
    })
    if (pending.outcome !== 'permission_required') {
      throw new Error('Expected a pending permission')
    }
    const stored = database
      .prepare(
        `SELECT state_json
         FROM tool_snapshots
         WHERE stream_id = ?`
      )
      .get(`pending-tool-invocation.${pending.executionId}`) as {
        state_json: string
      }
    expect(stored.state_json).not.toContain('raw-argument-must-stay-private')
    expect(
      JSON.stringify(await events.loadStream(pending.executionId))
    ).not.toContain('raw-argument-must-stay-private')

    let restarted!: ToolExecutionApplicationService
    const restartedDispatcher = new ToolOutboxDispatcher({
      repository: new SqliteToolOutboxRepository(database),
      publish: (message) => restarted.dispatch(message),
      owner: 'restarted-tool-runtime',
      now: () => 200
    })
    let restartedId = 0
    restarted = new ToolExecutionApplicationService({
      events,
      projections,
      projectionRunner,
      adapters,
      pendingCheckpoints: checkpoints,
      dispatcher: restartedDispatcher,
      aiRuns: { suspendToolCall, submitToolResult },
      now: () => 200,
      createId: () => `restarted-runtime-${++restartedId}`,
    resolveScopeRoots: async () => ['/workspace'],
      resolveBoundScopes: async () => [
        {
          authorizationId: 'bound-scope-1',
          source: {
            kind: 'requirement',
            requirementId: 'requirement-1',
            workspaceId: 'workspace-1'
          },
          roots: [{ canonicalPath: '/workspace', access: 'read-write' }],
          bindingRevision: 1,
          status: 'active',
          createdAt: 100
        }
      ]
    })

    await expect(restarted.restorePendingPermissions()).resolves.toBe(1)
    await expect(
      restarted.resolvePermission({
        requestId: String(pending.permissionRequests[0]?.id),
        expectedRevision: 1,
        decision: 'allow_once'
      })
    ).resolves.toMatchObject({
      status: 'approved',
      executionId: pending.executionId
    })
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        executionId: pending.executionId,
        idempotencyKey: 'run-restarted:call-restarted',
        arguments: expect.objectContaining({
          path: 'raw-argument-must-stay-private.txt'
        })
      }),
      expect.anything(),
      expect.any(AbortSignal)
    )
    expect(submitToolResult).toHaveBeenCalledWith(
      'run-restarted',
      expect.objectContaining({
        callId: 'call-restarted',
        toolExecutionId: pending.executionId
      })
    )
    await expect(checkpoints.load(pending.executionId)).resolves.toBeUndefined()
  })

  it('denies a pending invocation with one terminal result', async () => {
    vi.mocked(adapter.planEffects!).mockResolvedValue({
      outcome: 'planned',
      effects: [{ kind: 'filesystem.delete', path: '/workspace/a.txt', permanent: false }]
    })
    const pending = await service.execute({
      definition: {
        kind: 'tool',
        id: definition.id,
        version: definition.version,
        digest: definition.definitionDigest
      },
      triggerSource: 'model',
      context: {
        scope: { kind: 'conversation', conversationId: 'conversation-1' },
        conversationId: 'conversation-1',
        parentExecutionId: 'run-1',
        toolCallId: 'call-1'
      },
      input: { path: 'README.md' },
      idempotencyKey: 'call-1'
    })
    if (pending.outcome !== 'permission_required') {
      throw new Error('Expected a pending permission')
    }

    await expect(
      service.resolvePermission({
        requestId: String(pending.permissionRequests[0]?.id),
        expectedRevision: 1,
        decision: 'deny'
      })
    ).resolves.toMatchObject({
      status: 'denied',
      executionId: pending.executionId
    })
    await expect(
      projections.getExecution(pending.executionId)
    ).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'permission_denied' }
    })
    expect(adapter.execute).not.toHaveBeenCalled()
    expect(submitToolResult).toHaveBeenCalledWith('run-1', {
      callId: 'call-1',
      status: 'failed',
      errorCode: 'permission_denied',
      message: 'Tool permission was denied',
      toolExecutionId: pending.executionId
    })
    await expect(checkpoints.load(pending.executionId)).resolves.toBeUndefined()
  })

  it('replays an idempotent execution without invoking the adapter twice', async () => {
    const command = {
      definition: {
        kind: 'tool' as const,
        id: definition.id,
        version: definition.version,
        digest: definition.definitionDigest
      },
      triggerSource: 'workflow' as const,
      context: {
        scope: {
          kind: 'requirement' as const,
          requirementId: 'requirement-1'
        },
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1'
      },
      input: { path: 'README.md' },
      idempotencyKey: 'workflow:requirement-1:same-write'
    }

    const first = await service.execute(command)
    const repeated = await service.execute(command)

    expect(repeated).toEqual(first)
    expect(adapter.execute).toHaveBeenCalledOnce()
  })

  it('marks a non-resumable queued execution interrupted during startup recovery', async () => {
    await appendQueuedExecution(events)
    await projectionRunner.runExecutionBatch(1_000)

    await expect(service.recoverInterrupted()).resolves.toBe(1)
    await expect(
      projections.getExecution('queued-execution')
    ).resolves.toMatchObject({
      status: 'interrupted',
      error: {
        code: 'tool_restart_interrupted',
        retryable: false
      }
    })
    await expect(
      events.loadStream('queued-execution')
    ).resolves.toMatchObject([
      { eventType: 'tool.invocation_requested' },
      { eventType: 'tool.arguments_validated' },
      { eventType: 'tool.dispatch_enqueued' },
      { eventType: 'tool.recovery_started' },
      { eventType: 'tool.interrupted' }
    ])
  })

  it('cancels an active adapter execution and projects a cancelled result', async () => {
    adapter.cancel = vi.fn().mockResolvedValue(undefined)
    vi.mocked(adapter.execute).mockImplementationOnce(
      async (_binding, _invocation, _sink, signal) =>
        new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () =>
              resolve({
                outcome: 'cancelled',
                error: {
                  code: 'tool_cancelled',
                  message: 'Tool execution was cancelled',
                  retryable: false
                },
                metrics: { durationMs: 1, outputBytes: 0 }
              }),
            { once: true }
          )
        })
    )
    const running = service.execute({
      definition: {
        kind: 'tool',
        id: definition.id,
        version: definition.version,
        digest: definition.definitionDigest
      },
      triggerSource: 'model',
      context: {
        scope: {
          kind: 'conversation',
          conversationId: 'conversation-1'
        },
        conversationId: 'conversation-1',
        parentExecutionId: 'provider-run-1'
      },
      input: { path: 'README.md' },
      idempotencyKey: 'conversation:cancel-tool'
    })
    await vi.waitFor(() => expect(adapter.execute).toHaveBeenCalled())

    await expect(
      service.cancelByParent('provider-run-1')
    ).resolves.toBe(1)
    await expect(running).resolves.toMatchObject({
      outcome: 'executed',
      execution: { status: 'cancelled' }
    })
    expect(adapter.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ bindingId: 'binding-files-read' }),
      'runtime-1'
    )
  })
})

const definition: ToolDefinition = {
  schemaVersion: 1,
  id: 'builtin.files.read',
  version: '1.0.0',
  definitionDigest: 'a'.repeat(64),
  package: {
    packageId: 'realmflow.builtin.files',
    packageVersion: '1.0.0',
    packageDigest: 'b'.repeat(64)
  },
  origin: 'builtin',
  name: 'Read file',
  description: 'Read one file.',
  tags: ['file'],
  executor: {
    kind: 'builtin',
    handler: 'files.read',
    handlerVersion: '1.0.0'
  },
  inputSchema: {
    type: 'object',
    required: ['path'],
    properties: { path: { type: 'string' } },
    additionalProperties: false
  },
  outputSchema: { type: 'object' },
  capabilities: ['filesystem.read'],
  effects: ['local_data.read'],
  risk: 'low',
  invocation: {
    mode: 'unary',
    idempotency: 'required',
    cancellable: true,
    resumable: false
  },
  resources: {
    timeoutMs: 30_000,
    maxOutputBytes: 1_024,
    maxAttempts: 1
  },
  discovery: {
    intents: ['read file'],
    contexts: ['workflow']
  }
}

const deleteDefinition: ToolDefinition = {
  ...definition,
  id: 'builtin.files.delete_permanently',
  definitionDigest: 'd'.repeat(64),
  name: 'Delete permanently',
  description: 'Permanently delete one file.',
  executor: {
    kind: 'builtin',
    handler: 'files.delete_permanently',
    handlerVersion: '1.0.0'
  },
  inputSchema: {
    type: 'object',
    required: ['path', 'expectedChecksum'],
    properties: {
      path: { type: 'string' },
      expectedChecksum: { type: 'string', pattern: '^[a-f0-9]{64}$' }
    },
    additionalProperties: false
  },
  capabilities: ['filesystem.delete'],
  effects: ['local_data.delete'],
  risk: 'critical',
  discovery: {
    intents: ['delete permanently'],
    contexts: ['workflow'],
    requiresExplicitSelection: true
  }
}

const spreadsheetReadRangeDefinition: ToolDefinition = {
  ...definition,
  id: 'builtin.spreadsheet.read_range',
  definitionDigest: 'e'.repeat(64),
  package: {
    packageId: 'realmflow.builtin.spreadsheets',
    packageVersion: '1.0.0',
    packageDigest: 'f'.repeat(64)
  },
  name: 'Read spreadsheet range',
  description: 'Read typed cells from a spreadsheet session.',
  tags: ['spreadsheet'],
  executor: {
    kind: 'builtin',
    handler: 'spreadsheet.read_range',
    handlerVersion: '1.0.0'
  },
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['sessionId', 'sheet', 'range'],
    properties: {
      sessionId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f-]{27,}$'
      },
      expectedRevision: { type: 'integer', minimum: 0 },
      sheet: { type: 'string', minLength: 1, maxLength: 255 },
      range: {
        type: 'string',
        pattern: '^[A-Za-z]{1,3}[1-9][0-9]*:[A-Za-z]{1,3}[1-9][0-9]*$'
      }
    }
  },
  capabilities: ['filesystem.read'],
  effects: ['local_data.read'],
  risk: 'low',
  invocation: {
    mode: 'unary',
    idempotency: 'supported',
    cancellable: true,
    resumable: false
  },
  resources: {
    timeoutMs: 120_000,
    maxOutputBytes: 4_194_304,
    maxAttempts: 1
  },
  discovery: {
    intents: ['read spreadsheet range'],
    contexts: ['general', 'space', 'requirement', 'workflow', 'schedule']
  }
}

const imageRedactDefinition: ToolDefinition = {
  ...definition,
  id: 'builtin.image.redact',
  definitionDigest: '0'.repeat(64),
  package: {
    packageId: 'realmflow.builtin.images',
    packageVersion: '1.0.0',
    packageDigest: '9'.repeat(64)
  },
  name: 'Redact image',
  description: 'Cover explicit image regions with an opaque color.',
  tags: ['image'],
  executor: {
    kind: 'builtin',
    handler: 'image.redact',
    handlerVersion: '1.0.0'
  },
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['sessionId', 'expectedRevision', 'regions'],
    properties: {
      sessionId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f-]{27,}$'
      },
      expectedRevision: { type: 'integer', minimum: 0 },
      regions: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['left', 'top', 'width', 'height'],
          properties: {
            left: { type: 'integer', minimum: 0, maximum: 20000 },
            top: { type: 'integer', minimum: 0, maximum: 20000 },
            width: { type: 'integer', minimum: 1, maximum: 20000 },
            height: { type: 'integer', minimum: 1, maximum: 20000 }
          }
        }
      },
      color: {
        type: 'string',
        pattern: '^#[0-9a-fA-F]{6}$'
      }
    }
  },
  capabilities: ['filesystem.write'],
  effects: ['local_data.change'],
  risk: 'high',
  invocation: {
    mode: 'unary',
    idempotency: 'supported',
    cancellable: true,
    resumable: false
  },
  resources: {
    timeoutMs: 120_000,
    maxOutputBytes: 4_194_304,
    maxAttempts: 1
  },
  discovery: {
    intents: ['redact image'],
    contexts: ['general', 'space', 'requirement', 'workflow', 'schedule']
  }
}

async function seedCatalog(store: SqliteToolEventStore): Promise<void> {
  await seedPackage(store, definition, 'catalog-event-1')
  await seedToolDefinition(store, definition, 'catalog-event-2')
}

async function seedPackage(
  store: SqliteToolEventStore,
  tool: ToolDefinition,
  eventId: string
): Promise<void> {
  await store.append({
    streamId: `extension-${tool.package.packageId}`,
    streamType: 'extension',
    expectedSequence: 0,
    command: {
      idempotencyKey: `seed-tool-package-${tool.package.packageId}`,
      fingerprint: tool.package.packageDigest,
      result: { packageId: tool.package.packageId }
    },
    events: [
      pendingEvent(eventId, 'extension.package_imported', {
        packageId: tool.package.packageId,
        packageVersion: tool.package.packageVersion,
        packageDigest: tool.package.packageDigest,
        origin: tool.origin,
        name: tool.package.packageId.replace('realmflow.builtin.', ''),
        description: `${tool.package.packageId} test package.`
      })
    ],
    outbox: []
  })
}

async function seedToolDefinition(
  store: SqliteToolEventStore,
  tool: ToolDefinition,
  eventId: string
): Promise<void> {
  await store.append({
    streamId: `definition-${tool.id.replace(/[^a-z0-9_-]/gi, '-')}`,
    streamType: 'definition',
    expectedSequence: 0,
    command: {
      idempotencyKey: `seed-tool-definition-${tool.id}`,
      fingerprint: tool.definitionDigest,
      result: { definitionId: tool.id }
    },
    events: [
      pendingEvent(eventId, 'tool.definition_published', {
        definition: tool
      })
    ],
    outbox: []
  })
}

async function facadeDefinition(id: string): Promise<ToolDefinition> {
  const catalog = projectModelFacingToolCatalog(
    await projections.getCatalog(),
    'facade'
  )
  const facade = catalog.tools.find((tool) => tool.id === id)?.definition
  if (!facade) throw new Error(`Missing facade definition: ${id}`)
  return facade
}

async function directoryDefinition(id: string): Promise<ToolDefinition> {
  const catalog = projectModelFacingToolCatalog(
    await projections.getCatalog(),
    'directory'
  )
  const control = catalog.tools.find((tool) => tool.id === id)?.definition
  if (!control) throw new Error(`Missing directory definition: ${id}`)
  return control
}

async function runtimeDefinition(id: string): Promise<ToolDefinition> {
  const catalog = projectModelFacingToolCatalog(
    await projections.getCatalog(),
    'facade'
  )
  const control = catalog.tools.find((tool) => tool.id === id)?.definition
  if (!control) throw new Error(`Missing runtime definition: ${id}`)
  return control
}

function reference(tool: ToolDefinition) {
  return {
    kind: 'tool' as const,
    id: tool.id,
    version: tool.version,
    digest: tool.definitionDigest
  }
}

async function appendQueuedExecution(
  store: SqliteToolEventStore
): Promise<void> {
  const metadata = {
    correlationId: 'queued-correlation',
    causationId: 'queued-command',
    commandId: 'queued-command',
    actorType: 'system' as const,
    actorId: 'realmflow',
    occurredAt: 150
  }
  await store.append({
    streamId: 'queued-execution',
    streamType: 'tool_execution',
    expectedSequence: 0,
    command: {
      idempotencyKey: 'seed-queued-execution',
      fingerprint: '3'.repeat(64),
      result: { executionId: 'queued-execution' }
    },
    events: [
      {
        eventId: 'queued-event-1',
        eventType: 'tool.invocation_requested',
        eventSchemaVersion: 1,
        payload: {
          executionId: 'queued-execution',
          definition: {
            id: definition.id,
            version: definition.version,
            definitionDigest: definition.definitionDigest
          },
          context: {
            owner: { type: 'node_run', id: 'node-run-queued' },
            workspaceId: 'workspace-1',
            requirementId: 'requirement-1',
            nodeRunId: 'node-run-queued',
            correlationId: 'queued-correlation',
            causationId: 'queued-command'
          },
          requestedBy: { type: 'workflow', id: 'node-run-queued' }
        },
        metadata
      },
      {
        eventId: 'queued-event-2',
        eventType: 'tool.arguments_validated',
        eventSchemaVersion: 1,
        payload: { argumentsDigest: '4'.repeat(64) },
        metadata
      },
      {
        eventId: 'queued-event-3',
        eventType: 'tool.dispatch_enqueued',
        eventSchemaVersion: 1,
        payload: { dispatchId: 'queued-dispatch' },
        metadata
      }
    ],
    outbox: []
  })
}

function pendingEvent(
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  return {
    eventId,
    eventType,
    eventSchemaVersion: 1,
    payload,
    metadata: {
      correlationId: 'seed-correlation',
      causationId: 'seed-command',
      commandId: 'seed-command',
      actorType: 'system' as const,
      actorId: 'realmflow',
      occurredAt: 100
    }
  }
}

function idFactory(): () => string {
  let next = 0
  return () => `runtime-${++next}`
}
