import type {
  NativeOverlayKind,
  NativeOverlayRequest,
  WorkbenchActionId
} from '../../../shared/native-overlay'
import {
  PERSISTENCE_DATASETS,
  type PersistenceDataset
} from '../../../shared/persistence'
import type { TerminalDimensions } from '../../../shared/terminal'
import type { WorkbenchBounds } from '../../../shared/workbench'
import type {
  RequirementManifest,
  WriteWorkspaceFileInput
} from '../../../shared/workspace'
import {
  isRequirementStageId,
  type RequirementStageId
} from '../../../domain/requirement'
import type {
  CancelAiRunInput,
  GetAiRunInput,
  ListAiRunEventsInput,
  StartAiRunInput
} from '../../../shared/ai-run'
import type {
  AnswerNodeQuestionCommand,
  AppendConversationMessageCommand,
  CreateConversationCommand,
  CreateRequirementCommand,
  CreateSpaceCommand,
  DeleteEntityCommand,
  InsertWorkflowNodeCommand,
  ManageWorkflowNodeExecutionCommand,
  ModelMetricFilters,
  RemoveWorkflowNodeCommand,
  ReorderWorkflowNodesCommand,
  ResolveWorkflowNodeGateCommand,
  SaveModelProfileCommand,
  SaveModelProviderCommand,
  SaveNodeTodoCommand,
  SaveSpaceResourceCommand,
  SelectWorkRootCommand,
  UpdateRequirementCommand,
  UpdateSpaceCommand,
  UpdateWorkflowEdgeCommand
} from '../../../shared/business'
import type {
  NodeRunStatus,
  RequirementNode,
  WorkflowEdge,
  WorkflowNodeType
} from '../../../domain/workflow'

const requirementStages = new Set([
  'analysis',
  'design',
  'implementation',
  'testing',
  'release',
  'retrospective'
])
const overlayKinds = new Set<NativeOverlayKind>(['workbench-menu'])
const workbenchActions = new Set<WorkbenchActionId>([
  'files',
  'folder',
  'browser',
  'terminal'
])
const persistenceDatasets = new Set<PersistenceDataset>(PERSISTENCE_DATASETS)
const workflowNodeTypes = new Set<WorkflowNodeType>([
  'ai_generate',
  'human_input',
  'tool',
  'approval'
])
const nodeRunStatuses = new Set<NodeRunStatus>([
  'pending',
  'ready',
  'running',
  'waiting_user',
  'paused',
  'blocked',
  'completed',
  'failed',
  'skipped',
  'cancelled',
  'interrupted'
])
const conversationKinds = new Set(['general', 'space', 'requirement_node'])
const resourceTypes = new Set(['file', 'document', 'repository'])
const todoStatuses = new Set([
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'cancelled'
])
const requirementStatuses = new Set(['pending', 'active', 'completed'])

export function requireSelectWorkRootCommand(
  value: unknown,
  channel: string
): SelectWorkRootCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    path: requireString(record.path, channel, 'command.path'),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireCreateSpaceCommand(
  value: unknown,
  channel: string
): CreateSpaceCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    name: requireString(record.name, channel, 'command.name', {
      maxLength: 160
    }),
    ...(record.description === undefined
      ? {}
      : {
          description: requireString(
            record.description,
            channel,
            'command.description',
            { allowEmpty: true, maxLength: 4_000 }
          )
        })
  }
}

export function requireCreateRequirementCommand(
  value: unknown,
  channel: string
): CreateRequirementCommand {
  const record = requireRecord(value, channel, 'command')
  if (
    record.syncCompletedArtifactsToKnowledge !== undefined &&
    typeof record.syncCompletedArtifactsToKnowledge !== 'boolean'
  ) {
    invalidIpcPayload(channel, 'command.syncCompletedArtifactsToKnowledge')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    workspaceId: requireEntityId(
      record.workspaceId,
      channel,
      'command.workspaceId'
    ),
    title: requireString(record.title, channel, 'command.title', {
      maxLength: 240
    }),
    templateVersionId: requireEntityId(
      record.templateVersionId,
      channel,
      'command.templateVersionId'
    ),
    ...(record.syncCompletedArtifactsToKnowledge === undefined
      ? {}
      : {
          syncCompletedArtifactsToKnowledge:
            record.syncCompletedArtifactsToKnowledge as boolean
        })
  }
}

export function requireWorkspaceIdCommand(
  value: unknown,
  channel: string
): { workspaceId: string } {
  const record = requireRecord(value, channel, 'command')
  return {
    workspaceId: requireEntityId(
      record.workspaceId,
      channel,
      'command.workspaceId'
    )
  }
}

export function requireSessionIdCommand(
  value: unknown,
  channel: string
): { sessionId: string } {
  const record = requireRecord(value, channel, 'command')
  return {
    sessionId: requireEntityId(record.sessionId, channel, 'command.sessionId')
  }
}

export function requireNodeRunIdCommand(
  value: unknown,
  channel: string
): { nodeRunId: string } {
  const record = requireRecord(value, channel, 'command')
  return {
    nodeRunId: requireEntityId(record.nodeRunId, channel, 'command.nodeRunId')
  }
}

export function requireDeleteEntityCommand(
  value: unknown,
  channel: string
): DeleteEntityCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireRestoreEntityCommand(
  value: unknown,
  channel: string
): { id: string } {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id')
  }
}

export function requireUpdateSpaceCommand(
  value: unknown,
  channel: string
): UpdateSpaceCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    ...requireDeleteEntityCommand(value, channel),
    ...(record.label === undefined
      ? {}
      : {
          label: requireString(record.label, channel, 'command.label', {
            maxLength: 160
          })
        }),
    ...(record.description === undefined
      ? {}
      : {
          description: requireString(
            record.description,
            channel,
            'command.description',
            { allowEmpty: true, maxLength: 4_000 }
          )
        }),
    ...(record.sortOrder === undefined
      ? {}
      : {
          sortOrder: requireNonNegativeInteger(
            record.sortOrder,
            channel,
            'command.sortOrder'
          )
        })
  }
}

export function requireUpdateRequirementCommand(
  value: unknown,
  channel: string
): UpdateRequirementCommand {
  const record = requireRecord(value, channel, 'command')
  if (
    record.status !== undefined &&
    !requirementStatuses.has(record.status as string)
  ) {
    invalidIpcPayload(channel, 'command.status')
  }
  if (
    record.syncCompletedArtifactsToKnowledge !== undefined &&
    typeof record.syncCompletedArtifactsToKnowledge !== 'boolean'
  ) {
    invalidIpcPayload(channel, 'command.syncCompletedArtifactsToKnowledge')
  }
  return {
    ...requireDeleteEntityCommand(value, channel),
    ...(record.title === undefined
      ? {}
      : {
          title: requireString(record.title, channel, 'command.title', {
            maxLength: 240
          })
        }),
    ...(record.status === undefined
      ? {}
      : { status: record.status as UpdateRequirementCommand['status'] }),
    ...(record.sortOrder === undefined
      ? {}
      : {
          sortOrder: requireNonNegativeInteger(
            record.sortOrder,
            channel,
            'command.sortOrder'
          )
        }),
    ...(record.syncCompletedArtifactsToKnowledge === undefined
      ? {}
      : {
          syncCompletedArtifactsToKnowledge:
            record.syncCompletedArtifactsToKnowledge as boolean
        })
  }
}

export function requireCreateConversationCommand(
  value: unknown,
  channel: string
): CreateConversationCommand {
  const record = requireRecord(value, channel, 'command')
  if (!conversationKinds.has(record.kind as string)) {
    invalidIpcPayload(channel, 'command.kind')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    kind: record.kind as CreateConversationCommand['kind'],
    title: requireString(record.title, channel, 'command.title', {
      maxLength: 240
    }),
    prompt: requireString(record.prompt, channel, 'command.prompt', {
      maxLength: 128 * 1024
    }),
    ...optionalEntityId(record, 'workspaceId', channel),
    ...optionalEntityId(record, 'requirementId', channel),
    ...optionalEntityId(record, 'nodeRunId', channel),
    ...(record.modelProfileId === undefined
      ? {}
      : {
          modelProfileId: requireEntityId(
            record.modelProfileId,
            channel,
            'command.modelProfileId'
          )
        }),
    ...(record.folderPath === undefined
      ? {}
      : {
          folderPath: requireString(
            record.folderPath,
            channel,
            'command.folderPath'
          )
        })
  }
}

export function requireAppendConversationMessageCommand(
  value: unknown,
  channel: string
): AppendConversationMessageCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    sessionId: requireEntityId(record.sessionId, channel, 'command.sessionId'),
    messageId: requireEntityId(record.messageId, channel, 'command.messageId'),
    content: requireString(record.content, channel, 'command.content', {
      maxLength: 128 * 1024
    }),
    expectedRevision: requireRevision(record.expectedRevision, channel),
    ...(record.modelProfileId === undefined
      ? {}
      : {
          modelProfileId: requireEntityId(
            record.modelProfileId,
            channel,
            'command.modelProfileId'
          )
        })
  }
}

export function requireSaveSpaceResourceCommand(
  value: unknown,
  channel: string
): SaveSpaceResourceCommand {
  const record = requireRecord(value, channel, 'command')
  if (!resourceTypes.has(record.type as string)) {
    invalidIpcPayload(channel, 'command.type')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    workspaceId: requireEntityId(
      record.workspaceId,
      channel,
      'command.workspaceId'
    ),
    name: requireString(record.name, channel, 'command.name', {
      maxLength: 240
    }),
    type: record.type as SaveSpaceResourceCommand['type'],
    locator: requireString(record.locator, channel, 'command.locator'),
    detail: requireString(record.detail, channel, 'command.detail', {
      allowEmpty: true
    }),
    sortOrder: requireNonNegativeInteger(
      record.sortOrder,
      channel,
      'command.sortOrder'
    ),
    expectedRevision: requireRevision(record.expectedRevision, channel),
    createdAt: requireTimestamp(record.createdAt, channel, 'command.createdAt'),
    updatedAt: requireTimestamp(record.updatedAt, channel, 'command.updatedAt')
  }
}

export function requireSaveNodeTodoCommand(
  value: unknown,
  channel: string
): SaveNodeTodoCommand {
  const record = requireRecord(value, channel, 'command')
  if (!todoStatuses.has(record.status as string)) {
    invalidIpcPayload(channel, 'command.status')
  }
  if (typeof record.required !== 'boolean') {
    invalidIpcPayload(channel, 'command.required')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    nodeRunId: requireEntityId(record.nodeRunId, channel, 'command.nodeRunId'),
    title: requireString(record.title, channel, 'command.title', {
      maxLength: 500
    }),
    required: record.required,
    status: record.status as SaveNodeTodoCommand['status'],
    expectedRevision: requireRevision(record.expectedRevision, channel),
    createdAt: requireTimestamp(record.createdAt, channel, 'command.createdAt'),
    updatedAt: requireTimestamp(record.updatedAt, channel, 'command.updatedAt')
  }
}

export function requireAnswerNodeQuestionCommand(
  value: unknown,
  channel: string
): AnswerNodeQuestionCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    nodeRunId: requireEntityId(record.nodeRunId, channel, 'command.nodeRunId'),
    answer: requireString(record.answer, channel, 'command.answer', {
      maxLength: 128 * 1024
    }),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireModelCredentialCommand(
  value: unknown,
  channel: string
): { providerId: string; value: string } {
  const record = requireRecord(value, channel, 'command')
  return {
    providerId: requireEntityId(
      record.providerId,
      channel,
      'command.providerId'
    ),
    value: requireString(record.value, channel, 'command.value', {
      maxLength: 16 * 1024
    })
  }
}

export function requireSaveModelProviderCommand(
  value: unknown,
  channel: string
): SaveModelProviderCommand {
  const record = requireRecord(value, channel, 'command')
  if (!['local', 'openai_compatible'].includes(record.type as string)) {
    invalidIpcPayload(channel, 'command.type')
  }
  if (typeof record.enabled !== 'boolean') {
    invalidIpcPayload(channel, 'command.enabled')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    type: record.type as SaveModelProviderCommand['type'],
    name: requireString(record.name, channel, 'command.name', {
      maxLength: 240
    }),
    baseUrl: requireString(record.baseUrl, channel, 'command.baseUrl', {
      maxLength: 2_048
    }),
    enabled: record.enabled,
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireSaveModelProfileCommand(
  value: unknown,
  channel: string
): SaveModelProfileCommand {
  const record = requireRecord(value, channel, 'command')
  const capabilities = requireRecord(
    record.capabilities,
    channel,
    'command.capabilities'
  )
  for (const key of ['text', 'vision', 'toolCalling', 'structuredOutput']) {
    if (typeof capabilities[key] !== 'boolean') {
      invalidIpcPayload(channel, `command.capabilities.${key}`)
    }
  }
  if (typeof record.enabled !== 'boolean') {
    invalidIpcPayload(channel, 'command.enabled')
  }
  const contextWindow = requireNonNegativeInteger(
    record.contextWindow,
    channel,
    'command.contextWindow'
  )
  if (contextWindow === 0) {
    invalidIpcPayload(channel, 'command.contextWindow')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    providerId: requireEntityId(
      record.providerId,
      channel,
      'command.providerId'
    ),
    modelId: requireString(record.modelId, channel, 'command.modelId', {
      maxLength: 240
    }),
    displayName: requireString(
      record.displayName,
      channel,
      'command.displayName',
      { maxLength: 240 }
    ),
    enabled: record.enabled,
    capabilities: {
      text: capabilities.text as boolean,
      vision: capabilities.vision as boolean,
      toolCalling: capabilities.toolCalling as boolean,
      structuredOutput: capabilities.structuredOutput as boolean
    },
    contextWindow,
    inputCostPerMillionTokens: requireFiniteNumber(
      record.inputCostPerMillionTokens,
      channel,
      'command.inputCostPerMillionTokens'
    ),
    outputCostPerMillionTokens: requireFiniteNumber(
      record.outputCostPerMillionTokens,
      channel,
      'command.outputCostPerMillionTokens'
    ),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireModelMetricFilters(
  value: unknown,
  channel: string
): ModelMetricFilters | undefined {
  if (value === undefined) return undefined
  const record = requireRecord(value, channel, 'filters')
  return Object.fromEntries(
    ['providerId', 'modelProfileId', 'workspaceId', 'requirementId', 'nodeId']
      .filter((key) => record[key] !== undefined)
      .map((key) => [
        key,
        requireEntityId(record[key], channel, `filters.${key}`)
      ])
  ) as ModelMetricFilters
}

export function requireRequirementIdCommand(
  value: unknown,
  channel: string
): { requirementId: string } {
  const record = requireRecord(value, channel, 'command')
  return {
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    )
  }
}

export function requireWorkflowNodeIdCommand(
  value: unknown,
  channel: string
): { requirementId: string; nodeId: string } {
  const record = requireRecord(value, channel, 'command')
  return {
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    nodeId: requireEntityId(record.nodeId, channel, 'command.nodeId')
  }
}

export function requireManageWorkflowNodeExecutionCommand(
  value: unknown,
  channel: string
): ManageWorkflowNodeExecutionCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    nodeRunId: requireEntityId(record.nodeRunId, channel, 'command.nodeRunId'),
    expectedWorkflowRevision: requireRevision(
      record.expectedWorkflowRevision,
      channel
    ),
    expectedNodeRunRevision: requireRevision(
      record.expectedNodeRunRevision,
      channel
    ),
    ...(record.modelProfileId === undefined
      ? {}
      : {
          modelProfileId: requireEntityId(
            record.modelProfileId,
            channel,
            'command.modelProfileId'
          )
        })
  }
}

export function requireResolveWorkflowNodeGateCommand(
  value: unknown,
  channel: string
): ResolveWorkflowNodeGateCommand {
  const record = requireRecord(value, channel, 'command')
  const gate = requireRecord(record.gate, channel, 'command.gate')
  const common = {
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    nodeRunId: requireEntityId(record.nodeRunId, channel, 'command.nodeRunId'),
    expectedNodeRunRevision: requireRevision(
      record.expectedNodeRunRevision,
      channel
    )
  }
  if (gate.kind === 'approval') {
    if (gate.result !== 'approved' && gate.result !== 'rejected') {
      invalidIpcPayload(channel, 'command.gate.result')
    }
    return {
      ...common,
      gate: {
        kind: 'approval',
        result: gate.result as 'approved' | 'rejected'
      }
    }
  }
  if (gate.kind === 'custom') {
    if (typeof gate.passed !== 'boolean') {
      invalidIpcPayload(channel, 'command.gate.passed')
    }
    return {
      ...common,
      gate: {
        kind: 'custom',
        gateId: requireEntityId(
          gate.gateId,
          channel,
          'command.gate.gateId'
        ),
        passed: gate.passed as boolean
      }
    }
  }
  invalidIpcPayload(channel, 'command.gate.kind')
}

export function requireRemoveWorkflowNodeCommand(
  value: unknown,
  channel: string
): RemoveWorkflowNodeCommand {
  const record = requireWorkflowRevisionCommand(value, channel)
  return {
    ...record,
    nodeId: requireEntityId(
      (value as Record<string, unknown>).nodeId,
      channel,
      'command.nodeId'
    )
  }
}

export function requireInsertWorkflowNodeCommand(
  value: unknown,
  channel: string
): InsertWorkflowNodeCommand {
  const command = requireWorkflowRevisionCommand(value, channel)
  const record = value as Record<string, unknown>
  const afterNodeId =
    record.afterNodeId === undefined
      ? undefined
      : requireEntityId(record.afterNodeId, channel, 'command.afterNodeId')
  const beforeNodeId =
    record.beforeNodeId === undefined
      ? undefined
      : requireEntityId(record.beforeNodeId, channel, 'command.beforeNodeId')
  return {
    ...command,
    node: requireWorkflowNode(record.node, channel),
    ...(afterNodeId ? { afterNodeId } : {}),
    ...(beforeNodeId ? { beforeNodeId } : {})
  }
}

export function requireUpdateWorkflowEdgeCommand(
  value: unknown,
  channel: string
): UpdateWorkflowEdgeCommand {
  const command = requireWorkflowRevisionCommand(value, channel)
  const record = value as Record<string, unknown>
  return {
    ...command,
    edgeId: requireEntityId(record.edgeId, channel, 'command.edgeId'),
    edge: requireWorkflowEdge(record.edge, channel)
  }
}

export function requireReorderWorkflowNodesCommand(
  value: unknown,
  channel: string
): ReorderWorkflowNodesCommand {
  const command = requireWorkflowRevisionCommand(value, channel)
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.orderedNodeIds)) {
    invalidIpcPayload(channel, 'command.orderedNodeIds')
  }
  return {
    ...command,
    orderedNodeIds: record.orderedNodeIds.map((id, index) =>
      requireEntityId(id, channel, `command.orderedNodeIds.${index}`)
    )
  }
}

export function requirePersistenceDataset(
  value: unknown,
  channel: string
): PersistenceDataset {
  if (!persistenceDatasets.has(value as PersistenceDataset)) {
    invalidIpcPayload(channel, 'dataset')
  }
  return value as PersistenceDataset
}

export function requireRevision(value: unknown, channel: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalidIpcPayload(channel, 'expectedRevision')
  }
  return value
}

export function requirePersistenceValue(
  dataset: PersistenceDataset,
  value: unknown,
  channel: string
): unknown {
  const record = requireRecord(value, channel, 'value')
  if (dataset === 'workspaceNavigation') {
    if (
      record.version !== 1 ||
      !Array.isArray(record.spaces) ||
      !isRecord(record.requirementsBySpace)
    ) {
      invalidIpcPayload(channel, 'value')
    }
    for (const [index, space] of record.spaces.entries()) {
      const item = requireRecord(space, channel, `value.spaces.${index}`)
      requireString(item.path, channel, `value.spaces.${index}.path`)
      requireString(item.label, channel, `value.spaces.${index}.label`)
      requireString(
        item.description,
        channel,
        `value.spaces.${index}.description`,
        { allowEmpty: true }
      )
    }
    for (const [spacePath, requirements] of Object.entries(
      record.requirementsBySpace
    )) {
      if (!Array.isArray(requirements)) {
        invalidIpcPayload(channel, `value.requirementsBySpace.${spacePath}`)
      }
      for (const [index, requirement] of requirements.entries()) {
        const item = requireRecord(
          requirement,
          channel,
          `value.requirementsBySpace.${spacePath}.${index}`
        )
        requireString(
          item.id,
          channel,
          `value.requirementsBySpace.${spacePath}.${index}.id`
        )
        requireString(
          item.title,
          channel,
          `value.requirementsBySpace.${spacePath}.${index}.title`
        )
        if (item.stage !== undefined && !isRequirementStageId(item.stage)) {
          invalidIpcPayload(
            channel,
            `value.requirementsBySpace.${spacePath}.${index}.stage`
          )
        }
      }
    }
    return value
  }
  if (dataset === 'chatSessions') {
    if (record.version !== 4 || !Array.isArray(record.sessions)) {
      invalidIpcPayload(channel, 'value')
    }
    for (const [index, session] of record.sessions.entries()) {
      const item = requireRecord(session, channel, `value.sessions.${index}`)
      requireString(item.id, channel, `value.sessions.${index}.id`)
      requireString(item.title, channel, `value.sessions.${index}.title`)
      requireString(
        item.spacePath,
        channel,
        `value.sessions.${index}.spacePath`
      )
      if (!Array.isArray(item.messages)) {
        invalidIpcPayload(channel, `value.sessions.${index}.messages`)
      }
    }
    return value
  }
  if (record.version !== 1 || !isRecord(record.resourcesBySpace)) {
    invalidIpcPayload(channel, 'value')
  }
  for (const [spacePath, resources] of Object.entries(
    record.resourcesBySpace
  )) {
    if (!Array.isArray(resources)) {
      invalidIpcPayload(channel, `value.resourcesBySpace.${spacePath}`)
    }
  }
  return value
}

export function invalidIpcPayload(channel: string, field: string): never {
  throw new TypeError(`Invalid IPC payload for ${channel}: ${field}`)
}

export function requireString(
  value: unknown,
  channel: string,
  field: string,
  options: { allowEmpty?: boolean; maxLength?: number } = {}
): string {
  if (
    typeof value !== 'string' ||
    (!options.allowEmpty && value.trim().length === 0) ||
    value.length > (options.maxLength ?? 4096)
  ) {
    invalidIpcPayload(channel, field)
  }
  return value
}

export function requireStartAiRunInput(
  value: unknown,
  channel: string
): StartAiRunInput {
  const record = requireRecord(value, channel, 'input')
  const requirementId = requireString(
    record.requirementId,
    channel,
    'input.requirementId'
  )
  if (!/^[A-Za-z0-9._-]+$/.test(requirementId)) {
    invalidIpcPayload(channel, 'input.requirementId')
  }
  const modelProfileId =
    record.modelProfileId === undefined
      ? undefined
      : requireString(record.modelProfileId, channel, 'input.modelProfileId')
  if (record.nodeId !== undefined) {
    const nodeId = requireEntityId(record.nodeId, channel, 'input.nodeId')
    const nodeRunId = requireEntityId(
      record.nodeRunId,
      channel,
      'input.nodeRunId'
    )
    if (record.stageId !== undefined && !isRequirementStageId(record.stageId)) {
      invalidIpcPayload(channel, 'input.stageId')
    }
    return {
      requirementId,
      nodeId,
      nodeRunId,
      ...(record.stageId
        ? { stageId: record.stageId as RequirementStageId }
        : {}),
      ...(modelProfileId ? { modelProfileId } : {})
    }
  }
  if (!isRequirementStageId(record.stageId)) {
    invalidIpcPayload(channel, 'input.stageId')
  }
  const nodeRunId =
    record.nodeRunId === undefined
      ? undefined
      : requireEntityId(record.nodeRunId, channel, 'input.nodeRunId')
  return {
    requirementId,
    stageId: record.stageId as RequirementStageId,
    ...(modelProfileId ? { modelProfileId } : {}),
    ...(nodeRunId ? { nodeRunId } : {})
  }
}

export function requireCancelAiRunInput(
  value: unknown,
  channel: string
): CancelAiRunInput {
  return requireRunIdInput(value, channel)
}

export function requireGetAiRunInput(
  value: unknown,
  channel: string
): GetAiRunInput {
  return requireRunIdInput(value, channel)
}

export function requireListAiRunEventsInput(
  value: unknown,
  channel: string
): ListAiRunEventsInput {
  return requireRunIdInput(value, channel)
}

function requireRunIdInput(value: unknown, channel: string): { runId: string } {
  const record = requireRecord(value, channel, 'input')
  return {
    runId: requireString(record.runId, channel, 'input.runId', {
      maxLength: 128
    })
  }
}

export function requireWorkbenchBounds(
  value: unknown,
  channel: string,
  field = 'bounds'
): WorkbenchBounds {
  const record = requireRecord(value, channel, field)
  const bounds = {
    x: requireFiniteNumber(record.x, channel, `${field}.x`),
    y: requireFiniteNumber(record.y, channel, `${field}.y`),
    width: requireFiniteNumber(record.width, channel, `${field}.width`),
    height: requireFiniteNumber(record.height, channel, `${field}.height`)
  }
  if (bounds.width < 0 || bounds.height < 0) {
    invalidIpcPayload(channel, field)
  }
  return bounds
}

export function requireTerminalDimensions(
  value: unknown,
  channel: string
): TerminalDimensions {
  const record = requireRecord(value, channel, 'dimensions')
  const cols = record.cols
  const rows = record.rows
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    (cols as number) < 2 ||
    (cols as number) > 500 ||
    (rows as number) < 1 ||
    (rows as number) > 300
  ) {
    invalidIpcPayload(channel, 'dimensions')
  }
  return { cols: cols as number, rows: rows as number }
}

export function requireNativeOverlayRequest(
  value: unknown,
  channel: string
): NativeOverlayRequest {
  const record = requireRecord(value, channel, 'request')
  if (!overlayKinds.has(record.kind as NativeOverlayKind)) {
    invalidIpcPayload(channel, 'request.kind')
  }
  return {
    kind: record.kind as NativeOverlayKind,
    anchor: requireWorkbenchBounds(record.anchor, channel, 'request.anchor')
  }
}

export function requireNativeOverlayKind(
  value: unknown,
  channel: string
): NativeOverlayKind {
  if (!overlayKinds.has(value as NativeOverlayKind)) {
    invalidIpcPayload(channel, 'kind')
  }
  return value as NativeOverlayKind
}

export function requireWorkbenchAction(
  value: unknown,
  channel: string
): WorkbenchActionId {
  if (!workbenchActions.has(value as WorkbenchActionId)) {
    invalidIpcPayload(channel, 'action')
  }
  return value as WorkbenchActionId
}

export function requireWriteWorkspaceFileInput(
  value: unknown,
  channel: string
): WriteWorkspaceFileInput {
  const record = requireRecord(value, channel, 'input')
  return {
    requirementId: requireString(
      record.requirementId,
      channel,
      'input.requirementId'
    ),
    path: requireString(record.path, channel, 'input.path'),
    content: requireString(record.content, channel, 'input.content', {
      allowEmpty: true,
      maxLength: 2 * 1024 * 1024
    }),
    expectedVersion: requireString(
      record.expectedVersion,
      channel,
      'input.expectedVersion'
    )
  }
}

export function requireRequirementManifest(
  value: unknown,
  channel: string
): RequirementManifest {
  const manifest = requireRecord(value, channel, 'manifest')
  requireString(manifest.requirementId, channel, 'manifest.requirementId')
  const stages = requireRecord(manifest.stages, channel, 'manifest.stages')
  if (manifest.version !== 1) invalidIpcPayload(channel, 'manifest.version')

  for (const [stageId, stage] of Object.entries(stages)) {
    if (!requirementStages.has(stageId)) {
      invalidIpcPayload(channel, `manifest.stages.${stageId}`)
    }
    const stageRecord = requireRecord(
      stage,
      channel,
      `manifest.stages.${stageId}`
    )
    if (!Array.isArray(stageRecord.artifacts)) {
      invalidIpcPayload(channel, `manifest.stages.${stageId}.artifacts`)
    }
    for (const [index, artifact] of stageRecord.artifacts.entries()) {
      const artifactRecord = requireRecord(
        artifact,
        channel,
        `manifest.stages.${stageId}.artifacts.${index}`
      )
      requireString(
        artifactRecord.path,
        channel,
        `manifest.stages.${stageId}.artifacts.${index}.path`
      )
      if (
        artifactRecord.primary !== undefined &&
        typeof artifactRecord.primary !== 'boolean'
      ) {
        invalidIpcPayload(
          channel,
          `manifest.stages.${stageId}.artifacts.${index}.primary`
        )
      }
    }
  }

  return value as RequirementManifest
}

function requireWorkflowRevisionCommand(
  value: unknown,
  channel: string
): { requirementId: string; expectedRevision: number } {
  const record = requireRecord(value, channel, 'command')
  return {
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

function requireWorkflowNode(value: unknown, channel: string): RequirementNode {
  const record = requireRecord(value, channel, 'command.node')
  if (!workflowNodeTypes.has(record.type as WorkflowNodeType)) {
    invalidIpcPayload(channel, 'command.node.type')
  }
  if (!nodeRunStatuses.has(record.status as NodeRunStatus)) {
    invalidIpcPayload(channel, 'command.node.status')
  }
  if (
    !Number.isSafeInteger(record.order) ||
    (record.order as number) < 0 ||
    typeof record.allowSkip !== 'boolean'
  ) {
    invalidIpcPayload(channel, 'command.node')
  }
  const executor =
    record.executor === undefined
      ? undefined
      : requireAiGenerateExecutor(record.executor, channel)
  const completionGate =
    record.completionGate === undefined
      ? undefined
      : requireCompletionGate(record.completionGate, channel)
  if (record.type === 'ai_generate' && !executor) {
    invalidIpcPayload(channel, 'command.node.executor')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.node.id'),
    type: record.type as WorkflowNodeType,
    name: requireString(record.name, channel, 'command.node.name', {
      maxLength: 160
    }),
    description: requireString(
      record.description,
      channel,
      'command.node.description',
      { allowEmpty: true, maxLength: 4_000 }
    ),
    order: record.order as number,
    status: record.status as NodeRunStatus,
    allowSkip: record.allowSkip,
    ...(executor ? { executor } : {}),
    ...(completionGate ? { completionGate } : {})
  }
}

function requireCompletionGate(
  value: unknown,
  channel: string
): NonNullable<RequirementNode['completionGate']> {
  const record = requireRecord(value, channel, 'command.node.completionGate')
  if (
    record.requireApproval !== undefined &&
    typeof record.requireApproval !== 'boolean'
  ) {
    invalidIpcPayload(channel, 'command.node.completionGate.requireApproval')
  }
  return {
    ...(record.requireApproval === undefined
      ? {}
      : { requireApproval: record.requireApproval }),
    ...(record.customGateId === undefined
      ? {}
      : {
          customGateId: requireEntityId(
            record.customGateId,
            channel,
            'command.node.completionGate.customGateId'
          )
        })
  }
}

function requireAiGenerateExecutor(
  value: unknown,
  channel: string
): NonNullable<RequirementNode['executor']> {
  const record = requireRecord(value, channel, 'command.node.executor')
  if (record.kind !== 'ai_generate') {
    invalidIpcPayload(channel, 'command.node.executor.kind')
  }
  const artifact = requireRecord(
    record.artifact,
    channel,
    'command.node.executor.artifact'
  )
  if (
    record.legacyStageId !== undefined &&
    !isRequirementStageId(record.legacyStageId)
  ) {
    invalidIpcPayload(channel, 'command.node.executor.legacyStageId')
  }
  const legacyStageId = record.legacyStageId as RequirementStageId | undefined
  const context =
    record.context === undefined
      ? undefined
      : requireAiGenerateContext(record.context, channel)
  return {
    kind: 'ai_generate',
    prompt: requireString(
      record.prompt,
      channel,
      'command.node.executor.prompt',
      { maxLength: 20_000 }
    ),
    artifact: {
      relativePath: requireString(
        artifact.relativePath,
        channel,
        'command.node.executor.artifact.relativePath',
        { maxLength: 1_000 }
      ),
      kind: requireString(
        artifact.kind,
        channel,
        'command.node.executor.artifact.kind',
        { maxLength: 80 }
      )
    },
    ...(context ? { context } : {}),
    ...(legacyStageId ? { legacyStageId } : {})
  }
}

function requireAiGenerateContext(
  value: unknown,
  channel: string
): NonNullable<RequirementNode['executor']>['context'] {
  const record = requireRecord(value, channel, 'command.node.executor.context')
  if (record.attachments === undefined) return {}
  if (!Array.isArray(record.attachments) || record.attachments.length > 100) {
    invalidIpcPayload(channel, 'command.node.executor.context.attachments')
  }
  return {
    attachments: (record.attachments as unknown[]).map((value, index) => {
      const path = requireString(
        value,
        channel,
        `command.node.executor.context.attachments[${index}]`,
        { maxLength: 1_000 }
      )
      if (
        !path.startsWith('attachments/') ||
        path.includes('\\') ||
        path.split('/').includes('..')
      ) {
        invalidIpcPayload(
          channel,
          `command.node.executor.context.attachments[${index}]`
        )
      }
      return path
    })
  }
}

function requireWorkflowEdge(value: unknown, channel: string): WorkflowEdge {
  const record = requireRecord(value, channel, 'command.edge')
  return {
    id: requireEntityId(record.id, channel, 'command.edge.id'),
    sourceNodeId: requireEntityId(
      record.sourceNodeId,
      channel,
      'command.edge.sourceNodeId'
    ),
    targetNodeId: requireEntityId(
      record.targetNodeId,
      channel,
      'command.edge.targetNodeId'
    )
  }
}

function requireEntityId(
  value: unknown,
  channel: string,
  field: string
): string {
  const id = requireString(value, channel, field, { maxLength: 128 })
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) invalidIpcPayload(channel, field)
  return id
}

function optionalEntityId(
  record: Record<string, unknown>,
  key: 'workspaceId' | 'requirementId' | 'nodeRunId',
  channel: string
): Partial<Record<typeof key, string>> {
  return record[key] === undefined
    ? {}
    : {
        [key]: requireEntityId(record[key], channel, `command.${key}`)
      }
}

function requireNonNegativeInteger(
  value: unknown,
  channel: string,
  field: string
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalidIpcPayload(channel, field)
  }
  return value as number
}

function requireTimestamp(
  value: unknown,
  channel: string,
  field: string
): number {
  return requireNonNegativeInteger(value, channel, field)
}

function requireRecord(
  value: unknown,
  channel: string,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidIpcPayload(channel, field)
  }
  return value as Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requireFiniteNumber(
  value: unknown,
  channel: string,
  field: string
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalidIpcPayload(channel, field)
  }
  return value
}
