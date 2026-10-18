import { describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import {
  createAssistantTurnProjection,
  projectAssistantTurn,
  type AssistantRunEvent
} from '../../../../domain/assistant-turn'
import type { ModelRouteResult } from '../../../../domain/model'
import type { EffectiveModelSelection } from '../../../../domain/model-selection'
import type {
  ChatSessionRecord,
  ChatSessionRepository,
  Revisioned
} from '../ports/business-repositories'
import { SendConversationMessageUseCase } from './send-conversation-message'

describe('SendConversationMessageUseCase', () => {
  it('publishes targeted Turn projections after durable timeline appends', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-projection-events',
      kind: 'general',
      title: 'Projection events',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const appendAndProject = vi.fn(async () => true)
    const onProjectionUpdated = vi.fn()
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(
        () => session,
        (next) => {
          session = next
        }
      ),
      timeline: {
        appendAndProject,
        listAfter: vi.fn(async () => []),
        getSnapshot: vi.fn(async () => undefined),
        rebuildProjection: vi.fn(async () => undefined)
      },
      onProjectionUpdated,
      gateway: {
        createRun: vi.fn(async () => ({ runId: 'projection-run' })),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(
            1,
            'answer.delta',
            { delta: 'Projected answer' },
            'projection-run'
          )
          yield event(2, 'run.completed', {}, 'projection-run')
        }
      }
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'Question',
      expectedRevision: 0
    })

    expect(appendAndProject).toHaveBeenCalledTimes(2)
    expect(onProjectionUpdated).toHaveBeenCalledTimes(2)
    expect(onProjectionUpdated).toHaveBeenLastCalledWith({
      sessionId: session.id,
      turnId: expect.any(String),
      projection: expect.objectContaining({
        runId: 'projection-run',
        answer: 'Projected answer',
        status: 'completed'
      })
    })
    expect(
      appendAndProject.mock.invocationCallOrder[1]
    ).toBeLessThan(onProjectionUpdated.mock.invocationCallOrder[1])
  })

  it('uses Main default approval only for a new conversation and preserves its mode later', async () => {
    let session: Revisioned<ChatSessionRecord> | undefined
    const fresh: ChatSessionRecord = { id: 'default-approval', kind: 'general', title: 'Default',
      sortOrder: 0, turns: [], messages: [], createdAt: 1, updatedAt: 1 }
    const getDefaultApprovalProfile = vi.fn().mockResolvedValue('cautious')
    const createRun = vi.fn().mockResolvedValue({ runId: 'default-run' })
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(() => session!, next => { session = next }),
      getDefaultApprovalProfile,
      gateway: { createRun, cancelRun: vi.fn(),
        streamEvents: async function* () { yield event(1, 'run.completed', {}, 'default-run') } }
    })
    await useCase.execute({ sessionId: fresh.id, session: fresh, content: 'Hello', expectedRevision: 0 })
    expect(session?.approvalProfileId).toBe('cautious')
    getDefaultApprovalProfile.mockResolvedValue('trusted')
    await useCase.execute({ sessionId: fresh.id, content: 'Continue', expectedRevision: session!.revision })
    expect(session?.approvalProfileId).toBe('cautious')
    expect(getDefaultApprovalProfile).toHaveBeenCalledOnce()
  })

  it('persists the chosen approval mode and passes it to every new run', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-approval', kind: 'general', title: 'Approval',
      sortOrder: 0, turns: [], messages: [], revision: 0, createdAt: 1, updatedAt: 1
    }
    const createRun = vi.fn().mockResolvedValue({ runId: 'approval-run' })
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(() => session, next => { session = next }),
      gateway: {
        createRun, cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'run.completed', {}, 'approval-run')
        }
      }
    })
    await useCase.execute({
      sessionId: session.id, content: 'Hello', expectedRevision: 0,
      approvalProfileId: 'cautious'
    })
    expect(session.approvalProfileId).toBe('cautious')
    expect(createRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ approvalProfileId: 'cautious' }), undefined
    )
    await useCase.execute({
      sessionId: session.id, content: 'Continue', expectedRevision: session.revision
    })
    expect(createRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ approvalProfileId: 'cautious' }), undefined
    )
    await useCase.execute({
      sessionId: session.id, content: 'Continue again', expectedRevision: session.revision,
      approvalProfileId: 'trusted'
    })
    expect(session.approvalProfileId).toBe('trusted')
    expect(createRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ approvalProfileId: 'trusted' }), undefined
    )
  })

  it('binds a selected Skill reference to the run context for one turn', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-skill',
      kind: 'general',
      title: 'Skill',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const createRun = vi.fn().mockResolvedValue({ runId: 'skill-run' })
    const skill = {
      kind: 'skill' as const,
      id: 'builtin.skill.code_review',
      version: '1.0.2',
      digest: 'c'.repeat(64)
    }
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(
        () => session,
        (next) => {
          session = next
        }
      ),
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'run.completed', {}, 'skill-run')
        }
      }
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'Review current changes',
      expectedRevision: 0,
      capabilities: { skill }
    })

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ skill }),
      undefined
    )
  })

  it('binds selected Connector and MCP references to the run context for one turn', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-connectors',
      kind: 'general',
      title: 'Connectors',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const createRun = vi.fn().mockResolvedValue({ runId: 'connector-run' })
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(
        () => session,
        (next) => {
          session = next
        }
      ),
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'run.completed', {}, 'connector-run')
        }
      }
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'Call MCP ping',
      expectedRevision: 0,
      capabilities: {
        connectorBindings: [
          { service: 'http', connectorId: 'connector.tc-p1-invalid' }
        ],
        mcpServerIds: ['mcp.tc-p1-local']
      }
    })

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorBindings: [
          { service: 'http', connectorId: 'connector.tc-p1-invalid' }
        ],
        mcpServerIds: ['mcp.tc-p1-local']
      }),
      undefined
    )
  })

  it('rejects an unknown approval mode before persisting a message', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-invalid-approval', kind: 'general', title: 'Approval',
      sortOrder: 0, turns: [], messages: [], revision: 0, createdAt: 1, updatedAt: 1
    }
    const createRun = vi.fn()
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(() => session, next => { session = next }),
      gateway: { createRun, cancelRun: vi.fn(), streamEvents: async function* () {} }
    })
    await expect(useCase.execute({
      sessionId: session.id, content: 'Hello', expectedRevision: 0,
      approvalProfileId: 'allow-all' as never
    })).rejects.toThrow('Approval profile is invalid')
    expect(session.messages).toEqual([])
    expect(createRun).not.toHaveBeenCalled()
  })

  it('completes a system Slash Command without routing or starting a model run', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-command',
      kind: 'general',
      title: 'Commands',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const routeModel = vi.fn()
    const resolveExecution = vi.fn()
    const createRun = vi.fn()
    const recordCall = vi.fn()
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(
        () => session,
        (next) => {
          session = next
        }
      ),
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {}
      },
      models: {
        routeModel,
        resolveExecution,
        recordCall
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift()!
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: '/context',
      expectedRevision: 0
    })

    expect(result.messages.at(-1)).toMatchObject({
      id: 'message-assistant',
      status: 'completed',
      content: expect.stringContaining('上下文快照')
    })
    expect(routeModel).not.toHaveBeenCalled()
    expect(resolveExecution).not.toHaveBeenCalled()
    expect(createRun).not.toHaveBeenCalled()
    expect(recordCall).not.toHaveBeenCalled()
  })

  it('persists raw input and waits for clarification without starting a provider run', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-ambiguous',
      kind: 'general',
      title: 'Ambiguous file request',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const createRun = vi.fn().mockResolvedValue({ runId: 'provider-run-2' })
    const createWaitingInputRun = vi
      .fn()
      .mockResolvedValue({ runId: 'runtime-waiting-1' })
    const resolveWaitingInputRun = vi.fn().mockResolvedValue(undefined)
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      gateway: {
        createRun,
        createWaitingInputRun,
        resolveWaitingInputRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: '只读分析结果' }, 'provider-run-2')
          yield event(2, 'run.completed', {}, 'provider-run-2')
        }
      },
      now: () => 100,
      createId: (() => {
        const ids = [
          'message-user',
          'message-assistant',
          'message-user-2',
          'message-assistant-2'
        ]
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: '  处理一下这个文件  ',
      expectedRevision: 0,
      fileReferences: ['src/main.ts']
    })

    expect(createRun).not.toHaveBeenCalled()
    expect(createWaitingInputRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: session.id,
        pipelineVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
        processing: expect.objectContaining({
          gate: expect.objectContaining({
            status: 'clarification_required',
            sideEffects: ['可能修改或覆盖文件']
          })
        })
      }),
      expect.objectContaining({
        question: '请确认：仅分析该文件，还是允许修改或覆盖该文件？'
      })
    )
    expect(result.messages).toEqual([
      expect.objectContaining({
        id: 'message-user',
        content: '  处理一下这个文件  ',
        processing: expect.objectContaining({
          normalizedText: '处理一下这个文件'
        })
      }),
      expect.objectContaining({
        id: 'message-assistant',
        runId: 'runtime-waiting-1',
        status: 'completed',
        content: '请确认：仅分析该文件，还是允许修改或覆盖该文件？',
        execution: expect.objectContaining({
          status: 'waiting_input',
          answer: '请确认：仅分析该文件，还是允许修改或覆盖该文件？'
        })
      })
    ])

    const clarified = await useCase.execute({
      sessionId: session.id,
      content: '只分析，不修改文件',
      expectedRevision: result.revision
    })

    expect(resolveWaitingInputRun).toHaveBeenCalledWith(
      'runtime-waiting-1'
    )
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        processing: expect.objectContaining({
          semanticUnderstanding: expect.objectContaining({
            revision: 2,
            supersedesMessageId: 'message-user',
            objective: '处理一下这个文件',
            entities: [{ kind: 'file', id: 'src/main.ts' }],
            ambiguity: []
          })
        })
      }),
      undefined
    )
    expect(clarified.messages.at(-1)).toMatchObject({
      id: 'message-assistant-2',
      status: 'completed',
      content: '只读分析结果'
    })
  })

  it('starts an unrelated message as a fresh turn after a clarification wait', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-new-topic-after-wait',
      kind: 'general',
      title: 'New topic after wait',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const createRun = vi.fn().mockResolvedValue({ runId: 'provider-run-new-topic' })
    const createWaitingInputRun = vi
      .fn()
      .mockResolvedValue({ runId: 'runtime-waiting-capability' })
    const resolveWaitingInputRun = vi.fn().mockResolvedValue(undefined)
    const ids = [
      'message-user-capability',
      'message-assistant-capability',
      'message-user-new-topic',
      'message-assistant-new-topic'
    ]
    const createUseCase = () =>
      new SendConversationMessageUseCase({
        sessions: createTestRepository(
          () => session,
          (next) => {
            session = next
          }
        ),
        gateway: {
          createRun,
          createWaitingInputRun,
          resolveWaitingInputRun,
          cancelRun: vi.fn(),
          streamEvents: async function* () {
            yield event(
              1,
              'answer.delta',
              { delta: '开发者客栈是开发者服务平台。' },
              'provider-run-new-topic'
            )
            yield event(2, 'run.completed', {}, 'provider-run-new-topic')
          }
        },
        now: () => 100,
        createId: () => ids.shift() as string
      })

    const waiting = await createUseCase().execute({
      sessionId: session.id,
      content: '创建一个查询问题的 HTTP 连接器',
      expectedRevision: 0,
      capabilityReferences: ['com.example.query-connector']
    })
    const completed = await createUseCase().execute({
      sessionId: session.id,
      content: '开发者客栈是做什么的，都有哪些功能模块',
      expectedRevision: waiting.revision
    })

    expect(createWaitingInputRun).toHaveBeenCalledOnce()
    expect(resolveWaitingInputRun).toHaveBeenCalledWith(
      'runtime-waiting-capability'
    )
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: '开发者客栈是做什么的，都有哪些功能模块'
          }
        ],
        processing: expect.objectContaining({
          semanticUnderstanding: expect.objectContaining({
            sourceMessageId: 'message-user-new-topic',
            objective: '开发者客栈是做什么的，都有哪些功能模块',
            intent: 'answer',
            entities: [],
            ambiguity: [],
            revision: 1
          })
        })
      }),
      undefined
    )
    const newTopic = completed.messages.find(
      ({ id }) => id === 'message-user-new-topic'
    )
    expect(newTopic?.processing?.semanticUnderstanding).not.toHaveProperty(
      'supersedesMessageId'
    )
    expect(completed.messages.at(-1)).toMatchObject({
      id: 'message-assistant-new-topic',
      status: 'completed',
      content: '开发者客栈是开发者服务平台。'
    })
  })

  it('binds registered attachments to the user message and routes approved images to vision', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-image',
      kind: 'general',
      title: 'Image',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const beginTurn = vi.spyOn(repository, 'beginTurn')
    const prepare = vi.fn().mockResolvedValue({
      attachments: [
        {
          attachmentId: 'attachment-1',
          fileName: 'architecture.png',
          mimeType: 'image/png',
          kind: 'image',
          status: 'ready',
          extraction: 'vision'
        }
      ],
      contextText: '[附件 attachment-1: architecture.png]',
      imageParts: [
        {
          attachmentId: 'attachment-1',
          mimeType: 'image/png',
          dataBase64: 'iVBORw=='
        }
      ],
      errors: []
    })
    const routeModel = vi.fn().mockResolvedValue({
      ...selectedRoute('profile-vision', 'capability'),
      profile: {
        ...(
          selectedRoute('profile-vision', 'capability') as Extract<
            ModelRouteResult,
            { outcome: 'selected' }
          >
        ).profile,
        capabilities: {
          text: true,
          vision: true,
          toolCalling: false,
          structuredOutput: false
        }
      }
    })
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-image' })
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      attachments: {
        listByOwner: vi.fn().mockResolvedValue([
          {
            id: 'attachment-1',
            ownerId: 'draft-1',
            fileName: 'architecture.png',
            mimeType: 'image/png',
            mediaKind: 'image',
            sizeBytes: 8,
            checksumSha256: 'a'.repeat(64),
            source: 'picker',
            status: 'registered',
            createdAt: 1
          }
        ]),
        prepare
      },
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Image understood' }, 'run-image')
          yield event(2, 'run.completed', {}, 'run-image')
        }
      },
      models: {
        routeModel,
        resolveExecution: vi.fn().mockResolvedValue({
          providerType: 'local',
          baseUrl: 'http://127.0.0.1',
          modelId: 'vision-test',
          capabilities: {
            text: true,
            vision: true,
            toolCalling: false,
            structuredOutput: false
          }
        }),
        recordCall: vi.fn().mockResolvedValue(undefined)
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift()!
      })()
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'Analyze the diagram',
      expectedRevision: 0,
      attachments: {
        draftId: 'draft-1',
        attachmentIds: ['attachment-1'],
        allowImageEgress: true
      }
    })

    expect(routeModel).toHaveBeenCalledWith({
      strategy: 'capability',
      requiredCapabilities: ['text', 'vision'],
      minimumContextWindow: 1
    })
    expect(beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentBinding: {
          draftOwnerId: 'draft-1',
          attachmentIds: ['attachment-1']
        }
      })
    )
    expect(prepare).toHaveBeenCalledWith({
      attachmentIds: ['attachment-1'],
      ownerId: 'message-user',
      modelSupportsVision: true,
      allowImageEgress: true
    })
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentContext: expect.objectContaining({
          imageParts: [
            expect.objectContaining({ attachmentId: 'attachment-1' })
          ]
        })
      }),
      expect.anything()
    )
  })

  it('uses an atomic turn starter with message references before creating a run', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-node',
      kind: 'requirement_node',
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      title: 'Node',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const order: string[] = []
    const turnStarter = vi.fn(async (input) => {
      order.push('begin')
      return repository.beginTurn(input)
    })
    const afterTurnStarted = vi.fn(async () => {
      order.push('reevaluate')
    })
    const createRun = vi.fn(async () => {
      order.push('run')
      return { runId: 'run-node' }
    })
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Acknowledged' }, 'run-node')
          yield event(2, 'run.completed', {}, 'run-node')
        }
      },
      now: () => 100,
      createId: () => 'message-assistant'
    })

    await useCase.execute(
      {
        sessionId: session.id,
        session,
        content: 'Canary',
        expectedRevision: 0,
        messageId: 'message-user',
        context: '## Current node\nRelease',
        requirementNodeContext: {
          requirementId: 'requirement-1',
          nodeId: 'node-1',
          nodeRunId: 'node-run-1',
          skill: {
            kind: 'skill',
            id: 'builtin.skill.feature_implementation',
            version: '1.0.0',
            digest: 'a'.repeat(64)
          }
        },
        messageReferences: { questionId: 'question-1' },
        turnStarter,
        afterTurnStarted
      } as Parameters<SendConversationMessageUseCase['execute']>[0]
    )

    expect(order).toEqual(['begin', 'reevaluate', 'run'])
    expect(turnStarter).toHaveBeenCalledWith(
      expect.objectContaining({
        references: { questionId: 'question-1' }
      })
    )
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.stringContaining('## Current node\nRelease'),
        pipelineVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
        processing: expect.objectContaining({
          executionBrief: expect.objectContaining({
            objective: 'Canary'
          })
        }),
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        nodeId: 'node-1',
        nodeRunId: 'node-run-1',
        skill: {
          kind: 'skill',
          id: 'builtin.skill.feature_implementation',
          version: '1.0.0',
          digest: 'a'.repeat(64)
        }
      }),
      undefined
    )
  })

  it.each([
    [
      'general',
      {
        id: 'conversation-general',
        kind: 'general' as const
      },
      'general_conversation',
      {}
    ],
    [
      'folder',
      {
        id: 'conversation-folder',
        kind: 'general' as const,
        folderPath: '/workspace/folder'
      },
      'folder_conversation',
      {}
    ],
    [
      'space',
      {
        id: 'conversation-space',
        kind: 'space' as const,
        workspaceId: 'workspace-1'
      },
      'space_conversation',
      { workspaceId: 'workspace-1' }
    ],
    [
      'requirement node',
      {
        id: 'conversation-node',
        kind: 'requirement_node' as const,
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1'
      },
      'requirement_node_conversation',
      {
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        nodeId: 'node-1'
      }
    ]
  ])('maps %s conversation metrics to their source', async (
    _,
    identity,
    source,
    metricContext
  ) => {
    let session: Revisioned<ChatSessionRecord> = {
      ...identity,
      title: 'Conversation',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const recordCall = vi.fn().mockResolvedValue(undefined)
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(
        () => session,
        (next) => {
          session = next
        }
      ),
      spaceContext: {
        assertAvailable: vi.fn(),
        assembleSnapshot: vi.fn().mockResolvedValue({
          content: 'space context',
          allowedReferenceIds: [],
          insufficientKnowledge: false
        })
      },
      folderContext: { assertAvailable: vi.fn() },
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-source' }),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Answer' }, 'run-source')
          yield event(2, 'run.completed', {}, 'run-source')
        }
      },
      models: {
        routeModel: vi.fn().mockResolvedValue(
          selectedRoute('profile-source', 'fixed')
        ),
        resolveExecution: vi.fn().mockResolvedValue({
          providerType: 'local',
          baseUrl: 'http://127.0.0.1',
          modelId: 'local-test',
          displayName: 'Local Test'
        }),
        recordCall
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'Question',
      expectedRevision: 1,
      modelProfileId: 'profile-source',
      ...(Object.keys(metricContext).length > 0 ? { metricContext } : {})
    })

    expect(recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        source,
        conversationId: session.id,
        ...metricContext
      })
    )
  })

  it('records a failed metric after a local stream failure', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-stream-failure',
      kind: 'general',
      title: 'Failure',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const recordCall = vi.fn().mockResolvedValue(undefined)
    const finishTurn = vi.fn()
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const finish = repository.finishTurn
    repository.finishTurn = async (input) => {
      const result = await finish(input)
      finishTurn(input)
      return result
    }
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-stream-failure' }),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          throw new Error('https://provider.test leaked response body')
        }
      },
      models: {
        routeModel: vi.fn().mockResolvedValue(
          selectedRoute('profile-source', 'fixed')
        ),
        resolveExecution: vi.fn().mockResolvedValue({
          providerType: 'local',
          baseUrl: 'http://127.0.0.1',
          modelId: 'local-test',
          displayName: 'Local Test'
        }),
        recordCall
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'Question',
      expectedRevision: 1,
      modelProfileId: 'profile-source'
    })

    expect(finishTurn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    )
    expect(recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'general_conversation',
        aiRunId: 'run-stream-failure',
        status: 'failed',
        errorCode: 'stream_error'
      })
    )
    expect(
      finishTurn.mock.invocationCallOrder[0]
    ).toBeLessThan(recordCall.mock.invocationCallOrder[0] ?? 0)
  })

  it('appends a local stream failure after the last projected timeline sequence', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-stream-failure-control-event',
      kind: 'general',
      title: 'Failure after control event',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const appendedEvents: AssistantRunEvent[] = []
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      timeline: {
        appendAndProject: vi.fn(async (event) => {
          appendedEvents.push(event)
          return true
        }),
        listAfter: vi.fn(async () => []),
        getSnapshot: vi.fn(async () => undefined),
        rebuildProjection: vi.fn(async () => undefined)
      },
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-control-gap' }),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'partial' }, 'run-control-gap')
          yield event(2, 'run.turn_ready', {}, 'run-control-gap')
          throw new Error('stream failed after control event')
        }
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: 'Question',
      expectedRevision: 1
    })

    expect(result.messages.at(-1)).toMatchObject({ status: 'failed' })
    expect(appendedEvents.map(({ type, sequence }) => ({ type, sequence }))).toEqual([
      { type: 'answer.delta', sequence: 1 },
      { type: 'run.failed', sequence: 2 }
    ])
  })

  it('finishes from a durable terminal timeline when a stream append conflicts with it', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-stream-failure-durable-terminal',
      kind: 'general',
      title: 'Failure after external terminal projection',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const appendAndProject = vi.fn(async (event: AssistantRunEvent) => {
      if (event.sequence === 1) return true
      throw new Error('Assistant Run event conflicts with persisted fact')
    })
    const durableTerminal = projectAssistantTurn(
      projectAssistantTurn(
        createAssistantTurnProjection({
          runId: 'run-durable-terminal',
          turnId: 'message-user:turn',
          assistantMessageId: 'message-assistant',
          startedAt: 100
        }),
        {
          id: 'event-1',
          runId: 'run-durable-terminal',
          sequence: 1,
          type: 'answer.delta',
          timestamp: 100,
          data: { delta: 'partial' }
        }
      ),
      {
        id: 'external-permission-denied',
        runId: 'run-durable-terminal',
        sequence: 2,
        type: 'run.failed',
        timestamp: 110,
        data: {
          message: 'Permission denied by user',
          errorCode: 'permission_denied'
        }
      }
    )
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      timeline: {
        appendAndProject,
        listAfter: vi.fn(async () => []),
        getSnapshot: vi.fn(async () => durableTerminal),
        rebuildProjection: vi.fn(async () => undefined)
      },
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-durable-terminal' }),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'partial' }, 'run-durable-terminal')
          yield event(2, 'answer.delta', { delta: 'after conflict' }, 'run-durable-terminal')
        }
      },
      now: () => 120,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: 'Question',
      expectedRevision: 1
    })

    expect(result.messages.at(-1)).toMatchObject({
      status: 'failed',
      content: 'partial',
      error: 'Permission denied by user'
    })
    expect(appendAndProject).toHaveBeenCalledTimes(2)
  })

  it('continues from a durable permission timeline when a stream append conflicts with it', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-stream-conflict-durable-permission',
      kind: 'general',
      title: 'Continue after external permission projection',
      sortOrder: 0,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const appendAndProject = vi.fn(async (event: AssistantRunEvent) => {
      if (event.sequence === 2) {
        throw new Error('Assistant Run event conflicts with persisted fact')
      }
      return true
    })
    const afterAnswer = projectAssistantTurn(
      createAssistantTurnProjection({
        runId: 'run-durable-permission',
        turnId: 'message-user:turn',
        assistantMessageId: 'message-assistant',
        startedAt: 100
      }),
      {
        id: 'event-1',
        runId: 'run-durable-permission',
        sequence: 1,
        type: 'answer.delta',
        timestamp: 100,
        data: { delta: 'partial' }
      }
    )
    const durablePermission = projectAssistantTurn(
      projectAssistantTurn(afterAnswer, {
        id: 'external-tool-requested',
        runId: 'run-durable-permission',
        sequence: 2,
        type: 'tool.call.requested',
        timestamp: 110,
        data: {
          callId: 'call-1',
          toolName: 'bash',
          category: 'command',
          argumentsSummary: 'write file'
        }
      }),
      {
        id: 'external-permission-required',
        runId: 'run-durable-permission',
        sequence: 3,
        type: 'tool.call.permission_required',
        timestamp: 111,
        data: {
          callId: 'call-1',
          toolExecutionId: 'exec-1',
          message: 'Allow bash?'
        }
      }
    )
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      timeline: {
        appendAndProject,
        listAfter: vi.fn(async () => []),
        getSnapshot: vi.fn(async () => durablePermission),
        rebuildProjection: vi.fn(async () => undefined)
      },
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-durable-permission' }),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'partial' }, 'run-durable-permission')
          yield event(
            2,
            'tool.call.requested',
            {
              toolCall: {
                index: 0,
                id: 'call-1',
                name: 'bash',
                arguments: '{"command":"write"}'
              }
            },
            'run-durable-permission'
          )
          yield event(
            3,
            'tool.call.permission_required',
            {
              callId: 'call-1',
              toolExecutionId: 'exec-1',
              message: 'Allow bash?'
            },
            'run-durable-permission'
          )
          yield event(
            4,
            'tool.call.completed',
            {
              toolResult: {
                callId: 'call-1',
                status: 'completed',
                output: { ok: true },
                toolExecutionId: 'exec-1',
                resultSummary: 'wrote file'
              }
            },
            'run-durable-permission'
          )
          yield event(5, 'run.completed', {}, 'run-durable-permission')
        }
      },
      now: () => 120,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: 'Question',
      expectedRevision: 1
    })

    expect(result.messages.at(-1)).toMatchObject({
      status: 'completed',
      content: 'partial'
    })
    expect(appendAndProject.mock.calls.some(([event]) => event.sequence === 4)).toBe(true)
    expect(appendAndProject.mock.calls.some(([event]) => event.type === 'run.failed')).toBe(false)
  })

  it('fails the committed assistant turn when post-start reevaluation fails', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-node-failed',
      kind: 'requirement_node',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      title: 'Node',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const createRun = vi.fn()
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {}
      },
      now: () => 100,
      createId: () => 'message-assistant'
    })

    const result = await useCase.execute({
      sessionId: session.id,
      session,
      content: 'Canary',
      expectedRevision: 0,
      messageId: 'message-user',
      afterTurnStarted: vi
        .fn()
        .mockRejectedValue(new Error('gate evaluation failed'))
    })

    expect(createRun).not.toHaveBeenCalled()
    expect(result.messages).toEqual([
      expect.objectContaining({ id: 'message-user', status: 'completed' }),
      expect.objectContaining({
        id: 'message-assistant',
        status: 'failed',
        error: 'gate evaluation failed'
      })
    ])
  })

  it('validates and assembles space context before beginning a turn', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-space',
      kind: 'space',
      workspaceId: 'workspace-1',
      title: 'Space',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const order: string[] = []
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const beginTurn = repository.beginTurn
    repository.beginTurn = async (input) => {
      order.push('begin')
      return beginTurn(input)
    }
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-space' })
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      spaceContext: {
        assertAvailable: vi.fn(async () => {
          order.push('validate')
        }),
        assembleSnapshot: vi.fn(async () => {
          order.push('assemble')
          return {
            content: '## Space knowledge\nLocal checkout rules',
            allowedReferenceIds: [],
            insufficientKnowledge: false
          }
        })
      },
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Space answer' }, 'run-space')
          yield event(2, 'run.completed', {}, 'run-space')
        }
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    await useCase.execute({
      sessionId: session.id,
      content: '  checkout retry  ',
      expectedRevision: 1
    })

    expect(order).toEqual(['validate', 'assemble', 'begin'])
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-space',
        workspaceId: 'workspace-1',
        context: expect.stringContaining(
          '## Space knowledge\nLocal checkout rules'
        ),
        processing: expect.objectContaining({
          normalizedText: 'checkout retry'
        })
      }),
      undefined
    )
    expect(createRun.mock.calls[0]?.[0]).not.toHaveProperty('folderPath')
  })

  it('continues with a traceable degradation when optional space context retrieval fails', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-space',
      kind: 'space',
      workspaceId: 'workspace-1',
      title: 'Space',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-degraded' })
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      spaceContext: {
        assertAvailable: vi.fn(),
        assembleSnapshot: vi.fn().mockRejectedValue(
          new Error('读取空间知识失败，请重试')
        )
      },
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Degraded answer' }, 'run-degraded')
          yield event(2, 'run.completed', {}, 'run-degraded')
        }
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: 'conversation-space',
      content: 'checkout',
      expectedRevision: 1
    })

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.stringContaining('## Execution brief'),
        processing: expect.objectContaining({
          diagnostics: [
            {
              processorId: 'builtin.conversation-context',
              level: 'degraded',
              message: '读取空间知识失败，请重试'
            }
          ]
        })
      }),
      undefined
    )
    expect(result.messages.at(-1)?.content).toBe('Degraded answer')
  })

  it('persists generated artifacts on the completed assistant message', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-artifacts',
      kind: 'general',
      title: 'Artifacts',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const finalizeRun = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      generatedArtifacts: [
        {
          path: '/workspace/report.pdf',
          name: 'report.pdf',
          mediaType: 'application/pdf',
          sizeBytes: 1024,
          kind: 'pdf'
        }
      ]
    })
    const finishTurn = vi.spyOn(repository, 'finishTurn')
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      generatedArtifacts: { finalizeRun },
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-artifacts' }),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Report is ready.' }, 'run-artifacts')
          yield event(2, 'run.completed', {}, 'run-artifacts')
        }
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: 'Create report',
      expectedRevision: 1
    })

    expect(finalizeRun).toHaveBeenCalledWith({
      conversationId: session.id,
      assistantMessageId: 'message-assistant',
      runId: 'run-artifacts',
      status: 'completed'
    })
    expect(finishTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          schemaVersion: 1,
          generatedArtifacts: [
            {
              path: '/workspace/report.pdf',
              name: 'report.pdf',
              mediaType: 'application/pdf',
              sizeBytes: 1024,
              kind: 'pdf'
            }
          ]
        }
      })
    )
    expect(result.messages.at(-1)?.source).toEqual({
      schemaVersion: 1,
      generatedArtifacts: [
        expect.objectContaining({ path: '/workspace/report.pdf' })
      ]
    })
  })

  it('completes with a local artifact summary when the provider finishes without answer text', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-empty-artifacts',
      kind: 'general',
      title: 'Empty artifact answer',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const finalizeRun = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      generatedArtifacts: [
        {
          path: '/workspace/resume.pdf',
          name: 'resume.pdf',
          mediaType: 'application/pdf',
          sizeBytes: 2048,
          kind: 'pdf'
        }
      ]
    })
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      generatedArtifacts: { finalizeRun },
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-empty-artifacts' }),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'run.completed', {}, 'run-empty-artifacts')
        }
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: '生成简历 PDF',
      expectedRevision: 1
    })

    expect(result.messages.at(-1)).toMatchObject({
      role: 'assistant',
      status: 'completed',
      content: '已生成文件：resume.pdf',
      source: {
        schemaVersion: 1,
        generatedArtifacts: [
          expect.objectContaining({ path: '/workspace/resume.pdf' })
        ]
      }
    })
  })

  it('completes with a local completion summary when the provider finishes without answer text or artifacts', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-empty-completed',
      kind: 'general',
      title: 'Empty completed answer',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const finishTurn = vi.spyOn(repository, 'finishTurn')
    const projectedAnswers: string[] = []
    const finalizeRun = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      generatedArtifacts: []
    })
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      generatedArtifacts: { finalizeRun },
      timeline: {
        appendAndProject: vi.fn(async (_event, projection) => {
          projectedAnswers.push(projection.answer)
          return true
        }),
        listAfter: vi.fn(async () => []),
        getSnapshot: vi.fn(async () => undefined),
        rebuildProjection: vi.fn(async () => undefined)
      },
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-empty-completed' }),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(
            1,
            'execution.summary.delta',
            { delta: '正在核对文件状态', source: 'provider' },
            'run-empty-completed'
          )
          yield event(2, 'run.completed', {}, 'run-empty-completed')
        }
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: '检查并生成简历 PDF',
      expectedRevision: 1
    })

    expect(result.messages.at(-1)).toMatchObject({
      role: 'assistant',
      status: 'completed',
      content: '任务已完成，但模型没有返回最终总结。请查看执行详情确认处理过程。'
    })
    expect(projectedAnswers.at(-1)).toBe(
      finishTurn.mock.calls.at(-1)?.[0].content
    )
  })

  it('retrieves all active workspaces for every turn of an all-workspaces conversation', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-all',
      kind: 'general',
      knowledgeScope: { kind: 'all_workspaces' },
      title: 'All workspaces',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const assembleSnapshot = vi.fn().mockResolvedValue({
      content: '## Space knowledge / Workspace One\nShared release rules',
      allowedReferenceIds: [],
      insufficientKnowledge: false
    })
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-all' })
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      spaceContext: {
        assertAvailable: vi.fn(),
        assembleSnapshot
      },
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Answer' }, 'run-all')
          yield event(2, 'run.completed', {}, 'run-all')
        }
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'release',
      expectedRevision: 1
    })

    expect(assembleSnapshot).toHaveBeenCalledWith(
      { kind: 'all_workspaces' },
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'original',
          query: 'release'
        }),
        expect.objectContaining({
          kind: 'keyword',
          query: 'release'
        }),
        expect.objectContaining({
          kind: 'semantic',
          query: 'release'
        })
      ])
    )
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: session.id,
        context: expect.stringContaining('Workspace One')
      }),
      undefined
    )
    expect(createRun.mock.calls[0]?.[0]).not.toHaveProperty('workspaceId')
  })

  it('skips local knowledge dependencies for a none-scoped conversation', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-none',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'No knowledge',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const assembleSnapshot = vi.fn()
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-none' })
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      spaceContext: {
        assertAvailable: vi.fn(),
        assembleSnapshot
      },
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Answer' }, 'run-none')
          yield event(2, 'run.completed', {}, 'run-none')
        }
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'release',
      expectedRevision: 1
    })

    expect(assembleSnapshot).not.toHaveBeenCalled()
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.stringContaining('## Execution brief'),
        processing: expect.objectContaining({
          normalizedText: 'release'
        })
      }),
      undefined
    )
  })

  it('validates a persisted folder binding before routing or beginning a turn', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-folder',
      kind: 'general',
      folderPath: '/canonical/project',
      title: 'Folder',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const order: string[] = []
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const beginTurn = repository.beginTurn
    repository.beginTurn = async (input) => {
      order.push('begin')
      return beginTurn(input)
    }
    const createRun = vi.fn(async () => {
      order.push('run')
      return { runId: 'run-folder' }
    })
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      folderContext: {
        assertAvailable: vi.fn(async () => {
          order.push('folder')
        })
      },
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Folder answer' }, 'run-folder')
          yield event(2, 'run.completed', {}, 'run-folder')
        }
      },
      models: {
        routeModel: vi.fn(async () => {
          order.push('route')
          return selectedRoute('profile-1', 'capability')
        }),
        resolveExecution: vi.fn().mockResolvedValue({
          providerType: 'local',
          baseUrl: 'http://127.0.0.1',
          modelId: 'local-test'
        }),
        recordCall: vi.fn().mockResolvedValue(undefined)
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'Inspect this folder',
      expectedRevision: 1
    })

    expect(order).toEqual(['folder', 'route', 'begin', 'run'])
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ folderPath: '/canonical/project' }),
      expect.anything()
    )
  })

  it('leaves a folder conversation unchanged when its directory is unavailable', async () => {
    const session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-folder-missing',
      kind: 'general',
      folderPath: '/missing/project',
      title: 'Folder',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const beginTurn = vi.fn()
    const createRun = vi.fn()
    const routeModel = vi.fn()
    const useCase = new SendConversationMessageUseCase({
      sessions: {
        get: vi.fn().mockResolvedValue(session),
        listByWorkspace: async () => [],
        listByNodeRun: async () => [],
        listRecent: async () => ({
          conversations: [],
          folderPaths: [],
          totalCount: 0
        }),
        delete: async () => false,
        save: vi.fn(),
        beginTurn,
        bindTurnRun: vi.fn(),
        markTurnRetrying: vi.fn(),
        finishTurn: vi.fn(),
        recoverPendingTurns: vi.fn()
      },
      folderContext: {
        assertAvailable: vi
          .fn()
          .mockRejectedValue(
            new Error('绑定的文件夹不可用，请检查目录后重试')
          )
      },
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {}
      },
      models: {
        routeModel,
        resolveExecution: vi.fn(),
        recordCall: vi.fn()
      }
    })

    await expect(
      useCase.execute({
        sessionId: session.id,
        content: 'Inspect this folder',
        expectedRevision: 1
      })
    ).rejects.toThrow('绑定的文件夹不可用，请检查目录后重试')
    expect(routeModel).not.toHaveBeenCalled()
    expect(beginTurn).not.toHaveBeenCalled()
    expect(createRun).not.toHaveBeenCalled()
  })

  it('persists the user and streamed assistant messages and records metrics', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-1',
      kind: 'general',
      title: 'Hello',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const recordCall = vi.fn().mockResolvedValue(undefined)
    const routeModel = vi.fn().mockResolvedValue(
      selectedRoute('profile-local', 'fixed')
    )
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-1' })
    const events: AiRunEvent[] = [
      event(1, 'run.started', {}),
      event(2, 'answer.delta', { delta: 'Hello ' }),
      event(3, 'answer.delta', { delta: 'world' }),
      event(4, 'run.completed', {
        usage: {
          inputTokens: 5,
          outputTokens: 2,
          cachedTokens: 1,
          reasoningTokens: 0
        },
        firstTokenLatencyMs: 12,
        durationMs: 30,
        retryCount: 0
      })
    ]
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(
        () => session,
        (next) => {
          session = next
        }
      ),
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield* events
        }
      },
      models: {
        routeModel,
        resolveExecution: vi.fn().mockResolvedValue({
          providerType: 'local',
          baseUrl: 'http://127.0.0.1',
          modelId: 'local-test',
          displayName: 'Local Test'
        }),
        recordCall
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: 'Hi',
      expectedRevision: 1,
      modelProfileId: 'profile-local',
      reasoningMode: 'high'
    })

    expect(result.messages).toEqual([
      expect.objectContaining({ id: 'message-user', role: 'user', content: 'Hi' }),
      expect.objectContaining({
        id: 'message-assistant',
        role: 'assistant',
        modelName: 'Local Test',
        content: 'Hello world'
      })
    ])
    expect(recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'general_conversation',
        modelProfileId: 'profile-local',
        conversationId: 'conversation-1',
        aiRunId: 'run-1',
        inputTokens: 5,
        outputTokens: 2,
        status: 'completed'
      })
    )
    expect(routeModel).toHaveBeenCalledWith({
      strategy: 'fixed',
      profileId: 'profile-local'
    })
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ requestedReasoning: 'high' }),
      expect.anything()
    )
  })

  it('automatically routes an unpinned conversation and records the selected profile', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-auto',
      kind: 'general',
      title: 'Auto',
      sortOrder: 1,
      turns: [
        {
          id: 'previous-turn',
          sessionId: 'conversation-auto',
          index: 0,
          userMessageId: 'previous-user',
          assistantMessageId: 'previous-assistant',
          status: 'failed',
          createdAt: 1,
          completedAt: 1
        }
      ],
      messages: [
        {
          id: 'previous-user',
          turnId: 'previous-turn',
          role: 'user',
          status: 'completed',
          content: 'Previous request',
          sortOrder: 0,
          createdAt: 1
        },
        {
          id: 'previous-assistant',
          turnId: 'previous-turn',
          role: 'assistant',
          status: 'failed',
          content: '',
          error: 'Provider failed',
          sortOrder: 1,
          createdAt: 1,
          completedAt: 1
        }
      ],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const routeModel = vi
      .fn()
      .mockResolvedValue(selectedRoute('profile-routed', 'capability'))
    const recordCall = vi.fn().mockResolvedValue(undefined)
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-1' })
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(
        () => session,
        (next) => {
          session = next
        }
      ),
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Routed answer' })
          yield event(2, 'run.completed', {})
        }
      },
      models: {
        routeModel,
        resolveExecution: vi.fn().mockResolvedValue({
          providerType: 'local',
          baseUrl: 'http://127.0.0.1',
          modelId: 'routed'
        }),
        recordCall
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'Route this',
      expectedRevision: 1
    })

    expect(routeModel).toHaveBeenCalledWith({
      strategy: 'capability',
      requiredCapabilities: ['text'],
      minimumContextWindow: 1
    })
    expect(recordCall).toHaveBeenCalledWith(
      expect.objectContaining({ modelProfileId: 'profile-routed' })
    )
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedReasoning: 'auto',
        historicalFailureCount: 1
      }),
      expect.anything()
    )
  })

  it('uses the deterministic conversation fallback resolver when available', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-default',
      kind: 'general',
      title: 'Default',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const routeModel = vi.fn()
    const resolveConversationModel = vi
      .fn()
      .mockResolvedValue(selectedConversation('profile-default', 'default'))
    const useCase = new SendConversationMessageUseCase({
      sessions: createTestRepository(
        () => session,
        (next) => {
          session = next
        }
      ),
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-default' }),
        cancelRun: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'answer.delta', { delta: 'Default answer' }, 'run-default')
          yield event(2, 'run.completed', {}, 'run-default')
        }
      },
      models: {
        routeModel,
        resolveConversationModel,
        resolveExecution: vi.fn().mockResolvedValue({
          providerType: 'local',
          baseUrl: 'http://127.0.0.1',
          modelId: 'default'
        }),
        recordCall: vi.fn().mockResolvedValue(undefined)
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    await useCase.execute({
      sessionId: session.id,
      content: 'Use my default',
      expectedRevision: 1,
      modelProfileId: 'profile-missing'
    })

    expect(resolveConversationModel).toHaveBeenCalledWith('profile-missing')
    expect(routeModel).not.toHaveBeenCalled()
    expect(session.modelProfileId).toBe('profile-missing')
  })

  it.each([
    {
      failure: 'quota rejection',
      errorCode: 'provider_rejected' as const,
      message:
        'Model service quota is insufficient. Add credits or switch model.'
    },
    {
      failure: 'provider timeout',
      errorCode: 'provider_timeout' as const,
      message: 'Provider request timed out'
    },
    {
      failure: 'provider unavailability',
      errorCode: 'provider_unavailable' as const,
      message: 'Provider is temporarily unavailable'
    },
    {
      failure: 'provider rate limit',
      errorCode: 'provider_rate_limited' as const,
      message: 'Provider rate limit exceeded'
    }
  ])('falls back to another provider after an automatic $failure', async ({
    errorCode,
    message
  }) => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-provider-fallback',
      kind: 'general',
      title: 'Provider fallback',
      sortOrder: 1,
      turns: [],
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const repository = createTestRepository(
      () => session,
      (next) => {
        session = next
      }
    )
    const markTurnRetrying = vi.spyOn(repository, 'markTurnRetrying')
    const createRun = vi
      .fn()
      .mockResolvedValueOnce({ runId: 'run-deepseek' })
      .mockResolvedValueOnce({ runId: 'run-volcengine' })
    const recordCall = vi.fn().mockResolvedValue(undefined)
    const useCase = new SendConversationMessageUseCase({
      sessions: repository,
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* (runId) {
          if (runId === 'run-deepseek') {
            yield event(
              1,
              'run.failed',
              {
                message,
                errorCode,
                durationMs: 10,
                retryCount: 0
              },
              runId
            )
            return
          }
          yield event(1, 'answer.delta', { delta: 'Fallback answer' }, runId)
          yield event(2, 'run.completed', { durationMs: 20 }, runId)
        }
      },
      models: {
        routeModel: vi.fn(),
        resolveConversationModel: vi.fn().mockResolvedValue({
          outcome: 'selected',
          reason: 'first_available',
          provider: {
            id: 'provider-deepseek',
            type: 'openai_completions',
            name: 'DeepSeek',
            baseUrl: 'https://deepseek.example',
            enabled: true,
            revision: 1
          },
          profile: {
            ...selectedConversation('profile-deepseek', 'first_available')
              .profile,
            id: 'profile-deepseek',
            providerId: 'provider-deepseek',
            displayName: 'DeepSeek-V4.1-Flash'
          }
        }),
        resolveConversationFallbackModel: vi.fn().mockResolvedValue({
          outcome: 'selected',
          reason: 'first_available',
          provider: {
            id: 'provider-volcengine',
            type: 'openai_completions',
            name: 'VolcEngine',
            baseUrl: 'https://volcengine.example',
            enabled: true,
            revision: 1
          },
          profile: {
            ...selectedConversation('profile-volcengine', 'first_available')
              .profile,
            id: 'profile-volcengine',
            providerId: 'provider-volcengine',
            displayName: 'Doubao Seed 2.1 Pro'
          }
        }),
        resolveExecution: vi.fn(async (profileId) => ({
          providerType: 'openai_completions' as const,
          providerId:
            profileId === 'profile-deepseek'
              ? 'provider-deepseek'
              : 'provider-volcengine',
          modelProfileId: profileId,
          baseUrl: 'https://provider.example',
          modelId: profileId,
          displayName:
            profileId === 'profile-deepseek'
              ? 'DeepSeek-V4.1-Flash'
              : 'Doubao Seed 2.1 Pro',
          timeoutMs: 120_000,
          maxRetries: 0,
          maxConcurrency: 1,
          apiKey: 'secret'
        })),
        recordCall
      },
      now: (() => {
        let value = 100
        return () => value++
      })(),
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: 'Use an available provider',
      expectedRevision: 1
    })

    expect(createRun).toHaveBeenCalledTimes(2)
    expect(markTurnRetrying).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-deepseek',
        modelName: 'Doubao Seed 2.1 Pro'
      })
    )
    expect(recordCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        modelProfileId: 'profile-deepseek',
        status: 'failed'
      })
    )
    expect(recordCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        modelProfileId: 'profile-volcengine',
        status: 'completed'
      })
    )
    expect(result.messages.at(-1)).toMatchObject({
      status: 'completed',
      content: 'Fallback answer',
      runId: 'run-deepseek',
      modelName: 'Doubao Seed 2.1 Pro'
    })
  })

  it('does not persist a message or create a run when routing is unavailable', async () => {
    const save = vi.fn()
    const beginTurn = vi.fn()
    const createRun = vi.fn()
    const useCase = new SendConversationMessageUseCase({
      sessions: {
        get: vi.fn().mockResolvedValue({
          id: 'conversation-unavailable',
          kind: 'general',
          title: 'Unavailable',
          sortOrder: 1,
          turns: [],
          messages: [],
          revision: 1,
          createdAt: 1,
          updatedAt: 1
        }),
        listByWorkspace: async () => [],
        listByNodeRun: async () => [],
        listRecent: async () => ({
          conversations: [],
          folderPaths: [],
          totalCount: 0
        }),
        delete: async () => false,
        save,
        beginTurn,
        bindTurnRun: vi.fn(),
        markTurnRetrying: vi.fn(),
        finishTurn: vi.fn(),
        recoverPendingTurns: vi.fn()
      },
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        streamEvents: async function* () {}
      },
      models: {
        routeModel: vi.fn().mockResolvedValue({
          outcome: 'unavailable',
          code: 'no_capability_match',
          message: 'No enabled model satisfies text'
        }),
        resolveExecution: vi.fn(),
        recordCall: vi.fn()
      }
    })

    await expect(
      useCase.execute({
        sessionId: 'conversation-unavailable',
        content: 'Hello',
        expectedRevision: 1
      })
    ).rejects.toThrow('No enabled model satisfies text')
    expect(save).not.toHaveBeenCalled()
    expect(beginTurn).not.toHaveBeenCalled()
    expect(createRun).not.toHaveBeenCalled()
  })
})

function createTestRepository(
  read: () => Revisioned<ChatSessionRecord>,
  write: (session: Revisioned<ChatSessionRecord>) => void
): ChatSessionRepository {
  return {
    get: async () => structuredClone(read()),
    listByWorkspace: async () => [],
    listByNodeRun: async () => [],
    listRecent: async () => ({
      conversations: [],
      folderPaths: [],
      totalCount: 0
    }),
    delete: async () => false,
    save: async (entity, expectedRevision) => {
      const next = { ...entity, revision: expectedRevision + 1 }
      write(next)
      return { status: 'saved', entity: structuredClone(next) }
    },
    beginTurn: async (input) => {
      const current = { ...read(), ...input.session }
      const turnId = `${input.userMessageId}:turn`
      const next: Revisioned<ChatSessionRecord> = {
        ...current,
        revision: current.revision + 1,
        turns: [
          ...current.turns,
          {
            id: turnId,
            sessionId: current.id,
            index: current.turns.length,
            userMessageId: input.userMessageId,
            assistantMessageId: input.assistantMessageId,
            status: 'pending',
            createdAt: input.createdAt
          }
        ],
        messages: [
          ...current.messages,
          {
            id: input.userMessageId,
            turnId,
            role: 'user',
            status: 'completed',
            content: input.content,
            ...(input.processing ? { processing: input.processing } : {}),
            ...input.references,
            sortOrder: current.messages.length,
            createdAt: input.createdAt
          },
          {
            id: input.assistantMessageId,
            turnId,
            role: 'assistant',
            status: 'pending',
            content: '',
            ...(input.modelName ? { modelName: input.modelName } : {}),
            sortOrder: current.messages.length + 1,
            createdAt: input.createdAt
          }
        ]
      }
      write(next)
      return { status: 'started', entity: structuredClone(next) }
    },
    bindTurnRun: async (input) => {
      const current = read()
      const next: Revisioned<ChatSessionRecord> = {
        ...current,
        revision: current.revision + 1,
        turns: current.turns.map((turn) =>
          turn.assistantMessageId === input.assistantMessageId
            ? { ...turn, runId: input.runId, status: 'running' }
            : turn
        ),
        messages: current.messages.map((message) =>
          message.id === input.assistantMessageId
            ? { ...message, runId: input.runId }
            : message
        )
      }
      write(next)
      return { status: 'updated', entity: structuredClone(next) }
    },
    markTurnRetrying: async (input) => {
      const current = read()
      if (
        current.revision !== input.expectedRevision ||
        current.messages.find(
          (message) => message.id === input.assistantMessageId
        )?.runId !== input.runId
      ) {
        return { status: 'conflict', entity: structuredClone(current) }
      }
      const next: Revisioned<ChatSessionRecord> = {
        ...current,
        revision: current.revision + 1,
        turns: current.turns.map((turn) =>
          turn.assistantMessageId === input.assistantMessageId
            ? {
                ...turn,
                status: 'retrying'
              }
            : turn
        ),
        messages: current.messages.map((message) =>
          message.id === input.assistantMessageId
            ? {
                ...message,
                modelName: input.modelName
              }
            : message
        )
      }
      write(next)
      return { status: 'updated', entity: structuredClone(next) }
    },
    finishTurn: async (input) => {
      const current = read()
      const next: Revisioned<ChatSessionRecord> = {
        ...current,
        revision: current.revision + 1,
        turns: current.turns.map((turn) =>
          turn.assistantMessageId === input.assistantMessageId
            ? {
                ...turn,
                status: input.status,
                completedAt: input.updatedAt
              }
            : turn
        ),
        messages: current.messages.map((message) =>
          message.id === input.assistantMessageId
            ? {
                ...message,
                status: input.status,
                content: input.content,
                ...(input.source ? { source: input.source } : {}),
                ...(input.error ? { error: input.error } : {})
              }
            : message
        )
      }
      write(next)
      return { status: 'updated', entity: structuredClone(next) }
    },
    recoverPendingTurns: async () => 0
  }
}

function selectedRoute(
  profileId: string,
  reason: 'fixed' | 'capability'
): ModelRouteResult {
  return {
    outcome: 'selected',
    reason,
    profile: {
      id: profileId,
      providerId: 'provider-local',
      modelId: 'local-test',
      displayName: 'Local Test',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: false,
        structuredOutput: false
      },
      contextWindow: 32_000,
      timeoutMs: 120_000,
      maxRetries: 2,
      maxConcurrency: 4,
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
      revision: 1
    },
    provider: {
      id: 'provider-local',
      type: 'local',
      name: 'Local',
      baseUrl: 'http://127.0.0.1',
      enabled: true,
      revision: 1
    }
  }
}

function selectedConversation(
  profileId: string,
  reason: 'conversation' | 'default' | 'first_available'
): Extract<EffectiveModelSelection, { outcome: 'selected' }> {
  const selected = selectedRoute(profileId, 'fixed')
  if (selected.outcome === 'unavailable') {
    throw new Error('Expected a selected model route')
  }
  return {
    ...selected,
    reason
  }
}

function event(
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data'],
  runId = 'run-1'
): AiRunEvent {
  return {
    id: `event-${sequence}`,
    runId,
    sequence,
    type,
    timestamp: '2026-09-17T00:00:00.000Z',
    data
  }
}
