import type {
  ArtifactMetadataRepository,
  ChatSessionRecord,
  ChatSessionRepository,
  NodeQuestionRecord,
  NodeQuestionRepository,
  NodeTodoRepository,
  Revisioned
} from '../ports/business-repositories'
import type { ConversationKnowledgeScope } from '../../../../domain/conversation-knowledge-scope'
import type { ResolveNodeQuestionUseCase } from '../workflow/resolve-node-question'
import type { BeginRequirementNodeTurnUseCase } from './begin-requirement-node-turn'
import type { RequirementNodeConversationContextAssembler } from './requirement-node-context'
import type { SendConversationMessageUseCase } from './send-conversation-message'

export type RequirementNodeMessageReferences = {
  questionId?: string
  expectedQuestionRevision?: number
  todoId?: string
  toolCallId?: string
  artifactId?: string
}

type CreateInput = {
  id: string
  kind: 'general' | 'space' | 'requirement_node'
  knowledgeScope?: ConversationKnowledgeScope
  title: string
  prompt: string
  requirementId?: string
  nodeRunId?: string
  workspaceId?: string
  folderPath?: string
  modelProfileId?: string
  applicationLocale?: 'zh-CN' | 'en' | 'ja'
  references?: RequirementNodeMessageReferences
}

type AppendInput = {
  sessionId: string
  messageId: string
  content: string
  expectedRevision: number
  modelProfileId?: string
  applicationLocale?: 'zh-CN' | 'en' | 'ja'
  references?: RequirementNodeMessageReferences
}

type Dependencies = {
  sessions: Pick<ChatSessionRepository, 'get' | 'listByNodeRun'>
  questions: Pick<NodeQuestionRepository, 'get'>
  todos: Pick<NodeTodoRepository, 'get'>
  artifacts: Pick<ArtifactMetadataRepository, 'listByRequirement'>
  context: Pick<RequirementNodeConversationContextAssembler, 'assemble'>
  turns: Pick<BeginRequirementNodeTurnUseCase, 'execute'>
  reevaluator: Pick<ResolveNodeQuestionUseCase, 'reevaluate'>
  sender: Pick<SendConversationMessageUseCase, 'execute'>
  now?: () => number
}

type ValidatedReferences = {
  message: {
    questionId?: string
    todoId?: string
    toolCallId?: string
    artifactId?: string
  }
  question?: Revisioned<NodeQuestionRecord>
  artifact?: { nodeId?: string }
  expectedQuestionRevision?: number
}

export class SendRequirementNodeMessageUseCase {
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async create(
    input: CreateInput,
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  ): Promise<Revisioned<ChatSessionRecord>> {
    const title = input.title.trim()
    const prompt = input.prompt.trim()
    if (!title) throw new Error('Conversation title is required')
    if (!prompt) throw new Error('Conversation message is required')
    if (
      input.kind !== 'requirement_node' ||
      (input.knowledgeScope &&
        input.knowledgeScope.kind !== 'node_configuration') ||
      !input.requirementId ||
      !input.nodeRunId ||
      input.folderPath !== undefined
    ) {
      throw new Error(
        'Requirement node conversations require one requirement and node run'
      )
    }
    const existing = await this.dependencies.sessions.listByNodeRun(
      input.nodeRunId
    )
    const replay = existing.find((session) => session.id === input.id)
    if (replay) {
      return this.requireReplay(
        replay,
        `${input.id}:message:1`,
        prompt,
        input.references
      )
    }
    if (existing.some((session) => session.id !== input.id)) {
      throw new Error('Node run already has a conversation')
    }
    return this.send({
      sessionId: input.id,
      sessionIdentity: {
        id: input.id,
        title,
        requirementId: input.requirementId,
        nodeRunId: input.nodeRunId
      },
      content: prompt,
      expectedRevision: 0,
      messageId: `${input.id}:message:1`,
      ...(onUpdate ? { onUpdate } : {}),
      ...(input.modelProfileId
        ? { modelProfileId: input.modelProfileId }
        : {}),
      ...(input.applicationLocale
        ? { applicationLocale: input.applicationLocale }
        : {}),
      ...(input.references ? { references: input.references } : {})
    })
  }

  async append(
    input: AppendInput,
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  ): Promise<Revisioned<ChatSessionRecord>> {
    const session = await this.dependencies.sessions.get(input.sessionId)
    if (!session) throw new Error(`Conversation not found: ${input.sessionId}`)
    if (
      session.kind !== 'requirement_node' ||
      !session.requirementId ||
      !session.nodeRunId
    ) {
      throw new Error('Conversation is not a requirement node conversation')
    }
    const replay = session.messages.find(
      (message) => message.id === input.messageId
    )
    if (replay) {
      return this.requireReplay(
        session,
        input.messageId,
        input.content.trim(),
        input.references
      )
    }
    return this.send({
      sessionId: session.id,
      session,
      content: input.content,
      expectedRevision: input.expectedRevision,
      messageId: input.messageId,
      ...(onUpdate ? { onUpdate } : {}),
      ...(input.modelProfileId
        ? { modelProfileId: input.modelProfileId }
        : {}),
      ...(input.applicationLocale
        ? { applicationLocale: input.applicationLocale }
        : {}),
      ...(input.references ? { references: input.references } : {})
    })
  }

  private async send(input: {
    sessionId: string
    session?: Revisioned<ChatSessionRecord>
    sessionIdentity?: {
      id: string
      title: string
      requirementId: string
      nodeRunId: string
    }
    content: string
    expectedRevision: number
    messageId: string
    modelProfileId?: string
    applicationLocale?: 'zh-CN' | 'en' | 'ja'
    references?: RequirementNodeMessageReferences
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  }): Promise<Revisioned<ChatSessionRecord>> {
    const content = input.content.trim()
    if (!content) throw new Error('Conversation message is required')
    const requirementId =
      input.session?.requirementId ?? input.sessionIdentity?.requirementId
    const nodeRunId =
      input.session?.nodeRunId ?? input.sessionIdentity?.nodeRunId
    if (!requirementId || !nodeRunId) {
      throw new Error(
        'Requirement node conversations require one requirement and node run'
      )
    }
    const references = await this.validateReferences(
      input.references,
      requirementId,
      nodeRunId
    )
    const context = await this.dependencies.context.assemble({
      requirementId,
      nodeRunId,
      query: content,
      ...(references.question
        ? {
            pendingQuestion: {
              prompt: references.question.prompt,
              answer: content
            }
          }
        : {})
    })
    if (
      references.artifact &&
      references.artifact.nodeId !== context.nodeId
    ) {
      throw new Error('消息关联不属于当前需求节点')
    }
    if (
      input.session &&
      (input.session.workspaceId !== context.workspaceId ||
        input.session.requirementId !== context.requirementId ||
        input.session.nodeRunId !== nodeRunId)
    ) {
      throw new Error('Requirement node conversation binding changed')
    }
    const timestamp = this.now()
    const session =
      input.session ??
      ({
        id: input.sessionIdentity?.id as string,
        kind: 'requirement_node',
        knowledgeScope: { kind: 'node_configuration' },
        workspaceId: context.workspaceId,
        requirementId,
        nodeRunId,
        title: input.sessionIdentity?.title as string,
        sortOrder: timestamp,
        messages: [],
        createdAt: timestamp,
        updatedAt: timestamp
      } satisfies ChatSessionRecord)
    let answeredQuestion: Revisioned<NodeQuestionRecord> | undefined
    return this.dependencies.sender.execute({
      sessionId: input.sessionId,
      session,
      content,
      expectedRevision: input.expectedRevision,
      messageId: input.messageId,
      context: context.context,
      requirementNodeContext: {
        requirementId: context.requirementId,
        nodeId: context.nodeId,
        nodeRunId
      },
      messageReferences: references.message,
      ...(input.applicationLocale
        ? { applicationLocale: input.applicationLocale }
        : {}),
      metricContext: {
        workspaceId: context.workspaceId,
        requirementId: context.requirementId,
        nodeId: context.nodeId
      },
      turnStarter: async (turn) => {
        const result = await this.dependencies.turns.execute(
          turn,
          references.question
            ? {
                id: references.question.id,
                nodeRunId,
                answer: content,
                expectedRevision: references.expectedQuestionRevision as number
              }
            : undefined
        )
        answeredQuestion = result.answeredQuestion
        return result
      },
      afterTurnStarted: async () => {
        if (!answeredQuestion) return
        await this.dependencies.reevaluator.reevaluate({
          requirementId,
          question: answeredQuestion
        })
      },
      ...(input.onUpdate ? { onUpdate: input.onUpdate } : {}),
      modelRouting: 'fixed',
      ...(input.modelProfileId
        ? { modelProfileId: input.modelProfileId }
        : {})
    })
  }

  private async validateReferences(
    input: RequirementNodeMessageReferences | undefined,
    requirementId: string,
    nodeRunId: string
  ): Promise<ValidatedReferences> {
    if (!input) return { message: {} }
    const [question, todo, artifacts] = await Promise.all([
      input.questionId
        ? this.dependencies.questions.get(input.questionId)
        : Promise.resolve(undefined),
      input.todoId
        ? this.dependencies.todos.get(input.todoId)
        : Promise.resolve(undefined),
      input.artifactId
        ? this.dependencies.artifacts.listByRequirement(requirementId)
        : Promise.resolve([])
    ])
    const artifact = input.artifactId
      ? artifacts.find(({ id }) => id === input.artifactId)
      : undefined
    if (
      (input.questionId &&
        (!question ||
          question.nodeRunId !== nodeRunId ||
          input.expectedQuestionRevision === undefined)) ||
      (input.todoId && (!todo || todo.nodeRunId !== nodeRunId)) ||
      (input.artifactId && !artifact)
    ) {
      throw new Error('消息关联不属于当前需求节点')
    }
    if (question?.status !== undefined && question.status !== 'open') {
      throw new Error('节点问题已更新，请刷新后重试')
    }
    const toolCallId = input.toolCallId?.trim()
    if (input.toolCallId !== undefined && (!toolCallId || toolCallId.length > 240)) {
      throw new Error('消息关联不属于当前需求节点')
    }
    return {
      message: {
        ...(question ? { questionId: question.id } : {}),
        ...(todo ? { todoId: todo.id } : {}),
        ...(toolCallId ? { toolCallId } : {}),
        ...(artifact ? { artifactId: artifact.id } : {})
      },
      ...(question ? { question } : {}),
      ...(artifact ? { artifact } : {}),
      ...(input.expectedQuestionRevision === undefined
        ? {}
        : { expectedQuestionRevision: input.expectedQuestionRevision })
    }
  }

  private requireReplay(
    session: Revisioned<ChatSessionRecord>,
    messageId: string,
    content: string,
    references: RequirementNodeMessageReferences | undefined
  ): Revisioned<ChatSessionRecord> {
    const message = session.messages.find(({ id }) => id === messageId)
    if (
      message?.role === 'user' &&
      message.content === content &&
      message.questionId === references?.questionId &&
      message.todoId === references?.todoId &&
      message.toolCallId === references?.toolCallId &&
      message.artifactId === references?.artifactId
    ) {
      return session
    }
    throw new Error('Conversation message id conflict')
  }
}
