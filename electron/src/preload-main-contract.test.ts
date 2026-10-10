import { vi } from 'vitest'
import type { ModelRouteRequest } from '../../domain/model'
import type { RealmFlowApi } from '../../shared/types'
import {
  IPC_COMMAND_CHANNELS,
  IPC_EVENT_CHANNELS,
  IPC_INVOKE_CHANNELS,
  IPC_QUERY_CHANNELS,
  IPC_SEND_CHANNELS
} from '../../shared/ipc-contract'
import { registerMainIpc } from './ipc/register-main-ipc'
import { createRealmFlowApi } from './preload-api'

describe('preload and main IPC contract', () => {
  it('classifies every invoke channel exactly once as a query or command', () => {
    const queries = Object.values(IPC_QUERY_CHANNELS)
    const commands = Object.values(IPC_COMMAND_CHANNELS)
    const commandSet = new Set<string>(commands)

    expect(new Set(queries).size).toBe(queries.length)
    expect(new Set(commands).size).toBe(commands.length)
    expect(queries.filter((channel) => commandSet.has(channel))).toEqual([])
    expect(new Set([...queries, ...commands])).toEqual(
      new Set(Object.values(IPC_INVOKE_CHANNELS))
    )
    expect(queries).toContain(IPC_INVOKE_CHANNELS.spaceList)
    expect(commands).toContain(IPC_INVOKE_CHANNELS.spaceCreate)
  })

  it('exposes only typed Runtime governance queries and commands', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const governance = api.runtimeGovernance
    expect(governance).toBeDefined()

    await governance!.getSnapshot()
    await governance!.getRunDetail('run-1')
    await governance!.runEvaluation()
    await governance!.release({
      evaluationId: 'evaluation-1',
      expectedRevision: 1
    })
    await governance!.exportDiagnostic('run-1')

    expect(invoke.mock.calls).toEqual([
      [IPC_QUERY_CHANNELS.runtimeGovernanceSnapshot],
      [IPC_QUERY_CHANNELS.runtimeGovernanceRunDetail, { runId: 'run-1' }],
      [IPC_COMMAND_CHANNELS.runtimeGovernanceEvaluate],
      [
        IPC_COMMAND_CHANNELS.runtimeGovernanceRelease,
        { evaluationId: 'evaluation-1', expectedRevision: 1 }
      ],
      [IPC_COMMAND_CHANNELS.runtimeGovernanceExport, { runId: 'run-1' }]
    ])
  })

  it('exposes application model default query and save channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = {
      preference: {
        mode: 'profile' as const,
        providerId: 'provider-1',
        profileId: 'profile-1'
      },
      expectedRevision: 1
    }

    await api.business.getApplicationModelDefault()
    await api.business.saveApplicationModelDefault(command)

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_INVOKE_CHANNELS.modelDefaultGet
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_INVOKE_CHANNELS.modelDefaultSave,
      command
    )
  })

  it('forwards typed follow-up suggestion commands to the exact channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = {
      sessionId: 'conversation-1',
      suggestionSetId: 'set-1',
      suggestionId: 'suggestion-1',
      expectedSessionRevision: 3,
      expectedSuggestionRevision: 1
    }

    await api.business.sendFollowUpSuggestion(command)

    expect(invoke).toHaveBeenCalledWith(
      IPC_COMMAND_CHANNELS.conversationSendFollowUpSuggestion,
      command
    )
  })

  it('forwards conversation management commands to exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const rename = {
      id: 'conversation-1',
      expectedRevision: 2,
      title: 'Renamed'
    }
    const remove = { id: 'conversation-1', expectedRevision: 2 }

    await api.business.renameConversation(rename)
    await api.business.deleteConversation(remove)

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_COMMAND_CHANNELS.conversationRename,
      rename
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_COMMAND_CHANNELS.conversationDelete,
      remove
    )
  })

  it('exposes credential-free provider discovery and configuration channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )

    await api.business.discoverModelProviders()
    await api.business.configureDiscoveredModelProvider({
      catalogId: 'openai'
    })

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_INVOKE_CHANNELS.modelProviderDiscover
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_INVOKE_CHANNELS.modelDiscoveredProviderConfigure,
      { catalogId: 'openai' }
    )
  })

  it('forwards physical directory rename commands to their exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = {
      id: 'entity-1',
      name: 'Renamed Directory',
      expectedRevision: 2
    }

    await api.business.renameSpaceDirectory(command)
    await api.business.renameRequirementDirectory(command)

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_INVOKE_CHANNELS.spaceRenameDirectory,
      command
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_INVOKE_CHANNELS.requirementRenameDirectory,
      command
    )
  })

  it('forwards workflow parallelism commands to the exact channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = {
      requirementId: 'requirement-1',
      maxParallelism: 2,
      expectedWorkflowRevision: 4,
      expectedExecutionRevision: 3
    }

    await api.business.setWorkflowParallelism(command)

    expect(invoke).toHaveBeenCalledWith('workflow:set-parallelism', command)
  })

  it('forwards workflow rollback commands to an independent exact channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = {
      requestId: 'request-1',
      requirementId: 'requirement-1',
      executionId: 'execution-1',
      targetNodeId: 'node-1',
      expectedRequirementRevision: 4,
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 2,
      expectedNodeRunRevision: 1
    }

    await api.business.rollbackWorkflowToNode(command)

    expect(invoke).toHaveBeenCalledWith('workflow:rollback-to-node', command)
  })

  it('forwards workflow template node restore snapshots to the exact channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = {
      id: 'template-1',
      expectedRevision: 2,
      node: {
        id: 'template-1-v1-node-review',
        stableKey: 'review',
        type: 'ai_generate' as const,
        name: 'Review',
        description: '',
        order: 1,
        allowSkip: false,
        position: { x: 420, y: 180 }
      },
      edges: [
        {
          id: 'edge-analysis-review',
          sourceNodeId: 'template-1-v1-node-analysis',
          targetNodeId: 'template-1-v1-node-review'
        }
      ]
    }
    const business = api.business as typeof api.business & {
      restoreWorkflowTemplateNode: (
        input: typeof command
      ) => Promise<unknown>
    }

    await business.restoreWorkflowTemplateNode(command)

    expect(invoke).toHaveBeenCalledWith(
      'workflow-template-node:restore',
      command
    )
  })

  it('exposes template migration queries and command on exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const business = api.business as typeof api.business & {
      listTemplateMigrationCandidates: (query: {
        requirementId: string
      }) => Promise<unknown>
      previewTemplateMigration: (query: {
        requirementId: string
        targetTemplateVersionId: string
      }) => Promise<unknown>
      applyTemplateMigration: (command: {
        requestId: string
        requirementId: string
        targetTemplateVersionId: string
        expectedRequirementRevision: number
        expectedWorkflowRevision: number
        expectedExecutionRevision: number
      }) => Promise<unknown>
    }
    const listQuery = { requirementId: 'requirement-1' }
    const previewQuery = {
      requirementId: 'requirement-1',
      targetTemplateVersionId: 'template-v2'
    }
    const command = {
      requestId: 'migration-request-1',
      ...previewQuery,
      expectedRequirementRevision: 3,
      expectedWorkflowRevision: 4,
      expectedExecutionRevision: 5
    }

    expect(business.listTemplateMigrationCandidates).toBeTypeOf('function')
    expect(business.previewTemplateMigration).toBeTypeOf('function')
    expect(business.applyTemplateMigration).toBeTypeOf('function')

    await business.listTemplateMigrationCandidates(listQuery)
    await business.previewTemplateMigration(previewQuery)
    await business.applyTemplateMigration(command)

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      'template-migration:list-candidates',
      listQuery
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      'template-migration:preview',
      previewQuery
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      'template-migration:apply',
      command
    )
  })

  it('forwards model profile deletion to its exact command channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = { id: 'profile-1', expectedRevision: 2 }

    await api.business.deleteModelProfile(command)

    expect(invoke).toHaveBeenCalledWith(
      IPC_INVOKE_CHANNELS.modelProfileDelete,
      command
    )
  })

  it('exposes typed app support invokes without a generic URL', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )

    await api.business.getAppSupportInfo()
    await api.business.checkForUpdates({ requestId: 'request-1' })
    await api.business.openSupportLink({
      requestId: 'link-1',
      target: 'feedback'
    })

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_INVOKE_CHANNELS.appSupportGetInfo
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_INVOKE_CHANNELS.appSupportCheckUpdate,
      { requestId: 'request-1' }
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      IPC_INVOKE_CHANNELS.appSupportOpenLink,
      { requestId: 'link-1', target: 'feedback' }
    )
    expect(api.business).not.toHaveProperty('openExternalUrl')
  })

  it('exposes backup and restore invokes without renderer path arguments', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const requestId = '11111111-1111-4111-8111-111111111111'
    const checksum = `sha256:${'a'.repeat(64)}`

    await api.business.getBackupStatus()
    await api.business.chooseBackupDestination({ requestId })
    await api.business.chooseRestoreBundle()
    await api.business.prepareRestore({
      requestId,
      previewId: 'preview-1',
      expectedChecksum: checksum
    })
    await api.business.restartForRestore()

    expect(invoke).toHaveBeenNthCalledWith(1, 'backup:get-status')
    expect(invoke).toHaveBeenNthCalledWith(2, 'backup:choose-destination', {
      requestId
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'restore:choose-bundle')
    expect(invoke).toHaveBeenNthCalledWith(4, 'restore:prepare', {
      requestId,
      previewId: 'preview-1',
      expectedChecksum: checksum
    })
    expect(invoke).toHaveBeenNthCalledWith(5, 'restore:restart')
  })

  it('forwards model availability validation to its exact command channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = {
      profileId: 'profile-1',
      requestId: 'availability-request-1'
    }

    await api.business.validateModelProfile(command)

    expect(invoke).toHaveBeenCalledWith(
      IPC_INVOKE_CHANNELS.modelProfileValidate,
      command
    )
  })

  it('forwards connector management to exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const save = {
      id: 'connector-docs',
      name: 'Docs',
      type: 'http' as const,
      baseUrl: 'https://docs.example.com/api',
      authentication: { type: 'bearer' as const },
      enabled: true,
      timeoutMs: 5000,
      maxRetries: 1,
      credential: 'secret',
      expectedRevision: 0,
      idempotencyKey: 'connector-save-1'
    }

    await api.business.listConnectors()
    await api.business.saveConnector(save)
    await api.business.validateConnector({
      connectorId: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'connector-validate-1'
    })
    await api.business.deleteConnector({
      id: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'connector-delete-1'
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'connector:list')
    expect(invoke).toHaveBeenNthCalledWith(2, 'connector:save', save)
    expect(invoke).toHaveBeenNthCalledWith(3, 'connector:validate', {
      connectorId: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'connector-validate-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(4, 'connector:delete', {
      id: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'connector-delete-1'
    })
  })

  it('forwards local file ingestion commands to their exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const business = api.business as typeof api.business & {
      ingestLocalFiles: (command: unknown) => Promise<unknown>
      refreshLocalFileSource: (command: unknown) => Promise<unknown>
      openLocalFileSource: (command: unknown) => Promise<unknown>
    }
    const ingest = {
      workspaceId: 'space-1',
      selectionId: 'selection-1',
      filePaths: ['architecture.md'],
      storageMode: 'managed_copy',
      idempotencyKey: 'ingest-1'
    }

    await business.ingestLocalFiles(ingest)
    await business.refreshLocalFileSource({
      id: 'source-1',
      expectedRevision: 2,
      idempotencyKey: 'refresh-1'
    })
    await business.openLocalFileSource({ sourceId: 'source-1' })

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      'knowledge-source:ingest-local-files',
      ingest
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      'knowledge-source:refresh-local-file',
      {
        id: 'source-1',
        expectedRevision: 2,
        idempotencyKey: 'refresh-1'
      }
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      'knowledge-source:open-local-file',
      { sourceId: 'source-1' }
    )
  })

  it('forwards hybrid knowledge search through its query channel', async () => {
    const invoke = vi.fn().mockResolvedValue([])
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const searchKnowledge = (
      api.business as typeof api.business & {
        searchKnowledge?: (query: Record<string, unknown>) => Promise<unknown>
      }
    ).searchKnowledge
    const query = {
      scope: { kind: 'workspace' as const, workspaceId: 'space-1' },
      query: 'checkout retry',
      topK: 6,
      sourceKinds: ['file' as const]
    }

    expect(searchKnowledge).toBeTypeOf('function')
    await searchKnowledge?.(query)

    expect(invoke).toHaveBeenCalledWith('knowledge:search', query)
  })

  it('forwards typed catalog search through its query channel', async () => {
    const invoke = vi.fn().mockResolvedValue([])
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const query = {
      query: 'release planning',
      kind: 'workflow_template' as const,
      topK: 6
    }

    await api.business.searchCatalog(query)

    expect(invoke).toHaveBeenCalledWith('knowledge:search-catalog', query)
  })

  it('forwards Knowledge Note operations through exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const business = api.business as typeof api.business & {
      listKnowledgeNotes: (query: unknown) => Promise<unknown>
      createKnowledgeNote: (command: unknown) => Promise<unknown>
      editKnowledgeNote: (command: unknown) => Promise<unknown>
      archiveKnowledgeNote: (command: unknown) => Promise<unknown>
    }
    const createCommand = {
      id: 'note-1',
      versionId: 'version-1',
      workspaceId: 'workspace-1',
      sessionId: 'conversation-1',
      kind: 'decision',
      sourceMessageIds: ['message-1'],
      title: 'Storage',
      content: 'Use SQLite.'
    }

    expect(business.listKnowledgeNotes).toBeTypeOf('function')
    expect(business.createKnowledgeNote).toBeTypeOf('function')
    expect(business.editKnowledgeNote).toBeTypeOf('function')
    expect(business.archiveKnowledgeNote).toBeTypeOf('function')
    await business.listKnowledgeNotes({ workspaceId: 'workspace-1' })
    await business.createKnowledgeNote(createCommand)
    await business.editKnowledgeNote({
      noteId: 'note-1',
      versionId: 'version-2',
      expectedRevision: 1,
      title: 'Storage updated',
      content: 'Use SQLite with WAL.'
    })
    await business.archiveKnowledgeNote({
      noteId: 'note-1',
      expectedRevision: 2
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'knowledge-note:list', {
      workspaceId: 'workspace-1'
    })
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      'knowledge-note:create',
      createCommand
    )
    expect(invoke).toHaveBeenNthCalledWith(3, 'knowledge-note:edit', {
      noteId: 'note-1',
      versionId: 'version-2',
      expectedRevision: 1,
      title: 'Storage updated',
      content: 'Use SQLite with WAL.'
    })
    expect(invoke).toHaveBeenNthCalledWith(4, 'knowledge-note:archive', {
      noteId: 'note-1',
      expectedRevision: 2
    })
  })

  it('forwards repository ingestion operations to their exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const business = api.business as typeof api.business & {
      ingestLocalRepository: (command: unknown) => Promise<unknown>
      ingestRemoteRepository: (command: unknown) => Promise<unknown>
      refreshRepositorySource: (command: unknown) => Promise<unknown>
      getRepositorySnapshot: (query: unknown) => Promise<unknown>
      listRepositoryBranches: (query: unknown) => Promise<unknown>
      updateRepositoryBranch: (command: unknown) => Promise<unknown>
      retryRepositoryFileIndex: (command: unknown) => Promise<unknown>
    }
    const local = {
      id: 'repository-1',
      workspaceId: 'space-1',
      selectionId: 'selection-1',
      selectedBranch: 'main',
      name: 'RealmFlow',
      sortOrder: 0,
      idempotencyKey: 'repository-local-1'
    }
    const remote = {
      id: 'repository-2',
      workspaceId: 'space-1',
      name: 'Docs',
      connectorId: 'connector-git',
      path: '/team/docs',
      selectedBranch: 'main',
      sortOrder: 1,
      idempotencyKey: 'repository-remote-1'
    }
    const refresh = {
      sourceId: 'repository-2',
      expectedRevision: 2,
      idempotencyKey: 'repository-refresh-1'
    }

    await business.ingestLocalRepository(local)
    await business.ingestRemoteRepository(remote)
    await business.refreshRepositorySource(refresh)
    await business.getRepositorySnapshot({ sourceId: 'repository-2' })
    await business.listRepositoryBranches({
      mode: 'remote',
      workspaceId: 'space-1',
      connectorId: 'connector-git',
      path: '/team/docs'
    })
    await business.updateRepositoryBranch({
      sourceId: 'repository-2',
      branch: 'feature/docs',
      expectedRevision: 2,
      idempotencyKey: 'repository-branch-1'
    })
    await business.retryRepositoryFileIndex({
      sourceId: 'repository-2',
      documentKey: 'src/index.ts',
      expectedSourceRevision: 3,
      expectedSnapshotVersion: 2,
      idempotencyKey: 'repository-retry-1'
    })

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      'knowledge-source:ingest-local-repository',
      local
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      'knowledge-source:ingest-remote-repository',
      remote
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      'knowledge-source:refresh-repository',
      refresh
    )
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      'knowledge-source:get-repository-snapshot',
      { sourceId: 'repository-2' }
    )
    expect(invoke).toHaveBeenNthCalledWith(
      5,
      'repository:list-branches',
      expect.objectContaining({ connectorId: 'connector-git' })
    )
    expect(invoke).toHaveBeenNthCalledWith(
      6,
      'repository:update-branch',
      expect.objectContaining({ branch: 'feature/docs' })
    )
    expect(invoke).toHaveBeenNthCalledWith(
      7,
      'repository:retry-file-index',
      expect.objectContaining({ documentKey: 'src/index.ts' })
    )
  })

  it('forwards online document snapshot operations to their exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const business = api.business as typeof api.business & {
      createOnlineDocumentSource: (command: unknown) => Promise<unknown>
      syncOnlineDocumentSource: (command: unknown) => Promise<unknown>
      getOnlineDocumentSnapshot: (query: unknown) => Promise<unknown>
    }
    const create = {
      id: 'source-1',
      workspaceId: 'space-1',
      name: 'Product brief',
      connectorId: 'connector-docs',
      path: '/documents/brief',
      sortOrder: 0,
      idempotencyKey: 'create-doc-1'
    }
    const sync = {
      sourceId: 'source-1',
      expectedRevision: 3,
      idempotencyKey: 'sync-doc-1'
    }

    await business.createOnlineDocumentSource(create)
    await business.syncOnlineDocumentSource(sync)
    await business.getOnlineDocumentSnapshot({ sourceId: 'source-1' })

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      'knowledge-source:create-online-document',
      create
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      'knowledge-source:sync-online-document',
      sync
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      'knowledge-source:get-online-document-snapshot',
      { sourceId: 'source-1' }
    )
  })

  it('forwards model routing to its exact query channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const request: ModelRouteRequest = {
      strategy: 'capability',
      requiredCapabilities: ['text', 'vision'],
      minimumContextWindow: 32_000
    }

    await api.business.routeModel(request)

    expect(invoke).toHaveBeenCalledWith(
      IPC_INVOKE_CHANNELS.modelRouteResolve,
      request
    )
  })

  it('forwards recent conversation filters to the exact query channel', async () => {
    const invoke = vi.fn().mockResolvedValue({
      conversations: [],
      folderPaths: []
    })
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const query = {
      kind: 'space' as const,
      workspaceId: 'space-1',
      updatedAfter: 100
    }

    await api.business.listRecentConversations(query)

    expect(invoke).toHaveBeenCalledWith(
      IPC_INVOKE_CHANNELS.conversationListRecent,
      query
    )
  })

  it('forwards credential key rotation to its exact command channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = { requestId: 'rotation-request-1' }

    await api.business.rotateModelCredentialKey(command)

    expect(invoke).toHaveBeenCalledWith(
      IPC_INVOKE_CHANNELS.modelCredentialKeyRotate,
      command
    )
  })

  it('forwards builtin provider configuration to its exact command channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = {
      catalogId: 'deepseek' as const,
      credential: 'sk-deepseek'
    }

    await api.business.configureBuiltinModelProvider(command)

    expect(invoke).toHaveBeenCalledWith(
      IPC_INVOKE_CHANNELS.modelBuiltinProviderConfigure,
      command
    )
  })

  it('forwards space relocation commands to their exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const selection = { id: 'space-1', expectedRevision: 2 }
    const relocation = { ...selection, targetPath: '/moved/space' }

    await api.business.chooseSpaceRelocation(selection)
    await api.business.relocateSpace(relocation)

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      IPC_INVOKE_CHANNELS.spaceChooseRelocation,
      selection
    )
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_INVOKE_CHANNELS.spaceRelocate,
      relocation
    )
  })

  it('forwards trash lifecycle commands to their exact channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = createRealmFlowApi(
      {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn()
      },
      'darwin'
    )
    const command = {
      id: 'entity-1',
      confirmation: 'PERMANENTLY_DELETE' as const
    }

    await api.business.listTrashItems()
    await api.business.purgeSpace(command)
    await api.business.purgeRequirement(command)

    expect(invoke).toHaveBeenNthCalledWith(1, IPC_INVOKE_CHANNELS.trashList)
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      IPC_INVOKE_CHANNELS.spacePurge,
      command
    )
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      IPC_INVOKE_CHANNELS.requirementPurge,
      command
    )
  })

  it('registers every channel invoked by the preload API', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const listeners = new Map<string, (...args: unknown[]) => unknown>()
    const getSidecarStatus = vi.fn()
    const quitApp = vi.fn()
    const respondToCloseRequest = vi.fn()
    registerMainIpc({
      sidecar: { getStatus: getSidecarStatus },
      webProviders: { get: vi.fn(), save: vi.fn() },
      agentRuntime: {
        orchestrator: { status: vi.fn(), command: vi.fn() },
        resolveRunId: vi.fn(), resolveRun: vi.fn(), cancel: vi.fn()
      },
      aiRuns: {
        generate: {
          execute: vi.fn().mockResolvedValue({
            runId: 'run-1',
            completion: Promise.resolve()
          })
        },
        cancel: { execute: vi.fn() },
        getRun: { execute: vi.fn() },
        listEvents: { execute: vi.fn() },
        publisher: { subscribe: vi.fn(), publish: vi.fn() }
      } as never,
      business: createBusinessMock() as never,
      toolCatalog: {
        catalog: {
          list: vi.fn(),
          setActivation: vi.fn()
        },
        importer: {
          importFromPath: vi.fn()
        },
        mcpServers: {
          list: vi.fn(),
          save: vi.fn(),
          delete: vi.fn(),
          testConnection: vi.fn(),
          discover: vi.fn()
        }
      } as never,
      skillRegistry: {
        service: {
          list: vi.fn(),
          review: vi.fn(),
          setActivation: vi.fn()
        },
        synchronize: vi.fn()
      } as never,
      toolPermissions: {
        permissions: {
          listPendingPermissions: vi.fn()
        },
        decisions: {
          resolve: vi.fn()
        }
      },
      capabilityCatalog: {
        catalog: {
          listDefinitions: vi.fn(),
          listInstallations: vi.fn()
        },
        importer: {
          prepare: vi.fn(),
          install: vi.fn(),
          discard: vi.fn()
        },
        lifecycle: {
          setEnabled: vi.fn(),
          changeVersion: vi.fn(),
          delete: vi.fn()
        }
      } as never,
      capabilityBuilder: {
        builder: {
          createDraft: vi.fn(),
          getSession: vi.fn(),
          reviseDraft: vi.fn(),
          confirmInstall: vi.fn(),
          cancel: vi.fn()
        }
      } as never,
      runtimeGovernance: {
        service: {
          querySnapshot: vi.fn(),
          getRunDetail: vi.fn(),
          runEvaluation: vi.fn(),
          release: vi.fn(),
          createDiagnosticPackage: vi.fn(),
          recordDiagnosticExport: vi.fn()
        }
      } as never,
      workbenchLayout: {
        get: vi.fn(),
        update: vi.fn()
      },
      workbenchDashboard: {
        execute: vi.fn()
      },
      workbenchSystem: {
        execute: vi.fn()
      },
      workbenchTasks: {
        listTables: vi.fn(),
        getTable: vi.fn(),
        createTable: vi.fn(),
        updateTable: vi.fn(),
        deleteTable: vi.fn(),
        duplicateTable: vi.fn(),
        createField: vi.fn(),
        updateField: vi.fn(),
        deleteField: vi.fn(),
        createRecord: vi.fn(),
        updateRecord: vi.fn(),
        bulkDeleteRecords: vi.fn()
      } as never,
      workbenchAttachments: {
        list: vi.fn(),
        pickAndAttach: vi.fn(),
        readImage: vi.fn(),
        open: vi.fn(),
        reveal: vi.fn(),
        delete: vi.fn()
      } as never,
      conversationAttachments: {
        pick: vi.fn(),
        remove: vi.fn()
      } as never,
      workbenchSites: {
        getSnapshot: vi.fn(),
        createGroup: vi.fn(),
        updateGroup: vi.fn(),
        deleteGroup: vi.fn(),
        createSite: vi.fn(),
        updateSite: vi.fn(),
        deleteSite: vi.fn()
      } as never,
      workbenchMemos: {
        getMemos: vi.fn(),
        createMemo: vi.fn(),
        updateMemo: vi.fn(),
        deleteMemo: vi.fn()
      } as never,
      backup: {
        getStatus: vi.fn(),
        createBackup: vi.fn(),
        inspectRestore: vi.fn(),
        prepareRestore: vi.fn(),
        restartForRestore: vi.fn()
      },
      quitApp,
      respondToCloseRequest,
      persistence: {
        load: vi.fn()
      },
      workspace: createWorkspaceMock() as never,
      terminalManager: createTerminalMock() as never,
      codeSnippetService: {
        run: vi.fn(),
        save: vi.fn()
      } as never,
      nativeOverlayManager: createNativeOverlayMock() as never,
      webWorkbenchManager: createWebWorkbenchMock() as never,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
          handlers.set(channel, handler),
        on: (channel: string, listener: (...args: unknown[]) => unknown) =>
          listeners.set(channel, listener)
      } as never,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: true,
          filePaths: []
        }),
        showSaveDialog: vi.fn().mockResolvedValue({
          canceled: true
        })
      },
      shell: {} as never
    })

    expect(() =>
      handlers.get(IPC_QUERY_CHANNELS.sidecarGetStatus)?.(
        {},
        { unexpected: true }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_QUERY_CHANNELS.sidecarGetStatus}: payload`
    )
    expect(() =>
      handlers.get(IPC_COMMAND_CHANNELS.appQuit)?.({}, { unexpected: true })
    ).toThrow(
      `Invalid IPC payload for ${IPC_COMMAND_CHANNELS.appQuit}: payload`
    )
    expect(getSidecarStatus).not.toHaveBeenCalled()
    expect(quitApp).not.toHaveBeenCalled()
    expect(() =>
      handlers
        .get(IPC_COMMAND_CHANNELS.appCloseRespond)
        ?.({}, { approved: 'yes' })
    ).toThrow(
      `Invalid IPC payload for ${IPC_COMMAND_CHANNELS.appCloseRespond}: approved`
    )
    await handlers
      .get(IPC_COMMAND_CHANNELS.appCloseRespond)
      ?.({}, { approved: true })
    expect(respondToCloseRequest).toHaveBeenCalledWith(true)

    const invoked: string[] = []
    const subscribed: string[] = []
    const api = createRealmFlowApi(
      {
        invoke: async (channel) => {
          invoked.push(channel)
          return undefined
        },
        on: (channel) => {
          subscribed.push(channel)
        },
        removeListener: vi.fn()
      },
      'darwin'
    )

    await invokeEveryApiCommand(api)
    await api.agentRuntime!.get('run-1')
    await api.agentRuntime!.updateGoal({
      runId: 'run-1', requestId: 'goal-1', objective: 'Review', status: 'active', expectedRevision: 0
    })
    await api.agentRuntime!.steer({ runId: 'run-1', requestId: 'steer-1', message: 'Review' })
    await api.agentRuntime!.cancel({ runId: 'run-1', sessionId: 'session-1' })
    await api.webProviders!.get()
    await api.webProviders!.save({
      searchProvider: 'disabled', searxngBaseUrl: '', browserContinuation: false,
      expectedRevision: 0, requestId: 'web-save',
    })
    await api.toolPolicy!.get({ source: 'user', scenarioId: 'general' })
    await api.toolPolicy!.preview({ source: 'user', scenarioId: 'general' })
    await api.toolPolicy!.save({
      source: 'user', scenarioId: 'general', expectedRevision: null, layers: [],
    })
    await api.skillRegistry!.list()
    await api.skillRegistry!.synchronize()
    await api.skillRegistry!.review({
      skillId: 'workspace.review', version: '1.0.0', digest: 'a'.repeat(64),
      status: 'approved', notes: '', expectedRevision: 1, requestId: 'review-1'
    })
    await api.skillRegistry!.setActivation({
      skillId: 'workspace.review', version: '1.0.0', digest: 'a'.repeat(64),
      enabled: true, expectedRevision: 1, requestId: 'activate-1'
    })
    await api.toolPermissions.listPending()
    await api.toolPermissions.resolve({
      requestId: 'permission-1',
      expectedRevision: 1,
      decision: 'deny'
    })
    api.appLifecycle?.onCloseRequested(vi.fn())
    api.nativeOverlay?.onEvent(vi.fn())
    api.aiRuns.onEvent(vi.fn())
    api.workbenchHub.dashboard.onInvalidated(vi.fn())
    api.business.onConversationEvent?.(vi.fn())
    api.persistence.onChanged(vi.fn())
    api.webWorkbench.onStateChange(vi.fn())
    api.webWorkbench.onAgentBrowserSurface(vi.fn())
    api.terminal.onEvent(vi.fn())
    api.toolPermissions.onChanged(vi.fn())

    expect(new Set(invoked)).toEqual(
      new Set(Object.values(IPC_INVOKE_CHANNELS))
    )
    expect(new Set(handlers.keys())).toEqual(new Set(invoked))
    expect(new Set(listeners.keys())).toEqual(
      new Set(Object.values(IPC_SEND_CHANNELS))
    )
    expect(new Set(subscribed)).toEqual(
      new Set(Object.values(IPC_EVENT_CHANNELS))
    )
  })
})

function createWorkspaceMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    [
      'openSessionFiles',
      'bindSessionDirectory',
      'bindRequirement',
      'getBinding',
      'listDirectory',
      'readFile',
      'writeFile',
      'readManifest',
      'writeManifest',
      'getPreviewUrl',
      'resolvePreviewPath'
    ].map((name) => [name, vi.fn()])
  )
}

function createBusinessMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    [
      'selectWorkRoot',
      'listWorkRoots',
      'createSpace',
      'listSpaces',
      'updateSpace',
      'renameSpaceDirectory',
      'relocateSpace',
      'deleteSpace',
      'restoreSpace',
      'purgeSpace',
      'createRequirement',
      'listRequirements',
      'updateRequirement',
      'renameRequirementDirectory',
      'deleteRequirement',
      'restoreRequirement',
      'purgeRequirement',
      'listTrashItems',
      'listWorkflowTemplates',
      'listWorkflowTemplateLibrary',
      'listWorkflowTemplateVersions',
      'getWorkflowTemplateVersion',
      'getWorkflowTemplateDraft',
      'listTemplateMigrationCandidates',
      'previewTemplateMigration',
      'applyTemplateMigration',
      'createWorkflowTemplate',
      'copyWorkflowTemplate',
      'updateWorkflowTemplate',
      'createWorkflowTemplateVersion',
      'publishWorkflowTemplate',
      'archiveWorkflowTemplate',
      'addWorkflowTemplateNode',
      'copyWorkflowTemplateNode',
      'updateWorkflowTemplateNode',
      'configureWorkflowTemplateNode',
      'removeWorkflowTemplateNode',
      'restoreWorkflowTemplateNode',
      'reorderWorkflowTemplateNodes',
      'updateWorkflowTemplateNodePositions',
      'addWorkflowTemplateEdge',
      'removeWorkflowTemplateEdge',
      'getRequirementWorkflow',
      'getRequirementExecutionView',
      'setWorkflowParallelism',
      'listRequirementWorkflowRevisions',
      'insertWorkflowNode',
      'updateWorkflowNode',
      'removeWorkflowNode',
      'updateWorkflowEdge',
      'reorderWorkflowNodes',
      'getWorkflowNodeExecution',
      'pauseWorkflowNode',
      'resumeWorkflowNode',
      'resolveWorkflowNodeGate',
      'listRecentConversations',
      'listWorkspaceConversations',
      'getConversation',
      'createConversation',
      'appendConversationMessage',
      'sendFollowUpSuggestion',
      'listKnowledgeSources',
      'listKnowledgeSourceEvents',
      'getOnlineDocumentSnapshot',
      'registerKnowledgeSource',
      'ingestLocalFiles',
      'refreshLocalFileSource',
      'openLocalFileSource',
      'ingestLocalRepository',
      'ingestRemoteRepository',
      'refreshRepositorySource',
      'getRepositorySnapshot',
      'listRepositoryBranches',
      'updateRepositoryBranch',
      'retryRepositoryFileIndex',
      'getKnowledgeIndex',
      'searchKnowledge',
      'buildKnowledgeIndex',
      'createOnlineDocumentSource',
      'syncOnlineDocumentSource',
      'retryKnowledgeSource',
      'removeKnowledgeSource',
      'listNodeTodos',
      'saveNodeTodo',
      'deleteNodeTodo',
      'listNodeQuestions',
      'openNodeQuestion',
      'answerNodeQuestion',
      'dismissNodeQuestion',
      'listModels',
      'listEffectiveModels',
      'getApplicationModelDefault',
      'saveApplicationModelDefault',
      'discoverModelProviders',
      'configureDiscoveredModelProvider',
      'configureBuiltinModelProvider',
      'listConnectors',
      'saveConnector',
      'deleteConnector',
      'validateConnector',
      'listSkills',
      'chooseAndInstallSkill',
      'installSkillFromDirectory',
      'setSkillEnabled',
      'verifySkillVersion',
      'listPermissionGrants',
      'revokePermissionGrant',
      'rotateModelCredentialKey',
      'queryModelStatistics',
      'queryProductAnalytics',
      'queryOutboundCallAudit'
    ].map((name) => [name, vi.fn()])
  )
}

function createTerminalMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    ['create', 'write', 'resize', 'destroy', 'disposeOwner'].map((name) => [
      name,
      vi.fn()
    ])
  )
}

function createNativeOverlayMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    ['show', 'hide', 'select', 'close'].map((name) => [name, vi.fn()])
  )
}

function createWebWorkbenchMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    [
      'create',
      'show',
      'hideAll',
      'setBounds',
      'navigate',
      'goBack',
      'goForward',
      'reload',
      'destroy',
      'openExternal'
    ].map((name) => [name, vi.fn()])
  )
}

async function invokeEveryApiCommand(api: RealmFlowApi): Promise<void> {
  const bounds = { x: 0, y: 0, width: 300, height: 200 }
  const dimensions = { cols: 80, rows: 24 }
  const manifest = {
    version: 1 as const,
    requirementId: 'requirement-1',
    stages: {}
  }
  const capabilitySpec = {
    schemaVersion: 1 as const,
    id: 'com.example.issue-lookup',
    kind: 'connector' as const,
    version: '1.0.0',
    name: 'Issue lookup',
    description: 'Reads issue details.',
    scope: { kind: 'workspace' as const, workspaceId: 'workspace-1' },
    runtime: {
      kind: 'connector' as const,
      connectorKind: 'http' as const,
      baseUrl: 'https://api.example.com',
      method: 'GET' as const,
      path: '/issues/{issueId}',
      credentialRefs: ['issue-api-key'],
      externalWrite: false
    },
    permissions: {
      capabilities: ['network.connect' as const, 'credential.use' as const],
      maximumRisk: 'medium' as const,
      pathPrefixes: [],
      networkTargets: ['api.example.com']
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0',
      platforms: ['darwin' as const]
    }
  }
  const business = (
    api as RealmFlowApi & { business: Record<string, Function> }
  ).business

  await Promise.all([
    api.getSidecarStatus(),
    api.runtimeGovernance?.getSnapshot(),
    api.runtimeGovernance?.getRunDetail('run-1'),
    api.runtimeGovernance?.runEvaluation(),
    api.runtimeGovernance?.release({
      evaluationId: 'evaluation-1',
      expectedRevision: 1
    }),
    api.runtimeGovernance?.exportDiagnostic('run-1'),
    api.conversationAttachments?.pick({
      requestId: 'request-conversation-attachment-pick',
      draftId: 'draft-1'
    }),
    api.conversationAttachments?.remove({
      requestId: 'request-conversation-attachment-remove',
      draftId: 'draft-1',
      attachmentId: 'attachment-1'
    }),
    api.workbenchHub.layout.get(),
    api.workbenchHub.layout.update({
      requestId: 'request-workbench-layout',
      expectedRevision: 0,
      moduleOrder: ['tasks', 'sites', 'memos', 'terminal', 'system'],
      hiddenModules: []
    }),
    api.workbenchHub.dashboard.getSnapshot({ rangeHours: 168 }),
    api.workbenchHub.attachments.list({
      ownerType: 'task_record',
      ownerId: 'record-1'
    }),
    api.workbenchHub.attachments.pickAndAttach({
      requestId: 'request-attachment-pick',
      ownerType: 'task_record',
      ownerId: 'record-1'
    }),
    api.workbenchHub.attachments.readImage('attachment-1'),
    api.workbenchHub.attachments.open('attachment-1'),
    api.workbenchHub.attachments.reveal('attachment-1'),
    api.workbenchHub.attachments.delete({
      requestId: 'request-attachment-delete',
      attachmentId: 'attachment-1'
    }),
    api.workbenchHub.memos.getMemos(),
    api.workbenchHub.memos.getDeletedMemos(),
    api.workbenchHub.memos.createMemo({
      requestId: 'request-memo-create',
      title: 'Plan',
      document: { type: 'doc', content: [{ type: 'paragraph' }] }
    }),
    api.workbenchHub.memos.updateMemo({
      requestId: 'request-memo-update',
      memoId: 'memo-1',
      expectedRevision: 0,
      title: 'Updated plan'
    }),
    api.workbenchHub.memos.deleteMemo({
      requestId: 'request-memo-delete',
      memoId: 'memo-1',
      expectedRevision: 1
    }),
    api.workbenchHub.memos.restoreMemo({
      requestId: 'request-memo-restore',
      memoId: 'memo-1',
      expectedRevision: 2
    }),
    api.workbenchHub.sites.getSnapshot(),
    api.workbenchHub.sites.createGroup({
      requestId: 'request-site-group-create',
      name: 'Docs'
    }),
    api.workbenchHub.sites.updateGroup({
      requestId: 'request-site-group-update',
      groupId: 'group-1',
      expectedRevision: 0,
      name: 'Engineering'
    }),
    api.workbenchHub.sites.deleteGroup({
      requestId: 'request-site-group-delete',
      groupId: 'group-1',
      expectedRevision: 1
    }),
    api.workbenchHub.sites.createSite({
      requestId: 'request-site-create',
      groupId: 'group-1',
      name: 'RealmFlow',
      url: 'https://realmflow.dev/',
      openMode: 'embedded'
    }),
    api.workbenchHub.sites.updateSite({
      requestId: 'request-site-update',
      siteId: 'site-1',
      expectedRevision: 0,
      name: 'RealmFlow Docs'
    }),
    api.workbenchHub.sites.deleteSite({
      requestId: 'request-site-delete',
      siteId: 'site-1',
      expectedRevision: 1
    }),
    api.workbenchHub.tasks.listTables(),
    api.workbenchHub.tasks.getTable('table-1'),
    api.workbenchHub.tasks.createTable({
      requestId: 'request-table-create',
      name: 'Tasks'
    }),
    api.workbenchHub.tasks.updateTable({
      requestId: 'request-table-update',
      tableId: 'table-1',
      expectedRevision: 0,
      name: 'Updated Tasks'
    }),
    api.workbenchHub.tasks.deleteTable({
      requestId: 'request-table-delete',
      tableId: 'table-1',
      expectedRevision: 0
    }),
    api.workbenchHub.tasks.duplicateTable({
      requestId: 'request-table-duplicate',
      tableId: 'table-1',
      mode: 'structure'
    }),
    api.workbenchHub.tasks.createField({
      requestId: 'request-field-create',
      tableId: 'table-1',
      expectedRevision: 0,
      name: 'Title',
      fieldType: 'text',
      config: {}
    }),
    api.workbenchHub.tasks.updateField({
      requestId: 'request-field-update',
      tableId: 'table-1',
      fieldId: 'field-1',
      expectedRevision: 0,
      name: 'Summary'
    }),
    api.workbenchHub.tasks.deleteField({
      requestId: 'request-field-delete',
      tableId: 'table-1',
      fieldId: 'field-1',
      expectedRevision: 0
    }),
    api.workbenchHub.tasks.createRecord({
      requestId: 'request-record-create',
      tableId: 'table-1',
      values: {}
    }),
    api.workbenchHub.tasks.updateRecord({
      requestId: 'request-record-update',
      tableId: 'table-1',
      recordId: 'record-1',
      expectedRevision: 0,
      values: {}
    }),
    api.workbenchHub.tasks.bulkDeleteRecords({
      requestId: 'request-record-delete',
      tableId: 'table-1',
      recordIds: ['record-1']
    }),
    api.workbenchHub.system.getStatus(),
    api.aiRuns.start({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    }),
    api.aiRuns.cancel('run-1'),
    api.aiRuns.get('run-1'),
    api.aiRuns.attach('run-1'),
    api.aiRuns.listEvents('run-1'),
    api.aiRuns.recover('run-1', 'resume'),
    business.selectWorkRoot({
      id: 'root-1',
      path: '/work',
      expectedRevision: 0
    }),
    business.chooseWorkRoot(),
    business.listWorkRoots(),
    business.createSpace({ id: 'space-1', name: 'Space' }),
    business.listSpaces(),
    business.updateSpace({
      id: 'space-1',
      expectedRevision: 1,
      label: 'Updated'
    }),
    business.renameSpaceDirectory({
      id: 'space-1',
      name: 'Renamed Space',
      expectedRevision: 1
    }),
    business.chooseSpaceRelocation({
      id: 'space-1',
      expectedRevision: 1
    }),
    business.relocateSpace({
      id: 'space-1',
      targetPath: '/moved/space',
      expectedRevision: 1
    }),
    business.deleteSpace({ id: 'space-1', expectedRevision: 1 }),
    business.restoreSpace({ id: 'space-1' }),
    business.purgeSpace({
      id: 'space-1',
      confirmation: 'PERMANENTLY_DELETE'
    }),
    business.createRequirement({
      id: 'requirement-1',
      workspaceId: 'space-1',
      title: 'Requirement',
      templateVersionId: 'builtin-sdlc-v1'
    }),
    business.listRequirements({ workspaceId: 'space-1' }),
    business.updateRequirement({
      id: 'requirement-1',
      expectedRevision: 1,
      status: 'active'
    }),
    business.renameRequirementDirectory({
      id: 'requirement-1',
      name: 'Renamed Requirement',
      expectedRevision: 1
    }),
    business.deleteRequirement({
      id: 'requirement-1',
      expectedRevision: 1
    }),
    business.restoreRequirement({ id: 'requirement-1' }),
    business.purgeRequirement({
      id: 'requirement-1',
      confirmation: 'PERMANENTLY_DELETE'
    }),
    business.listTrashItems(),
    business.listWorkflowTemplates(),
    business.listWorkflowTemplateLibrary(),
    business.listWorkflowTemplateVersions({ templateId: 'template-1' }),
    business.getWorkflowTemplateVersion({
      templateId: 'template-1',
      versionId: 'template-1-v1'
    }),
    business.listTemplateMigrationCandidates({
      requirementId: 'requirement-1'
    }),
    business.previewTemplateMigration({
      requirementId: 'requirement-1',
      targetTemplateVersionId: 'template-1-v2'
    }),
    business.applyTemplateMigration({
      requestId: 'migration-request-1',
      requirementId: 'requirement-1',
      targetTemplateVersionId: 'template-1-v2',
      expectedRequirementRevision: 1,
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1
    }),
    business.createWorkflowTemplate({
      id: 'template-1',
      name: 'Delivery'
    }),
    business.copyWorkflowTemplate({
      id: 'template-2',
      sourceTemplateId: 'template-1',
      name: 'Delivery copy'
    }),
    business.updateWorkflowTemplate({
      id: 'template-1',
      expectedRevision: 1,
      name: 'Updated delivery'
    }),
    business.createWorkflowTemplateVersion({
      id: 'template-1',
      sourceVersionId: 'template-1-v1',
      expectedRevision: 2
    }),
    business.getWorkflowTemplateDraft({ templateId: 'template-1' }),
    business.addWorkflowTemplateNode({
      id: 'template-1',
      expectedRevision: 2,
      node: {
        stableKey: 'analysis',
        type: 'ai_generate',
        name: 'Analysis',
        description: '',
        allowSkip: false
      }
    }),
    business.copyWorkflowTemplateNode({
      id: 'template-1',
      expectedRevision: 3,
      sourceNodeId: 'template-1-v1-node-analysis',
      stableKey: 'review',
      name: 'Review'
    }),
    business.updateWorkflowTemplateNode({
      id: 'template-1',
      expectedRevision: 4,
      nodeId: 'template-1-v1-node-analysis',
      name: 'Product analysis'
    }),
    business.configureWorkflowTemplateNode({
      id: 'template-1',
      expectedRevision: 5,
      nodeId: 'template-1-v1-node-analysis',
      configuration: {
        input: {
          includeRequirementBody: true,
          predecessorArtifacts: 'direct',
          includeSpaceKnowledge: false,
          attachments: []
        },
        prompt: 'Analyze this requirement.',
        model: { strategy: 'inherit' },
        connectorIds: [],
        permissions: [],
        artifact: {
          required: true,
          relativePath: 'artifacts/analysis.md',
          kind: 'markdown'
        },
        todos: [],
        completionGate: { requireApproval: false },
        retry: { maxAttempts: 1, backoffMs: 0 },
        skip: { allowed: false, requireReason: false }
      }
    }),
    business.removeWorkflowTemplateNode({
      id: 'template-1',
      expectedRevision: 6,
      nodeId: 'template-1-v1-node-review'
    }),
    business.restoreWorkflowTemplateNode({
      id: 'template-1',
      expectedRevision: 6,
      node: {
        id: 'template-1-v1-node-review',
        stableKey: 'review',
        type: 'ai_generate',
        name: 'Review',
        description: '',
        order: 1,
        allowSkip: false,
        position: { x: 420, y: 180 }
      },
      edges: [
        {
          id: 'edge-analysis-review',
          sourceNodeId: 'template-1-v1-node-analysis',
          targetNodeId: 'template-1-v1-node-review'
        }
      ]
    }),
    business.reorderWorkflowTemplateNodes({
      id: 'template-1',
      expectedRevision: 6,
      orderedNodeIds: ['template-1-v1-node-analysis']
    }),
    business.updateWorkflowTemplateNodePositions({
      id: 'template-1',
      expectedRevision: 7,
      positions: [
        {
          nodeId: 'template-1-v1-node-analysis',
          position: { x: 320, y: 180 }
        }
      ]
    }),
    business.addWorkflowTemplateEdge({
      id: 'template-1',
      expectedRevision: 7,
      sourceNodeId: 'template-1-v1-node-analysis',
      targetNodeId: 'template-1-v1-node-design'
    }),
    business.removeWorkflowTemplateEdge({
      id: 'template-1',
      expectedRevision: 8,
      edgeId: 'template-1-v1-edge-analysis-design'
    }),
    business.publishWorkflowTemplate({
      id: 'template-1',
      expectedRevision: 2
    }),
    business.archiveWorkflowTemplate({
      id: 'template-1',
      expectedRevision: 3
    }),
    business.getRequirementWorkflow({ requirementId: 'requirement-1' }),
    business.getRequirementExecutionView({
      requirementId: 'requirement-1',
      nodeId: 'node-1'
    }),
    business.setWorkflowParallelism({
      requirementId: 'requirement-1',
      maxParallelism: 2,
      expectedWorkflowRevision: 4,
      expectedExecutionRevision: 3
    }),
    business.rollbackWorkflowToNode({
      requestId: 'request-1',
      requirementId: 'requirement-1',
      executionId: 'execution-1',
      targetNodeId: 'node-1',
      expectedRequirementRevision: 1,
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 1
    }),
    business.listRequirementWorkflowRevisions({
      requirementId: 'requirement-1'
    }),
    business.insertWorkflowNode({
      requirementId: 'requirement-1',
      expectedRevision: 1,
      node: {
        id: 'node-1',
        type: 'ai_generate',
        name: 'Node',
        description: '',
        order: 1,
        status: 'pending',
        allowSkip: false
      }
    }),
    business.updateWorkflowNode({
      requirementId: 'requirement-1',
      expectedRevision: 1,
      nodeId: 'node-1',
      changes: {
        name: 'Updated node',
        description: 'Updated description',
        allowSkip: true
      }
    }),
    business.removeWorkflowNode({
      requirementId: 'requirement-1',
      expectedRevision: 1,
      nodeId: 'node-1'
    }),
    business.updateWorkflowEdge({
      requirementId: 'requirement-1',
      expectedRevision: 1,
      edgeId: 'edge-1',
      edge: {
        id: 'edge-1',
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2'
      }
    }),
    business.reorderWorkflowNodes({
      requirementId: 'requirement-1',
      expectedRevision: 1,
      orderedNodeIds: ['node-1']
    }),
    business.getWorkflowNodeExecution({
      requirementId: 'requirement-1',
      nodeId: 'node-1'
    }),
    business.startWorkflowNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 1
    }),
    business.pauseWorkflowNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 1
    }),
    business.resumeWorkflowNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 1
    }),
    business.cancelWorkflowNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 1
    }),
    business.retryWorkflowNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 1
    }),
    business.prepareWorkflowNodeContext({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 1,
      modelProfileId: 'profile-1'
    }),
    business.skipWorkflowNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 1,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 1,
      expectedRequirementRevision: 1,
      reason: 'Not needed'
    }),
    business.resolveWorkflowNodeGate({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 1,
      gate: {
        kind: 'approval',
        decisionId: 'decision-1',
        expectedApprovalRevision: 0,
        result: 'approved'
      }
    }),
    business.listRecentConversations({}),
    business.listWorkspaceConversations({ workspaceId: 'space-1' }),
    business.getConversation({ sessionId: 'conversation-1' }),
    business.renameConversation({
      id: 'conversation-1',
      expectedRevision: 1,
      title: 'Renamed conversation'
    }),
    business.deleteConversation({
      id: 'conversation-1',
      expectedRevision: 1
    }),
    business.createConversation({
      id: 'conversation-1',
      kind: 'space',
      workspaceId: 'workspace-1',
      knowledgeScope: {
        kind: 'workspace',
        workspaceId: 'workspace-1'
      },
      title: 'Conversation',
      prompt: 'Hello'
    }),
    business.appendConversationMessage({
      sessionId: 'conversation-1',
      messageId: 'message-2',
      content: 'Continue',
      expectedRevision: 1
    }),
    business.sendFollowUpSuggestion({
      sessionId: 'conversation-1',
      suggestionSetId: 'set-1',
      suggestionId: 'suggestion-1',
      expectedSessionRevision: 2,
      expectedSuggestionRevision: 1
    }),
    business.listKnowledgeSources({ workspaceId: 'space-1' }),
    business.listKnowledgeSourceEvents({ sourceId: 'resource-1' }),
    business.registerKnowledgeSource({
      id: 'resource-1',
      workspaceId: 'space-1',
      name: 'Resource',
      type: 'document',
      locator: 'https://example.com',
      detail: 'example.com',
      sortOrder: 0,
      idempotencyKey: 'register-resource-1'
    }),
    business.ingestLocalFiles({
      workspaceId: 'space-1',
      selectionId: 'selection-1',
      filePaths: ['architecture.md'],
      storageMode: 'managed_copy',
      idempotencyKey: 'ingest-resource-1'
    }),
    business.refreshLocalFileSource({
      id: 'resource-1',
      expectedRevision: 1,
      idempotencyKey: 'refresh-resource-1'
    }),
    business.openLocalFileSource({ sourceId: 'resource-1' }),
    business.ingestLocalRepository({
      id: 'repository-1',
      workspaceId: 'space-1',
      selectionId: 'selection-1',
      selectedBranch: 'main',
      name: 'RealmFlow',
      sortOrder: 0,
      idempotencyKey: 'ingest-local-repository-1'
    }),
    business.ingestRemoteRepository({
      id: 'repository-2',
      workspaceId: 'space-1',
      name: 'Docs',
      connectorId: 'connector-docs',
      path: '/repositories/docs',
      selectedBranch: 'main',
      sortOrder: 1,
      idempotencyKey: 'ingest-remote-repository-1'
    }),
    business.refreshRepositorySource({
      sourceId: 'repository-2',
      expectedRevision: 1,
      idempotencyKey: 'refresh-repository-1'
    }),
    business.getRepositorySnapshot({ sourceId: 'repository-2' }),
    business.listRepositoryBranches({
      mode: 'local',
      selectionId: 'selection-1'
    }),
    business.updateRepositoryBranch({
      sourceId: 'repository-2',
      branch: 'main',
      expectedRevision: 1,
      idempotencyKey: 'update-repository-branch-1'
    }),
    business.retryRepositoryFileIndex({
      sourceId: 'repository-2',
      documentKey: 'src/index.ts',
      expectedSourceRevision: 1,
      expectedSnapshotVersion: 1,
      idempotencyKey: 'retry-repository-file-1'
    }),
    business.getKnowledgeIndex({ sourceId: 'repository-2' }),
    business.getKnowledgeRuntimeHealth(),
    business.listKnowledgeNotes({ workspaceId: 'space-1' }),
    business.createKnowledgeNote({
      id: 'note-1',
      versionId: 'note-version-1',
      workspaceId: 'space-1',
      sessionId: 'conversation-1',
      kind: 'decision',
      sourceMessageIds: ['message-1'],
      title: 'Decision',
      content: 'Use SQLite.'
    }),
    business.editKnowledgeNote({
      noteId: 'note-1',
      versionId: 'note-version-2',
      expectedRevision: 1,
      title: 'Updated decision',
      content: 'Use SQLite with WAL.'
    }),
    business.archiveKnowledgeNote({
      noteId: 'note-1',
      expectedRevision: 2
    }),
    business.searchKnowledge({
      scope: { kind: 'workspace', workspaceId: 'space-1' },
      query: 'checkout retry'
    }),
    business.searchCatalog({
      query: 'release planning',
      kind: 'workflow_template'
    }),
    business.buildKnowledgeIndex({
      id: 'repository-2',
      expectedRevision: 2,
      idempotencyKey: 'index-repository-2'
    }),
    business.refreshKnowledgeSource({
      sourceId: 'repository-2',
      idempotencyKey: 'refresh-source-2'
    }),
    business.setKnowledgeRefreshPolicy({
      sourceId: 'repository-2',
      expectedRevision: 1,
      preset: '15m',
      timeZone: 'Asia/Shanghai'
    }),
    business.createOnlineDocumentSource({
      id: 'online-resource-1',
      workspaceId: 'space-1',
      name: 'Product brief',
      connectorId: 'connector-docs',
      path: '/documents/brief',
      sortOrder: 0,
      idempotencyKey: 'create-online-resource-1'
    }),
    business.syncOnlineDocumentSource({
      sourceId: 'online-resource-1',
      expectedRevision: 3,
      idempotencyKey: 'sync-online-resource-1'
    }),
    business.getOnlineDocumentSnapshot({ sourceId: 'online-resource-1' }),
    business.retryKnowledgeSource({
      id: 'resource-1',
      expectedRevision: 1,
      idempotencyKey: 'retry-resource-1'
    }),
    business.removeKnowledgeSource({
      id: 'resource-1',
      expectedRevision: 1,
      idempotencyKey: 'remove-resource-1'
    }),
    business.listNodeTodos({ nodeRunId: 'node-run-1' }),
    business.saveNodeTodo({
      id: 'todo-1',
      nodeRunId: 'node-run-1',
      title: 'Review',
      required: true,
      status: 'completed',
      expectedRevision: 1
    }),
    business.deleteNodeTodo({
      id: 'todo-1',
      nodeRunId: 'node-run-1',
      expectedRevision: 2
    }),
    business.listNodeQuestions({ nodeRunId: 'node-run-1' }),
    business.openNodeQuestion({
      id: 'question-1',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      prompt: 'Which rollout strategy?',
      required: true,
      expectedRevision: 0
    }),
    business.answerNodeQuestion({
      id: 'question-1',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      answer: 'Approved',
      expectedRevision: 1
    }),
    business.dismissNodeQuestion({
      id: 'question-2',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedRevision: 1
    }),
    business.listModels(),
    business.listEffectiveModels(),
    business.getApplicationModelDefault(),
    business.saveApplicationModelDefault({
      preference: { mode: 'auto' },
      expectedRevision: 0
    }),
    business.discoverModelProviders(),
    business.configureDiscoveredModelProvider({ catalogId: 'openai' }),
    business.configureBuiltinModelProvider({
      catalogId: 'deepseek',
      credential: 'secret'
    }),
    business.listConnectors(),
    business.saveConnector({
      id: 'connector-docs',
      name: 'Docs',
      type: 'http',
      baseUrl: 'https://docs.example.com/api',
      authentication: { type: 'none' },
      enabled: true,
      timeoutMs: 5000,
      maxRetries: 1,
      expectedRevision: 0,
      idempotencyKey: 'connector-save-1'
    }),
    business.validateConnector({
      connectorId: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'connector-validate-1'
    }),
    business.deleteConnector({
      id: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'connector-delete-1'
    }),
    api.toolCatalog.list({ locale: 'zh-CN' }),
    api.toolCatalog.chooseAndImport({
      sourceType: 'archive',
      idempotencyKey: 'extension-import-1'
    }),
    api.toolCatalog.setActivation({
      targetType: 'tool',
      targetId: 'builtin.files.read',
      enabled: true,
      idempotencyKey: 'tool-enable-1'
    }),
    api.toolCatalog.changePackageVersion({
      packageId: 'com.example.files',
      targetVersion: '1.0.0',
      operation: 'rollback',
      idempotencyKey: 'package-rollback-1'
    }),
    api.toolCatalog.listMcpServers(),
    api.toolCatalog.saveMcpServer({
      id: 'search',
      name: 'Search',
      enabled: true,
      transport: {
        kind: 'streamable_http',
        url: 'https://mcp.example.com/rpc',
        credentialNames: []
      },
      credentialValues: {},
      expectedRevision: 0,
      idempotencyKey: 'mcp-save-1'
    }),
    api.toolCatalog.deleteMcpServer({
      id: 'search',
      expectedRevision: 1,
      idempotencyKey: 'mcp-delete-1'
    }),
    api.toolCatalog.testMcpServer({
      id: 'search',
      expectedRevision: 1
    }),
    api.toolCatalog.discoverMcpServer({
      id: 'search',
      idempotencyKey: 'mcp-discover-1'
    }),
    api.capabilityCatalog?.list({ locale: 'zh-CN' }),
    api.capabilityCatalog?.chooseAndPrepare({
      sourceType: 'archive'
    }),
    api.capabilityCatalog?.install({
      proposalId: 'proposal-1',
      scope: { kind: 'global' },
      enable: false
    }),
    api.capabilityCatalog?.discard('proposal-1'),
    api.capabilityCatalog?.setEnabled({
      installationId: 'installation-1',
      enabled: true,
      expectedRevision: 1
    }),
    api.capabilityCatalog?.changeVersion({
      installationId: 'installation-1',
      targetVersion: '2.0.0',
      expectedRevision: 1,
      operation: 'upgrade'
    }),
    api.capabilityCatalog?.delete({
      installationId: 'installation-1',
      expectedRevision: 1
    }),
    api.capabilityBuilder?.createDraft({
      request: 'Create an issue lookup connector.',
      spec: capabilitySpec
    }),
    api.capabilityBuilder?.getSession('generation-1'),
    api.capabilityBuilder?.reviseDraft({
      sessionId: 'generation-1',
      expectedRevision: 3,
      request: 'Update the issue lookup connector.',
      spec: capabilitySpec
    }),
    api.capabilityBuilder?.confirmInstall({
      sessionId: 'generation-1',
      proposalId: 'proposal-1',
      revision: 3,
      packageDigest: 'a'.repeat(64),
      scope: capabilitySpec.scope,
      enable: false
    }),
    api.capabilityBuilder?.cancel({
      sessionId: 'generation-1',
      expectedRevision: 3
    }),
    business.listSchedules(),
    business.listScheduleRuns({ limit: 20 }),
    business.createSchedule({
      definition: {
        name: 'Daily summary',
        description: 'Summarize project status',
        cronExpression: '0 9 * * 1-5',
        timeZone: 'Asia/Shanghai',
        missedRunPolicy: 'skip',
        workspaceId: 'space-1',
        modelProfileId: 'profile-1',
        executionTarget: {
          kind: 'skill',
          id: 'skill-version-1',
          version: '1.0.0',
          digest: 'a'.repeat(64)
        },
        skillInput: {},
        connectorBindings: [],
        permissions: []
      },
      idempotencyKey: 'schedule-create-1'
    }),
    business.updateSchedule({
      id: 'schedule-1',
      expectedRevision: 1,
      definition: {
        name: 'Daily summary',
        description: 'Summarize project status',
        cronExpression: '0 9 * * 1-5',
        timeZone: 'Asia/Shanghai',
        missedRunPolicy: 'skip',
        workspaceId: 'space-1',
        modelProfileId: 'profile-1',
        executionTarget: {
          kind: 'skill',
          id: 'skill-version-1',
          version: '1.0.0',
          digest: 'a'.repeat(64)
        },
        skillInput: {},
        connectorBindings: [],
        permissions: []
      },
      idempotencyKey: 'schedule-update-1'
    }),
    business.pauseSchedule({
      id: 'schedule-1',
      expectedRevision: 1,
      idempotencyKey: 'schedule-pause-1'
    }),
    business.resumeSchedule({
      id: 'schedule-1',
      expectedRevision: 2,
      idempotencyKey: 'schedule-resume-1'
    }),
    business.runScheduleNow({
      id: 'schedule-1',
      idempotencyKey: 'schedule-run-1'
    }),
    business.deleteSchedule({
      id: 'schedule-1',
      expectedRevision: 3,
      idempotencyKey: 'schedule-delete-1'
    }),
    business.saveModelProvider({
      id: 'provider-1',
      type: 'openai_completions',
      name: 'Example',
      baseUrl: 'https://api.example.com/v1',
      enabled: true,
      credential: 'secret',
      expectedRevision: 0
    }),
    business.deleteModelProvider({
      id: 'provider-1',
      expectedRevision: 1
    }),
    business.removeModelProviderCredential({
      providerId: 'provider-1',
      expectedRevision: 1
    }),
    business.rotateModelCredentialKey({
      requestId: 'rotation-request-1'
    }),
    business.saveModelProfile({
      id: 'profile-1',
      providerId: 'provider-1',
      modelId: 'example-model',
      displayName: 'Example Model',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: true,
        structuredOutput: true
      },
      contextWindow: 128000,
      timeoutMs: 120000,
      maxRetries: 2,
      maxConcurrency: 4,
      inputCostPerMillionTokens: 2,
      outputCostPerMillionTokens: 8,
      expectedRevision: 0
    }),
    business.deleteModelProfile({
      id: 'profile-1',
      expectedRevision: 1
    }),
    business.setModelProfilesEnabled({
      providerId: 'provider-1',
      expectedProviderRevision: 1,
      profiles: [{ id: 'profile-1', expectedRevision: 1 }],
      enabled: false
    }),
    business.validateModelProfile({
      profileId: 'profile-1',
      requestId: 'availability-request-1'
    }),
    business.routeModel({
      strategy: 'capability',
      requiredCapabilities: ['text'],
      minimumContextWindow: 1
    }),
    business.queryModelStatistics({
      workspaceId: 'space-1',
      groupBy: 'workspace'
    }),
    business.queryProductAnalytics({
      workspaceId: 'space-1',
      activityLimit: 12
    }),
    business.queryOutboundCallAudit({
      callType: 'model_completion',
      status: 'failed',
      requirementId: 'requirement-1',
      limit: 50
    }),
    business.getAppSupportInfo(),
    business.checkForUpdates({ requestId: 'update-request-1' }),
    business.openSupportLink({
      requestId: 'support-link-1',
      target: 'online_help'
    }),
    business.getBackupStatus(),
    business.chooseBackupDestination({
      requestId: '11111111-1111-4111-8111-111111111111'
    }),
    business.chooseRestoreBundle(),
    business.prepareRestore({
      requestId: '22222222-2222-4222-8222-222222222222',
      previewId: 'preview-1',
      expectedChecksum: `sha256:${'a'.repeat(64)}`
    }),
    business.restartForRestore(),
    api.quitApp(),
    api.appLifecycle?.respondToCloseRequest(true),
    api.nativeOverlay?.show({ kind: 'workbench-menu', anchor: bounds }),
    api.nativeOverlay?.hide('workbench-menu'),
    api.persistence.load('workspaceNavigation'),
    api.workspace.chooseFiles(),
    api.workspace.openSessionFiles(['/tmp/report.pdf']),
    api.workspace.chooseFolder(),
    api.workspace.chooseDirectory('requirement-1'),
    api.workspace.getBinding('requirement-1'),
    api.workspace.listDirectory('requirement-1'),
    api.workspace.readFile('requirement-1', 'notes.md'),
    api.workspace.readPreviewBytes?.('requirement-1', 'invoice.ofd'),
    api.workspace.writeFile({
      requirementId: 'requirement-1',
      path: 'notes.md',
      content: 'content',
      expectedVersion: 'version-1'
    }),
    api.workspace.readManifest('requirement-1'),
    api.workspace.writeManifest('requirement-1', manifest),
    api.workspace.getPreviewUrl('requirement-1', 'notes.md'),
    api.workspace.showItem('requirement-1', 'notes.md'),
    api.webWorkbench.create('https://example.com'),
    api.webWorkbench.show('page-1', bounds),
    api.webWorkbench.hideAll(),
    api.webWorkbench.setBounds('page-1', bounds),
    api.webWorkbench.navigate('page-1', 'https://example.com'),
    api.webWorkbench.goBack('page-1'),
    api.webWorkbench.goForward('page-1'),
    api.webWorkbench.reload('page-1'),
    api.webWorkbench.destroy('page-1'),
    api.webWorkbench.openExternal('https://example.com'),
    api.terminal.create('requirement-1', dimensions),
    api.terminal.createHome(dimensions),
    api.terminal.write('terminal-1', 'ls\r'),
    api.terminal.resize('terminal-1', dimensions),
    api.terminal.destroy('terminal-1'),
    api.codeSnippet?.run({
      language: 'javascript',
      content: 'console.log("ready")',
      suggestedName: 'snippet.js'
    }),
    api.codeSnippet?.save({
      language: 'javascript',
      content: 'console.log("ready")',
      suggestedName: 'snippet.js'
    })
  ])
}
