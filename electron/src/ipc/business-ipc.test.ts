import { describe, expect, it, vi } from 'vitest'
import type { BusinessHandlers } from '../../../shared/business'
import { IPC_INVOKE_CHANNELS } from '../../../shared/ipc-contract'
import { registerBusinessIpc } from './business-ipc'

const chooseWorkRootChannel = IPC_INVOKE_CHANNELS.settingsChooseWorkRoot

describe('business IPC', () => {
  it('returns null without selecting a work root when the directory picker is cancelled', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: true,
      filePaths: []
    })
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never,
      dialog: { showOpenDialog },
      resolvePath: vi.fn(),
      createId: vi.fn()
    })

    const handler = registered.get(chooseWorkRootChannel)
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({})).resolves.toBeNull()
    expect(handlers.selectWorkRoot.execute).not.toHaveBeenCalled()
  })

  it('selects a new canonical work root with a generated id', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const selected = {
      id: 'root-new',
      path: '/canonical/work',
      isCurrent: true,
      revision: 1,
      createdAt: 10,
      lastUsedAt: 10
    }
    vi.mocked(handlers.listWorkRoots.execute).mockResolvedValue([])
    vi.mocked(handlers.selectWorkRoot.execute).mockResolvedValue(selected)
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['/chosen/work']
        })
      },
      resolvePath: vi.fn().mockResolvedValue('/canonical/work'),
      createId: vi.fn().mockReturnValue('root-new')
    })

    const handler = registered.get(chooseWorkRootChannel)
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({})).resolves.toEqual(selected)
    expect(handlers.selectWorkRoot.execute).toHaveBeenCalledWith({
      id: 'root-new',
      path: '/canonical/work',
      expectedRevision: 0
    })
  })

  it('reuses the id and revision of an existing canonical work root', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const existing = {
      id: 'root-existing',
      path: '/canonical/work',
      isCurrent: false,
      revision: 4,
      createdAt: 10,
      lastUsedAt: 20
    }
    vi.mocked(handlers.listWorkRoots.execute).mockResolvedValue([existing])
    vi.mocked(handlers.selectWorkRoot.execute).mockResolvedValue({
      ...existing,
      isCurrent: true,
      revision: 5
    })
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['/chosen/work']
        })
      },
      resolvePath: vi.fn().mockResolvedValue('/canonical/work'),
      createId: vi.fn().mockReturnValue('unused-id')
    })

    const handler = registered.get(chooseWorkRootChannel)
    expect(handler).toBeTypeOf('function')

    await handler?.({})
    expect(handlers.selectWorkRoot.execute).toHaveBeenCalledWith({
      id: existing.id,
      path: existing.path,
      expectedRevision: existing.revision
    })
  })

  it('returns null when choosing a relocation directory is cancelled', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: true,
          filePaths: []
        })
      }
    })

    await expect(
      registered.get(IPC_INVOKE_CHANNELS.spaceChooseRelocation)?.(
        {},
        { id: 'space-1', expectedRevision: 3 }
      )
    ).resolves.toBeNull()
    expect(handlers.relocateSpace.execute).not.toHaveBeenCalled()
  })

  it('forwards a selected relocation directory and validated revision', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['/moved/space']
        })
      }
    })

    await registered.get(IPC_INVOKE_CHANNELS.spaceChooseRelocation)?.(
      {},
      { id: 'space-1', expectedRevision: 3 }
    )
    expect(handlers.relocateSpace.execute).toHaveBeenCalledWith({
      id: 'space-1',
      expectedRevision: 3,
      targetPath: '/moved/space'
    })
  })

  it.each([
    [
      'target path',
      { id: 'space-1', targetPath: '   ', expectedRevision: 3 },
      'command.targetPath'
    ],
    [
      'revision',
      { id: 'space-1', targetPath: '/moved/space', expectedRevision: -1 },
      'expectedRevision'
    ]
  ] as const)(
    'rejects an invalid relocation %s before invoking the use case',
    (_label, command, field) => {
      const handlers = createHandlers()
      const registered = new Map<string, (...args: unknown[]) => unknown>()
      registerBusinessIpc({
        handlers,
        ipcMain: {
          handle: (
            channel: string,
            handler: (...args: unknown[]) => unknown
          ) => {
            registered.set(channel, handler)
          }
        } as never
      })

      const handler = registered.get(IPC_INVOKE_CHANNELS.spaceRelocate)
      expect(() => handler?.({}, command)).toThrow(
        `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.spaceRelocate}: ${field}`
      )
      expect(handlers.relocateSpace.execute).not.toHaveBeenCalled()
    }
  )

  it('rejects whitespace-only space names before invoking the use case', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.spaceCreate)
    expect(() => handler?.({}, { id: 'space-1', name: '   ' })).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.spaceCreate}: command.name`
    )
    expect(handlers.createSpace.execute).not.toHaveBeenCalled()
  })

  it('forwards validated physical directory rename commands', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const command = {
      id: 'entity-1',
      name: 'Renamed Directory',
      expectedRevision: 2
    }

    await registered.get(IPC_INVOKE_CHANNELS.spaceRenameDirectory)?.(
      {},
      command
    )
    await registered.get(IPC_INVOKE_CHANNELS.requirementRenameDirectory)?.(
      {},
      command
    )

    expect(handlers.renameSpaceDirectory.execute).toHaveBeenCalledWith(command)
    expect(handlers.renameRequirementDirectory.execute).toHaveBeenCalledWith(
      command
    )
  })

  it.each([
    [
      'space',
      'spaceRenameDirectory',
      'renameSpaceDirectory',
      { id: 'space-1', name: '   ', expectedRevision: 1 }
    ],
    [
      'requirement',
      'requirementRenameDirectory',
      'renameRequirementDirectory',
      { name: 'Renamed', expectedRevision: 1 }
    ],
    [
      'requirement revision',
      'requirementRenameDirectory',
      'renameRequirementDirectory',
      { id: 'requirement-1', name: 'Renamed', expectedRevision: -1 }
    ]
  ] as const)(
    'rejects an invalid %s directory rename payload',
    (_label, channelKey, handlerKey, command) => {
      const handlers = createHandlers()
      const registered = new Map<string, (...args: unknown[]) => unknown>()
      registerBusinessIpc({
        handlers,
        ipcMain: {
          handle: (
            channel: string,
            handler: (...args: unknown[]) => unknown
          ) => {
            registered.set(channel, handler)
          }
        } as never
      })
      const channel = IPC_INVOKE_CHANNELS[channelKey]

      expect(() => registered.get(channel)?.({}, command)).toThrow(
        `Invalid IPC payload for ${channel}`
      )
      expect(handlers[handlerKey].execute).not.toHaveBeenCalled()
    }
  )

  it('registers the P0 query and command channels', () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers: createHandlers(),
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    expect([...registered.keys()]).toEqual(
      expect.arrayContaining([
        IPC_INVOKE_CHANNELS.requirementList,
        IPC_INVOKE_CHANNELS.trashList,
        IPC_INVOKE_CHANNELS.spaceRestore,
        IPC_INVOKE_CHANNELS.spacePurge,
        IPC_INVOKE_CHANNELS.requirementRestore,
        IPC_INVOKE_CHANNELS.requirementPurge,
        IPC_INVOKE_CHANNELS.workflowTemplateList,
        IPC_INVOKE_CHANNELS.workflowTemplateLibraryList,
        IPC_INVOKE_CHANNELS.workflowTemplateCreate,
        IPC_INVOKE_CHANNELS.workflowTemplateCopy,
        IPC_INVOKE_CHANNELS.workflowTemplateUpdate,
        IPC_INVOKE_CHANNELS.workflowTemplatePublish,
        IPC_INVOKE_CHANNELS.workflowTemplateArchive,
        'workflow-template-node:restore',
        IPC_INVOKE_CHANNELS.requirementWorkflowRevisionList,
        IPC_INVOKE_CHANNELS.requirementWorkflowUpdateNode,
        IPC_INVOKE_CHANNELS.conversationListRecent,
        IPC_INVOKE_CHANNELS.conversationListByWorkspace,
        IPC_INVOKE_CHANNELS.conversationCreate,
        IPC_INVOKE_CHANNELS.conversationAppendMessage,
        IPC_INVOKE_CHANNELS.knowledgeSourceList,
        IPC_INVOKE_CHANNELS.knowledgeSourceEventList,
        IPC_INVOKE_CHANNELS.knowledgeSourceRegister,
        'knowledge-source:create-online-document',
        'knowledge-source:sync-online-document',
        'knowledge-source:get-online-document-snapshot',
        IPC_INVOKE_CHANNELS.knowledgeSourceRetry,
        IPC_INVOKE_CHANNELS.knowledgeSourceRemove,
        IPC_INVOKE_CHANNELS.nodeTodoList,
        IPC_INVOKE_CHANNELS.nodeTodoSave,
        IPC_INVOKE_CHANNELS.nodeQuestionList,
        IPC_INVOKE_CHANNELS.nodeQuestionOpen,
        IPC_INVOKE_CHANNELS.nodeQuestionAnswer,
        IPC_INVOKE_CHANNELS.nodeQuestionDismiss,
        IPC_INVOKE_CHANNELS.workflowNodeExecutionGet,
        IPC_INVOKE_CHANNELS.workflowNodeResolveGate,
        IPC_INVOKE_CHANNELS.modelList,
        IPC_INVOKE_CHANNELS.modelEffectiveList,
        IPC_INVOKE_CHANNELS.modelBuiltinProviderConfigure,
        IPC_INVOKE_CHANNELS.modelProviderSave,
        IPC_INVOKE_CHANNELS.modelProviderDelete,
        IPC_INVOKE_CHANNELS.modelCredentialKeyRotate,
        IPC_INVOKE_CHANNELS.modelProfileSave,
        IPC_INVOKE_CHANNELS.modelProfileDelete,
        IPC_INVOKE_CHANNELS.modelProfileValidate,
        IPC_INVOKE_CHANNELS.modelStatisticsQuery,
        IPC_INVOKE_CHANNELS.outboundCallAuditQuery
      ])
    )
  })

  it('forwards the payloadless effective model snapshot query', async () => {
    const { handlers, registered } = registerHandlers()
    const snapshot = {
      groups: [
        {
          providerId: 'provider-1',
          providerName: 'Example',
          providerType: 'openai_completions' as const,
          readiness: 'ready' as const,
          models: []
        }
      ]
    }
    vi.mocked(handlers.listEffectiveModels.execute).mockResolvedValue(snapshot)

    await expect(
      registered.get(IPC_INVOKE_CHANNELS.modelEffectiveList)?.({})
    ).resolves.toEqual(snapshot)
    expect(handlers.listEffectiveModels.execute).toHaveBeenCalledOnce()
    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.modelEffectiveList)?.({}, 'extra')
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.modelEffectiveList}`
    )
  })

  it('queries and saves the application model default through validated channels', async () => {
    const { handlers, registered } = registerHandlers()
    const preference = {
      mode: 'profile' as const,
      providerId: 'provider-1',
      profileId: 'profile-1'
    }
    vi.mocked(handlers.getApplicationModelDefault.execute).mockResolvedValue({
      ...preference,
      revision: 2
    })

    await expect(
      registered.get(IPC_INVOKE_CHANNELS.modelDefaultGet)?.({})
    ).resolves.toEqual({ ...preference, revision: 2 })
    await registered.get(IPC_INVOKE_CHANNELS.modelDefaultSave)?.(
      {},
      {
        preference,
        expectedRevision: 2
      }
    )

    expect(handlers.saveApplicationModelDefault.execute).toHaveBeenCalledWith({
      preference,
      expectedRevision: 2
    })
    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.modelDefaultSave)?.(
        {},
        {
          preference: {
            mode: 'profile',
            providerId: '',
            profileId: 'profile-1'
          },
          expectedRevision: 2
        }
      )
    ).toThrow(`Invalid IPC payload for ${IPC_INVOKE_CHANNELS.modelDefaultSave}`)
  })

  it('discovers and configures local provider credentials without a Renderer secret', async () => {
    const { handlers, registered } = registerHandlers()
    const snapshot = {
      providers: [{ catalogId: 'openai' as const, credentialDetected: true }],
      failed: false
    }
    vi.mocked(handlers.discoverModelProviders.execute).mockResolvedValue(
      snapshot
    )

    await expect(
      registered.get(IPC_INVOKE_CHANNELS.modelProviderDiscover)?.({})
    ).resolves.toEqual(snapshot)
    await registered.get(
      IPC_INVOKE_CHANNELS.modelDiscoveredProviderConfigure
    )?.({}, { catalogId: 'openai' })

    expect(
      handlers.configureDiscoveredModelProvider.execute
    ).toHaveBeenCalledWith({ catalogId: 'openai' })
  })

  it('validates and forwards a model statistics query', async () => {
    const { handlers, registered } = registerHandlers()
    const channel = IPC_INVOKE_CHANNELS.modelStatisticsQuery
    const query = {
      from: 100,
      to: 200,
      providerId: 'provider-1',
      conversationId: 'conversation-1',
      groupBy: 'conversation'
    }

    await registered.get(channel)?.({}, query)

    expect(handlers.queryModelStatistics.execute).toHaveBeenCalledWith(query)
    for (const invalid of [
      null,
      [],
      { unexpected: true },
      { from: -1 },
      { to: 1.5 },
      { providerId: '' },
      { groupBy: 'day' }
    ]) {
      expect(() => registered.get(channel)?.({}, invalid)).toThrow(
        `Invalid IPC payload for ${channel}`
      )
    }
  })

  it('validates and forwards a product analytics query', async () => {
    const { handlers, registered } = registerHandlers()
    const channel = IPC_INVOKE_CHANNELS.productAnalyticsQuery
    const query = {
      workspaceId: 'workspace-1',
      activityLimit: 20
    }

    await registered.get(channel)?.({}, query)

    expect(handlers.queryProductAnalytics.execute).toHaveBeenCalledWith(query)
    for (const invalid of [
      null,
      [],
      { unexpected: true },
      { workspaceId: '' },
      { activityLimit: 0 },
      { activityLimit: 21 },
      { activityLimit: 1.5 }
    ]) {
      expect(() => registered.get(channel)?.({}, invalid)).toThrow(
        `Invalid IPC payload for ${channel}`
      )
    }
  })

  it('validates and forwards an outbound call audit query', async () => {
    const { handlers, registered } = registerHandlers()
    const channel = IPC_INVOKE_CHANNELS.outboundCallAuditQuery
    const query = {
      from: 100,
      to: 200,
      callType: 'model_completion',
      status: 'failed',
      ownerType: 'ai_run',
      ownerId: 'run-1',
      requirementId: 'requirement-1',
      limit: 50
    }

    await registered.get(channel)?.({}, query)

    expect(handlers.queryOutboundCallAudit.execute).toHaveBeenCalledWith(query)
    for (const invalid of [
      null,
      [],
      { unexpected: true },
      { from: -1 },
      { from: 2, to: 1 },
      { callType: 'unknown' },
      { status: 'pending' },
      { ownerType: 'model' },
      { ownerId: 'https://secret.example' },
      { limit: 0 },
      { limit: 201 }
    ]) {
      expect(() => registered.get(channel)?.({}, invalid)).toThrow(
        `Invalid IPC payload for ${channel}`
      )
    }
  })

  it('rejects unexpected payload for a no-argument query', () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const channel = IPC_INVOKE_CHANNELS.spaceList

    expect(() => registered.get(channel)?.({}, { unexpected: true })).toThrow(
      `Invalid IPC payload for ${channel}: payload`
    )
    expect(handlers.listSpaces.execute).not.toHaveBeenCalled()
  })

  it('forwards a typed recent conversation query to its handler', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const query = {
      kind: 'general',
      folderPath: '/tmp/project',
      updatedAfter: 100
    }

    await registered.get(IPC_INVOKE_CHANNELS.conversationListRecent)?.(
      {},
      query
    )

    expect(handlers.listRecentConversations.execute).toHaveBeenCalledWith(query)
  })

  it('rejects invalid recent conversation filters before handler execution', () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const channel = IPC_INVOKE_CHANNELS.conversationListRecent
    const invokeRecent = registered.get(channel)
    const invalidQueries = [
      undefined,
      null,
      [],
      { unknown: true },
      { kind: 'requirement_node' },
      { workspaceId: '' },
      { folderPath: '' },
      { updatedAfter: -1 },
      { updatedAfter: 1.5 },
      { workspaceId: 'space-1', folderPath: '/tmp/project' },
      { kind: 'general', workspaceId: 'space-1' },
      { kind: 'space', folderPath: '/tmp/project' }
    ]

    for (const query of invalidQueries) {
      expect(() => invokeRecent?.({}, query)).toThrow(
        `Invalid IPC payload for ${channel}`
      )
    }
    expect(handlers.listRecentConversations.execute).not.toHaveBeenCalled()
  })

  it('validates and forwards conversation rename and delete commands', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const rename = {
      id: 'conversation-1',
      expectedRevision: 2,
      title: 'Renamed conversation'
    }
    const remove = { id: 'conversation-1', expectedRevision: 2 }

    await registered.get(IPC_INVOKE_CHANNELS.conversationRename)?.({}, rename)
    await registered.get(IPC_INVOKE_CHANNELS.conversationDelete)?.({}, remove)

    expect(handlers.renameConversation.execute).toHaveBeenCalledWith(rename)
    expect(handlers.deleteConversation.execute).toHaveBeenCalledWith(remove)
  })

  it('rejects invalid conversation mutation commands before execution', () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    for (const invalid of [
      { id: '', expectedRevision: 2, title: 'Renamed' },
      { id: 'conversation-1', expectedRevision: -1, title: 'Renamed' },
      { id: 'conversation-1', expectedRevision: 2, title: '   ' },
      {
        id: 'conversation-1',
        expectedRevision: 2,
        title: 'x'.repeat(241)
      },
      {
        id: 'conversation-1',
        expectedRevision: 2,
        title: 'Renamed',
        unexpected: true
      }
    ]) {
      expect(() =>
        registered
          .get(IPC_INVOKE_CHANNELS.conversationRename)
          ?.({}, invalid)
      ).toThrow(
        `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationRename}`
      )
    }
    expect(() =>
      registered
        .get(IPC_INVOKE_CHANNELS.conversationDelete)
        ?.({}, { id: 'conversation-1', expectedRevision: 2, unexpected: true })
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationDelete}`
    )
    expect(handlers.renameConversation.execute).not.toHaveBeenCalled()
    expect(handlers.deleteConversation.execute).not.toHaveBeenCalled()
  })

  it('accepts explicit model API protocols and rejects the legacy provider type', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const save = registered.get(IPC_INVOKE_CHANNELS.modelProviderSave)
    const remove = registered.get(IPC_INVOKE_CHANNELS.modelProviderDelete)

    for (const type of [
      'openai_completions',
      'openai_responses',
      'anthropic_messages'
    ]) {
      await save?.(
        {},
        {
          id: `provider-${type}`,
          type,
          name: 'Example',
          baseUrl: 'https://api.example.com',
          enabled: true,
          credential: 'secret',
          expectedRevision: 0
        }
      )
      expect(handlers.saveModelProvider.execute).toHaveBeenLastCalledWith({
        id: `provider-${type}`,
        type,
        name: 'Example',
        baseUrl: 'https://api.example.com',
        enabled: true,
        credential: 'secret',
        expectedRevision: 0
      })
    }

    expect(() =>
      save?.(
        {},
        {
          id: 'provider-legacy',
          type: 'openai_compatible',
          name: 'Legacy',
          baseUrl: 'https://api.example.com/v1',
          enabled: true,
          expectedRevision: 0
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.modelProviderSave}: command.type`
    )

    expect(() =>
      remove?.({}, { id: 'provider-1', expectedRevision: -1 })
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.modelProviderDelete}: expectedRevision`
    )
    expect(handlers.deleteModelProvider.execute).not.toHaveBeenCalled()

    await save?.(
      {},
      {
        id: 'provider-headers',
        type: 'openai_completions',
        name: 'Headers',
        baseUrl: 'https://api.example.com/v1',
        enabled: true,
        customHeaders: [
          { name: 'X-Tenant', value: 'secret-value' },
          { name: 'X-Retained' }
        ],
        expectedRevision: 0
      }
    )
    expect(handlers.saveModelProvider.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        customHeaders: [
          { name: 'X-Tenant', value: 'secret-value' },
          { name: 'X-Retained' }
        ]
      })
    )
    expect(() =>
      save?.(
        {},
        {
          id: 'provider-protected-header',
          type: 'openai_completions',
          name: 'Protected header',
          baseUrl: 'https://api.example.com/v1',
          enabled: true,
          customHeaders: [{ name: 'Authorization', value: 'secret' }],
          expectedRevision: 0
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.modelProviderSave}: command.customHeaders.0.name`
    )
  })

  it('accepts only supported builtin provider configuration fields', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const channel = IPC_INVOKE_CHANNELS.modelBuiltinProviderConfigure
    const configure = registered.get(channel)

    await configure?.(
      {},
      { catalogId: 'deepseek', credential: ' sk-deepseek ' }
    )
    await configure?.(
      {},
      {
        catalogId: 'ark',
        credential: 'ark-secret'
      }
    )

    expect(
      handlers.configureBuiltinModelProvider.execute
    ).toHaveBeenNthCalledWith(1, {
      catalogId: 'deepseek',
      credential: ' sk-deepseek '
    })
    expect(
      handlers.configureBuiltinModelProvider.execute
    ).toHaveBeenNthCalledWith(2, {
      catalogId: 'ark',
      credential: 'ark-secret'
    })
    for (const command of [
      { catalogId: 'unsupported-provider', credential: 'secret' },
      { catalogId: 'deepseek', credential: '   ' },
      {
        catalogId: 'ark',
        credential: 'secret',
        modelId: 'ep-account-endpoint'
      },
      { catalogId: 'deepseek', credential: 'secret', baseUrl: 'https://evil' }
    ]) {
      expect(() => configure?.({}, command)).toThrow(
        `Invalid IPC payload for ${channel}`
      )
    }
    expect(
      handlers.configureBuiltinModelProvider.execute
    ).toHaveBeenCalledTimes(2)
  })

  it('validates and forwards connector management commands', async () => {
    const { handlers, registered } = registerHandlers()
    const connectorHandlers = handlers as typeof handlers & {
      listConnectors: { execute: ReturnType<typeof vi.fn> }
      saveConnector: { execute: ReturnType<typeof vi.fn> }
      deleteConnector: { execute: ReturnType<typeof vi.fn> }
      validateConnector: { execute: ReturnType<typeof vi.fn> }
    }
    const result = {
      connector: {
        id: 'connector-docs',
        name: 'Docs',
        type: 'http',
        baseUrl: 'https://docs.example.com/api',
        authentication: { type: 'api_key_header', headerName: 'X-Service-Key' },
        enabled: true,
        timeoutMs: 5000,
        maxRetries: 1,
        revision: 1,
        createdAt: 10,
        updatedAt: 10
      },
      hasCredential: true
    }
    connectorHandlers.listConnectors.execute.mockResolvedValue([result])
    connectorHandlers.saveConnector.execute.mockResolvedValue(result)
    connectorHandlers.validateConnector.execute.mockResolvedValue(result)
    const command = {
      id: 'connector-docs',
      name: 'Docs',
      type: 'http',
      baseUrl: 'https://docs.example.com/api',
      authentication: {
        type: 'api_key_header',
        headerName: 'X-Service-Key'
      },
      enabled: true,
      timeoutMs: 5000,
      maxRetries: 1,
      credential: 'secret',
      expectedRevision: 0,
      idempotencyKey: 'connector-save-1'
    }

    await registered.get('connector:list')?.({})
    await registered.get('connector:save')?.({}, command)
    await registered.get('connector:validate')?.(
      {},
      {
        connectorId: 'connector-docs',
        expectedRevision: 1,
        idempotencyKey: 'connector-validate-1'
      }
    )
    await registered.get('connector:delete')?.(
      {},
      {
        id: 'connector-docs',
        expectedRevision: 1,
        idempotencyKey: 'connector-delete-1'
      }
    )

    expect(connectorHandlers.listConnectors.execute).toHaveBeenCalledOnce()
    expect(connectorHandlers.saveConnector.execute).toHaveBeenCalledWith(
      command
    )
    expect(connectorHandlers.validateConnector.execute).toHaveBeenCalledWith({
      connectorId: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'connector-validate-1'
    })
    expect(connectorHandlers.deleteConnector.execute).toHaveBeenCalledWith({
      id: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'connector-delete-1'
    })
  })

  it.each([
    ['unknown field', { unexpected: true }],
    ['type', { type: 'database' }],
    ['authentication', { authentication: { type: 'basic' } }],
    ['revision', { expectedRevision: -1 }]
  ])('rejects invalid connector save %s', (_label, override) => {
    const { handlers, registered } = registerHandlers()
    const connectorHandlers = handlers as typeof handlers & {
      saveConnector: { execute: ReturnType<typeof vi.fn> }
    }
    const command = {
      id: 'connector-docs',
      name: 'Docs',
      type: 'http',
      baseUrl: 'https://docs.example.com/api',
      authentication: { type: 'bearer' },
      enabled: true,
      timeoutMs: 5000,
      maxRetries: 1,
      expectedRevision: 0,
      idempotencyKey: 'connector-save-1',
      ...override
    }

    expect(() => registered.get('connector:save')?.({}, command)).toThrow(
      'Invalid IPC payload for connector:save'
    )
    expect(connectorHandlers.saveConnector.execute).not.toHaveBeenCalled()
  })

  it('rejects connector responses that expose credential fields', async () => {
    const { handlers, registered } = registerHandlers()
    const connectorHandlers = handlers as typeof handlers & {
      saveConnector: { execute: ReturnType<typeof vi.fn> }
    }
    connectorHandlers.saveConnector.execute.mockResolvedValue({
      connector: {
        id: 'connector-docs',
        name: 'Docs',
        type: 'http',
        baseUrl: 'https://docs.example.com/api',
        authentication: { type: 'bearer' },
        enabled: true,
        timeoutMs: 5000,
        maxRetries: 1,
        revision: 1,
        createdAt: 10,
        updatedAt: 10,
        credential: 'must-not-cross'
      },
      hasCredential: true
    })

    await expect(
      registered.get('connector:save')?.(
        {},
        {
          id: 'connector-docs',
          name: 'Docs',
          type: 'http',
          baseUrl: 'https://docs.example.com/api',
          authentication: { type: 'bearer' },
          enabled: true,
          timeoutMs: 5000,
          maxRetries: 1,
          expectedRevision: 0,
          idempotencyKey: 'connector-save-1'
        }
      )
    ).rejects.toThrow(
      'Invalid IPC payload for connector:save: result.connector.credential'
    )
  })

  it('validates credential key rotation requests before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const channel = IPC_INVOKE_CHANNELS.modelCredentialKeyRotate
    const rotate = registered.get(channel)

    await rotate?.({}, { requestId: ' rotation-request-1 ' })

    expect(handlers.rotateModelCredentialKey.execute).toHaveBeenCalledWith({
      requestId: 'rotation-request-1'
    })
    expect(() => rotate?.({}, { requestId: '   ' })).toThrow(
      `Invalid IPC payload for ${channel}: command.requestId`
    )
  })

  it('validates complete profile saves and deletion revisions before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const save = registered.get(IPC_INVOKE_CHANNELS.modelProfileSave)
    const remove = registered.get(IPC_INVOKE_CHANNELS.modelProfileDelete)
    const command = {
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
      contextWindow: 128_000,
      timeoutMs: 120_000,
      maxRetries: 2,
      maxConcurrency: 4,
      inputCostPerMillionTokens: 2,
      outputCostPerMillionTokens: 8,
      expectedRevision: 0
    }

    await save?.({}, command)
    expect(handlers.saveModelProfile.execute).toHaveBeenCalledWith(command)
    expect(() => save?.({}, { ...command, timeoutMs: 0 })).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.modelProfileSave}: command.timeoutMs`
    )
    await remove?.({}, { id: 'profile-1', expectedRevision: 1 })
    expect(handlers.deleteModelProfile.execute).toHaveBeenCalledWith({
      id: 'profile-1',
      expectedRevision: 1
    })
  })

  it('validates availability commands before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const channel = IPC_INVOKE_CHANNELS.modelProfileValidate
    const validate = registered.get(channel)
    const command = {
      profileId: 'profile-1',
      requestId: 'availability-request-1'
    }

    await validate?.({}, command)

    expect(handlers.validateModelProfile.execute).toHaveBeenCalledWith(command)
    expect(() => validate?.({}, { ...command, requestId: '   ' })).toThrow(
      `Invalid IPC payload for ${channel}: command.requestId`
    )
    expect(handlers.validateModelProfile.execute).toHaveBeenCalledOnce()
  })

  it('validates and forwards atomic model bulk enablement commands', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const channel = 'model-profiles:set-enabled'
    const setEnabled = registered.get(channel)
    const command = {
      providerId: 'provider-1',
      expectedProviderRevision: 3,
      profiles: [
        { id: 'profile-1', expectedRevision: 2 },
        { id: 'profile-2', expectedRevision: 5 }
      ],
      enabled: false
    }

    expect(typeof setEnabled).toBe('function')
    await setEnabled?.({}, command)
    expect(
      (
        handlers as typeof handlers & {
          setModelProfilesEnabled: { execute: ReturnType<typeof vi.fn> }
        }
      ).setModelProfilesEnabled.execute
    ).toHaveBeenCalledWith(command)
  })

  it('validates model routing requests before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const channel = IPC_INVOKE_CHANNELS.modelRouteResolve
    const route = registered.get(channel)
    const command = {
      strategy: 'capability',
      requiredCapabilities: ['vision', 'structuredOutput'],
      minimumContextWindow: 32_000
    }

    await route?.({}, command)

    expect(handlers.routeModel.execute).toHaveBeenCalledWith(command)
    expect(() =>
      route?.({}, { ...command, requiredCapabilities: ['vision', 'vision'] })
    ).toThrow(
      `Invalid IPC payload for ${channel}: request.requiredCapabilities`
    )
    expect(() => route?.({}, { ...command, minimumContextWindow: 0 })).toThrow(
      `Invalid IPC payload for ${channel}: request.minimumContextWindow`
    )
    expect(() => route?.({}, { strategy: 'unknown' })).toThrow(
      `Invalid IPC payload for ${channel}: request.strategy`
    )
    expect(handlers.routeModel.execute).toHaveBeenCalledOnce()
  })

  it('rejects unexpected payload before opening a no-argument command dialog', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const showOpenDialog = vi.fn()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never,
      dialog: { showOpenDialog }
    })

    await expect(
      registered.get(chooseWorkRootChannel)?.({}, { unexpected: true })
    ).rejects.toThrow(
      `Invalid IPC payload for ${chooseWorkRootChannel}: payload`
    )
    expect(showOpenDialog).not.toHaveBeenCalled()
    expect(handlers.selectWorkRoot.execute).not.toHaveBeenCalled()
  })

  it('validates permanent deletion confirmation before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const handler = registered.get(IPC_INVOKE_CHANNELS.requirementPurge)

    expect(() =>
      handler?.({}, { id: 'requirement-1', confirmation: 'delete' })
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.requirementPurge}: command.confirmation`
    )
    expect(handlers.purgeRequirement.execute).not.toHaveBeenCalled()

    await handler?.(
      {},
      {
        id: 'requirement-1',
        confirmation: 'PERMANENTLY_DELETE'
      }
    )
    expect(handlers.purgeRequirement.execute).toHaveBeenCalledWith({
      id: 'requirement-1',
      confirmation: 'PERMANENTLY_DELETE'
    })
  })

  it('validates workflow template lifecycle commands before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const create = registered.get(IPC_INVOKE_CHANNELS.workflowTemplateCreate)
    const publish = registered.get(IPC_INVOKE_CHANNELS.workflowTemplatePublish)
    const createVersion = registered.get(
      IPC_INVOKE_CHANNELS.workflowTemplateVersionCreate
    )
    const listVersions = registered.get(
      IPC_INVOKE_CHANNELS.workflowTemplateVersionList
    )

    expect(() => create?.({}, { id: 'template-1', name: '   ' })).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.workflowTemplateCreate}: command.name`
    )
    expect(handlers.createWorkflowTemplate.execute).not.toHaveBeenCalled()

    await publish?.({}, { id: 'template-1', expectedRevision: 2 })
    expect(handlers.publishWorkflowTemplate.execute).toHaveBeenCalledWith({
      id: 'template-1',
      expectedRevision: 2
    })
    await createVersion?.(
      {},
      {
        id: 'template-1',
        sourceVersionId: 'template-1-v1',
        expectedRevision: 2
      }
    )
    expect(handlers.createWorkflowTemplateVersion.execute).toHaveBeenCalledWith(
      {
        id: 'template-1',
        sourceVersionId: 'template-1-v1',
        expectedRevision: 2
      }
    )
    await listVersions?.({}, { templateId: 'template-1' })
    expect(handlers.listWorkflowTemplateVersions.execute).toHaveBeenCalledWith({
      templateId: 'template-1'
    })
  })

  it('validates and forwards template migration queries and commands', async () => {
    const handlers = createHandlers() as BusinessHandlers & {
      listTemplateMigrationCandidates: {
        execute: ReturnType<typeof vi.fn>
      }
      previewTemplateMigration: { execute: ReturnType<typeof vi.fn> }
      applyTemplateMigration: { execute: ReturnType<typeof vi.fn> }
    }
    Object.assign(handlers, {
      listTemplateMigrationCandidates: { execute: vi.fn() },
      previewTemplateMigration: { execute: vi.fn() },
      applyTemplateMigration: { execute: vi.fn() }
    })
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const list = registered.get('template-migration:list-candidates')
    const preview = registered.get('template-migration:preview')
    const apply = registered.get('template-migration:apply')

    expect(list).toBeTypeOf('function')
    expect(preview).toBeTypeOf('function')
    expect(apply).toBeTypeOf('function')

    await list?.({}, { requirementId: 'requirement-1' })
    await preview?.(
      {},
      {
        requirementId: 'requirement-1',
        targetTemplateVersionId: 'template-v2'
      }
    )
    await apply?.(
      {},
      {
        requestId: 'migration-request-1',
        requirementId: 'requirement-1',
        targetTemplateVersionId: 'template-v2',
        expectedRequirementRevision: 3,
        expectedWorkflowRevision: 4,
        expectedExecutionRevision: 5
      }
    )

    expect(
      handlers.listTemplateMigrationCandidates.execute
    ).toHaveBeenCalledWith({ requirementId: 'requirement-1' })
    expect(handlers.previewTemplateMigration.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      targetTemplateVersionId: 'template-v2'
    })
    expect(handlers.applyTemplateMigration.execute).toHaveBeenCalledWith({
      requestId: 'migration-request-1',
      requirementId: 'requirement-1',
      targetTemplateVersionId: 'template-v2',
      expectedRequirementRevision: 3,
      expectedWorkflowRevision: 4,
      expectedExecutionRevision: 5
    })
  })

  it.each([
    ['list non-object', 'template-migration:list-candidates', null],
    [
      'list unknown key',
      'template-migration:list-candidates',
      { requirementId: 'requirement-1', unexpected: true }
    ],
    [
      'preview blank requirement',
      'template-migration:preview',
      { requirementId: ' ', targetTemplateVersionId: 'template-v2' }
    ],
    [
      'preview blank target',
      'template-migration:preview',
      { requirementId: 'requirement-1', targetTemplateVersionId: ' ' }
    ],
    [
      'apply malformed request id',
      'template-migration:apply',
      {
        requestId: 'migration request',
        requirementId: 'requirement-1',
        targetTemplateVersionId: 'template-v2',
        expectedRequirementRevision: 3,
        expectedWorkflowRevision: 4,
        expectedExecutionRevision: 5
      }
    ],
    [
      'apply unsafe revision',
      'template-migration:apply',
      {
        requestId: 'migration-request-1',
        requirementId: 'requirement-1',
        targetTemplateVersionId: 'template-v2',
        expectedRequirementRevision: Number.MAX_SAFE_INTEGER + 1,
        expectedWorkflowRevision: 4,
        expectedExecutionRevision: 5
      }
    ],
    [
      'apply unknown key',
      'template-migration:apply',
      {
        requestId: 'migration-request-1',
        requirementId: 'requirement-1',
        targetTemplateVersionId: 'template-v2',
        expectedRequirementRevision: 3,
        expectedWorkflowRevision: 4,
        expectedExecutionRevision: 5,
        unexpected: true
      }
    ]
  ] as const)(
    'rejects invalid template migration payload: %s',
    (_label, channel, payload) => {
      const handlers = createHandlers() as BusinessHandlers & {
        listTemplateMigrationCandidates: {
          execute: ReturnType<typeof vi.fn>
        }
        previewTemplateMigration: { execute: ReturnType<typeof vi.fn> }
        applyTemplateMigration: { execute: ReturnType<typeof vi.fn> }
      }
      Object.assign(handlers, {
        listTemplateMigrationCandidates: { execute: vi.fn() },
        previewTemplateMigration: { execute: vi.fn() },
        applyTemplateMigration: { execute: vi.fn() }
      })
      const registered = new Map<string, (...args: unknown[]) => unknown>()
      registerBusinessIpc({
        handlers,
        ipcMain: {
          handle: (name: string, handler: (...args: unknown[]) => unknown) => {
            registered.set(name, handler)
          }
        } as never
      })

      expect(() => registered.get(channel)?.({}, payload)).toThrow(
        `Invalid IPC payload for ${channel}`
      )
      expect(
        handlers.listTemplateMigrationCandidates.execute
      ).not.toHaveBeenCalled()
      expect(handlers.previewTemplateMigration.execute).not.toHaveBeenCalled()
      expect(handlers.applyTemplateMigration.execute).not.toHaveBeenCalled()
    }
  )

  it('validates requirement workflow revision queries before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const handler = registered.get(
      IPC_INVOKE_CHANNELS.requirementWorkflowRevisionList
    )

    expect(() => handler?.({}, { requirementId: ' ' })).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.requirementWorkflowRevisionList}: command.requirementId`
    )
    await handler?.({}, { requirementId: 'requirement-1' })
    expect(
      handlers.listRequirementWorkflowRevisions.execute
    ).toHaveBeenCalledWith({ requirementId: 'requirement-1' })
  })

  it('validates requirement execution view queries before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const handler = registered.get(
      IPC_INVOKE_CHANNELS.requirementExecutionViewGet
    )

    expect(() =>
      handler?.({}, { requirementId: 'requirement-1', nodeId: ' ' })
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.requirementExecutionViewGet}: command.nodeId`
    )
    await handler?.(
      {},
      { requirementId: 'requirement-1', nodeId: 'node-analysis' }
    )
    expect(handlers.getRequirementExecutionView.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'node-analysis'
    })
  })

  it('strictly validates workflow parallelism commands and returns structured failures', async () => {
    const handlers = createHandlers() as BusinessHandlers & {
      setWorkflowParallelism: {
        execute: ReturnType<typeof vi.fn>
      }
    }
    handlers.setWorkflowParallelism = {
      execute: vi.fn().mockResolvedValue({
        outcome: 'rejected',
        error: {
          code: 'revision_conflict',
          message: 'Workflow parallelism revision conflict',
          latestWorkflowRevision: 4,
          latestExecutionRevision: 3
        }
      })
    }
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const handler = registered.get('workflow:set-parallelism')
    const command = {
      requirementId: 'requirement-1',
      maxParallelism: 2,
      expectedWorkflowRevision: 4,
      expectedExecutionRevision: 3
    }

    expect(handler).toBeTypeOf('function')
    expect(() => handler?.({}, { ...command, extra: true })).toThrow(
      'Invalid IPC payload for workflow:set-parallelism: command.extra'
    )
    expect(() => handler?.({}, { ...command, maxParallelism: 1.5 })).toThrow(
      'Invalid IPC payload for workflow:set-parallelism: command.maxParallelism'
    )
    expect(() =>
      handler?.({}, { ...command, expectedExecutionRevision: -1 })
    ).toThrow(
      'Invalid IPC payload for workflow:set-parallelism: expectedRevision'
    )

    await expect(handler?.({}, command)).resolves.toEqual({
      outcome: 'rejected',
      error: {
        code: 'revision_conflict',
        message: 'Workflow parallelism revision conflict',
        latestWorkflowRevision: 4,
        latestExecutionRevision: 3
      }
    })
    expect(handlers.setWorkflowParallelism.execute).toHaveBeenCalledWith(
      command
    )
  })

  it('validates workflow template node commands before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const add = registered.get(IPC_INVOKE_CHANNELS.workflowTemplateNodeAdd)
    const reorder = registered.get(
      IPC_INVOKE_CHANNELS.workflowTemplateNodeReorder
    )
    const updatePositions = registered.get(
      IPC_INVOKE_CHANNELS.workflowTemplateNodeUpdatePositions
    )

    await add?.(
      {},
      {
        id: 'template-1',
        expectedRevision: 2,
        node: {
          stableKey: 'analysis',
          type: 'ai_generate',
          name: 'Analysis',
          description: '',
          allowSkip: false
        }
      }
    )
    expect(handlers.addWorkflowTemplateNode.execute).toHaveBeenCalledWith({
      id: 'template-1',
      expectedRevision: 2,
      node: {
        stableKey: 'analysis',
        type: 'ai_generate',
        name: 'Analysis',
        description: '',
        allowSkip: false
      }
    })

    expect(() =>
      reorder?.(
        {},
        {
          id: 'template-1',
          expectedRevision: 2,
          orderedNodeIds: ['node-1', 'node-1']
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.workflowTemplateNodeReorder}: command.orderedNodeIds`
    )
    expect(handlers.reorderWorkflowTemplateNodes.execute).not.toHaveBeenCalled()

    await updatePositions?.(
      {},
      {
        id: 'template-1',
        expectedRevision: 2,
        positions: [
          {
            nodeId: 'template-1-v1-node-analysis',
            position: { x: 320, y: 180 }
          }
        ]
      }
    )
    expect(
      handlers.updateWorkflowTemplateNodePositions.execute
    ).toHaveBeenCalledWith({
      id: 'template-1',
      expectedRevision: 2,
      positions: [
        {
          nodeId: 'template-1-v1-node-analysis',
          position: { x: 320, y: 180 }
        }
      ]
    })
    expect(() =>
      updatePositions?.(
        {},
        {
          id: 'template-1',
          expectedRevision: 2,
          positions: [
            {
              nodeId: 'template-1-v1-node-analysis',
              position: { x: Number.POSITIVE_INFINITY, y: 180 }
            }
          ]
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.workflowTemplateNodeUpdatePositions}: command.positions.0.position.x`
    )
  })

  it('validates and forwards a complete workflow template node restore snapshot', async () => {
    const restore = vi.fn()
    const handlers = {
      ...createHandlers(),
      restoreWorkflowTemplateNode: { execute: restore }
    }
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const command = {
      id: 'template-1',
      expectedRevision: 2,
      node: {
        id: 'template-1-v1-node-review',
        stableKey: 'review',
        type: 'ai_generate',
        name: 'Review',
        description: 'Review the generated plan',
        order: 1,
        allowSkip: true,
        position: { x: 420, y: 180 },
        configuration: {
          input: {
            includeRequirementBody: true,
            predecessorArtifacts: 'direct',
            includeSpaceKnowledge: true,
            attachments: ['attachments/brief.md']
          },
          prompt: 'Review the requirement.',
          model: { strategy: 'fixed', profileId: 'profile-1' },
          connectorIds: ['issue-tracker'],
          permissions: [
            { capability: 'filesystem.read', scope: 'requirement' }
          ],
          artifact: {
            required: true,
            relativePath: 'artifacts/analysis.md',
            kind: 'markdown'
          },
          todos: [{ title: 'Confirm scope', required: true }],
          completionGate: {
            requireApproval: true,
            customGateId: 'quality'
          },
          retry: { maxAttempts: 3, backoffMs: 1500 },
          skip: { allowed: true, requireReason: true }
        }
      },
      edges: [
        {
          id: 'edge-analysis-review',
          sourceNodeId: 'template-1-v1-node-analysis',
          targetNodeId: 'template-1-v1-node-review'
        }
      ]
    }

    await registered.get('workflow-template-node:restore')?.({}, command)

    expect(restore).toHaveBeenCalledWith(command)
    expect(() =>
      registered.get('workflow-template-node:restore')?.(
        {},
        {
          ...command,
          node: { ...command.node, order: -1 }
        }
      )
    ).toThrow(
      'Invalid IPC payload for workflow-template-node:restore: command.node.order'
    )
  })

  it('validates workflow template edge commands before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const add = registered.get(IPC_INVOKE_CHANNELS.workflowTemplateEdgeAdd)
    const remove = registered.get(
      IPC_INVOKE_CHANNELS.workflowTemplateEdgeRemove
    )

    await add?.(
      {},
      {
        id: 'template-1',
        expectedRevision: 2,
        sourceNodeId: 'node-analysis',
        targetNodeId: 'node-design'
      }
    )
    expect(handlers.addWorkflowTemplateEdge.execute).toHaveBeenCalledWith({
      id: 'template-1',
      expectedRevision: 2,
      sourceNodeId: 'node-analysis',
      targetNodeId: 'node-design'
    })

    expect(() =>
      remove?.(
        {},
        {
          id: 'template-1',
          expectedRevision: 2,
          edgeId: ' '
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.workflowTemplateEdgeRemove}: command.edgeId`
    )
    expect(handlers.removeWorkflowTemplateEdge.execute).not.toHaveBeenCalled()
  })

  it('validates complete workflow node configuration before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const configure = registered.get(
      IPC_INVOKE_CHANNELS.workflowTemplateNodeConfigure
    )
    const command = {
      id: 'template-1',
      expectedRevision: 2,
      nodeId: 'node-analysis',
      configuration: {
        input: {
          includeRequirementBody: true,
          predecessorArtifacts: 'direct',
          includeSpaceKnowledge: false,
          attachments: ['attachments/brief.md']
        },
        prompt: 'Analyze this requirement.',
        model: { strategy: 'inherit' },
        connectorIds: [],
        permissions: [{ capability: 'filesystem.read', scope: 'requirement' }],
        artifact: {
          required: true,
          relativePath: 'artifacts/analysis.md',
          kind: 'markdown'
        },
        todos: [{ title: 'Confirm scope', required: true }],
        completionGate: { requireApproval: false },
        retry: { maxAttempts: 2, backoffMs: 1000 },
        skip: { allowed: false, requireReason: false }
      }
    }

    await configure?.({}, command)
    expect(handlers.configureWorkflowTemplateNode.execute).toHaveBeenCalledWith(
      command
    )
    const capabilityCommand = {
      ...command,
      configuration: {
        ...command.configuration,
        model: {
          strategy: 'capability',
          requiredCapabilities: ['text', 'vision'],
          minimumContextWindow: 32_000
        }
      }
    }
    await configure?.({}, capabilityCommand)
    expect(
      handlers.configureWorkflowTemplateNode.execute
    ).toHaveBeenLastCalledWith(capabilityCommand)

    expect(() =>
      configure?.(
        {},
        {
          ...command,
          configuration: {
            ...command.configuration,
            executionTarget: {
              kind: 'skill',
              id: 'planning',
              version: '1.0.0',
              digest: 'a'.repeat(64)
            }
          }
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.workflowTemplateNodeConfigure}: command.configuration.executionTarget`
    )

    expect(() =>
      configure?.(
        {},
        {
          ...command,
          configuration: {
            ...command.configuration,
            permissions: [{ capability: 'network.admin', scope: 'space' }]
          }
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.workflowTemplateNodeConfigure}: command.configuration.permissions.0.capability`
    )
    expect(() =>
      configure?.(
        {},
        {
          ...capabilityCommand,
          configuration: {
            ...capabilityCommand.configuration,
            model: {
              ...capabilityCommand.configuration.model,
              requiredCapabilities: ['vision', 'vision']
            }
          }
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.workflowTemplateNodeConfigure}: command.configuration.model.requiredCapabilities`
    )
  })

  it('validates revisioned node execution commands before pausing', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.workflowNodePause)
    await handler?.(
      {},
      {
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedWorkflowRevision: 3,
        expectedExecutionRevision: 1,
        expectedNodeRunRevision: 2
      }
    )
    expect(handlers.pauseWorkflowNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 2
    })
  })

  it('preserves explicit AI executor configuration when inserting a node', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const command = {
      requirementId: 'requirement-1',
      expectedRevision: 2,
      node: {
        id: 'custom-node',
        type: 'ai_generate',
        name: 'Security Review',
        description: '',
        order: 1,
        status: 'pending',
        allowSkip: true,
        completionGate: {
          requireApproval: true,
          customGateId: 'security-policy'
        },
        executor: {
          kind: 'ai_generate',
          prompt: 'Review predecessor artifacts for security risks.',
          artifact: {
            relativePath: 'artifacts/security-review.md',
            kind: 'markdown'
          }
        }
      },
      afterNodeId: 'node-analysis'
    }
    const handler = registered.get(
      IPC_INVOKE_CHANNELS.requirementWorkflowInsertNode
    )

    await handler?.({}, command)

    expect(handlers.insertWorkflowNode.execute).toHaveBeenCalledWith(command)
  })

  it('validates editable workflow node changes before forwarding', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const handler = registered.get(
      IPC_INVOKE_CHANNELS.requirementWorkflowUpdateNode
    )
    const command = {
      requirementId: 'requirement-1',
      expectedRevision: 2,
      nodeId: 'node-analysis',
      changes: {
        name: 'Discovery',
        description: 'Clarify the requirement.',
        allowSkip: true,
        completionGate: { requireApproval: true }
      }
    }

    await handler?.({}, command)
    expect(handlers.updateWorkflowNode.execute).toHaveBeenCalledWith(command)

    expect(() =>
      handler?.(
        {},
        {
          ...command,
          changes: { ...command.changes, status: 'completed' }
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.requirementWorkflowUpdateNode}: command.changes.status`
    )
    expect(handlers.updateWorkflowNode.execute).toHaveBeenCalledTimes(1)
  })

  it('preserves the selected model when resuming a workflow node', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.workflowNodeResume)
    await handler?.(
      {},
      {
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedWorkflowRevision: 3,
        expectedExecutionRevision: 1,
        expectedNodeRunRevision: 2,
        modelProfileId: 'profile-1'
      }
    )

    expect(handlers.resumeWorkflowNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 2,
      modelProfileId: 'profile-1'
    })
  })

  it('routes start, cancel, retry, and skip as distinct validated commands', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const command = {
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 2
    }

    await registered.get(IPC_INVOKE_CHANNELS.workflowNodeStart)?.({}, command)
    await registered.get(IPC_INVOKE_CHANNELS.workflowNodeCancel)?.({}, command)
    await registered.get(IPC_INVOKE_CHANNELS.workflowNodeRetry)?.({}, command)
    await registered.get(IPC_INVOKE_CHANNELS.workflowNodeSkip)?.(
      {},
      {
        ...command,
        expectedRequirementRevision: 4,
        reason: '  Covered elsewhere  '
      }
    )

    expect(handlers.startWorkflowNode.execute).toHaveBeenCalledWith(command)
    expect(handlers.cancelWorkflowNode.execute).toHaveBeenCalledWith(command)
    expect(handlers.retryWorkflowNode.execute).toHaveBeenCalledWith(command)
    expect(handlers.skipWorkflowNode.execute).toHaveBeenCalledWith({
      ...command,
      expectedRequirementRevision: 4,
      reason: 'Covered elsewhere'
    })
  })

  it('routes rollback to node as an independent validated command', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
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

    await registered.get('workflow:rollback-to-node')?.({}, command)

    expect(handlers.rollbackWorkflowToNode.execute).toHaveBeenCalledWith(command)
  })

  it.each([
    ['unknown field', { unsupportedAction: 'retry' }],
    ['empty request id', { requestId: ' ' }],
    ['empty requirement id', { requirementId: '' }],
    ['empty execution id', { executionId: '' }],
    ['empty target node id', { targetNodeId: '' }],
    ['negative requirement revision', { expectedRequirementRevision: -1 }],
    ['fractional workflow revision', { expectedWorkflowRevision: 1.5 }],
    ['non-numeric execution revision', { expectedExecutionRevision: '2' }],
    ['negative node run revision', { expectedNodeRunRevision: -1 }]
  ])('rejects rollback payload with %s', async (_case, override) => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const command = {
      requestId: 'request-1',
      requirementId: 'requirement-1',
      executionId: 'execution-1',
      targetNodeId: 'node-1',
      expectedRequirementRevision: 4,
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 2,
      expectedNodeRunRevision: 1,
      ...override
    }

    expect(() =>
      registered.get('workflow:rollback-to-node')?.({}, command)
    ).toThrow('Invalid IPC payload')
    expect(handlers.rollbackWorkflowToNode.execute).not.toHaveBeenCalled()
  })

  it('routes context preview with validated node revisions', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const command = {
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 2,
      modelProfileId: 'profile-1'
    }

    await registered.get(IPC_INVOKE_CHANNELS.workflowNodePreviewContext)?.(
      {},
      command
    )

    expect(handlers.prepareWorkflowNodeContext.execute).toHaveBeenCalledWith(
      command
    )
  })

  it('rejects context preview with an invalid revision', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.workflowNodePreviewContext)?.(
        {},
        {
          requirementId: 'requirement-1',
          nodeRunId: 'node-run-1',
          expectedWorkflowRevision: 3,
          expectedExecutionRevision: -1,
          expectedNodeRunRevision: 2
        }
      )
    ).toThrow('expectedRevision')
    expect(handlers.prepareWorkflowNodeContext.execute).not.toHaveBeenCalled()
  })

  it('validates a workflow approval gate command', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.workflowNodeResolveGate)
    await handler?.(
      {},
      {
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedNodeRunRevision: 2,
        gate: {
          kind: 'approval',
          decisionId: 'decision-1',
          expectedApprovalRevision: 0,
          result: 'approved',
          note: 'Ready to release'
        }
      }
    )

    expect(handlers.resolveWorkflowNodeGate.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      gate: {
        kind: 'approval',
        decisionId: 'decision-1',
        expectedApprovalRevision: 0,
        result: 'approved',
        note: 'Ready to release'
      }
    })
  })

  it('rejects renderer-owned approval identity and oversized notes', () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const handler = registered.get(IPC_INVOKE_CHANNELS.workflowNodeResolveGate)
    const command = {
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      gate: {
        kind: 'approval',
        decisionId: 'decision-1',
        expectedApprovalRevision: 0,
        result: 'approved'
      }
    }

    expect(() =>
      handler?.(
        {},
        {
          ...command,
          gate: { ...command.gate, actorId: 'forged-user' }
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.workflowNodeResolveGate}: command.gate.actorId`
    )
    expect(() =>
      handler?.(
        {},
        {
          ...command,
          gate: { ...command.gate, note: 'x'.repeat(2_001) }
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.workflowNodeResolveGate}: command.gate.note`
    )
    expect(handlers.resolveWorkflowNodeGate.execute).not.toHaveBeenCalled()
  })

  it('rejects an invalid conversation kind before invoking the use case', () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.conversationCreate)
    expect(() =>
      handler?.(
        {},
        {
          id: 'conversation-1',
          kind: 'requirement',
          title: 'Invalid',
          prompt: 'Hello'
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: command.kind`
    )
    expect(handlers.createConversation.execute).not.toHaveBeenCalled()
  })

  it('accepts a space conversation with exactly one workspace binding', () => {
    const { handlers, registered } = registerHandlers()
    const command = {
      id: 'conversation-space',
      kind: 'space',
      workspaceId: 'workspace-1',
      knowledgeScope: { kind: 'workspace', workspaceId: 'workspace-1' },
      title: 'Space chat',
      prompt: 'Use local knowledge',
      reasoningMode: 'high'
    }

    registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.({}, command)

    expect(handlers.createConversation.execute).toHaveBeenCalledWith(
      command,
      expect.any(Function)
    )
  })

  it('accepts a general conversation with an opaque folder binding', () => {
    const { handlers, registered } = registerHandlers()
    const command = {
      id: 'conversation-folder',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      folderBindingId: 'session-folder-1',
      title: 'Folder chat',
      prompt: 'Inspect this folder'
    }

    registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.({}, command)

    expect(handlers.createConversation.execute).toHaveBeenCalledWith(
      command,
      expect.any(Function)
    )
  })

  it('accepts a requirement node conversation with message references', () => {
    const { handlers, registered } = registerHandlers()
    const command = {
      id: 'conversation-node',
      kind: 'requirement_node',
      knowledgeScope: { kind: 'node_configuration' },
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      title: 'Build',
      prompt: 'Canary',
      references: {
        questionId: 'question-1',
        expectedQuestionRevision: 2,
        todoId: 'todo-1',
        toolCallId: 'tool-call-1',
        artifactId: 'artifact-1'
      }
    }

    registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.({}, command)

    expect(handlers.createConversation.execute).toHaveBeenCalledWith(
      command,
      expect.any(Function)
    )
  })

  it('rejects conversation reasoning overrides for requirement nodes', () => {
    const { handlers, registered } = registerHandlers()

    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.(
        {},
        {
          id: 'conversation-node',
          kind: 'requirement_node',
          knowledgeScope: { kind: 'node_configuration' },
          requirementId: 'requirement-1',
          nodeRunId: 'node-run-1',
          title: 'Build',
          prompt: 'Canary',
          reasoningMode: 'high'
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: command.reasoningMode`
    )
    expect(handlers.createConversation.execute).not.toHaveBeenCalled()
  })

  it.each([
    [
      {
        kind: 'general',
        knowledgeScope: {
          kind: 'all_workspaces',
          workspaceIds: ['workspace-1']
        }
      }
    ],
    [
      {
        kind: 'space',
        workspaceId: 'workspace-1',
        knowledgeScope: { kind: 'workspace', workspaceId: 'workspace-2' }
      }
    ],
    [
      {
        kind: 'requirement_node',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        knowledgeScope: { kind: 'none' }
      }
    ],
    [
      {
        kind: 'general',
        folderBindingId: 'folder-1',
        knowledgeScope: { kind: 'all_workspaces' }
      }
    ]
  ])('rejects an invalid conversation knowledge scope %#', (binding) => {
    const { handlers, registered } = registerHandlers()

    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.(
        {},
        {
          id: 'conversation-invalid-scope',
          title: 'Invalid scope',
          prompt: 'Hello',
          ...binding
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: command.knowledgeScope`
    )
    expect(handlers.createConversation.execute).not.toHaveBeenCalled()
  })

  it.each([
    [
      {
        kind: 'requirement_node',
        knowledgeScope: { kind: 'node_configuration' },
        nodeRunId: 'node-run-1'
      },
      'requirementId'
    ],
    [
      {
        kind: 'requirement_node',
        knowledgeScope: { kind: 'node_configuration' },
        requirementId: 'requirement-1'
      },
      'nodeRunId'
    ],
    [
      {
        kind: 'requirement_node',
        knowledgeScope: { kind: 'node_configuration' },
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        workspaceId: 'workspace-1'
      },
      'workspaceId'
    ],
    [
      {
        kind: 'requirement_node',
        knowledgeScope: { kind: 'node_configuration' },
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        folderPath: '/tmp/task'
      },
      'folderPath'
    ]
  ])('rejects invalid requirement node binding %#', (override, field) => {
    const { handlers, registered } = registerHandlers()

    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.(
        {},
        {
          id: 'conversation-node',
          title: 'Build',
          prompt: 'Canary',
          ...override
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: command.${field}`
    )
    expect(handlers.createConversation.execute).not.toHaveBeenCalled()
  })

  it.each([
    [
      {
        kind: 'space',
        knowledgeScope: { kind: 'workspace', workspaceId: 'workspace-1' }
      },
      'command.workspaceId'
    ],
    [
      {
        kind: 'space',
        workspaceId: 'workspace-1',
        knowledgeScope: { kind: 'workspace', workspaceId: 'workspace-1' },
        folderPath: '/tmp/task'
      },
      'command.folderPath'
    ],
    [
      {
        kind: 'space',
        workspaceId: 'workspace-1',
        knowledgeScope: { kind: 'workspace', workspaceId: 'workspace-1' },
        requirementId: 'requirement-1'
      },
      'command.requirementId'
    ],
    [
      {
        kind: 'space',
        workspaceId: 'workspace-1',
        knowledgeScope: { kind: 'workspace', workspaceId: 'workspace-1' },
        nodeRunId: 'node-run-1'
      },
      'command.nodeRunId'
    ]
  ])('rejects invalid space conversation binding %#', (override, field) => {
    const { handlers, registered } = registerHandlers()

    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.(
        {},
        {
          id: 'conversation-space',
          title: 'Space chat',
          prompt: 'Hello',
          ...override
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: ${field}`
    )
    expect(handlers.createConversation.execute).not.toHaveBeenCalled()
  })

  it.each([
    ['title', '   '],
    ['prompt', '\n\t']
  ])(
    'rejects blank conversation %s before invoking the use case',
    (field, value) => {
      const { handlers, registered } = registerHandlers()
      const command = {
        id: 'conversation-1',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        title: 'General chat',
        prompt: 'Hello',
        [field]: value
      }

      expect(() =>
        registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.({}, command)
      ).toThrow(
        `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: command.${field}`
      )
      expect(handlers.createConversation.execute).not.toHaveBeenCalled()
    }
  )

  it('sends a follow-up suggestion and broadcasts the committed conversation', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const send = vi.fn()
    const conversation = {
      id: 'conversation-1',
      kind: 'general' as const,
      knowledgeScope: { kind: 'none' as const },
      title: 'General chat',
      sortOrder: 1,
      messages: [],
      revision: 4,
      createdAt: 1,
      updatedAt: 2
    }
    vi.mocked(handlers.sendFollowUpSuggestion.execute).mockImplementation(
      async (_command, onUpdate) => {
        onUpdate?.(conversation)
        return conversation
      }
    )
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (
          registeredChannel: string,
          handler: (...args: unknown[]) => unknown
        ) => {
          registered.set(registeredChannel, handler)
        }
      } as never
    })
    const command = {
      sessionId: 'conversation-1',
      suggestionSetId: 'set-1',
      suggestionId: 'suggestion-1',
      expectedSessionRevision: 3,
      expectedSuggestionRevision: 1
    }

    await registered.get(
      IPC_INVOKE_CHANNELS.conversationSendFollowUpSuggestion
    )?.({ sender: { isDestroyed: () => false, send } }, command)

    expect(handlers.sendFollowUpSuggestion.execute).toHaveBeenCalledWith(
      command,
      expect.any(Function)
    )
    expect(send).toHaveBeenCalledWith('conversation:event', { conversation })
  })

  it.each(['workspaceId', 'requirementId', 'nodeRunId', 'folderPath'])(
    'rejects general conversation %s bindings at the IPC boundary',
    (field) => {
      const { handlers, registered } = registerHandlers()
      const command = {
        id: 'conversation-1',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        title: 'General chat',
        prompt: 'Hello',
        [field]: field === 'folderPath' ? '/tmp/task' : `${field}-1`
      }

      expect(() =>
        registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.({}, command)
      ).toThrow(
        `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: command.${field}`
      )
      expect(handlers.createConversation.execute).not.toHaveBeenCalled()
    }
  )

  it.each([
    [{ folderBindingId: '   ' }, 'folderBindingId'],
    [
      { folderBindingId: 'session-folder-1', workspaceId: 'workspace-1' },
      'workspaceId'
    ],
    [
      { folderBindingId: 'session-folder-1', requirementId: 'requirement-1' },
      'requirementId'
    ],
    [
      { folderBindingId: 'session-folder-1', nodeRunId: 'node-run-1' },
      'nodeRunId'
    ],
    [
      { folderBindingId: 'session-folder-1', folderPath: '/tmp/task' },
      'folderPath'
    ]
  ])('rejects invalid folder conversation binding %#', (override, field) => {
    const { handlers, registered } = registerHandlers()

    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.(
        {},
        {
          id: 'conversation-folder',
          kind: 'general',
          knowledgeScope: { kind: 'none' },
          title: 'Folder chat',
          prompt: 'Hello',
          ...override
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: command.${field}`
    )
    expect(handlers.createConversation.execute).not.toHaveBeenCalled()
  })

  it('rejects unknown conversation creation fields', () => {
    const { handlers, registered } = registerHandlers()

    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.conversationCreate)?.(
        {},
        {
          id: 'conversation-1',
          kind: 'general',
          knowledgeScope: { kind: 'none' },
          title: 'General chat',
          prompt: 'Hello',
          unexpected: true
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: command.unexpected`
    )
    expect(handlers.createConversation.execute).not.toHaveBeenCalled()
  })

  it.each([
    [
      IPC_INVOKE_CHANNELS.conversationCreate,
      'createConversation',
      {
        id: 'conversation-1',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        title: 'General chat',
        prompt: 'Hello'
      }
    ],
    [
      IPC_INVOKE_CHANNELS.conversationAppendMessage,
      'appendConversationMessage',
      {
        sessionId: 'conversation-1',
        messageId: 'message-2',
        content: 'Continue',
        expectedRevision: 2
      }
    ]
  ])(
    'streams committed conversation snapshots for %s to the invoking Renderer',
    async (channel, handlerName, command) => {
      const handlers = createHandlers()
      const registered = new Map<string, (...args: unknown[]) => unknown>()
      const send = vi.fn()
      registerBusinessIpc({
        handlers,
        ipcMain: {
          handle: (
            registeredChannel: string,
            handler: (...args: unknown[]) => unknown
          ) => {
            registered.set(registeredChannel, handler)
          }
        } as never
      })
      const conversation = {
        id: 'conversation-1',
        kind: 'general' as const,
        knowledgeScope: { kind: 'none' as const },
        title: 'General chat',
        sortOrder: 1,
        messages: [],
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
      vi.mocked(
        handlers[handlerName as 'createConversation'].execute
      ).mockImplementation(async (_command, onUpdate) => {
        onUpdate?.(conversation)
        return conversation
      })

      await registered.get(channel)?.(
        { sender: { isDestroyed: () => false, send } },
        command
      )

      expect(send).toHaveBeenCalledWith('conversation:event', { conversation })
    }
  )

  it.each([
    [{ content: '   ' }, 'command.content'],
    [{ expectedRevision: -1 }, 'expectedRevision'],
    [{ reasoningMode: 'extreme' }, 'command.reasoningMode'],
    [{ unexpected: true }, 'command.unexpected']
  ])('rejects invalid conversation append payload %#', (override, field) => {
    const { handlers, registered } = registerHandlers()

    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.conversationAppendMessage)?.(
        {},
        {
          sessionId: 'conversation-1',
          messageId: 'message-2',
          content: 'Continue',
          expectedRevision: 2,
          ...override
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationAppendMessage}: ${field}`
    )
    expect(handlers.appendConversationMessage.execute).not.toHaveBeenCalled()
  })

  it('requires a question revision when appending a linked answer', () => {
    const { handlers, registered } = registerHandlers()
    const handler = registered.get(
      IPC_INVOKE_CHANNELS.conversationAppendMessage
    )

    expect(() =>
      handler?.(
        {},
        {
          sessionId: 'conversation-node',
          messageId: 'message-2',
          content: 'Canary',
          expectedRevision: 2,
          references: { questionId: 'question-1' }
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationAppendMessage}: command.references.expectedQuestionRevision`
    )
    expect(handlers.appendConversationMessage.execute).not.toHaveBeenCalled()
  })

  it('validates and forwards knowledge source registration', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const command = {
      id: 'resource-1',
      workspaceId: 'space-1',
      name: 'Product brief',
      type: 'document' as const,
      locator: 'https://example.com/brief',
      detail: 'example.com',
      sortOrder: 0,
      idempotencyKey: 'register-resource-1'
    }
    await registered.get(IPC_INVOKE_CHANNELS.knowledgeSourceRegister)?.(
      {},
      command
    )

    expect(handlers.registerKnowledgeSource.execute).toHaveBeenCalledWith(
      command
    )
  })

  it('registers typed Knowledge Note query and command handlers', async () => {
    const handlers = createHandlers()
    const noteHandler = () => ({ execute: vi.fn() })
    const notes = {
      listKnowledgeNotes: noteHandler(),
      createKnowledgeNote: noteHandler(),
      editKnowledgeNote: noteHandler(),
      archiveKnowledgeNote: noteHandler()
    }
    Object.assign(handlers, notes)
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, callback: (...args: unknown[]) => unknown) => {
          registered.set(channel, callback)
        }
      } as never
    })
    const createCommand = {
      id: 'note-1',
      versionId: 'note-version-1',
      workspaceId: 'workspace-1',
      sessionId: 'conversation-1',
      kind: 'decision',
      sourceMessageIds: ['message-1', 'message-2'],
      title: 'Storage decision',
      content: 'Use SQLite.'
    }

    expect(registered.get('knowledge-note:list')).toBeTypeOf('function')
    expect(registered.get('knowledge-note:create')).toBeTypeOf('function')
    expect(registered.get('knowledge-note:edit')).toBeTypeOf('function')
    expect(registered.get('knowledge-note:archive')).toBeTypeOf('function')

    await registered.get('knowledge-note:list')?.(
      {},
      { workspaceId: 'workspace-1' }
    )
    await registered.get('knowledge-note:create')?.({}, createCommand)
    await registered.get('knowledge-note:edit')?.(
      {},
      {
        noteId: 'note-1',
        versionId: 'note-version-2',
        expectedRevision: 1,
        title: 'Updated decision',
        content: 'Use SQLite with WAL.'
      }
    )
    await registered.get('knowledge-note:archive')?.(
      {},
      { noteId: 'note-1', expectedRevision: 2 }
    )

    expect(notes.listKnowledgeNotes.execute).toHaveBeenCalledWith({
      workspaceId: 'workspace-1'
    })
    expect(notes.createKnowledgeNote.execute).toHaveBeenCalledWith(createCommand)
    expect(notes.editKnowledgeNote.execute).toHaveBeenCalledWith({
      noteId: 'note-1',
      versionId: 'note-version-2',
      expectedRevision: 1,
      title: 'Updated decision',
      content: 'Use SQLite with WAL.'
    })
    expect(notes.archiveKnowledgeNote.execute).toHaveBeenCalledWith({
      noteId: 'note-1',
      expectedRevision: 2
    })
  })

  it('accepts an empty runtime health query from Preload', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, callback: (...args: unknown[]) => unknown) => {
          registered.set(channel, callback)
        }
      } as never
    })

    await registered.get('knowledge:get-runtime-health')?.({})

    expect(handlers.getKnowledgeRuntimeHealth.execute).toHaveBeenCalledOnce()
  })

  it.each([
    [
      'kind',
      {
        id: 'note-1',
        versionId: 'version-1',
        workspaceId: 'workspace-1',
        sessionId: 'conversation-1',
        kind: 'summary',
        sourceMessageIds: ['message-1'],
        title: 'Title',
        content: 'Content'
      },
      'command.kind'
    ],
    [
      'source messages',
      {
        id: 'note-1',
        versionId: 'version-1',
        workspaceId: 'workspace-1',
        sessionId: 'conversation-1',
        kind: 'conversation_note',
        sourceMessageIds: [],
        title: 'Title',
        content: 'Content'
      },
      'command.sourceMessageIds'
    ],
    [
      'title',
      {
        id: 'note-1',
        versionId: 'version-1',
        workspaceId: 'workspace-1',
        sessionId: 'conversation-1',
        kind: 'retrospective',
        sourceMessageIds: ['message-1'],
        title: '   ',
        content: 'Content'
      },
      'command.title'
    ]
  ])('rejects an invalid Knowledge Note %s', (_label, command, field) => {
    const handlers = createHandlers()
    const createKnowledgeNote = { execute: vi.fn() }
    Object.assign(handlers, { createKnowledgeNote })
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, callback: (...args: unknown[]) => unknown) => {
          registered.set(channel, callback)
        }
      } as never
    })

    expect(() => registered.get('knowledge-note:create')?.({}, command)).toThrow(
      `Invalid IPC payload for knowledge-note:create: ${field}`
    )
    expect(createKnowledgeNote.execute).not.toHaveBeenCalled()
  })

  it('validates and forwards hybrid knowledge search queries', async () => {
    const handlers = Object.assign(createHandlers(), {
      searchKnowledge: { execute: vi.fn().mockResolvedValue([]) }
    })
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const query = {
      scope: { kind: 'workspace', workspaceId: 'space-1' },
      query: 'checkout retry',
      topK: 6,
      sourceKinds: ['file', 'artifact']
    }

    expect(registered.get('knowledge:search')).toBeTypeOf('function')
    await registered.get('knowledge:search')?.({}, query)

    expect(handlers.searchKnowledge.execute).toHaveBeenCalledWith(query)
  })

  it('returns only IPC-safe knowledge metadata without content, vectors, or paths', async () => {
    const handlers = Object.assign(createHandlers(), {
      searchKnowledge: {
        execute: vi.fn().mockResolvedValue([
          {
            id: 'point-1',
            schemaVersion: 1,
            profileId: 'realmflow-vector-index-v1',
            workspaceId: 'space-1',
            workspaceName: 'Workspace',
            generationId: 'generation-1',
            sourceKind: 'file',
            sourceId: 'source-1',
            sourceVersion: 'file:v1',
            documentId: 'document-1',
            documentKey: 'notes.md',
            title: 'Notes',
            content: 'body-canary',
            vector: [0.125, 0.25],
            absolutePath: '/Users/private/notes.md',
            chunkId: 'chunk-1',
            chunkOrdinal: 0,
            startOffset: 0,
            endOffset: 11,
            startLine: 1,
            endLine: 1,
            checksum: `sha256:${'a'.repeat(64)}`,
            createdAt: 1,
            fusionScore: 0.9,
            fusionRank: 1
          }
        ])
      }
    })
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const response = await registered.get('knowledge:search')?.(
      {},
      {
        scope: { kind: 'workspace', workspaceId: 'space-1' },
        query: 'checkout'
      }
    )
    const serialized = JSON.stringify(response)

    expect(serialized).not.toContain('body-canary')
    expect(serialized).not.toContain('0.125')
    expect(serialized).not.toContain('/Users/private/notes.md')
    expect(response).toEqual([
      expect.objectContaining({
        id: 'point-1',
        workspaceId: 'space-1',
        documentKey: 'notes.md',
        title: 'Notes',
        fusionRank: 1
      })
    ])
  })

  it.each([
    [{ query: ' ' }, 'query.query'],
    [{ topK: 0 }, 'query.topK'],
    [{ keywordWeight: 0.5 }, 'query.keywordWeight'],
    [
      {
        scope: {
          kind: 'all_workspaces',
          workspaceIds: ['space-1']
        }
      },
      'query.scope.workspaceIds'
    ],
    [{ unexpected: true }, 'query.unexpected']
  ])('rejects invalid hybrid knowledge queries %#', async (override, field) => {
    const handlers = Object.assign(createHandlers(), {
      searchKnowledge: { execute: vi.fn() }
    })
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    await expect(
      registered.get('knowledge:search')?.(
        {},
        {
          scope: { kind: 'workspace', workspaceId: 'space-1' },
          query: 'checkout',
          ...override
        }
      )
    ).rejects.toThrow(field)
    expect(handlers.searchKnowledge.execute).not.toHaveBeenCalled()
  })

  it('validates catalog search and returns only typed result metadata', async () => {
    const handlers = Object.assign(createHandlers(), {
      searchCatalog: {
        execute: vi.fn().mockResolvedValue([
          {
            id: 'catalog-point-1',
            schemaVersion: 1,
            profileId: 'realmflow-vector-index-v1',
            catalogKind: 'skill',
            catalogId: 'com.example.planning',
            versionId: 'skill-version-1',
            sourceVersion: '1.0.0',
            title: 'Planning',
            content: 'private catalog projection',
            checksum: `sha256:${'a'.repeat(64)}`,
            updatedAt: 10,
            fusionScore: 0.9,
            fusionRank: 1
          }
        ])
      }
    })
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })
    const query = {
      query: 'release planning',
      kind: 'skill' as const,
      topK: 6
    }

    const response = await registered.get('knowledge:search-catalog')?.(
      {},
      query
    )

    expect(handlers.searchCatalog.execute).toHaveBeenCalledWith(query)
    expect(response).toEqual([
      {
        id: 'catalog-point-1',
        catalogKind: 'skill',
        catalogId: 'com.example.planning',
        versionId: 'skill-version-1',
        sourceVersion: '1.0.0',
        title: 'Planning',
        updatedAt: 10,
        fusionScore: 0.9,
        fusionRank: 1
      }
    ])
    expect(JSON.stringify(response)).not.toContain('private catalog projection')
    expect(JSON.stringify(response)).not.toContain('checksum')
  })

  it.each([
    [{ query: ' ', kind: 'skill' as const }, 'query.query'],
    [{ query: 'planning', kind: 'unknown' }, 'query.kind'],
    [{ query: 'planning', kind: 'skill' as const, topK: 0 }, 'query.topK'],
    [{ query: 'planning', kind: 'skill' as const, topK: 21 }, 'query.topK'],
    [{ query: 'planning', kind: 'skill' as const, unexpected: true }, 'query.unexpected']
  ])('rejects invalid catalog search queries %#', async (query, field) => {
    const handlers = Object.assign(createHandlers(), {
      searchCatalog: { execute: vi.fn() }
    })
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    await expect(
      registered.get('knowledge:search-catalog')?.({}, query)
    ).rejects.toThrow(field)
    expect(handlers.searchCatalog.execute).not.toHaveBeenCalled()
  })

  it('validates and forwards local file ingestion', async () => {
    const { handlers, registered } = registerHandlers()
    const localHandlers = handlers as typeof handlers & {
      ingestLocalFiles: { execute: ReturnType<typeof vi.fn> }
    }
    const command = {
      workspaceId: 'space-1',
      selectionId: 'selection-1',
      filePaths: ['architecture.md'],
      storageMode: 'managed_copy',
      idempotencyKey: 'ingest-1'
    }

    await registered.get('knowledge-source:ingest-local-files')?.({}, command)

    expect(localHandlers.ingestLocalFiles.execute).toHaveBeenCalledWith(command)
  })

  it('rejects invalid local file ingestion before dispatch', () => {
    const { handlers, registered } = registerHandlers()
    const localHandlers = handlers as typeof handlers & {
      ingestLocalFiles: { execute: ReturnType<typeof vi.fn> }
    }

    expect(() =>
      registered.get('knowledge-source:ingest-local-files')?.(
        {},
        {
          workspaceId: 'space-1',
          selectionId: 'selection-1',
          filePaths: ['architecture.md', 'architecture.md'],
          storageMode: 'managed_copy',
          idempotencyKey: 'ingest-1'
        }
      )
    ).toThrow('command.filePaths')
    expect(localHandlers.ingestLocalFiles.execute).not.toHaveBeenCalled()
  })

  it('validates and forwards repository ingestion operations', async () => {
    const { handlers, registered } = registerHandlers()
    const repositoryHandlers = handlers as typeof handlers & {
      ingestLocalRepository: { execute: ReturnType<typeof vi.fn> }
      ingestRemoteRepository: { execute: ReturnType<typeof vi.fn> }
      refreshRepositorySource: { execute: ReturnType<typeof vi.fn> }
      getRepositorySnapshot: { execute: ReturnType<typeof vi.fn> }
      listRepositoryBranches: { execute: ReturnType<typeof vi.fn> }
      updateRepositoryBranch: { execute: ReturnType<typeof vi.fn> }
      retryRepositoryFileIndex: { execute: ReturnType<typeof vi.fn> }
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

    await registered.get('knowledge-source:ingest-local-repository')?.(
      {},
      local
    )
    await registered.get('knowledge-source:ingest-remote-repository')?.(
      {},
      remote
    )
    await registered.get('knowledge-source:refresh-repository')?.({}, refresh)
    await registered.get('knowledge-source:get-repository-snapshot')?.(
      {},
      { sourceId: 'repository-2' }
    )
    await registered.get('repository:list-branches')?.(
      {},
      { sourceId: 'repository-2' }
    )
    await registered.get('repository:update-branch')?.(
      {},
      {
        sourceId: 'repository-2',
        branch: 'feature/docs',
        expectedRevision: 2,
        idempotencyKey: 'repository-branch-1'
      }
    )
    await registered.get('repository:retry-file-index')?.(
      {},
      {
        sourceId: 'repository-2',
        documentKey: 'src/index.ts',
        expectedSourceRevision: 3,
        expectedSnapshotVersion: 2,
        idempotencyKey: 'repository-retry-1'
      }
    )

    expect(
      repositoryHandlers.ingestLocalRepository.execute
    ).toHaveBeenCalledWith(local)
    expect(
      repositoryHandlers.ingestRemoteRepository.execute
    ).toHaveBeenCalledWith(remote)
    expect(
      repositoryHandlers.refreshRepositorySource.execute
    ).toHaveBeenCalledWith(refresh)
    expect(
      repositoryHandlers.getRepositorySnapshot.execute
    ).toHaveBeenCalledWith({ sourceId: 'repository-2' })
    expect(
      repositoryHandlers.listRepositoryBranches.execute
    ).toHaveBeenCalledWith({ sourceId: 'repository-2' })
    expect(
      repositoryHandlers.updateRepositoryBranch.execute
    ).toHaveBeenCalledWith(
      expect.objectContaining({ branch: 'feature/docs' })
    )
    expect(
      repositoryHandlers.retryRepositoryFileIndex.execute
    ).toHaveBeenCalledWith(
      expect.objectContaining({ documentKey: 'src/index.ts' })
    )
  })

  it.each([
    [
      'knowledge-source:ingest-local-repository',
      {
        id: 'repository-1',
        workspaceId: 'space-1',
        selectionId: 'selection-1',
        selectedBranch: 'main',
        name: 'RealmFlow',
        sortOrder: 0,
        idempotencyKey: 'repository-local-1',
        localPath: '/private/repository'
      },
      'command.localPath'
    ],
    [
      'knowledge-source:ingest-local-repository',
      {
        id: 'invalid id',
        workspaceId: 'space-1',
        selectionId: 'selection-1',
        selectedBranch: 'main',
        name: 'RealmFlow',
        sortOrder: 0,
        idempotencyKey: 'repository-local-1'
      },
      'command.id'
    ],
    [
      'knowledge-source:ingest-remote-repository',
      {
        id: 'repository-2',
        workspaceId: 'space-1',
        name: 'Docs',
        connectorId: 'connector-git',
        path: 'https://git.example.com/team/docs',
        selectedBranch: 'main',
        sortOrder: 1,
        idempotencyKey: 'repository-remote-1'
      },
      'command.path'
    ],
    [
      'knowledge-source:ingest-remote-repository',
      {
        id: 'repository-2',
        workspaceId: 'space-1',
        name: '   ',
        connectorId: 'connector-git',
        path: '/team/docs',
        selectedBranch: 'main',
        sortOrder: 1,
        idempotencyKey: 'repository-remote-1'
      },
      'command.name'
    ],
    [
      'knowledge-source:refresh-repository',
      {
        sourceId: 'repository-2',
        expectedRevision: 0,
        idempotencyKey: 'repository-refresh-1'
      },
      'command.expectedRevision'
    ]
  ])('rejects invalid repository payloads on %s', (channel, command, field) => {
    const { handlers, registered } = registerHandlers()
    const repositoryHandlers = handlers as typeof handlers & {
      ingestLocalRepository: { execute: ReturnType<typeof vi.fn> }
      ingestRemoteRepository: { execute: ReturnType<typeof vi.fn> }
      refreshRepositorySource: { execute: ReturnType<typeof vi.fn> }
    }

    expect(() => registered.get(channel)?.({}, command)).toThrow(field)
    expect(
      repositoryHandlers.ingestLocalRepository.execute
    ).not.toHaveBeenCalled()
    expect(
      repositoryHandlers.ingestRemoteRepository.execute
    ).not.toHaveBeenCalled()
    expect(
      repositoryHandlers.refreshRepositorySource.execute
    ).not.toHaveBeenCalled()
  })

  it('rejects unknown knowledge source registration fields', () => {
    const { handlers, registered } = registerHandlers()
    const channel = IPC_INVOKE_CHANNELS.knowledgeSourceRegister

    expect(() =>
      registered.get(channel)?.(
        {},
        {
          id: 'resource-1',
          workspaceId: 'space-1',
          name: 'Product brief',
          type: 'document',
          locator: 'https://example.com/brief',
          detail: 'example.com',
          sortOrder: 0,
          idempotencyKey: 'register-resource-1',
          status: 'indexed'
        }
      )
    ).toThrow(`Invalid IPC payload for ${channel}: command.status`)
    expect(handlers.registerKnowledgeSource.execute).not.toHaveBeenCalled()
  })

  it('validates and forwards online document snapshot operations', async () => {
    const { handlers, registered } = registerHandlers()
    const onlineHandlers = handlers as typeof handlers & {
      createOnlineDocumentSource: { execute: ReturnType<typeof vi.fn> }
      syncOnlineDocumentSource: { execute: ReturnType<typeof vi.fn> }
      getOnlineDocumentSnapshot: { execute: ReturnType<typeof vi.fn> }
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

    await registered.get('knowledge-source:create-online-document')?.(
      {},
      create
    )
    await registered.get('knowledge-source:sync-online-document')?.({}, sync)
    await registered.get('knowledge-source:get-online-document-snapshot')?.(
      {},
      { sourceId: 'source-1' }
    )

    expect(
      onlineHandlers.createOnlineDocumentSource.execute
    ).toHaveBeenCalledWith(create)
    expect(
      onlineHandlers.syncOnlineDocumentSource.execute
    ).toHaveBeenCalledWith(sync)
    expect(
      onlineHandlers.getOnlineDocumentSnapshot.execute
    ).toHaveBeenCalledWith({ sourceId: 'source-1' })
  })

  it.each([
    [
      'absolute path',
      { path: 'https://docs.example.com/brief' },
      'command.path'
    ],
    ['empty name', { name: ' ' }, 'command.name'],
    ['invalid id', { connectorId: 'bad id' }, 'command.connectorId'],
    ['unknown field', { credential: 'secret' }, 'command.credential']
  ])(
    'rejects online document creation with %s before dispatch',
    (_label, override, field) => {
      const { handlers, registered } = registerHandlers()
      const onlineHandlers = handlers as typeof handlers & {
        createOnlineDocumentSource: { execute: ReturnType<typeof vi.fn> }
      }

      expect(() =>
        registered.get('knowledge-source:create-online-document')?.(
          {},
          {
            id: 'source-1',
            workspaceId: 'space-1',
            name: 'Product brief',
            connectorId: 'connector-docs',
            path: '/documents/brief',
            sortOrder: 0,
            idempotencyKey: 'create-doc-1',
            ...override
          }
        )
      ).toThrow(field)
      expect(
        onlineHandlers.createOnlineDocumentSource.execute
      ).not.toHaveBeenCalled()
    }
  )

  it('rejects a non-positive online document revision before dispatch', () => {
    const { handlers, registered } = registerHandlers()
    const onlineHandlers = handlers as typeof handlers & {
      syncOnlineDocumentSource: { execute: ReturnType<typeof vi.fn> }
    }

    expect(() =>
      registered.get('knowledge-source:sync-online-document')?.(
        {},
        {
          sourceId: 'source-1',
          expectedRevision: 0,
          idempotencyKey: 'sync-doc-1'
        }
      )
    ).toThrow('command.expectedRevision')
    expect(
      onlineHandlers.syncOnlineDocumentSource.execute
    ).not.toHaveBeenCalled()
  })

  it('strips persistence-owned timestamps from node todo commands', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    await registered.get(IPC_INVOKE_CHANNELS.nodeTodoSave)?.(
      {},
      {
        id: 'todo-1',
        nodeRunId: 'node-run-1',
        title: 'Review',
        required: true,
        status: 'pending',
        expectedRevision: 0,
        createdAt: 1,
        updatedAt: 2
      }
    )

    expect(handlers.saveNodeTodo.execute).toHaveBeenCalledWith({
      id: 'todo-1',
      nodeRunId: 'node-run-1',
      title: 'Review',
      required: true,
      status: 'pending',
      expectedRevision: 0
    })
  })

  it('validates revisioned node todo deletion before dispatching it', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    await registered.get(IPC_INVOKE_CHANNELS.nodeTodoDelete)?.(
      {},
      {
        id: 'todo-1',
        nodeRunId: 'node-run-1',
        expectedRevision: 2,
        title: 'ignored'
      }
    )

    expect(handlers.deleteNodeTodo.execute).toHaveBeenCalledWith({
      id: 'todo-1',
      nodeRunId: 'node-run-1',
      expectedRevision: 2
    })
  })

  it('validates node question commands before dispatching them', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    await registered.get(IPC_INVOKE_CHANNELS.nodeQuestionOpen)?.(
      {},
      {
        id: 'question-1',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        prompt: '  Which rollout strategy?  ',
        required: true,
        expectedRevision: 0,
        createdAt: 1
      }
    )
    await registered.get(IPC_INVOKE_CHANNELS.nodeQuestionAnswer)?.(
      {},
      {
        id: 'question-1',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        answer: '  Canary  ',
        expectedRevision: 1
      }
    )
    await registered.get(IPC_INVOKE_CHANNELS.nodeQuestionDismiss)?.(
      {},
      {
        id: 'question-2',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedRevision: 1
      }
    )

    expect(handlers.openNodeQuestion.execute).toHaveBeenCalledWith({
      id: 'question-1',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      prompt: '  Which rollout strategy?  ',
      required: true,
      expectedRevision: 0
    })
    expect(handlers.answerNodeQuestion.execute).toHaveBeenCalledWith({
      id: 'question-1',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      answer: '  Canary  ',
      expectedRevision: 1
    })
    expect(handlers.dismissNodeQuestion.execute).toHaveBeenCalledWith({
      id: 'question-2',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedRevision: 1
    })
  })

  it('validates app support queries, commands and results at the boundary', async () => {
    const { handlers, registered } = registerHandlers()
    const info = {
      currentVersion: '1.0.0',
      lastCheck: {
        requestId: 'request-old',
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        status: 'update_available' as const,
        checkedAt: 100
      }
    }
    vi.mocked(handlers.getAppSupportInfo.execute).mockResolvedValue(info)
    vi.mocked(handlers.checkForUpdates.execute).mockResolvedValue(
      info.lastCheck
    )
    vi.mocked(handlers.openSupportLink.execute).mockResolvedValue({
      requestId: 'link-1',
      target: 'feedback',
      status: 'opened'
    })

    await expect(
      registered.get(IPC_INVOKE_CHANNELS.appSupportGetInfo)?.({})
    ).resolves.toEqual(info)
    await expect(
      registered.get(IPC_INVOKE_CHANNELS.appSupportCheckUpdate)?.(
        {},
        { requestId: 'request-1' }
      )
    ).resolves.toEqual(info.lastCheck)
    await expect(
      registered.get(IPC_INVOKE_CHANNELS.appSupportOpenLink)?.(
        {},
        { requestId: 'link-1', target: 'feedback' }
      )
    ).resolves.toEqual({
      requestId: 'link-1',
      target: 'feedback',
      status: 'opened'
    })

    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.appSupportGetInfo)?.(
        {},
        { unexpected: true }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.appSupportGetInfo}: payload`
    )
    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.appSupportCheckUpdate)?.(
        {},
        { requestId: 'request-2', unexpected: true }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.appSupportCheckUpdate}: command.unexpected`
    )
    expect(() =>
      registered.get(IPC_INVOKE_CHANNELS.appSupportOpenLink)?.(
        {},
        { requestId: 'link-2', target: 'https://example.com' }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.appSupportOpenLink}: command.target`
    )

    vi.mocked(handlers.getAppSupportInfo.execute).mockResolvedValueOnce({
      currentVersion: 'private malformed version'
    })
    await expect(
      registered.get(IPC_INVOKE_CHANNELS.appSupportGetInfo)?.({})
    ).rejects.toThrow(
      `Invalid IPC result for ${IPC_INVOKE_CHANNELS.appSupportGetInfo}`
    )
  })

  it('owns backup paths and validates restore commands at the Main boundary', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const checksum = `sha256:${'a'.repeat(64)}`
    const operation = {
      requestId: '11111111-1111-4111-8111-111111111111',
      kind: 'backup' as const,
      status: 'succeeded' as const,
      bundleName: 'daily.realmflow-backup',
      bundleChecksum: checksum,
      formatVersion: 1,
      schemaVersion: 44,
      fileCount: 5,
      byteSize: 1024,
      createdAt: 100,
      completedAt: 200
    }
    const preview = {
      previewId: 'preview-1',
      formatVersion: 1 as const,
      applicationVersion: '0.1.0',
      schemaVersion: 44,
      createdAt: '2026-09-28T05:00:00.000Z',
      bundleChecksum: checksum,
      summary: {
        workRootCount: 1,
        spaceCount: 1,
        requirementCount: 1,
        formalArtifactCount: 1,
        fileCount: 5,
        byteSize: 1024
      }
    }
    const backup = {
      getStatus: vi.fn().mockResolvedValue({
        latestBackup: operation,
        latestRestore: undefined
      }),
      createBackup: vi.fn().mockResolvedValue(operation),
      inspectRestore: vi.fn().mockResolvedValue(preview),
      prepareRestore: vi.fn().mockResolvedValue({
        ...operation,
        kind: 'restore',
        status: 'restore_pending',
        completedAt: undefined
      }),
      restartForRestore: vi.fn().mockResolvedValue(true)
    }
    const showSaveDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: '/backups/daily'
    })
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ['/backups/daily.realmflow-backup']
    })
    registerBusinessIpc({
      handlers,
      backup,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never,
      dialog: { showOpenDialog, showSaveDialog }
    })

    await expect(registered.get('backup:get-status')?.({})).resolves.toEqual({
      latestBackup: operation
    })
    await expect(
      registered.get('backup:choose-destination')?.(
        {},
        { requestId: operation.requestId }
      )
    ).resolves.toEqual(operation)
    expect(backup.createBackup).toHaveBeenCalledWith({
      requestId: operation.requestId,
      destinationPath: '/backups/daily.realmflow-backup'
    })
    await expect(
      registered.get('restore:choose-bundle')?.({})
    ).resolves.toEqual(preview)
    expect(backup.inspectRestore).toHaveBeenCalledWith(
      '/backups/daily.realmflow-backup'
    )
    await expect(
      registered.get('restore:prepare')?.(
        {},
        {
          requestId: operation.requestId,
          previewId: preview.previewId,
          expectedChecksum: checksum
        }
      )
    ).resolves.toMatchObject({ status: 'restore_pending' })
    await expect(registered.get('restore:restart')?.({})).resolves.toBe(true)
    expect(backup.restartForRestore).toHaveBeenCalledOnce()
  })

  it('cancels backup and restore selection without creating an operation', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const backup = {
      getStatus: vi.fn(),
      createBackup: vi.fn(),
      inspectRestore: vi.fn(),
      prepareRestore: vi.fn(),
      restartForRestore: vi.fn()
    }
    registerBusinessIpc({
      handlers,
      backup,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never,
      dialog: {
        showSaveDialog: vi.fn().mockResolvedValue({
          canceled: true
        }),
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: true,
          filePaths: []
        })
      }
    })

    await expect(
      registered.get('backup:choose-destination')?.(
        {},
        { requestId: '11111111-1111-4111-8111-111111111111' }
      )
    ).resolves.toBeNull()
    await expect(
      registered.get('restore:choose-bundle')?.({})
    ).resolves.toBeNull()
    expect(backup.createBackup).not.toHaveBeenCalled()
    expect(backup.inspectRestore).not.toHaveBeenCalled()
  })

  it.each([
    [
      'backup request',
      'backup:choose-destination',
      { requestId: 'not-a-uuid', destinationPath: '/renderer/path' },
      'command.destinationPath'
    ],
    [
      'restore checksum',
      'restore:prepare',
      {
        requestId: '11111111-1111-4111-8111-111111111111',
        previewId: 'preview-1',
        expectedChecksum: 'invalid',
        bundlePath: '/renderer/path'
      },
      'command.bundlePath'
    ],
    [
      'restore preview token',
      'restore:prepare',
      {
        requestId: '11111111-1111-4111-8111-111111111111',
        previewId: '',
        expectedChecksum: `sha256:${'a'.repeat(64)}`
      },
      'command.previewId'
    ]
  ] as const)(
    'rejects invalid %s before opening a picker or invoking a service',
    async (_label, channel, command, field) => {
      const handlers = createHandlers()
      const registered = new Map<string, (...args: unknown[]) => unknown>()
      const backup = {
        getStatus: vi.fn(),
        createBackup: vi.fn(),
        inspectRestore: vi.fn(),
        prepareRestore: vi.fn(),
        restartForRestore: vi.fn()
      }
      const showSaveDialog = vi.fn()
      registerBusinessIpc({
        handlers,
        backup,
        ipcMain: {
          handle: (
            registeredChannel: string,
            handler: (...args: unknown[]) => unknown
          ) => registered.set(registeredChannel, handler)
        } as never,
        dialog: {
          showSaveDialog,
          showOpenDialog: vi.fn()
        }
      })

      await expect(registered.get(channel)?.({}, command)).rejects.toThrow(
        `Invalid IPC payload for ${channel}: ${field}`
      )
      expect(showSaveDialog).not.toHaveBeenCalled()
      expect(backup.prepareRestore).not.toHaveBeenCalled()
    }
  )

  it('rejects malformed backup results before returning them to Renderer', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      backup: {
        getStatus: vi.fn().mockResolvedValue({
          latestBackup: {
            status: 'succeeded',
            bundleName: '/private/absolute/path'
          }
        }),
        createBackup: vi.fn(),
        inspectRestore: vi.fn(),
        prepareRestore: vi.fn(),
        restartForRestore: vi.fn()
      },
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    await expect(registered.get('backup:get-status')?.({})).rejects.toThrow(
      'Invalid IPC result for backup:get-status'
    )
  })
})

function createHandlers(): BusinessHandlers {
  const handler = (): { execute: ReturnType<typeof vi.fn> } => ({
    execute: vi.fn()
  })
  return {
    selectWorkRoot: handler(),
    listWorkRoots: handler(),
    createSpace: handler(),
    listSpaces: handler(),
    updateSpace: handler(),
    renameSpaceDirectory: handler(),
    relocateSpace: handler(),
    deleteSpace: handler(),
    restoreSpace: handler(),
    purgeSpace: handler(),
    createRequirement: handler(),
    updateRequirement: handler(),
    renameRequirementDirectory: handler(),
    deleteRequirement: handler(),
    restoreRequirement: handler(),
    purgeRequirement: handler(),
    listTrashItems: handler(),
    getRequirementWorkflow: handler(),
    getRequirementExecutionView: handler(),
    listRequirementWorkflowRevisions: handler(),
    insertWorkflowNode: handler(),
    updateWorkflowNode: handler(),
    removeWorkflowNode: handler(),
    updateWorkflowEdge: handler(),
    reorderWorkflowNodes: handler(),
    setWorkflowParallelism: handler(),
    getWorkflowNodeExecution: handler(),
    startWorkflowNode: handler(),
    pauseWorkflowNode: handler(),
    resumeWorkflowNode: handler(),
    cancelWorkflowNode: handler(),
    retryWorkflowNode: handler(),
    rollbackWorkflowToNode: handler(),
    skipWorkflowNode: handler(),
    prepareWorkflowNodeContext: handler(),
    resolveWorkflowNodeGate: handler(),
    listRequirements: handler(),
    listWorkflowTemplates: handler(),
    listWorkflowTemplateLibrary: handler(),
    listWorkflowTemplateVersions: handler(),
    getWorkflowTemplateVersion: handler(),
    getWorkflowTemplateDraft: handler(),
    listTemplateMigrationCandidates: handler(),
    previewTemplateMigration: handler(),
    applyTemplateMigration: handler(),
    createWorkflowTemplate: handler(),
    copyWorkflowTemplate: handler(),
    updateWorkflowTemplate: handler(),
    createWorkflowTemplateVersion: handler(),
    publishWorkflowTemplate: handler(),
    archiveWorkflowTemplate: handler(),
    addWorkflowTemplateNode: handler(),
    copyWorkflowTemplateNode: handler(),
    updateWorkflowTemplateNode: handler(),
    configureWorkflowTemplateNode: handler(),
    removeWorkflowTemplateNode: handler(),
    restoreWorkflowTemplateNode: handler(),
    reorderWorkflowTemplateNodes: handler(),
    updateWorkflowTemplateNodePositions: handler(),
    addWorkflowTemplateEdge: handler(),
    removeWorkflowTemplateEdge: handler(),
    listRecentConversations: handler(),
    listWorkspaceConversations: handler(),
    getConversation: handler(),
    renameConversation: handler(),
    deleteConversation: handler(),
    createConversation: handler(),
    appendConversationMessage: handler(),
    sendFollowUpSuggestion: handler(),
    listKnowledgeSources: handler(),
    listKnowledgeSourceEvents: handler(),
    getOnlineDocumentSnapshot: handler(),
    getKnowledgeIndex: handler(),
    getKnowledgeRuntimeHealth: handler(),
    listKnowledgeNotes: handler(),
    createKnowledgeNote: handler(),
    editKnowledgeNote: handler(),
    archiveKnowledgeNote: handler(),
    registerKnowledgeSource: handler(),
    ingestLocalFiles: handler(),
    refreshLocalFileSource: handler(),
    openLocalFileSource: handler(),
    ingestLocalRepository: handler(),
    ingestRemoteRepository: handler(),
    refreshRepositorySource: handler(),
    getRepositorySnapshot: handler(),
    listRepositoryBranches: handler(),
    updateRepositoryBranch: handler(),
    retryRepositoryFileIndex: handler(),
    buildKnowledgeIndex: handler(),
    refreshKnowledgeSource: handler(),
    setKnowledgeRefreshPolicy: handler(),
    searchKnowledge: handler(),
    searchCatalog: handler(),
    createOnlineDocumentSource: handler(),
    syncOnlineDocumentSource: handler(),
    retryKnowledgeSource: handler(),
    removeKnowledgeSource: handler(),
    listNodeTodos: handler(),
    saveNodeTodo: handler(),
    deleteNodeTodo: handler(),
    listNodeQuestions: handler(),
    openNodeQuestion: handler(),
    answerNodeQuestion: handler(),
    dismissNodeQuestion: handler(),
    listModels: handler(),
    listEffectiveModels: handler(),
    getApplicationModelDefault: handler(),
    saveApplicationModelDefault: handler(),
    discoverModelProviders: handler(),
    configureDiscoveredModelProvider: handler(),
    configureBuiltinModelProvider: handler(),
    saveModelProvider: handler(),
    deleteModelProvider: handler(),
    removeModelProviderCredential: handler(),
    rotateModelCredentialKey: handler(),
    saveModelProfile: handler(),
    deleteModelProfile: handler(),
    setModelProfilesEnabled: handler(),
    validateModelProfile: handler(),
    routeModel: handler(),
    queryModelStatistics: handler(),
    queryProductAnalytics: handler(),
    queryOutboundCallAudit: handler(),
    getAppSupportInfo: handler(),
    checkForUpdates: handler(),
    openSupportLink: handler(),
    listConnectors: handler(),
    saveConnector: handler(),
    deleteConnector: handler(),
    validateConnector: handler(),
    listSkills: handler(),
    installSkillFromDirectory: handler(),
    setSkillEnabled: handler(),
    verifySkillVersion: handler(),
    listSkillExecutions: handler(),
    prepareSkillExecution: handler(),
    executeSkill: handler(),
    cancelSkillExecution: handler(),
    listPermissionGrants: handler(),
    revokePermissionGrant: handler(),
    listSchedules: handler(),
    listScheduleRuns: handler(),
    createSchedule: handler(),
    updateSchedule: handler(),
    pauseSchedule: handler(),
    resumeSchedule: handler(),
    runScheduleNow: handler(),
    deleteSchedule: handler()
  } as BusinessHandlers
}

function registerHandlers() {
  const handlers = createHandlers()
  const registered = new Map<string, (...args: unknown[]) => unknown>()
  registerBusinessIpc({
    handlers,
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        registered.set(channel, handler)
      }
    } as never
  })
  return { handlers, registered }
}
