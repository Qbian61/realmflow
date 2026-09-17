import type { RequirementWorkflow, RequirementNode, WorkflowEdge } from '../domain/workflow'
import type {
  ModelCallMetric,
  ModelProfile,
  ModelProvider
} from '../domain/model'

export type SelectWorkRootCommand = {
  id: string
  path: string
  expectedRevision: number
}

export type CreateSpaceCommand = {
  id: string
  name: string
  description?: string
}

export type CreateRequirementCommand = {
  id: string
  workspaceId: string
  title: string
  templateVersionId: string
  syncCompletedArtifactsToKnowledge?: boolean
}

export type UpdateSpaceCommand = {
  id: string
  expectedRevision: number
  label?: string
  description?: string
  sortOrder?: number
}

export type UpdateRequirementCommand = {
  id: string
  expectedRevision: number
  title?: string
  status?: RequirementDto['status']
  sortOrder?: number
  syncCompletedArtifactsToKnowledge?: boolean
}

export type DeleteEntityCommand = {
  id: string
  expectedRevision: number
}

export type RestoreEntityCommand = {
  id: string
}

export type RequirementWorkflowCommand = {
  requirementId: string
  expectedRevision: number
}

export type InsertWorkflowNodeCommand = RequirementWorkflowCommand & {
  node: RequirementNode
  afterNodeId?: string
  beforeNodeId?: string
}

export type RemoveWorkflowNodeCommand = RequirementWorkflowCommand & {
  nodeId: string
}

export type ManageWorkflowNodeExecutionCommand = {
  requirementId: string
  nodeRunId: string
  expectedWorkflowRevision: number
  expectedNodeRunRevision: number
  modelProfileId?: string
}

export type ResolveWorkflowNodeGateCommand = {
  requirementId: string
  nodeRunId: string
  expectedNodeRunRevision: number
  gate:
    | { kind: 'approval'; result: 'approved' | 'rejected' }
    | { kind: 'custom'; gateId: string; passed: boolean }
}

export type UpdateWorkflowEdgeCommand = RequirementWorkflowCommand & {
  edgeId: string
  edge: WorkflowEdge
}

export type ReorderWorkflowNodesCommand = RequirementWorkflowCommand & {
  orderedNodeIds: string[]
}

export type WorkRootDto = {
  id: string
  path: string
  isCurrent: boolean
  revision: number
  createdAt: number
  lastUsedAt: number
}

export type SpaceDto = {
  id: string
  path: string
  label: string
  description: string
  rootPath?: string
  workRootId?: string
  directoryName?: string
  sortOrder: number
  revision: number
  createdAt: number
  updatedAt: number
}

export type RequirementDto = {
  id: string
  workspaceId: string
  title: string
  status: 'pending' | 'active' | 'completed'
  workflowTemplateVersionId?: string
  directoryName?: string
  workspaceRootPath?: string
  syncCompletedArtifactsToKnowledge?: boolean
  sortOrder: number
  revision: number
  createdAt: number
  updatedAt: number
}

export type WorkflowTemplateDto = {
  id: string
  templateId: string
  version: number
  status: 'draft' | 'published' | 'archived'
  checksum: string
  nodes: Array<{
    id: string
    stableKey: string
    type: RequirementNode['type']
    name: string
    description: string
    order: number
    allowSkip: boolean
  }>
  edges: WorkflowEdge[]
}

export type ConversationKind = 'general' | 'space' | 'requirement_node'

export type ConversationMessageDto = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  sortOrder: number
  createdAt: number
}

export type ConversationDto = {
  id: string
  kind: ConversationKind
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  title: string
  sortOrder: number
  messages: ConversationMessageDto[]
  revision: number
  createdAt: number
  updatedAt: number
}

export type CreateConversationCommand = {
  id: string
  kind: ConversationKind
  title: string
  prompt: string
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  modelProfileId?: string
}

export type AppendConversationMessageCommand = {
  sessionId: string
  messageId: string
  content: string
  expectedRevision: number
  modelProfileId?: string
}

export type SpaceResourceDto = {
  id: string
  workspaceId: string
  name: string
  type: 'file' | 'document' | 'repository'
  locator: string
  detail: string
  sortOrder: number
  revision: number
  createdAt: number
  updatedAt: number
}

export type SaveSpaceResourceCommand = Omit<SpaceResourceDto, 'revision'> & {
  expectedRevision: number
}

export type NodeTodoDto = {
  id: string
  nodeRunId: string
  title: string
  required: boolean
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
  revision: number
  createdAt: number
  updatedAt: number
}

export type SaveNodeTodoCommand = Omit<NodeTodoDto, 'revision'> & {
  expectedRevision: number
}

export type NodeQuestionDto = {
  id: string
  nodeRunId: string
  prompt: string
  required: boolean
  status: 'open' | 'answered' | 'dismissed'
  answer?: string
  revision: number
  createdAt: number
  updatedAt: number
  answeredAt?: number
}

export type AnswerNodeQuestionCommand = {
  id: string
  nodeRunId: string
  answer: string
  expectedRevision: number
}

export type WorkflowNodeExecutionDto = {
  execution: {
    id: string
    requirementId: string
    status:
      | 'created'
      | 'running'
      | 'waiting_user'
      | 'paused'
      | 'completed'
      | 'failed'
      | 'cancelled'
      | 'interrupted'
    currentNodeId?: string
    revision: number
    createdAt: number
    updatedAt: number
    completedAt?: number
  }
  nodeRun: {
    id: string
    executionId: string
    nodeId: string
    aiRunId?: string
    status: RequirementNode['status']
    attempt: number
    revision: number
    createdAt: number
    updatedAt: number
    completedAt?: number
    checkpoint?: Record<string, unknown>
  }
}

export type ModelPoolDto = {
  providers: Array<ModelProvider & { revision: number }>
  profiles: Array<ModelProfile & { revision: number }>
}

export type SaveModelProviderCommand = ModelProvider & {
  expectedRevision: number
}

export type SaveModelProfileCommand = ModelProfile & {
  expectedRevision: number
}

export type ModelMetricFilters = {
  providerId?: string
  modelProfileId?: string
  workspaceId?: string
  requirementId?: string
  nodeId?: string
}

export interface BusinessApi {
  selectWorkRoot: (command: SelectWorkRootCommand) => Promise<WorkRootDto>
  listWorkRoots: () => Promise<WorkRootDto[]>
  createSpace: (command: CreateSpaceCommand) => Promise<SpaceDto>
  listSpaces: () => Promise<SpaceDto[]>
  updateSpace: (command: UpdateSpaceCommand) => Promise<SpaceDto>
  deleteSpace: (command: DeleteEntityCommand) => Promise<boolean>
  restoreSpace: (command: RestoreEntityCommand) => Promise<boolean>
  createRequirement: (
    command: CreateRequirementCommand
  ) => Promise<RequirementDto>
  listRequirements: (command: {
    workspaceId: string
  }) => Promise<RequirementDto[]>
  updateRequirement: (
    command: UpdateRequirementCommand
  ) => Promise<RequirementDto>
  deleteRequirement: (command: DeleteEntityCommand) => Promise<boolean>
  restoreRequirement: (command: RestoreEntityCommand) => Promise<boolean>
  listWorkflowTemplates: () => Promise<WorkflowTemplateDto[]>
  getRequirementWorkflow: (command: {
    requirementId: string
  }) => Promise<RequirementWorkflow | undefined>
  insertWorkflowNode: (
    command: InsertWorkflowNodeCommand
  ) => Promise<RequirementWorkflow>
  removeWorkflowNode: (
    command: RemoveWorkflowNodeCommand
  ) => Promise<RequirementWorkflow>
  updateWorkflowEdge: (
    command: UpdateWorkflowEdgeCommand
  ) => Promise<RequirementWorkflow>
  reorderWorkflowNodes: (
    command: ReorderWorkflowNodesCommand
  ) => Promise<RequirementWorkflow>
  getWorkflowNodeExecution: (command: {
    requirementId: string
    nodeId: string
  }) => Promise<WorkflowNodeExecutionDto | undefined>
  pauseWorkflowNode: (
    command: ManageWorkflowNodeExecutionCommand
  ) => Promise<RequirementWorkflow>
  resumeWorkflowNode: (
    command: ManageWorkflowNodeExecutionCommand
  ) => Promise<RequirementWorkflow>
  resolveWorkflowNodeGate: (
    command: ResolveWorkflowNodeGateCommand
  ) => Promise<RequirementWorkflow>
  listRecentConversations: () => Promise<ConversationDto[]>
  listWorkspaceConversations: (command: {
    workspaceId: string
  }) => Promise<ConversationDto[]>
  getConversation: (command: {
    sessionId: string
  }) => Promise<ConversationDto | undefined>
  createConversation: (
    command: CreateConversationCommand
  ) => Promise<ConversationDto>
  appendConversationMessage: (
    command: AppendConversationMessageCommand
  ) => Promise<ConversationDto>
  listSpaceResources: (command: {
    workspaceId: string
  }) => Promise<SpaceResourceDto[]>
  saveSpaceResource: (
    command: SaveSpaceResourceCommand
  ) => Promise<SpaceResourceDto>
  deleteSpaceResource: (command: DeleteEntityCommand) => Promise<boolean>
  listNodeTodos: (command: { nodeRunId: string }) => Promise<NodeTodoDto[]>
  saveNodeTodo: (command: SaveNodeTodoCommand) => Promise<NodeTodoDto>
  listNodeQuestions: (command: {
    nodeRunId: string
  }) => Promise<NodeQuestionDto[]>
  answerNodeQuestion: (
    command: AnswerNodeQuestionCommand
  ) => Promise<NodeQuestionDto>
  listModels: () => Promise<ModelPoolDto>
  saveModelProvider: (
    command: SaveModelProviderCommand
  ) => Promise<ModelProvider & { revision: number }>
  saveModelProfile: (
    command: SaveModelProfileCommand
  ) => Promise<ModelProfile & { revision: number }>
  setModelCredential: (command: {
    providerId: string
    value: string
  }) => Promise<void>
  listModelMetrics: (
    filters?: ModelMetricFilters
  ) => Promise<ModelCallMetric[]>
}

export type BusinessCommandHandlers = {
  [Key in keyof BusinessApi]: {
    execute: (...args: Parameters<BusinessApi[Key]>) => ReturnType<BusinessApi[Key]>
  }
}
