import { randomUUID } from 'node:crypto'
import type { AiRunEvent } from '../../../../domain/ai-run'
import {
  createAssistantTurnProjection,
  type AssistantTurnProjection
} from '../../../../domain/assistant-turn'
import { resolveAgentRunScenario } from '../../../../domain/agent-runtime'
import {
  ConversationProcessorPipeline,
  createBuiltinConversationProcessors,
  type ConversationProcessingGate,
  type ConversationProcessingSnapshot,
  type ConversationProcessor,
  type RetrievalQuery
} from '../../../../domain/conversation-processor'
import {
  ModelRoutingError,
  type ModelCapability,
  type ModelCallErrorCode,
  type ModelCallSource,
  type ModelExecutionConfig,
  type ModelRouteRequest,
  type ModelRouteResult
} from '../../../../domain/model'
import type {
  ConversationAttachmentDescriptor,
  ConversationAttachmentEnvelope
} from '../../../../domain/conversation-input'
import type { ConversationGeneratedArtifactSource } from '../../../../domain/follow-up-suggestion'
import type { ConversationAttachmentSubmission } from '../../../../shared/conversation-attachments'
import type { EffectiveModelSelection } from '../../../../domain/model-selection'
import type { ReasoningPreference } from '../../../../domain/reasoning-router'
import { resolveResponseLanguage } from '../../../../domain/response-language'
import type { KnowledgeSearchScope } from '../../../../domain/knowledge-search'
import type {
  ChatSessionRecord,
  ChatSessionRepository,
  AssistantRunTimelineRepository,
  Revisioned
} from '../ports/business-repositories'
import {
  projectConversationRunEvent,
  toAssistantRunEvent
} from './assistant-turn-projector'
import {
  applyConversationHistoryCommands,
  ConversationSlashCommandHandler,
  type ConversationSlashCommandExecution
} from './conversation-slash-command-handler'
import type {
  ConversationContext,
  RequirementNodeConversationContext
} from '../../ai-run/application/ports'
import type { FollowUpSuggestionGenerationInput } from './follow-up-suggestion-coordinator'

type BeginTurnInput = Parameters<ChatSessionRepository['beginTurn']>[0]
type RequirementNodeRunContext = Pick<
  RequirementNodeConversationContext,
  'requirementId' | 'nodeId' | 'nodeRunId' | 'skill'
>

const AUTOMATIC_FALLBACK_ERROR_CODES = new Set<ModelCallErrorCode>([
  'provider_rate_limited',
  'provider_timeout',
  'provider_unavailable'
])

type Dependencies = {
  sessions: ChatSessionRepository
  timeline?: AssistantRunTimelineRepository
  spaceContext?: {
    assertAvailable: (workspaceId: string) => Promise<void>
    assemble: (
      workspaceId: string,
      query: string | readonly RetrievalQuery[]
    ) => Promise<string | undefined>
    assembleScope?: (
      scope: KnowledgeSearchScope,
      query: string | readonly RetrievalQuery[]
    ) => Promise<string | undefined>
    assembleSnapshot?: (
      scope: KnowledgeSearchScope,
      query: string | readonly RetrievalQuery[]
    ) => Promise<NonNullable<ConversationProcessingSnapshot['knowledgeContext']>>
  }
  folderContext?: {
    assertAvailable: (folderPath: string) => Promise<void>
  }
  gateway: {
    createRun: (
      context: ConversationContext,
      model?: ModelExecutionConfig
    ) => Promise<{ runId: string }>
    streamEvents: (
      runId: string,
      signal: AbortSignal
    ) => AsyncIterable<AiRunEvent>
    cancelRun: (runId: string) => Promise<void>
    createWaitingInputRun?: (
      context: ConversationContext,
      gate: Extract<
        ConversationProcessingGate,
        { status: 'clarification_required' }
      >
    ) => Promise<{ runId: string }>
    resolveWaitingInputRun?: (runId: string) => Promise<void>
  }
  processing?: Pick<ConversationProcessorPipeline, 'run' | 'version'>
  slashCommands?: Pick<ConversationSlashCommandHandler, 'execute'>
  attachments?: {
    listByOwner: (
      ownerId: string
    ) => Promise<ConversationAttachmentDescriptor[]>
    prepare: (input: {
      attachmentIds: readonly string[]
      ownerId: string
      modelSupportsVision: boolean
      allowImageEgress: boolean
    }) => Promise<ConversationAttachmentEnvelope>
  }
  models?: {
    routeModel: (request: ModelRouteRequest) => Promise<ModelRouteResult>
    resolveConversationModel?: (
      profileId?: string
    ) => Promise<EffectiveModelSelection>
    resolveConversationFallbackModel?: (
      excludedProviderIds: readonly string[]
    ) => Promise<EffectiveModelSelection>
    resolveExecution: (profileId: string) => Promise<ModelExecutionConfig>
    recordCall: (input: {
      modelProfileId: string
      source: ModelCallSource
      workspaceId?: string
      requirementId?: string
      nodeId?: string
      conversationId: string
      aiRunId: string
      startedAt: number
      inputTokens: number
      outputTokens: number
      cachedTokens: number
      reasoningTokens: number
      firstTokenLatencyMs?: number
      durationMs: number
      retryCount: number
      status: 'completed' | 'failed' | 'cancelled'
      errorCode?: ModelCallErrorCode
    }) => Promise<unknown>
  }
  onCompleted?: (
    input: FollowUpSuggestionGenerationInput
  ) => void | Promise<void>
  generatedArtifacts?: {
    finalizeRun(input: {
      conversationId: string
      assistantMessageId: string
      runId: string
      status: 'completed' | 'failed' | 'cancelled'
    }): Promise<ConversationGeneratedArtifactSource | undefined>
  }
  createId?: () => string
  now?: () => number
}

export class SendConversationMessageUseCase {
  private readonly createId: () => string
  private readonly now: () => number
  private readonly processing?: Pick<
    ConversationProcessorPipeline,
    'run' | 'version'
  >

  constructor(private readonly dependencies: Dependencies) {
    this.createId = dependencies.createId ?? randomUUID
    this.now = dependencies.now ?? Date.now
    this.processing = dependencies.processing
  }

  async execute(input: {
    sessionId: string
    session?: ChatSessionRecord
    content: string
    expectedRevision: number
    messageId?: string
    modelProfileId?: string
    modelRouting?: 'conversation' | 'fixed'
    reasoningMode?: ReasoningPreference
    applicationLocale?: 'zh-CN' | 'en' | 'ja'
    context?: string
    requirementNodeContext?: RequirementNodeRunContext
    messageReferences?: BeginTurnInput['references']
    fileReferences?: string[]
    attachmentPaths?: string[]
    attachments?: ConversationAttachmentSubmission
    capabilityReferences?: string[]
    turnStarter?: ChatSessionRepository['beginTurn']
    afterTurnStarted?: (
      session: Revisioned<ChatSessionRecord>
    ) => Promise<void>
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
    metricContext?: {
      workspaceId?: string
      requirementId?: string
      nodeId?: string
    }
  }): Promise<Revisioned<ChatSessionRecord>> {
    const rawContent = input.content
    if (!rawContent.trim()) throw new Error('Conversation message is required')
    const persisted = await this.dependencies.sessions.get(input.sessionId)
    const current =
      persisted ?? (input.session ? { ...input.session, revision: 0 } : undefined)
    if (!current) throw new Error(`Conversation not found: ${input.sessionId}`)
    if (
      persisted &&
      input.session &&
      !isSameConversationIdentity(persisted, input.session)
    ) {
      throw new Error('Conversation already exists')
    }
    const userMessageId = input.messageId ?? this.createId()
    const existing = current.messages.find(({ id }) => id === userMessageId)
    if (existing) {
      if (existing.role === 'user' && existing.content === rawContent) {
        return current
      }
      throw new Error('Conversation message id conflict')
    }
    const timestamp = this.now()
    const previousClarification = findPreviousClarification(current)
    const scenario = resolveAgentRunScenario({
      conversationId: current.id,
      ...(current.workspaceId ? { workspaceId: current.workspaceId } : {}),
      ...(current.folderPath ? { folderPath: current.folderPath } : {}),
      ...(input.requirementNodeContext ?? {})
    })
    await this.assertFolderAvailable(current)
    await this.assertKnowledgeContextAvailable(current)
    const processingPipeline =
      this.processing ??
      new ConversationProcessorPipeline([
        ...createBuiltinConversationProcessors(),
        this.createConversationContextProcessor(current, input.context)
      ])
    const processing = await processingPipeline.run({
      messageId: userMessageId,
      content: rawContent,
      scenarioId: scenario.id,
      bindings: {
        ...(current.workspaceId ? { workspaceId: current.workspaceId } : {}),
        ...(input.requirementNodeContext
          ? {
              requirementId: input.requirementNodeContext.requirementId,
              nodeId: input.requirementNodeContext.nodeId,
              nodeRunId: input.requirementNodeContext.nodeRunId
            }
          : {}),
        ...(input.fileReferences
          ? { fileReferences: input.fileReferences }
          : {}),
        ...(input.attachments
          ? { attachmentPaths: input.attachments.attachmentIds }
          : input.attachmentPaths
            ? { attachmentPaths: input.attachmentPaths }
            : {}),
        ...(input.capabilityReferences
          ? { capabilityReferences: input.capabilityReferences }
          : {}),
        ...(input.messageReferences
          ? { messageReferences: input.messageReferences }
          : {})
      },
      ...(previousClarification
        ? {
            previousUnderstanding:
              previousClarification.processing.semanticUnderstanding
          }
        : {}),
      createdAt: timestamp
    })
    const slashExecution = processing.slashCommand
      ? await (
          this.dependencies.slashCommands ??
          new ConversationSlashCommandHandler()
        ).execute({
          rawCommand: processing.normalizedText,
          processing
        })
      : undefined
    const requestedModelProfileId =
      input.modelProfileId ?? current.modelProfileId
    const attachmentDescriptors = input.attachments
      ? await this.requireAttachmentDescriptors(input.attachments)
      : []
    const requiredCapabilities: ModelCapability[] =
      input.attachments?.allowImageEgress &&
      attachmentDescriptors.some(({ mediaKind }) => mediaKind === 'image')
        ? ['text', 'vision']
        : ['text']
    const automaticRouting =
      (input.modelRouting ?? 'conversation') === 'conversation' &&
      requestedModelProfileId === undefined
    const modelProfileId =
      processing.gate.status === 'continue' &&
      slashExecution?.handled !== true
        ? await this.routeModel(
            requestedModelProfileId,
            input.modelRouting ?? 'conversation',
            requiredCapabilities
          )
        : undefined
    const model =
      modelProfileId && this.dependencies.models
        ? await this.dependencies.models.resolveExecution(modelProfileId)
        : undefined
    const assistantMessageId = this.createId()
    const started = await (
      input.turnStarter ?? this.dependencies.sessions.beginTurn
    )({
      session:
        input.modelProfileId &&
        input.modelProfileId !== current.modelProfileId
          ? { ...current, modelProfileId: input.modelProfileId }
          : current,
      expectedRevision: input.expectedRevision,
      userMessageId,
      assistantMessageId,
      content: rawContent,
      processing,
      ...(input.applicationLocale
        ? { applicationLocale: input.applicationLocale }
        : {}),
      ...(model
        ? { modelName: model.displayName ?? model.modelId }
        : {}),
      ...(input.messageReferences
        ? { references: input.messageReferences }
        : {}),
      ...(input.attachments
        ? {
            attachmentBinding: {
              draftOwnerId: input.attachments.draftId,
              attachmentIds: input.attachments.attachmentIds
            }
          }
        : {}),
      createdAt: timestamp
    })
    if (started.status === 'idempotent') return started.entity
    if (started.status === 'message_conflict') {
      throw new Error('Conversation message id conflict')
    }
    if (started.status === 'active') {
      throw new Error('Conversation already has an active response')
    }
    if (started.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }
    this.emitUpdate(input.onUpdate, started.entity)
    if (input.afterTurnStarted) {
      try {
        await input.afterTurnStarted(started.entity)
      } catch (error) {
        return this.finishFailedTurn(
          started.entity,
          assistantMessageId,
          '',
          error,
          undefined,
          input.onUpdate
        )
      }
    }
    if (
      previousClarification &&
      processing.semanticUnderstanding.supersedesMessageId &&
      this.dependencies.gateway.resolveWaitingInputRun
    ) {
      try {
        await this.dependencies.gateway.resolveWaitingInputRun(
          previousClarification.runId
        )
      } catch (error) {
        return this.finishFailedTurn(
          started.entity,
          assistantMessageId,
          '',
          error,
          undefined,
          input.onUpdate
        )
      }
    }
    if (slashExecution?.handled) {
      return this.finishLocalCommandTurn({
        session: started.entity,
        assistantMessageId,
        execution: slashExecution,
        onUpdate: input.onUpdate
      })
    }
    let attachmentContext: ConversationAttachmentEnvelope | undefined
    if (input.attachments) {
      if (!this.dependencies.attachments) {
        return this.finishFailedTurn(
          started.entity,
          assistantMessageId,
          '',
          new Error('Conversation attachment runtime is unavailable'),
          undefined,
          input.onUpdate
        )
      }
      try {
        attachmentContext = await this.dependencies.attachments.prepare({
          attachmentIds: input.attachments.attachmentIds,
          ownerId: userMessageId,
          modelSupportsVision: model?.capabilities?.vision === true,
          allowImageEgress: input.attachments.allowImageEgress
        })
      } catch (error) {
        return this.finishFailedTurn(
          started.entity,
          assistantMessageId,
          '',
          error,
          undefined,
          input.onUpdate
        )
      }
    }
    const history = applyConversationHistoryCommands(
      started.entity.messages
    )

    const runContext: ConversationContext = {
      conversationId: current.id,
      messages: history.messages
        .filter(
          (message) =>
            message.status === 'completed' && message.content.length > 0
        )
        .map(({ id, role, content }) => ({
          role,
          content:
            id === userMessageId &&
            slashExecution &&
            !slashExecution.handled
              ? slashExecution.prompt
              : content
        })),
      ...(current.workspaceId ? { workspaceId: current.workspaceId } : {}),
      ...(current.folderPath ? { folderPath: current.folderPath } : {}),
      context: [
        formatAgentContext(processing, processing.knowledgeContext?.content),
        history.compactedContext,
        attachmentContext?.contextText
      ]
        .filter(Boolean)
        .join('\n\n'),
      pipelineVersion: processing.pipelineVersion,
      processing,
      ...(attachmentContext ? { attachmentContext } : {}),
      ...(!input.requirementNodeContext
        ? {
            requestedReasoning:
              !input.reasoningMode || input.reasoningMode === 'auto'
                ? history.reasoning ?? 'auto'
                : input.reasoningMode,
            historicalFailureCount: started.entity.messages.filter(
              ({ role, status }) =>
                role === 'assistant' && status === 'failed'
            ).length
          }
        : {}),
      ...(input.requirementNodeContext ?? {})
    }
    const citationPolicy = processing.knowledgeContext
      ? {
          allowedKnowledgeReferences: new Set(
            processing.knowledgeContext.allowedReferenceIds
          )
        }
      : undefined
    if (processing.gate.status === 'clarification_required') {
      return this.waitForClarification({
        session: started.entity,
        assistantMessageId,
        runContext,
        gate: processing.gate,
        onUpdate: input.onUpdate
      })
    }

    const startedAt = this.now()
    let created: { runId: string }
    try {
      created = await this.dependencies.gateway.createRun(runContext, model)
    } catch (error) {
      return this.finishFailedTurn(
        started.entity,
        assistantMessageId,
        '',
        error,
        undefined,
        input.onUpdate
      )
    }
    const bound = await this.dependencies.sessions.bindTurnRun({
      sessionId: current.id,
      assistantMessageId,
      runId: created.runId,
      expectedRevision: started.entity.revision,
      updatedAt: this.now()
    })
    if (bound.status === 'conflict') {
      await this.dependencies.gateway.cancelRun(created.runId).catch(() => undefined)
      throw new Error('Conversation revision conflict')
    }
    this.emitUpdate(input.onUpdate, bound.entity)
    let assistantContent = ''
    let turnProjection: AssistantTurnProjection =
      createAssistantTurnProjection({
        runId: created.runId,
        assistantMessageId,
        startedAt
      })
    let lastSequence = 0
    let terminalEvent: AiRunEvent | undefined
    let suspensionEvent: AiRunEvent | undefined
    try {
      for await (const event of this.dependencies.gateway.streamEvents(
        created.runId,
        new AbortController().signal
      )) {
        if (event.runId !== created.runId) {
          throw new Error('Conversation run event belongs to another run')
        }
        if (event.sequence <= lastSequence) continue
        if (event.sequence !== lastSequence + 1) {
          throw new Error('Conversation run event sequence gap')
        }
        lastSequence = event.sequence
        const projected = projectConversationRunEvent(
          turnProjection,
          event,
          citationPolicy
        )
        const timelineEvent = toAssistantRunEvent(event, citationPolicy)
        if (projected && timelineEvent) {
          await this.dependencies.timeline?.appendAndProject(
            timelineEvent,
            projected
          )
          turnProjection = projected
          assistantContent = projected.answer
          this.emitUpdate(
            input.onUpdate,
            projectAssistantContent(
              bound.entity,
              assistantMessageId,
              assistantContent,
              turnProjection
            )
          )
        }
        if (
          event.type === 'run.completed' ||
          event.type === 'run.failed' ||
          event.type === 'run.cancelled'
        ) {
          terminalEvent = event
          break
        }
        if (isConversationRunSuspension(event)) {
          suspensionEvent = event
          break
        }
      }
    } catch (error) {
      const failed = await this.finishFailedTurn(
        bound.entity,
        assistantMessageId,
        assistantContent,
        error,
        created.runId,
        input.onUpdate
      )
      await this.recordLocalFailureMetric(
        modelProfileId,
        current,
        created.runId,
        startedAt,
        input.metricContext
      )
      return failed
    }
    if (suspensionEvent) {
      return this.finishSuspendedTurn(
        bound.entity,
        assistantMessageId,
        assistantContent,
        turnProjection,
        created.runId,
        input.onUpdate
      )
    }
    if (!terminalEvent) {
      const failed = await this.finishFailedTurn(
        bound.entity,
        assistantMessageId,
        assistantContent,
        new Error('Conversation run ended without a terminal event'),
        created.runId,
        input.onUpdate
      )
      await this.recordLocalFailureMetric(
        modelProfileId,
        current,
        created.runId,
        startedAt,
        input.metricContext
      )
      return failed
    }
    if (terminalEvent.type !== 'run.completed') {
      const fallback = await this.tryAutomaticProviderFallback({
        automaticRouting,
        primaryModel: model,
        primaryModelProfileId: modelProfileId,
        primaryRunId: created.runId,
        primaryStartedAt: startedAt,
        primaryTerminalEvent: terminalEvent,
        primaryContent: assistantContent,
        session: bound.entity,
        assistantMessageId,
        runContext,
        onUpdate: input.onUpdate,
        metricContext: input.metricContext
      })
      if (fallback) return fallback
      const failed = await this.finishFailedTurn(
        bound.entity,
        assistantMessageId,
        assistantContent,
        new Error(
          terminalEvent.data.message ??
            (terminalEvent.type === 'run.cancelled'
              ? 'Conversation run cancelled'
              : 'Conversation run failed')
        ),
        created.runId,
        input.onUpdate
      )
      await this.recordMetric(
        modelProfileId,
        current,
        created.runId,
        startedAt,
        terminalEvent,
        input.metricContext
      )
      return failed
    }
    const source = await this.dependencies.generatedArtifacts?.finalizeRun({
      conversationId: current.id,
      assistantMessageId,
      runId: created.runId,
      status: 'completed'
    })
    const responseLocale = resolveResponseLanguage(
      rawContent,
      input.applicationLocale
    ).locale
    const completedContent =
      assistantContent.trim() ||
      completedArtifactAnswer(source, responseLocale) ||
      completedRunAnswer(responseLocale)
    if (!completedContent.trim()) {
      const failed = await this.finishFailedTurn(
        bound.entity,
        assistantMessageId,
        assistantContent,
        new Error('Conversation run completed without assistant content'),
        created.runId,
        input.onUpdate
      )
      await this.recordMetric(
        modelProfileId,
        current,
        created.runId,
        startedAt,
        terminalEvent,
        input.metricContext
      )
      return failed
    }
    const completed = await this.dependencies.sessions.finishTurn({
      sessionId: current.id,
      assistantMessageId,
      runId: created.runId,
      status: 'completed',
      content: completedContent,
      ...(source ? { source } : {}),
      expectedRevision: bound.entity.revision,
      updatedAt: this.now()
    })
    if (completed.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }
    this.emitUpdate(input.onUpdate, completed.entity)
    this.scheduleCompletedTurn({
      conversationId: current.id,
      assistantMessageId,
      sourceRunId: created.runId,
      modelProfileId,
      responseLocale,
      userObjective: rawContent,
      finalAnswer: completedContent,
      unresolvedItems: [],
      artifactSummaries: [],
      executionOutcome: 'completed'
    })
    await this.recordMetric(
      modelProfileId,
      current,
      created.runId,
      startedAt,
      terminalEvent,
      input.metricContext
    )
    return completed.entity
  }

  private async finishLocalCommandTurn(input: {
    session: Revisioned<ChatSessionRecord>
    assistantMessageId: string
    execution: Extract<
      ConversationSlashCommandExecution,
      { handled: true }
    >
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  }): Promise<Revisioned<ChatSessionRecord>> {
    const completed = await this.dependencies.sessions.finishTurn({
      sessionId: input.session.id,
      assistantMessageId: input.assistantMessageId,
      status: 'completed',
      content: input.execution.content,
      expectedRevision: input.session.revision,
      updatedAt: this.now()
    })
    if (completed.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }
    this.emitUpdate(input.onUpdate, completed.entity)
    return completed.entity
  }

  private async waitForClarification(input: {
    session: Revisioned<ChatSessionRecord>
    assistantMessageId: string
    runContext: ConversationContext
    gate: Extract<
      ConversationProcessingGate,
      { status: 'clarification_required' }
    >
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  }): Promise<Revisioned<ChatSessionRecord>> {
    if (!this.dependencies.gateway.createWaitingInputRun) {
      return this.finishFailedTurn(
        input.session,
        input.assistantMessageId,
        '',
        new Error('Conversation clarification runtime is unavailable'),
        undefined,
        input.onUpdate
      )
    }
    let created: { runId: string }
    try {
      created = await this.dependencies.gateway.createWaitingInputRun(
        input.runContext,
        input.gate
      )
    } catch (error) {
      return this.finishFailedTurn(
        input.session,
        input.assistantMessageId,
        '',
        error,
        undefined,
        input.onUpdate
      )
    }
    const bound = await this.dependencies.sessions.bindTurnRun({
      sessionId: input.session.id,
      assistantMessageId: input.assistantMessageId,
      runId: created.runId,
      expectedRevision: input.session.revision,
      updatedAt: this.now()
    })
    if (bound.status === 'conflict') {
      await this.dependencies.gateway
        .cancelRun(created.runId)
        .catch(() => undefined)
      throw new Error('Conversation revision conflict')
    }
    this.emitUpdate(input.onUpdate, bound.entity)
    const startedAt = this.now()
    let projection = createAssistantTurnProjection({
      runId: created.runId,
      assistantMessageId: input.assistantMessageId,
      startedAt
    })
    for (const event of [
      {
        id: `${created.runId}:1`,
        runId: created.runId,
        sequence: 1,
        type: 'answer.delta',
        timestamp: new Date(startedAt).toISOString(),
        data: { delta: input.gate.question }
      },
      {
        id: `${created.runId}:2`,
        runId: created.runId,
        sequence: 2,
        type: 'run.waiting_input',
        timestamp: new Date(startedAt).toISOString(),
        data: { recoveryReason: 'clarification_required' }
      }
    ] satisfies AiRunEvent[]) {
      const next = projectConversationRunEvent(projection, event)
      const timelineEvent = toAssistantRunEvent(event)
      if (next && timelineEvent) {
        await this.dependencies.timeline?.appendAndProject(
          timelineEvent,
          next
        )
        projection = next
      }
    }
    const completed = await this.dependencies.sessions.finishTurn({
      sessionId: input.session.id,
      assistantMessageId: input.assistantMessageId,
      runId: created.runId,
      status: 'completed',
      content: input.gate.question,
      expectedRevision: bound.entity.revision,
      updatedAt: this.now()
    })
    if (completed.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }
    const projected = projectAssistantContent(
      completed.entity,
      input.assistantMessageId,
      input.gate.question,
      projection
    )
    this.emitUpdate(input.onUpdate, projected)
    return projected
  }

  private async tryAutomaticProviderFallback(input: {
    automaticRouting: boolean
    primaryModel?: ModelExecutionConfig
    primaryModelProfileId?: string
    primaryRunId: string
    primaryStartedAt: number
    primaryTerminalEvent: AiRunEvent
    primaryContent: string
    session: Revisioned<ChatSessionRecord>
    assistantMessageId: string
    runContext: ConversationContext
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
    metricContext?: {
      workspaceId?: string
      requirementId?: string
      nodeId?: string
    }
  }): Promise<Revisioned<ChatSessionRecord> | undefined> {
    const models = this.dependencies.models
    const providerId = input.primaryModel?.providerId
    if (
      !input.automaticRouting ||
      !models?.resolveConversationFallbackModel ||
      !providerId ||
      input.primaryContent.length > 0 ||
      input.primaryTerminalEvent.type !== 'run.failed' ||
      !isAutomaticProviderFallbackFailure(input.primaryTerminalEvent)
    ) {
      return undefined
    }

    const selection = await models.resolveConversationFallbackModel([
      providerId
    ])
    if (selection.outcome !== 'selected') return undefined
    const fallbackModel = await models.resolveExecution(
      selection.profile.id
    )
    const fallbackStartedAt = this.now()
    let created: { runId: string }
    try {
      created = await this.dependencies.gateway.createRun(
        input.runContext,
        fallbackModel
      )
    } catch {
      return undefined
    }
    const rebound = await this.dependencies.sessions.rebindTurnRun({
      sessionId: input.session.id,
      assistantMessageId: input.assistantMessageId,
      previousRunId: input.primaryRunId,
      runId: created.runId,
      modelName: fallbackModel.displayName ?? fallbackModel.modelId,
      expectedRevision: input.session.revision,
      updatedAt: this.now()
    })
    if (rebound.status === 'conflict') {
      await this.dependencies.gateway.cancelRun(created.runId).catch(() => undefined)
      throw new Error('Conversation revision conflict')
    }
    this.emitUpdate(input.onUpdate, rebound.entity)
    await this.recordMetric(
      input.primaryModelProfileId,
      input.session,
      input.primaryRunId,
      input.primaryStartedAt,
      input.primaryTerminalEvent,
      input.metricContext
    )

    let assistantContent = ''
    let turnProjection: AssistantTurnProjection =
      createAssistantTurnProjection({
        runId: created.runId,
        assistantMessageId: input.assistantMessageId,
        startedAt: fallbackStartedAt
      })
    const fallbackKnowledgeContext =
      input.runContext.processing?.knowledgeContext
    const citationPolicy = fallbackKnowledgeContext
      ? {
          allowedKnowledgeReferences: new Set(
            fallbackKnowledgeContext.allowedReferenceIds
          )
        }
      : undefined
    let lastSequence = 0
    let terminalEvent: AiRunEvent | undefined
    let suspensionEvent: AiRunEvent | undefined
    try {
      for await (const event of this.dependencies.gateway.streamEvents(
        created.runId,
        new AbortController().signal
      )) {
        if (event.runId !== created.runId) {
          throw new Error('Conversation run event belongs to another run')
        }
        if (event.sequence <= lastSequence) continue
        if (event.sequence !== lastSequence + 1) {
          throw new Error('Conversation run event sequence gap')
        }
        lastSequence = event.sequence
        const projected = projectConversationRunEvent(
          turnProjection,
          event,
          citationPolicy
        )
        const timelineEvent = toAssistantRunEvent(event, citationPolicy)
        if (projected && timelineEvent) {
          await this.dependencies.timeline?.appendAndProject(
            timelineEvent,
            projected
          )
          turnProjection = projected
          assistantContent = projected.answer
          this.emitUpdate(
            input.onUpdate,
            projectAssistantContent(
              rebound.entity,
              input.assistantMessageId,
              assistantContent,
              turnProjection
            )
          )
        }
        if (
          event.type === 'run.completed' ||
          event.type === 'run.failed' ||
          event.type === 'run.cancelled'
        ) {
          terminalEvent = event
          break
        }
        if (isConversationRunSuspension(event)) {
          suspensionEvent = event
          break
        }
      }
    } catch (error) {
      const failed = await this.finishFailedTurn(
        rebound.entity,
        input.assistantMessageId,
        assistantContent,
        error,
        created.runId,
        input.onUpdate
      )
      await this.recordLocalFailureMetric(
        selection.profile.id,
        rebound.entity,
        created.runId,
        fallbackStartedAt,
        input.metricContext
      )
      return failed
    }
    if (suspensionEvent) {
      return this.finishSuspendedTurn(
        rebound.entity,
        input.assistantMessageId,
        assistantContent,
        turnProjection,
        created.runId,
        input.onUpdate
      )
    }
    if (!terminalEvent || terminalEvent.type !== 'run.completed') {
      const failed = await this.finishFailedTurn(
        rebound.entity,
        input.assistantMessageId,
        assistantContent,
        new Error(
          terminalEvent?.data.message ??
            (terminalEvent?.type === 'run.cancelled'
              ? 'Conversation run cancelled'
              : 'Conversation run failed')
        ),
        created.runId,
        input.onUpdate
      )
      if (terminalEvent) {
        await this.recordMetric(
          selection.profile.id,
          rebound.entity,
          created.runId,
          fallbackStartedAt,
          terminalEvent,
          input.metricContext
        )
      }
      return failed
    }
    const source = await this.dependencies.generatedArtifacts?.finalizeRun({
      conversationId: input.runContext.conversationId,
      assistantMessageId: input.assistantMessageId,
      runId: created.runId,
      status: 'completed'
    })
    const userObjective =
      [...input.runContext.messages]
        .reverse()
        .find(({ role }) => role === 'user')?.content ?? ''
    const responseLocale =
      input.runContext.responseLanguage?.locale ??
      resolveResponseLanguage(
        userObjective,
        input.runContext.applicationLocale
      ).locale
    const completedContent =
      assistantContent.trim() ||
      completedArtifactAnswer(source, responseLocale) ||
      completedRunAnswer(responseLocale)
    if (!completedContent.trim()) {
      const failed = await this.finishFailedTurn(
        rebound.entity,
        input.assistantMessageId,
        assistantContent,
        new Error('Conversation run completed without assistant content'),
        created.runId,
        input.onUpdate
      )
      await this.recordMetric(
        selection.profile.id,
        rebound.entity,
        created.runId,
        fallbackStartedAt,
        terminalEvent,
        input.metricContext
      )
      return failed
    }
    const completed = await this.dependencies.sessions.finishTurn({
      sessionId: rebound.entity.id,
      assistantMessageId: input.assistantMessageId,
      runId: created.runId,
      status: 'completed',
      content: completedContent,
      ...(source ? { source } : {}),
      expectedRevision: rebound.entity.revision,
      updatedAt: this.now()
    })
    if (completed.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }
    this.emitUpdate(input.onUpdate, completed.entity)
    this.scheduleCompletedTurn({
      conversationId: input.runContext.conversationId,
      assistantMessageId: input.assistantMessageId,
      sourceRunId: created.runId,
      modelProfileId: selection.profile.id,
      responseLocale,
      userObjective,
      finalAnswer: completedContent,
      unresolvedItems: [],
      artifactSummaries: [],
      executionOutcome: 'completed'
    })
    await this.recordMetric(
      selection.profile.id,
      rebound.entity,
      created.runId,
      fallbackStartedAt,
      terminalEvent,
      input.metricContext
    )
    return completed.entity
  }

  private scheduleCompletedTurn(
    input: FollowUpSuggestionGenerationInput
  ): void {
    try {
      void Promise.resolve(this.dependencies.onCompleted?.(input)).catch(
        () => undefined
      )
    } catch {
      // Optional follow-up work must not alter the completed conversation.
    }
  }

  private async routeModel(
    profileId: string | undefined,
    mode: 'conversation' | 'fixed',
    requiredCapabilities: ModelCapability[] = ['text']
  ): Promise<string | undefined> {
    if (!this.dependencies.models) return profileId
    if (
      mode === 'conversation' &&
      this.dependencies.models.resolveConversationModel &&
      requiredCapabilities.length === 1
    ) {
      const selection =
        await this.dependencies.models.resolveConversationModel(profileId)
      if (selection.outcome === 'unavailable') {
        throw new Error(
          'No available model. Configure a model provider to continue.'
        )
      }
      return selection.profile.id
    }
    const route = await this.dependencies.models.routeModel(
      profileId
        ? { strategy: 'fixed', profileId }
        : {
            strategy: 'capability',
            requiredCapabilities,
            minimumContextWindow: 1
          }
    )
    if (route.outcome === 'unavailable') {
      throw new ModelRoutingError(route.code, route.message)
    }
    return route.profile.id
  }

  private async requireAttachmentDescriptors(
    submission: ConversationAttachmentSubmission
  ): Promise<ConversationAttachmentDescriptor[]> {
    if (!this.dependencies.attachments) {
      throw new Error('Conversation attachment runtime is unavailable')
    }
    const owned = await this.dependencies.attachments.listByOwner(
      submission.draftId
    )
    const byId = new Map(owned.map((attachment) => [attachment.id, attachment]))
    const selected = submission.attachmentIds.map((id) => byId.get(id))
    if (selected.some((attachment) => !attachment)) {
      throw new Error('Attachment ownership conflict')
    }
    return selected as ConversationAttachmentDescriptor[]
  }

  private createConversationContextProcessor(
    session: Revisioned<ChatSessionRecord>,
    explicitContext?: string
  ): ConversationProcessor {
    return {
      id: 'builtin.conversation-context',
      version: '1.0.0',
      stage: 'context',
      order: 15,
      scenarios: [
        'general',
        'folder',
        'space',
        'requirement-node',
        'workflow-node',
        'scheduled',
        'sensitive',
        'management'
      ],
      writes: ['knowledgeContext'],
      sideEffect: 'none',
      failurePolicy: 'optional',
      timeoutMs: 3_000,
      maxOutputBytes: 1_000_000,
      process: async (_input, current) => {
        if (current.gate.status === 'clarification_required') {
          return { patch: {} }
        }
        const query =
          current.semanticUnderstanding.retrievalQueries.length > 0
            ? current.semanticUnderstanding.retrievalQueries
            : current.normalizedText
        const context =
          explicitContext ??
          (await this.prepareKnowledgeContext(session, query))
        return {
          patch: {
            ...(typeof context === 'string'
              ? {
                  knowledgeContext: {
                    content: context,
                    allowedReferenceIds: [],
                    insufficientKnowledge: false
                  }
                }
              : context
                ? { knowledgeContext: context }
                : {})
          }
        }
      }
    }
  }

  private async assertKnowledgeContextAvailable(
    session: Revisioned<ChatSessionRecord>
  ): Promise<void> {
    const scope =
      session.knowledgeScope ??
      (session.kind === 'space' && session.workspaceId
        ? { kind: 'workspace' as const, workspaceId: session.workspaceId }
        : session.kind === 'requirement_node'
          ? { kind: 'node_configuration' as const }
          : { kind: 'none' as const })
    if (scope.kind === 'none' || scope.kind === 'node_configuration') return
    if (!this.dependencies.spaceContext) {
      throw new Error('Space conversation context is unavailable')
    }
    if (
      scope.kind === 'all_workspaces' &&
      !this.dependencies.spaceContext.assembleScope
    ) {
      throw new Error('All-workspace conversation context is unavailable')
    }
    if (scope.kind === 'workspace') {
      if (
        session.kind !== 'space' ||
        session.workspaceId !== scope.workspaceId
      ) {
        throw new Error('Space conversations require exactly one workspace')
      }
      await this.dependencies.spaceContext.assertAvailable(scope.workspaceId)
    }
  }

  private async prepareKnowledgeContext(
    session: Revisioned<ChatSessionRecord>,
    query: string | readonly RetrievalQuery[]
  ): Promise<
    NonNullable<ConversationProcessingSnapshot['knowledgeContext']> | undefined
  > {
    const scope =
      session.knowledgeScope ??
      (session.kind === 'space' && session.workspaceId
        ? { kind: 'workspace' as const, workspaceId: session.workspaceId }
        : session.kind === 'requirement_node'
          ? { kind: 'node_configuration' as const }
          : { kind: 'none' as const })
    if (scope.kind === 'none' || scope.kind === 'node_configuration') {
      return undefined
    }
    if (!this.dependencies.spaceContext) return undefined
    if (scope.kind === 'all_workspaces') {
      if (this.dependencies.spaceContext.assembleSnapshot) {
        return this.dependencies.spaceContext.assembleSnapshot(scope, query)
      }
      if (!this.dependencies.spaceContext.assembleScope) {
        throw new Error('All-workspace conversation context is unavailable')
      }
      return legacyKnowledgeContext(
        await this.dependencies.spaceContext.assembleScope(scope, query)
      )
    }
    if (this.dependencies.spaceContext.assembleSnapshot) {
      return this.dependencies.spaceContext.assembleSnapshot(scope, query)
    }
    return legacyKnowledgeContext(
      await this.dependencies.spaceContext.assemble(scope.workspaceId, query)
    )
  }

  private async assertFolderAvailable(
    session: Revisioned<ChatSessionRecord>
  ): Promise<void> {
    if (!session.folderPath) return
    if (session.kind !== 'general' || session.workspaceId) {
      throw new Error(
        'Folder conversations require exactly one folder binding'
      )
    }
    if (!this.dependencies.folderContext) {
      throw new Error('Folder conversation context is unavailable')
    }
    await this.dependencies.folderContext.assertAvailable(session.folderPath)
  }

  private async recordMetric(
    modelProfileId: string | undefined,
    session: Revisioned<ChatSessionRecord>,
    runId: string,
    startedAt: number,
    event: AiRunEvent,
    metricContext?: {
      workspaceId?: string
      requirementId?: string
      nodeId?: string
    }
  ): Promise<void> {
    if (!modelProfileId || !this.dependencies.models) return
    const usage = event.data.usage
    await this.dependencies.models
      .recordCall({
        modelProfileId,
        source: modelCallSourceForSession(session),
        ...(metricContext?.workspaceId
          ? { workspaceId: metricContext.workspaceId }
          : session.workspaceId
            ? { workspaceId: session.workspaceId }
            : {}),
        ...(metricContext?.requirementId
          ? { requirementId: metricContext.requirementId }
          : {}),
        ...(metricContext?.nodeId ? { nodeId: metricContext.nodeId } : {}),
        conversationId: session.id,
        aiRunId: runId,
        startedAt,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cachedTokens: usage?.cachedTokens ?? 0,
        reasoningTokens: usage?.reasoningTokens ?? 0,
        ...(event.data.firstTokenLatencyMs === undefined
          ? {}
          : { firstTokenLatencyMs: event.data.firstTokenLatencyMs }),
        durationMs: event.data.durationMs ?? 0,
        retryCount: event.data.retryCount ?? 0,
        ...(event.data.errorCode
          ? { errorCode: event.data.errorCode }
          : {}),
        status:
          event.type === 'run.completed'
            ? 'completed'
            : event.type === 'run.cancelled'
              ? 'cancelled'
              : 'failed'
      })
      .catch(() => undefined)
  }

  private async recordLocalFailureMetric(
    modelProfileId: string | undefined,
    session: Revisioned<ChatSessionRecord>,
    runId: string,
    startedAt: number,
    metricContext?: {
      workspaceId?: string
      requirementId?: string
      nodeId?: string
    }
  ): Promise<void> {
    await this.recordMetric(
      modelProfileId,
      session,
      runId,
      startedAt,
      {
        id: `local-failure-${runId}`,
        runId,
        sequence: 0,
        type: 'run.failed',
        timestamp: new Date().toISOString(),
        data: {
          durationMs: Math.max(this.now() - startedAt, 0),
          errorCode: 'stream_error'
        }
      },
      metricContext
    )
  }

  private async finishFailedTurn(
    session: Revisioned<ChatSessionRecord>,
    assistantMessageId: string,
    content: string,
    error: unknown,
    runId?: string,
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  ): Promise<Revisioned<ChatSessionRecord>> {
    const failed = await this.dependencies.sessions.finishTurn({
      sessionId: session.id,
      assistantMessageId,
      ...(runId ? { runId } : {}),
      status: 'failed',
      content,
      error: toSafeConversationError(error),
      expectedRevision: session.revision,
      updatedAt: this.now()
    })
    if (failed.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }
    this.emitUpdate(onUpdate, failed.entity)
    return failed.entity
  }

  private async finishSuspendedTurn(
    session: Revisioned<ChatSessionRecord>,
    assistantMessageId: string,
    content: string,
    execution: AssistantTurnProjection,
    runId: string,
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  ): Promise<Revisioned<ChatSessionRecord>> {
    const completed = await this.dependencies.sessions.finishTurn({
      sessionId: session.id,
      assistantMessageId,
      runId,
      status: 'completed',
      content,
      expectedRevision: session.revision,
      updatedAt: this.now()
    })
    if (completed.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }
    const projected = projectAssistantContent(
      completed.entity,
      assistantMessageId,
      content,
      execution
    )
    this.emitUpdate(onUpdate, projected)
    return projected
  }

  private emitUpdate(
    onUpdate: ((session: Revisioned<ChatSessionRecord>) => void) | undefined,
    session: Revisioned<ChatSessionRecord>
  ): void {
    try {
      onUpdate?.(session)
    } catch {
      // A closed Renderer must not interrupt the persisted conversation turn.
    }
  }
}

function isConversationRunSuspension(event: AiRunEvent): boolean {
  return (
    event.type === 'run.waiting_input' ||
    event.type === 'run.paused' ||
    event.type === 'run.recovery_blocked'
  )
}

function projectAssistantContent(
  session: Revisioned<ChatSessionRecord>,
  assistantMessageId: string,
  content: string,
  execution?: AssistantTurnProjection
): Revisioned<ChatSessionRecord> {
  return {
    ...session,
    messages: session.messages.map((message) =>
      message.id === assistantMessageId
        ? { ...message, content, ...(execution ? { execution } : {}) }
        : message
    )
  }
}

function findPreviousClarification(
  session: Revisioned<ChatSessionRecord>
):
  | {
      processing: ConversationProcessingSnapshot
      runId: string
    }
  | undefined {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index]
    if (message.role !== 'user') continue
    if (
      message.processing?.gate.status !== 'clarification_required'
    ) {
      return undefined
    }
    const response = session.messages[index + 1]
    if (response?.role !== 'assistant' || !response.runId) return undefined
    return { processing: message.processing, runId: response.runId }
  }
  return undefined
}

function formatAgentContext(
  processing: ConversationProcessingSnapshot,
  context?: string
): string {
  const brief = processing.executionBrief
  const sections = [
    '## Execution brief',
    `Source message: ${brief.sourceMessageId}`,
    `Objective: ${brief.objective}`,
    `Risk: ${brief.riskLevel}`,
    `Writes allowed: ${brief.capabilityRestrictions.allowWrites ? 'yes' : 'no'}`,
    `External side effects allowed: ${
      brief.capabilityRestrictions.allowExternalSideEffects ? 'yes' : 'no'
    }`,
    brief.constraints.length > 0
      ? `Constraints:\n${brief.constraints
          .map((value) => `- ${value}`)
          .join('\n')}`
      : '',
    brief.acceptanceCriteria.length > 0
      ? `Acceptance criteria:\n${brief.acceptanceCriteria
          .map((value) => `- ${value}`)
          .join('\n')}`
      : '',
    context ?? ''
  ]
  return sections.filter(Boolean).join('\n\n')
}

function modelCallSourceForSession(
  session: Revisioned<ChatSessionRecord>
): ModelCallSource {
  if (session.kind === 'requirement_node') {
    return 'requirement_node_conversation'
  }
  if (session.kind === 'space') return 'space_conversation'
  if (session.folderPath) return 'folder_conversation'
  return 'general_conversation'
}

function completedArtifactAnswer(
  source: ConversationGeneratedArtifactSource | undefined,
  locale: 'zh-CN' | 'en' | 'ja'
): string {
  const artifacts = source?.generatedArtifacts ?? []
  if (artifacts.length === 0) return ''
  const names = artifacts.map(({ name }) => name).join(locale === 'zh-CN' ? '、' : ', ')
  if (locale === 'en') return `Generated files: ${names}`
  if (locale === 'ja') return `生成したファイル: ${names}`
  return `已生成文件：${names}`
}

function completedRunAnswer(locale: 'zh-CN' | 'en' | 'ja'): string {
  if (locale === 'en') {
    return 'The task completed, but the model did not return a final summary. Check the execution details to review what happened.'
  }
  if (locale === 'ja') {
    return 'タスクは完了しましたが、モデルは最終サマリーを返しませんでした。処理内容は実行詳細で確認してください。'
  }
  return '任务已完成，但模型没有返回最终总结。请查看执行详情确认处理过程。'
}

function legacyKnowledgeContext(
  content: string | undefined
): NonNullable<ConversationProcessingSnapshot['knowledgeContext']> | undefined {
  return content
    ? {
        content,
        allowedReferenceIds: [],
        insufficientKnowledge: false
      }
    : undefined
}

function isSameConversationIdentity(
  existing: ChatSessionRecord,
  candidate: ChatSessionRecord
): boolean {
  return (
    existing.id === candidate.id &&
    existing.kind === candidate.kind &&
    existing.title === candidate.title &&
    existing.workspaceId === candidate.workspaceId &&
    existing.requirementId === candidate.requirementId &&
    existing.nodeRunId === candidate.nodeRunId &&
    existing.folderPath === candidate.folderPath &&
    JSON.stringify(existing.knowledgeScope) ===
      JSON.stringify(candidate.knowledgeScope)
  )
}

function toSafeConversationError(error: unknown): string {
  const fallback = 'Conversation response failed'
  if (!(error instanceof Error)) return fallback
  const message = error.message.trim()
  if (
    !message ||
    message.length > 240 ||
    /https?:\/\/|authorization|bearer\s|api[_ -]?key|token\s*=|request body|response body/i.test(
      message
    )
  ) {
    return fallback
  }
  return message
}

function isAutomaticProviderFallbackFailure(event: AiRunEvent): boolean {
  const errorCode = event.data.errorCode
  if (
    typeof errorCode === 'string' &&
    AUTOMATIC_FALLBACK_ERROR_CODES.has(errorCode as ModelCallErrorCode)
  ) {
    return true
  }
  return (
    errorCode === 'provider_rejected' &&
    event.data.message ===
      'Model service quota is insufficient. Add credits or switch model.'
  )
}
