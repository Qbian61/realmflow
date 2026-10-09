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
import {
  MODEL_STATISTICS_GROUPS,
  type ModelStatisticsQuery
} from '../../../shared/model-statistics'
import type { ProductAnalyticsQuery } from '../../../shared/product-analytics'
import type {
  RequirementManifest,
  WriteWorkspaceFileInput
} from '../../../shared/workspace'
import {
  isRequirementStageId,
  type RequirementStageId
} from '../../../domain/requirement'
import type { ModelCapability, ModelRouteRequest } from '../../../domain/model'
import {
  REASONING_PREFERENCES,
  type ReasoningPreference
} from '../../../domain/reasoning-router'
import { getConfigurableBuiltinModelProvider } from '../../../domain/model-provider-catalog'
import { normalizeModelProviderHeaders } from '../../../domain/model'
import type { OutboundCallQuery } from '../../../domain/outbound-call'
import { isSupportLinkTarget } from '../../../domain/app-support'
import {
  normalizeConversationKnowledgeScope,
  type ConversationKnowledgeScope
} from '../../../domain/conversation-knowledge-scope'
import type {
  AgentRunRecoveryAction,
  CancelAiRunInput,
  GetAiRunInput,
  ListAiRunEventsInput,
  StartAiRunInput
} from '../../../shared/ai-run'
import {
  normalizeScheduleDefinition,
  type ScheduleDefinition
} from '../../../domain/schedule'
import { normalizeToolDefinitionReference } from '../../../domain/tool-definition'
import type {
  AddWorkflowTemplateEdgeCommand,
  AddWorkflowTemplateNodeCommand,
  ArchiveKnowledgeNoteCommand,
  ApplyTemplateMigrationCommand,
  AnswerNodeQuestionCommand,
  AppendConversationMessageCommand,
  CatalogSearchQueryDto,
  CheckForUpdatesCommand,
  ConfigureBuiltinModelProviderCommand,
  ConfigureDiscoveredModelProviderCommand,
  ConfigureWorkflowTemplateNodeCommand,
  CopyWorkflowTemplateCommand,
  CopyWorkflowTemplateNodeCommand,
  CreateKnowledgeNoteCommand,
  CreateOnlineDocumentSourceCommand,
  CreateConversationCommand,
  CreateRequirementCommand,
  CreateScheduleCommand,
  CreateSpaceCommand,
  CreateWorkflowTemplateCommand,
  CreateWorkflowTemplateVersionCommand,
  DeleteConversationCommand,
  DeleteConnectorCommand,
  DeleteModelProfileCommand,
  DeleteModelProviderCommand,
  DeleteNodeTodoCommand,
  DeleteEntityCommand,
  DismissNodeQuestionCommand,
  EditKnowledgeNoteCommand,
  InsertWorkflowNodeCommand,
  IngestLocalFilesCommand,
  IngestLocalRepositoryCommand,
  IngestRemoteRepositoryCommand,
  ListRepositoryBranchesQuery,
  ListScheduleRunsQuery,
  ManageKnowledgeSourceCommand,
  ManageWorkflowNodeExecutionCommand,
  OpenNodeQuestionCommand,
  OpenSupportLinkCommand,
  ChooseBackupDestinationCommand,
  PrepareRestoreCommand,
  PrepareContextSnapshotCommand,
  PurgeEntityCommand,
  RecentConversationQuery,
  RefreshKnowledgeSourceCommand,
  RegisterKnowledgeSourceCommand,
  RollbackWorkflowToNodeCommand,
  RemoveModelProviderCredentialCommand,
  RemoveWorkflowTemplateEdgeCommand,
  RemoveWorkflowTemplateNodeCommand,
  RestoreWorkflowTemplateNodeCommand,
  RelocateSpaceCommand,
  RenameManagedDirectoryCommand,
  RenameConversationCommand,
  RotateModelCredentialKeyCommand,
  RunScheduleNowCommand,
  RemoveWorkflowNodeCommand,
  ReorderWorkflowNodesCommand,
  ReorderWorkflowTemplateNodesCommand,
  ResolveWorkflowNodeGateCommand,
  SaveApplicationModelDefaultCommand,
  SetKnowledgeRefreshPolicyCommand,
  SaveConnectorCommand,
  SaveModelProfileCommand,
  SaveModelProviderCommand,
  SaveNodeTodoCommand,
  SendFollowUpSuggestionCommand,
  SelectWorkRootCommand,
  SetWorkflowParallelismCommand,
  SetModelProfilesEnabledCommandDto,
  SkipWorkflowNodeCommand,
  RefreshRepositorySourceCommand,
  RetryRepositoryFileIndexCommand,
  SyncOnlineDocumentSourceCommand,
  TransitionWorkflowTemplateCommand,
  TransitionScheduleCommand,
  UpdateRequirementCommand,
  UpdateRepositoryBranchCommand,
  UpdateScheduleCommand,
  UpdateSpaceCommand,
  ValidateConnectorCommand,
  ValidateModelProfileCommand,
  UpdateWorkflowNodeCommand,
  UpdateWorkflowTemplateCommand,
  UpdateWorkflowTemplateNodeCommand,
  UpdateWorkflowTemplateNodePositionsCommand,
  UpdateWorkflowEdgeCommand
} from '../../../shared/business'
import type { KnowledgeSearchQueryInput } from '../../../domain/knowledge-search'
import type {
  NodeRunStatus,
  RequirementNode,
  WorkflowEdge,
  WorkflowNodeConfiguration,
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
const reasoningPreferences = new Set<string>(REASONING_PREFERENCES)
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

export function requireCreateWorkflowTemplateCommand(
  value: unknown,
  channel: string
): CreateWorkflowTemplateCommand {
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

export function requireCopyWorkflowTemplateCommand(
  value: unknown,
  channel: string
): CopyWorkflowTemplateCommand {
  const command = requireCreateWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  return {
    ...command,
    sourceTemplateId: requireEntityId(
      record.sourceTemplateId,
      channel,
      'command.sourceTemplateId'
    ),
    ...(record.sourceVersionId === undefined
      ? {}
      : {
          sourceVersionId: requireEntityId(
            record.sourceVersionId,
            channel,
            'command.sourceVersionId'
          )
        })
  }
}

export function requireUpdateWorkflowTemplateCommand(
  value: unknown,
  channel: string
): UpdateWorkflowTemplateCommand {
  const record = requireRecord(value, channel, 'command')
  if (record.name === undefined && record.description === undefined) {
    invalidIpcPayload(channel, 'command')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision: requireRevision(record.expectedRevision, channel),
    ...(record.name === undefined
      ? {}
      : {
          name: requireString(record.name, channel, 'command.name', {
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
        })
  }
}

export function requireTransitionWorkflowTemplateCommand(
  value: unknown,
  channel: string
): TransitionWorkflowTemplateCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireCreateWorkflowTemplateVersionCommand(
  value: unknown,
  channel: string
): CreateWorkflowTemplateVersionCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  return {
    ...command,
    sourceVersionId: requireEntityId(
      record.sourceVersionId,
      channel,
      'command.sourceVersionId'
    )
  }
}

export function requireWorkflowTemplateIdQuery(
  value: unknown,
  channel: string
): { templateId: string } {
  const record = requireRecord(value, channel, 'query')
  return {
    templateId: requireEntityId(record.templateId, channel, 'query.templateId')
  }
}

export function requireWorkflowTemplateVersionQuery(
  value: unknown,
  channel: string
): { templateId: string; versionId: string } {
  const record = requireRecord(value, channel, 'query')
  requireAllowedFields(record, ['templateId', 'versionId'], channel, 'query')
  return {
    templateId: requireEntityId(record.templateId, channel, 'query.templateId'),
    versionId: requireEntityId(record.versionId, channel, 'query.versionId')
  }
}

export function requireTemplateMigrationRequirementQuery(
  value: unknown,
  channel: string
): { requirementId: string } {
  const record = requireRecord(value, channel, 'query')
  requireAllowedFields(record, ['requirementId'], channel, 'query')
  return {
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'query.requirementId'
    )
  }
}

export function requireTemplateMigrationPreviewQuery(
  value: unknown,
  channel: string
): { requirementId: string; targetTemplateVersionId: string } {
  const record = requireRecord(value, channel, 'query')
  requireAllowedFields(
    record,
    ['requirementId', 'targetTemplateVersionId'],
    channel,
    'query'
  )
  return {
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'query.requirementId'
    ),
    targetTemplateVersionId: requireEntityId(
      record.targetTemplateVersionId,
      channel,
      'query.targetTemplateVersionId'
    )
  }
}

export function requireApplyTemplateMigrationCommand(
  value: unknown,
  channel: string
): ApplyTemplateMigrationCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'requestId',
      'requirementId',
      'targetTemplateVersionId',
      'expectedRequirementRevision',
      'expectedWorkflowRevision',
      'expectedExecutionRevision'
    ],
    channel,
    'command'
  )
  return {
    requestId: requireEntityId(record.requestId, channel, 'command.requestId'),
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    targetTemplateVersionId: requireEntityId(
      record.targetTemplateVersionId,
      channel,
      'command.targetTemplateVersionId'
    ),
    expectedRequirementRevision: requireRevision(
      record.expectedRequirementRevision,
      channel
    ),
    expectedWorkflowRevision: requireRevision(
      record.expectedWorkflowRevision,
      channel
    ),
    expectedExecutionRevision: requireRevision(
      record.expectedExecutionRevision,
      channel
    )
  }
}

export function requireAddWorkflowTemplateNodeCommand(
  value: unknown,
  channel: string
): AddWorkflowTemplateNodeCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  const node = requireRecord(record.node, channel, 'command.node')
  if (
    !workflowNodeTypes.has(node.type as WorkflowNodeType) ||
    typeof node.allowSkip !== 'boolean'
  ) {
    invalidIpcPayload(channel, 'command.node')
  }
  return {
    ...command,
    node: {
      stableKey: requireEntityId(
        node.stableKey,
        channel,
        'command.node.stableKey'
      ),
      type: node.type as WorkflowNodeType,
      name: requireString(node.name, channel, 'command.node.name', {
        maxLength: 160
      }),
      description: requireString(
        node.description,
        channel,
        'command.node.description',
        { allowEmpty: true, maxLength: 4_000 }
      ),
      allowSkip: node.allowSkip
    }
  }
}

export function requireCopyWorkflowTemplateNodeCommand(
  value: unknown,
  channel: string
): CopyWorkflowTemplateNodeCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  return {
    ...command,
    sourceNodeId: requireEntityId(
      record.sourceNodeId,
      channel,
      'command.sourceNodeId'
    ),
    stableKey: requireEntityId(record.stableKey, channel, 'command.stableKey'),
    ...(record.name === undefined
      ? {}
      : {
          name: requireString(record.name, channel, 'command.name', {
            maxLength: 160
          })
        })
  }
}

export function requireUpdateWorkflowTemplateNodeCommand(
  value: unknown,
  channel: string
): UpdateWorkflowTemplateNodeCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  if (
    record.name === undefined &&
    record.description === undefined &&
    record.type === undefined &&
    record.allowSkip === undefined
  ) {
    invalidIpcPayload(channel, 'command')
  }
  if (
    record.type !== undefined &&
    !workflowNodeTypes.has(record.type as WorkflowNodeType)
  ) {
    invalidIpcPayload(channel, 'command.type')
  }
  if (record.allowSkip !== undefined && typeof record.allowSkip !== 'boolean') {
    invalidIpcPayload(channel, 'command.allowSkip')
  }
  return {
    ...command,
    nodeId: requireEntityId(record.nodeId, channel, 'command.nodeId'),
    ...(record.name === undefined
      ? {}
      : {
          name: requireString(record.name, channel, 'command.name', {
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
    ...(record.type === undefined
      ? {}
      : { type: record.type as WorkflowNodeType }),
    ...(record.allowSkip === undefined ? {} : { allowSkip: record.allowSkip })
  }
}

export function requireConfigureWorkflowTemplateNodeCommand(
  value: unknown,
  channel: string
): ConfigureWorkflowTemplateNodeCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  return {
    ...command,
    nodeId: requireEntityId(record.nodeId, channel, 'command.nodeId'),
    configuration: requireWorkflowNodeConfiguration(
      record.configuration,
      channel
    )
  }
}

function requireWorkflowNodeConfiguration(
  value: unknown,
  channel: string,
  field = 'command.configuration'
): WorkflowNodeConfiguration {
  const configuration = requireRecord(value, channel, field)
  requireAllowedFields(
    configuration,
    [
      'input',
      'prompt',
      'reasoning',
      'model',
      'connectorIds',
      'permissions',
      'artifact',
      'todos',
      'completionGate',
      'retry',
      'skip'
    ],
    channel,
    field
  )
  const input = requireRecord(configuration.input, channel, `${field}.input`)
  if (!['none', 'direct', 'all'].includes(String(input.predecessorArtifacts))) {
    invalidIpcPayload(channel, `${field}.input.predecessorArtifacts`)
  }
  if (!Array.isArray(input.attachments)) {
    invalidIpcPayload(channel, `${field}.input.attachments`)
  }
  const model = requireRecord(configuration.model, channel, `${field}.model`)
  if (
    model.strategy !== 'inherit' &&
    model.strategy !== 'fixed' &&
    model.strategy !== 'capability'
  ) {
    invalidIpcPayload(channel, `${field}.model.strategy`)
  }
  const modelConfiguration: WorkflowNodeConfiguration['model'] =
    model.strategy === 'fixed'
      ? {
          strategy: 'fixed',
          profileId: requireEntityId(
            model.profileId,
            channel,
            `${field}.model.profileId`
          )
        }
      : model.strategy === 'capability'
        ? {
            strategy: 'capability',
            requiredCapabilities: requireModelCapabilities(
              model.requiredCapabilities,
              channel,
              `${field}.model.requiredCapabilities`
            ),
            minimumContextWindow: requirePositiveInteger(
              model.minimumContextWindow,
              channel,
              `${field}.model.minimumContextWindow`
            )
          }
        : { strategy: 'inherit' }
  const connectorIds = requireEntityIdArray(
    configuration.connectorIds,
    channel,
    `${field}.connectorIds`
  )
  if (!Array.isArray(configuration.permissions)) {
    invalidIpcPayload(channel, `${field}.permissions`)
  }
  const capabilities = new Set([
    'filesystem.read',
    'filesystem.write',
    'process.execute',
    'repository.modify'
  ])
  const permissionScopes = new Set(['requirement', 'space'])
  const permissions = configuration.permissions.map((value, index) => {
    const permissionField = `${field}.permissions.${index}`
    const permission = requireRecord(value, channel, permissionField)
    if (!capabilities.has(String(permission.capability))) {
      invalidIpcPayload(channel, `${permissionField}.capability`)
    }
    if (!permissionScopes.has(String(permission.scope))) {
      invalidIpcPayload(channel, `${permissionField}.scope`)
    }
    return {
      capability:
        permission.capability as WorkflowNodeConfiguration['permissions'][number]['capability'],
      scope:
        permission.scope as WorkflowNodeConfiguration['permissions'][number]['scope']
    }
  })
  const artifact = requireRecord(
    configuration.artifact,
    channel,
    `${field}.artifact`
  )
  if (!Array.isArray(configuration.todos)) {
    invalidIpcPayload(channel, `${field}.todos`)
  }
  const todos = configuration.todos.map((value, index) => {
    const todoField = `${field}.todos.${index}`
    const todo = requireRecord(value, channel, todoField)
    return {
      title: requireString(todo.title, channel, `${todoField}.title`, {
        maxLength: 500
      }),
      required: requireBooleanValue(
        todo.required,
        channel,
        `${todoField}.required`
      )
    }
  })
  const completionGate = requireRecord(
    configuration.completionGate,
    channel,
    `${field}.completionGate`
  )
  const retry = requireRecord(configuration.retry, channel, `${field}.retry`)
  const skip = requireRecord(configuration.skip, channel, `${field}.skip`)
  const reasoning = configuration.reasoning
  if (
    reasoning !== undefined &&
    !['inherit', 'off', 'low', 'medium', 'high'].includes(String(reasoning))
  ) {
    invalidIpcPayload(channel, `${field}.reasoning`)
  }
  return {
    input: {
      includeRequirementBody: requireBooleanValue(
        input.includeRequirementBody,
        channel,
        `${field}.input.includeRequirementBody`
      ),
      predecessorArtifacts:
        input.predecessorArtifacts as WorkflowNodeConfiguration['input']['predecessorArtifacts'],
      includeSpaceKnowledge: requireBooleanValue(
        input.includeSpaceKnowledge,
        channel,
        `${field}.input.includeSpaceKnowledge`
      ),
      attachments: input.attachments.map((path, index) =>
        requireString(path, channel, `${field}.input.attachments.${index}`, {
          maxLength: 1000
        })
      )
    },
    prompt: requireString(configuration.prompt, channel, `${field}.prompt`, {
      allowEmpty: true,
      maxLength: 32_000
    }),
    ...(reasoning === undefined
      ? {}
      : {
          reasoning: reasoning as NonNullable<
            WorkflowNodeConfiguration['reasoning']
          >
        }),
    model: modelConfiguration,
    connectorIds,
    permissions,
    artifact: {
      required: requireBooleanValue(
        artifact.required,
        channel,
        `${field}.artifact.required`
      ),
      relativePath: requireString(
        artifact.relativePath,
        channel,
        `${field}.artifact.relativePath`,
        { allowEmpty: true, maxLength: 1000 }
      ),
      kind: requireString(artifact.kind, channel, `${field}.artifact.kind`, {
        allowEmpty: true,
        maxLength: 100
      })
    },
    todos,
    completionGate: {
      requireApproval: requireBooleanValue(
        completionGate.requireApproval,
        channel,
        `${field}.completionGate.requireApproval`
      ),
      ...(completionGate.customGateId === undefined
        ? {}
        : {
            customGateId: requireEntityId(
              completionGate.customGateId,
              channel,
              `${field}.completionGate.customGateId`
            )
          })
    },
    retry: {
      maxAttempts: requireIntegerValue(
        retry.maxAttempts,
        channel,
        `${field}.retry.maxAttempts`
      ),
      backoffMs: requireIntegerValue(
        retry.backoffMs,
        channel,
        `${field}.retry.backoffMs`
      )
    },
    skip: {
      allowed: requireBooleanValue(
        skip.allowed,
        channel,
        `${field}.skip.allowed`
      ),
      requireReason: requireBooleanValue(
        skip.requireReason,
        channel,
        `${field}.skip.requireReason`
      )
    }
  }
}

function requireEntityIdArray(
  value: unknown,
  channel: string,
  field: string
): string[] {
  if (!Array.isArray(value)) invalidIpcPayload(channel, field)
  return value.map((item, index) =>
    requireEntityId(item, channel, `${field}.${index}`)
  )
}

function requireBooleanValue(
  value: unknown,
  channel: string,
  field: string
): boolean {
  if (typeof value !== 'boolean') invalidIpcPayload(channel, field)
  return value
}

function requireIntegerValue(
  value: unknown,
  channel: string,
  field: string
): number {
  if (!Number.isInteger(value)) invalidIpcPayload(channel, field)
  return value as number
}

export function requireRemoveWorkflowTemplateNodeCommand(
  value: unknown,
  channel: string
): RemoveWorkflowTemplateNodeCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  return {
    ...command,
    nodeId: requireEntityId(record.nodeId, channel, 'command.nodeId')
  }
}

export function requireRestoreWorkflowTemplateNodeCommand(
  value: unknown,
  channel: string
): RestoreWorkflowTemplateNodeCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  const node = requireRecord(record.node, channel, 'command.node')
  if (
    !workflowNodeTypes.has(node.type as WorkflowNodeType) ||
    typeof node.allowSkip !== 'boolean'
  ) {
    invalidIpcPayload(channel, 'command.node')
  }
  const position =
    node.position === undefined
      ? undefined
      : requireRecord(node.position, channel, 'command.node.position')
  if (!Array.isArray(record.edges) || record.edges.length > 1_000) {
    invalidIpcPayload(channel, 'command.edges')
  }
  return {
    ...command,
    node: {
      id: requireEntityId(node.id, channel, 'command.node.id'),
      stableKey: requireEntityId(
        node.stableKey,
        channel,
        'command.node.stableKey'
      ),
      type: node.type as WorkflowNodeType,
      name: requireString(node.name, channel, 'command.node.name', {
        maxLength: 160
      }),
      description: requireString(
        node.description,
        channel,
        'command.node.description',
        { allowEmpty: true, maxLength: 4_000 }
      ),
      order: requireNonNegativeInteger(
        node.order,
        channel,
        'command.node.order'
      ),
      allowSkip: node.allowSkip,
      ...(position
        ? {
            position: {
              x: requireFiniteNumber(
                position.x,
                channel,
                'command.node.position.x'
              ),
              y: requireFiniteNumber(
                position.y,
                channel,
                'command.node.position.y'
              )
            }
          }
        : {}),
      ...(node.configuration === undefined
        ? {}
        : {
            configuration: requireWorkflowNodeConfiguration(
              node.configuration,
              channel,
              'command.node.configuration'
            )
          })
    },
    edges: record.edges.map((edge, index) =>
      requireWorkflowEdge(edge, channel, `command.edges.${index}`)
    )
  }
}

export function requireReorderWorkflowTemplateNodesCommand(
  value: unknown,
  channel: string
): ReorderWorkflowTemplateNodesCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  if (!Array.isArray(record.orderedNodeIds)) {
    invalidIpcPayload(channel, 'command.orderedNodeIds')
  }
  const orderedNodeIds = record.orderedNodeIds.map((id, index) =>
    requireEntityId(id, channel, `command.orderedNodeIds.${index}`)
  )
  if (new Set(orderedNodeIds).size !== orderedNodeIds.length) {
    invalidIpcPayload(channel, 'command.orderedNodeIds')
  }
  return { ...command, orderedNodeIds }
}

export function requireUpdateWorkflowTemplateNodePositionsCommand(
  value: unknown,
  channel: string
): UpdateWorkflowTemplateNodePositionsCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  if (!Array.isArray(record.positions) || record.positions.length === 0) {
    invalidIpcPayload(channel, 'command.positions')
  }
  const nodeIds = new Set<string>()
  const positions = record.positions.map((value, index) => {
    const field = `command.positions.${index}`
    const entry = requireRecord(value, channel, field)
    const nodeId = requireEntityId(entry.nodeId, channel, `${field}.nodeId`)
    if (nodeIds.has(nodeId)) {
      invalidIpcPayload(channel, 'command.positions')
    }
    nodeIds.add(nodeId)
    const position = requireRecord(entry.position, channel, `${field}.position`)
    return {
      nodeId,
      position: {
        x: requireFiniteNumber(position.x, channel, `${field}.position.x`),
        y: requireFiniteNumber(position.y, channel, `${field}.position.y`)
      }
    }
  })
  return { ...command, positions }
}

export function requireAddWorkflowTemplateEdgeCommand(
  value: unknown,
  channel: string
): AddWorkflowTemplateEdgeCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  return {
    ...command,
    sourceNodeId: requireEntityId(
      record.sourceNodeId,
      channel,
      'command.sourceNodeId'
    ),
    targetNodeId: requireEntityId(
      record.targetNodeId,
      channel,
      'command.targetNodeId'
    )
  }
}

export function requireRemoveWorkflowTemplateEdgeCommand(
  value: unknown,
  channel: string
): RemoveWorkflowTemplateEdgeCommand {
  const command = requireTransitionWorkflowTemplateCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  return {
    ...command,
    edgeId: requireEntityId(record.edgeId, channel, 'command.edgeId')
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

export function requireRenameConversationCommand(
  value: unknown,
  channel: string
): RenameConversationCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['id', 'expectedRevision', 'title'],
    channel,
    'command'
  )
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision: requireRevision(record.expectedRevision, channel),
    title: requireString(record.title, channel, 'command.title', {
      maxLength: 240
    })
  }
}

export function requireDeleteConversationCommand(
  value: unknown,
  channel: string
): DeleteConversationCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['id', 'expectedRevision'],
    channel,
    'command'
  )
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision: requireRevision(record.expectedRevision, channel)
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

export function requirePurgeEntityCommand(
  value: unknown,
  channel: string
): PurgeEntityCommand {
  const record = requireRecord(value, channel, 'command')
  if (record.confirmation !== 'PERMANENTLY_DELETE') {
    invalidIpcPayload(channel, 'command.confirmation')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    confirmation: 'PERMANENTLY_DELETE'
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

export function requireRenameManagedDirectoryCommand(
  value: unknown,
  channel: string
): RenameManagedDirectoryCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    name: requireString(record.name, channel, 'command.name', {
      maxLength: 160
    }),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireRelocateSpaceCommand(
  value: unknown,
  channel: string
): RelocateSpaceCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    targetPath: requireString(
      record.targetPath,
      channel,
      'command.targetPath',
      { maxLength: 4_096 }
    ),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireCreateConversationCommand(
  value: unknown,
  channel: string
): CreateConversationCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'id',
      'kind',
      'knowledgeScope',
      'title',
      'prompt',
      'workspaceId',
      'requirementId',
      'nodeRunId',
      'folderPath',
      'folderBindingId',
      'modelProfileId',
      'reasoningMode',
      'applicationLocale',
      'references',
      'attachments'
    ],
    channel,
    'command'
  )
  if (
    !conversationKinds.has(record.kind as string) ||
    !['general', 'space', 'requirement_node'].includes(record.kind as string)
  ) {
    invalidIpcPayload(channel, 'command.kind')
  }
  let knowledgeScope: ConversationKnowledgeScope
  try {
    knowledgeScope = normalizeConversationKnowledgeScope(record.knowledgeScope)
  } catch {
    invalidIpcPayload(channel, 'command.knowledgeScope')
  }
  if (record.kind === 'general') {
    for (const field of [
      'workspaceId',
      'requirementId',
      'nodeRunId',
      'folderPath'
    ]) {
      if (record[field] !== undefined)
        invalidIpcPayload(channel, `command.${field}`)
    }
    if (record.references !== undefined) {
      invalidIpcPayload(channel, 'command.references')
    }
    if (
      record.folderBindingId !== undefined
        ? knowledgeScope.kind !== 'none'
        : !['none', 'all_workspaces'].includes(knowledgeScope.kind)
    ) {
      invalidIpcPayload(channel, 'command.knowledgeScope')
    }
  }
  if (record.kind === 'space') {
    if (record.workspaceId === undefined) {
      invalidIpcPayload(channel, 'command.workspaceId')
    }
    for (const field of [
      'requirementId',
      'nodeRunId',
      'folderPath',
      'folderBindingId'
    ]) {
      if (record[field] !== undefined)
        invalidIpcPayload(channel, `command.${field}`)
    }
    if (record.references !== undefined) {
      invalidIpcPayload(channel, 'command.references')
    }
    if (
      knowledgeScope.kind !== 'workspace' ||
      knowledgeScope.workspaceId !== record.workspaceId
    ) {
      invalidIpcPayload(channel, 'command.knowledgeScope')
    }
  }
  if (record.kind === 'requirement_node') {
    if (record.requirementId === undefined) {
      invalidIpcPayload(channel, 'command.requirementId')
    }
    if (record.nodeRunId === undefined) {
      invalidIpcPayload(channel, 'command.nodeRunId')
    }
    for (const field of ['workspaceId', 'folderPath', 'folderBindingId']) {
      if (record[field] !== undefined)
        invalidIpcPayload(channel, `command.${field}`)
    }
    if (knowledgeScope.kind !== 'node_configuration') {
      invalidIpcPayload(channel, 'command.knowledgeScope')
    }
    if (record.reasoningMode !== undefined) {
      invalidIpcPayload(channel, 'command.reasoningMode')
    }
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    kind: record.kind as CreateConversationCommand['kind'],
    knowledgeScope,
    title: requireString(record.title, channel, 'command.title', {
      maxLength: 240
    }),
    prompt: requireString(record.prompt, channel, 'command.prompt', {
      maxLength: 128 * 1024
    }),
    ...(record.workspaceId === undefined
      ? {}
      : {
          workspaceId: requireEntityId(
            record.workspaceId,
            channel,
            'command.workspaceId'
          )
        }),
    ...(record.requirementId === undefined
      ? {}
      : {
          requirementId: requireEntityId(
            record.requirementId,
            channel,
            'command.requirementId'
          )
        }),
    ...(record.nodeRunId === undefined
      ? {}
      : {
          nodeRunId: requireEntityId(
            record.nodeRunId,
            channel,
            'command.nodeRunId'
          )
        }),
    ...(record.folderBindingId === undefined
      ? {}
      : {
          folderBindingId: requireEntityId(
            record.folderBindingId,
            channel,
            'command.folderBindingId'
          )
        }),
    ...(record.references === undefined
      ? {}
      : {
          references: requireConversationReferences(record.references, channel)
        }),
    ...(record.attachments === undefined
      ? {}
      : {
          attachments: requireConversationAttachmentSubmission(
            record.attachments,
            channel
          )
        }),
    ...(record.modelProfileId === undefined
      ? {}
      : {
          modelProfileId: requireEntityId(
            record.modelProfileId,
            channel,
            'command.modelProfileId'
          )
        }),
    ...(record.reasoningMode === undefined
      ? {}
      : {
          reasoningMode: requireReasoningPreference(
            record.reasoningMode,
            channel,
            'command.reasoningMode'
          )
        }),
    ...(record.applicationLocale === undefined
      ? {}
      : {
          applicationLocale: requireApplicationLocale(
            record.applicationLocale,
            channel
          )
        })
  }
}

export function requireAppendConversationMessageCommand(
  value: unknown,
  channel: string
): AppendConversationMessageCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'sessionId',
      'messageId',
      'content',
      'expectedRevision',
      'modelProfileId',
      'reasoningMode',
      'applicationLocale',
      'references',
      'attachments'
    ],
    channel,
    'command'
  )
  return {
    sessionId: requireEntityId(record.sessionId, channel, 'command.sessionId'),
    messageId: requireEntityId(record.messageId, channel, 'command.messageId'),
    content: requireString(record.content, channel, 'command.content', {
      maxLength: 128 * 1024
    }),
    expectedRevision: requireRevision(record.expectedRevision, channel),
    ...(record.references === undefined
      ? {}
      : {
          references: requireConversationReferences(record.references, channel)
        }),
    ...(record.attachments === undefined
      ? {}
      : {
          attachments: requireConversationAttachmentSubmission(
            record.attachments,
            channel
          )
        }),
    ...(record.modelProfileId === undefined
      ? {}
      : {
          modelProfileId: requireEntityId(
            record.modelProfileId,
            channel,
            'command.modelProfileId'
          )
        }),
    ...(record.reasoningMode === undefined
      ? {}
      : {
          reasoningMode: requireReasoningPreference(
            record.reasoningMode,
            channel,
            'command.reasoningMode'
          )
        }),
    ...(record.applicationLocale === undefined
      ? {}
      : {
          applicationLocale: requireApplicationLocale(
            record.applicationLocale,
            channel
          )
        })
  }
}

function requireApplicationLocale(
  value: unknown,
  channel: string
): 'zh-CN' | 'en' | 'ja' {
  if (value !== 'zh-CN' && value !== 'en' && value !== 'ja') {
    invalidIpcPayload(channel, 'command.applicationLocale')
  }
  return value
}

export function requireSendFollowUpSuggestionCommand(
  value: unknown,
  channel: string
): SendFollowUpSuggestionCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'sessionId',
      'suggestionSetId',
      'suggestionId',
      'expectedSessionRevision',
      'expectedSuggestionRevision',
      'modelProfileId',
      'reasoningMode',
      'applicationLocale'
    ],
    channel,
    'command'
  )
  return {
    sessionId: requireEntityId(record.sessionId, channel, 'command.sessionId'),
    suggestionSetId: requireEntityId(
      record.suggestionSetId,
      channel,
      'command.suggestionSetId'
    ),
    suggestionId: requireEntityId(
      record.suggestionId,
      channel,
      'command.suggestionId'
    ),
    expectedSessionRevision: requireRevision(
      record.expectedSessionRevision,
      channel
    ),
    expectedSuggestionRevision: requireRevision(
      record.expectedSuggestionRevision,
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
        }),
    ...(record.reasoningMode === undefined
      ? {}
      : {
          reasoningMode: requireReasoningPreference(
            record.reasoningMode,
            channel,
            'command.reasoningMode'
          )
        }),
    ...(record.applicationLocale === undefined
      ? {}
      : {
          applicationLocale: requireApplicationLocale(
            record.applicationLocale,
            channel
          )
        })
  }
}

function requireConversationAttachmentSubmission(
  value: unknown,
  channel: string
): {
  draftId: string
  attachmentIds: string[]
  allowImageEgress: boolean
} {
  const record = requireRecord(value, channel, 'command.attachments')
  requireAllowedFields(
    record,
    ['draftId', 'attachmentIds', 'allowImageEgress'],
    channel,
    'command.attachments'
  )
  if (
    !Array.isArray(record.attachmentIds) ||
    record.attachmentIds.length === 0 ||
    record.attachmentIds.length > 20
  ) {
    invalidIpcPayload(channel, 'command.attachments.attachmentIds')
  }
  if (typeof record.allowImageEgress !== 'boolean') {
    invalidIpcPayload(channel, 'command.attachments.allowImageEgress')
  }
  const attachmentIds = record.attachmentIds.map((id, index) =>
    requireEntityId(
      id,
      channel,
      `command.attachments.attachmentIds.${index}`
    )
  )
  if (new Set(attachmentIds).size !== attachmentIds.length) {
    invalidIpcPayload(channel, 'command.attachments.attachmentIds')
  }
  return {
    draftId: requireEntityId(
      record.draftId,
      channel,
      'command.attachments.draftId'
    ),
    attachmentIds,
    allowImageEgress: record.allowImageEgress
  }
}

function requireReasoningPreference(
  value: unknown,
  channel: string,
  field: string
): ReasoningPreference {
  if (typeof value !== 'string' || !reasoningPreferences.has(value)) {
    invalidIpcPayload(channel, field)
  }
  return value as ReasoningPreference
}

function requireConversationReferences(value: unknown, channel: string) {
  const record = requireRecord(value, channel, 'command.references')
  requireAllowedFields(
    record,
    [
      'questionId',
      'expectedQuestionRevision',
      'todoId',
      'toolCallId',
      'artifactId'
    ],
    channel,
    'command.references'
  )
  if (
    (record.questionId === undefined) !==
    (record.expectedQuestionRevision === undefined)
  ) {
    invalidIpcPayload(
      channel,
      record.questionId === undefined
        ? 'command.references.questionId'
        : 'command.references.expectedQuestionRevision'
    )
  }
  return {
    ...(record.questionId === undefined
      ? {}
      : {
          questionId: requireEntityId(
            record.questionId,
            channel,
            'command.references.questionId'
          ),
          expectedQuestionRevision: requireConversationReferenceRevision(
            record.expectedQuestionRevision,
            channel
          )
        }),
    ...(record.todoId === undefined
      ? {}
      : {
          todoId: requireEntityId(
            record.todoId,
            channel,
            'command.references.todoId'
          )
        }),
    ...(record.toolCallId === undefined
      ? {}
      : {
          toolCallId: requireEntityId(
            record.toolCallId,
            channel,
            'command.references.toolCallId'
          )
        }),
    ...(record.artifactId === undefined
      ? {}
      : {
          artifactId: requireEntityId(
            record.artifactId,
            channel,
            'command.references.artifactId'
          )
        })
  }
}

function requireConversationReferenceRevision(
  value: unknown,
  channel: string
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalidIpcPayload(channel, 'command.references.expectedQuestionRevision')
  }
  return value
}

export function requireRegisterKnowledgeSourceCommand(
  value: unknown,
  channel: string
): RegisterKnowledgeSourceCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'id',
      'workspaceId',
      'name',
      'type',
      'locator',
      'detail',
      'sortOrder',
      'idempotencyKey'
    ],
    channel,
    'command'
  )
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
    type: record.type as RegisterKnowledgeSourceCommand['type'],
    locator: requireString(record.locator, channel, 'command.locator'),
    detail: requireString(record.detail, channel, 'command.detail', {
      allowEmpty: true
    }),
    sortOrder: requireNonNegativeInteger(
      record.sortOrder,
      channel,
      'command.sortOrder'
    ),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireManageKnowledgeSourceCommand(
  value: unknown,
  channel: string
): ManageKnowledgeSourceCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['id', 'expectedRevision', 'idempotencyKey'],
    channel,
    'command'
  )
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision: requirePositiveInteger(
      record.expectedRevision,
      channel,
      'command.expectedRevision'
    ),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireRefreshKnowledgeSourceCommand(
  value: unknown,
  channel: string
): RefreshKnowledgeSourceCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['sourceId', 'idempotencyKey'],
    channel,
    'command'
  )
  return {
    sourceId: requireEntityId(record.sourceId, channel, 'command.sourceId'),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireSetKnowledgeRefreshPolicyCommand(
  value: unknown,
  channel: string
): SetKnowledgeRefreshPolicyCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['sourceId', 'expectedRevision', 'preset', 'timeZone'],
    channel,
    'command'
  )
  const preset = requireString(record.preset, channel, 'command.preset')
  if (!['manual', '5m', '15m', '30m', '1h', 'daily'].includes(preset)) {
    invalidIpcPayload(channel, 'command.preset')
  }
  return {
    sourceId: requireEntityId(record.sourceId, channel, 'command.sourceId'),
    expectedRevision: requirePositiveInteger(
      record.expectedRevision,
      channel,
      'command.expectedRevision'
    ),
    preset: preset as SetKnowledgeRefreshPolicyCommand['preset'],
    timeZone: requireString(record.timeZone, channel, 'command.timeZone', {
      maxLength: 128
    })
  }
}

export function requireIngestLocalRepositoryCommand(
  value: unknown,
  channel: string
): IngestLocalRepositoryCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'id',
      'workspaceId',
      'selectionId',
      'selectedBranch',
      'name',
      'sortOrder',
      'idempotencyKey'
    ],
    channel,
    'command'
  )
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    workspaceId: requireEntityId(
      record.workspaceId,
      channel,
      'command.workspaceId'
    ),
    selectionId: requireEntityId(
      record.selectionId,
      channel,
      'command.selectionId'
    ),
    selectedBranch: requireRepositoryBranch(
      record.selectedBranch,
      channel,
      'command.selectedBranch'
    ),
    name: requireString(record.name, channel, 'command.name', {
      maxLength: 240
    }),
    sortOrder: requireNonNegativeInteger(
      record.sortOrder,
      channel,
      'command.sortOrder'
    ),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireIngestRemoteRepositoryCommand(
  value: unknown,
  channel: string
): IngestRemoteRepositoryCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'id',
      'workspaceId',
      'name',
      'connectorId',
      'path',
      'selectedBranch',
      'sortOrder',
      'idempotencyKey'
    ],
    channel,
    'command'
  )
  const path = requireString(record.path, channel, 'command.path', {
    maxLength: 2048
  })
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('#') ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(path)
  ) {
    invalidIpcPayload(channel, 'command.path')
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
    connectorId: requireEntityId(
      record.connectorId,
      channel,
      'command.connectorId'
    ),
    path,
    selectedBranch: requireRepositoryBranch(
      record.selectedBranch,
      channel,
      'command.selectedBranch'
    ),
    sortOrder: requireNonNegativeInteger(
      record.sortOrder,
      channel,
      'command.sortOrder'
    ),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireRefreshRepositorySourceCommand(
  value: unknown,
  channel: string
): RefreshRepositorySourceCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['sourceId', 'expectedRevision', 'idempotencyKey'],
    channel,
    'command'
  )
  return {
    sourceId: requireEntityId(record.sourceId, channel, 'command.sourceId'),
    expectedRevision: requirePositiveInteger(
      record.expectedRevision,
      channel,
      'command.expectedRevision'
    ),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireListRepositoryBranchesQuery(
  value: unknown,
  channel: string
): ListRepositoryBranchesQuery {
  const record = requireRecord(value, channel, 'query')
  if (record.sourceId !== undefined) {
    requireAllowedFields(record, ['sourceId'], channel, 'query')
    return {
      sourceId: requireEntityId(record.sourceId, channel, 'query.sourceId')
    }
  }
  const mode = requireString(record.mode, channel, 'query.mode')
  if (mode === 'local') {
    requireAllowedFields(record, ['mode', 'selectionId'], channel, 'query')
    return {
      mode,
      selectionId: requireEntityId(
        record.selectionId,
        channel,
        'query.selectionId'
      )
    }
  }
  if (mode === 'remote') {
    requireAllowedFields(
      record,
      ['mode', 'connectorId', 'path', 'workspaceId'],
      channel,
      'query'
    )
    return {
      mode,
      connectorId: requireEntityId(
        record.connectorId,
        channel,
        'query.connectorId'
      ),
      path: requireString(record.path, channel, 'query.path', {
        maxLength: 2048
      }),
      workspaceId: requireEntityId(
        record.workspaceId,
        channel,
        'query.workspaceId'
      )
    }
  }
  return invalidIpcPayload(channel, 'query.mode')
}

export function requireUpdateRepositoryBranchCommand(
  value: unknown,
  channel: string
): UpdateRepositoryBranchCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['sourceId', 'branch', 'expectedRevision', 'idempotencyKey'],
    channel,
    'command'
  )
  return {
    sourceId: requireEntityId(record.sourceId, channel, 'command.sourceId'),
    branch: requireRepositoryBranch(record.branch, channel, 'command.branch'),
    expectedRevision: requirePositiveInteger(
      record.expectedRevision,
      channel,
      'command.expectedRevision'
    ),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireRetryRepositoryFileIndexCommand(
  value: unknown,
  channel: string
): RetryRepositoryFileIndexCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'sourceId',
      'documentKey',
      'expectedSourceRevision',
      'expectedSnapshotVersion',
      'idempotencyKey'
    ],
    channel,
    'command'
  )
  return {
    sourceId: requireEntityId(record.sourceId, channel, 'command.sourceId'),
    documentKey: requireRelativePath(
      record.documentKey,
      channel,
      'command.documentKey'
    ),
    expectedSourceRevision: requirePositiveInteger(
      record.expectedSourceRevision,
      channel,
      'command.expectedSourceRevision'
    ),
    expectedSnapshotVersion: requirePositiveInteger(
      record.expectedSnapshotVersion,
      channel,
      'command.expectedSnapshotVersion'
    ),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireCreateOnlineDocumentSourceCommand(
  value: unknown,
  channel: string
): CreateOnlineDocumentSourceCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'id',
      'workspaceId',
      'name',
      'connectorId',
      'path',
      'sortOrder',
      'idempotencyKey'
    ],
    channel,
    'command'
  )
  const path = requireString(record.path, channel, 'command.path', {
    maxLength: 2048
  })
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('#') ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(path)
  ) {
    invalidIpcPayload(channel, 'command.path')
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
    connectorId: requireEntityId(
      record.connectorId,
      channel,
      'command.connectorId'
    ),
    path,
    sortOrder: requireNonNegativeInteger(
      record.sortOrder,
      channel,
      'command.sortOrder'
    ),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireSyncOnlineDocumentSourceCommand(
  value: unknown,
  channel: string
): SyncOnlineDocumentSourceCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['sourceId', 'expectedRevision', 'idempotencyKey'],
    channel,
    'command'
  )
  return {
    sourceId: requireEntityId(record.sourceId, channel, 'command.sourceId'),
    expectedRevision: requirePositiveInteger(
      record.expectedRevision,
      channel,
      'command.expectedRevision'
    ),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireIngestLocalFilesCommand(
  value: unknown,
  channel: string
): IngestLocalFilesCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'workspaceId',
      'selectionId',
      'filePaths',
      'storageMode',
      'idempotencyKey'
    ],
    channel,
    'command'
  )
  if (
    record.storageMode !== 'managed_copy' &&
    record.storageMode !== 'external_reference'
  ) {
    invalidIpcPayload(channel, 'command.storageMode')
  }
  if (
    !Array.isArray(record.filePaths) ||
    record.filePaths.length === 0 ||
    record.filePaths.length > 100
  ) {
    invalidIpcPayload(channel, 'command.filePaths')
  }
  const filePaths = record.filePaths.map((filePath, index) =>
    requireString(filePath, channel, `command.filePaths.${index}`, {
      maxLength: 1_000
    })
  )
  if (new Set(filePaths).size !== filePaths.length) {
    invalidIpcPayload(channel, 'command.filePaths')
  }
  return {
    workspaceId: requireEntityId(
      record.workspaceId,
      channel,
      'command.workspaceId'
    ),
    selectionId: requireEntityId(
      record.selectionId,
      channel,
      'command.selectionId'
    ),
    filePaths,
    storageMode: record.storageMode,
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireKnowledgeSourceIdQuery(
  value: unknown,
  channel: string
): { sourceId: string } {
  const record = requireRecord(value, channel, 'query')
  requireAllowedFields(record, ['sourceId'], channel, 'query')
  return {
    sourceId: requireEntityId(record.sourceId, channel, 'query.sourceId')
  }
}

export function requireCreateKnowledgeNoteCommand(
  value: unknown,
  channel: string
): CreateKnowledgeNoteCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'id',
      'versionId',
      'workspaceId',
      'sessionId',
      'kind',
      'sourceMessageIds',
      'title',
      'content'
    ],
    channel,
    'command'
  )
  if (
    record.kind !== 'conversation_note' &&
    record.kind !== 'decision' &&
    record.kind !== 'retrospective'
  ) {
    invalidIpcPayload(channel, 'command.kind')
  }
  const sourceMessageIds = requireEntityIdArray(
    record.sourceMessageIds,
    channel,
    'command.sourceMessageIds'
  )
  if (
    sourceMessageIds.length === 0 ||
    new Set(sourceMessageIds).size !== sourceMessageIds.length
  ) {
    invalidIpcPayload(channel, 'command.sourceMessageIds')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    versionId: requireEntityId(
      record.versionId,
      channel,
      'command.versionId'
    ),
    workspaceId: requireEntityId(
      record.workspaceId,
      channel,
      'command.workspaceId'
    ),
    sessionId: requireEntityId(
      record.sessionId,
      channel,
      'command.sessionId'
    ),
    kind: record.kind,
    sourceMessageIds,
    title: requireString(record.title, channel, 'command.title', {
      maxLength: 240
    }),
    content: requireString(record.content, channel, 'command.content', {
      maxLength: 200_000
    })
  }
}

export function requireEditKnowledgeNoteCommand(
  value: unknown,
  channel: string
): EditKnowledgeNoteCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['noteId', 'expectedRevision', 'versionId', 'title', 'content'],
    channel,
    'command'
  )
  return {
    noteId: requireEntityId(record.noteId, channel, 'command.noteId'),
    expectedRevision: requireRevision(record.expectedRevision, channel),
    versionId: requireEntityId(
      record.versionId,
      channel,
      'command.versionId'
    ),
    title: requireString(record.title, channel, 'command.title', {
      maxLength: 240
    }),
    content: requireString(record.content, channel, 'command.content', {
      maxLength: 200_000
    })
  }
}

export function requireArchiveKnowledgeNoteCommand(
  value: unknown,
  channel: string
): ArchiveKnowledgeNoteCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['noteId', 'expectedRevision'],
    channel,
    'command'
  )
  return {
    noteId: requireEntityId(record.noteId, channel, 'command.noteId'),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireKnowledgeSearchQuery(
  value: unknown,
  channel: string
): KnowledgeSearchQueryInput {
  const record = requireRecord(value, channel, 'query')
  requireAllowedFields(
    record,
    ['scope', 'query', 'topK', 'sourceKinds', 'requirementId'],
    channel,
    'query'
  )
  const scopeRecord = requireRecord(record.scope, channel, 'query.scope')
  const scopeKind = requireString(
    scopeRecord.kind,
    channel,
    'query.scope.kind'
  )
  const scope =
    scopeKind === 'workspace'
      ? (() => {
          requireAllowedFields(
            scopeRecord,
            ['kind', 'workspaceId'],
            channel,
            'query.scope'
          )
          return {
            kind: 'workspace' as const,
            workspaceId: requireEntityId(
              scopeRecord.workspaceId,
              channel,
              'query.scope.workspaceId'
            )
          }
        })()
      : (() => {
          if (scopeKind !== 'all_workspaces') {
            invalidIpcPayload(channel, 'query.scope.kind')
          }
          requireAllowedFields(
            scopeRecord,
            ['kind'],
            channel,
            'query.scope'
          )
          return { kind: 'all_workspaces' as const }
        })()
  const query: KnowledgeSearchQueryInput = {
    scope,
    query: requireString(record.query, channel, 'query.query', {
      maxLength: 2_000
    })
  }
  if (query.query.includes('\0')) invalidIpcPayload(channel, 'query.query')
  if (record.topK !== undefined) {
    const topK = requirePositiveInteger(record.topK, channel, 'query.topK')
    if (topK > 20) invalidIpcPayload(channel, 'query.topK')
    query.topK = topK
  }
  if (record.sourceKinds !== undefined) {
    if (
      !Array.isArray(record.sourceKinds) ||
      record.sourceKinds.length === 0
    ) {
      invalidIpcPayload(channel, 'query.sourceKinds')
    }
    const allowedSourceKinds = new Set([
      'file',
      'document',
      'repository',
      'artifact',
      'requirement_memory',
      'conversation_note',
      'decision',
      'retrospective'
    ])
    const sourceKinds = record.sourceKinds.map((sourceKind, index) => {
      const parsed = requireString(
        sourceKind,
        channel,
        `query.sourceKinds[${index}]`
      )
      if (!allowedSourceKinds.has(parsed)) {
        invalidIpcPayload(channel, `query.sourceKinds[${index}]`)
      }
      return parsed
    })
    if (new Set(sourceKinds).size !== sourceKinds.length) {
      invalidIpcPayload(channel, 'query.sourceKinds')
    }
    query.sourceKinds =
      sourceKinds as NonNullable<KnowledgeSearchQueryInput['sourceKinds']>
  }
  if (record.requirementId !== undefined) {
    query.requirementId = requireEntityId(
      record.requirementId,
      channel,
      'query.requirementId'
    )
  }
  return query
}

export function requireCatalogSearchQuery(
  value: unknown,
  channel: string
): CatalogSearchQueryDto {
  const record = requireRecord(value, channel, 'query')
  requireAllowedFields(record, ['query', 'kind', 'topK'], channel, 'query')
  const query = requireString(record.query, channel, 'query.query', {
    maxLength: 2_000
  })
  if (query.includes('\0')) invalidIpcPayload(channel, 'query.query')
  const kind = requireString(record.kind, channel, 'query.kind')
  if (kind !== 'workflow_template' && kind !== 'skill') {
    invalidIpcPayload(channel, 'query.kind')
  }
  const result: CatalogSearchQueryDto = {
    query,
    kind: kind as CatalogSearchQueryDto['kind']
  }
  if (record.topK !== undefined) {
    const topK = requirePositiveInteger(record.topK, channel, 'query.topK')
    if (topK > 20) invalidIpcPayload(channel, 'query.topK')
    result.topK = topK
  }
  return result
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
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireDeleteNodeTodoCommand(
  value: unknown,
  channel: string
): DeleteNodeTodoCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    nodeRunId: requireEntityId(record.nodeRunId, channel, 'command.nodeRunId'),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireAnswerNodeQuestionCommand(
  value: unknown,
  channel: string
): AnswerNodeQuestionCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    nodeRunId: requireEntityId(record.nodeRunId, channel, 'command.nodeRunId'),
    answer: requireString(record.answer, channel, 'command.answer', {
      maxLength: 128 * 1024
    }),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireOpenNodeQuestionCommand(
  value: unknown,
  channel: string
): OpenNodeQuestionCommand {
  const record = requireRecord(value, channel, 'command')
  if (typeof record.required !== 'boolean') {
    invalidIpcPayload(channel, 'command.required')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    nodeRunId: requireEntityId(record.nodeRunId, channel, 'command.nodeRunId'),
    prompt: requireString(record.prompt, channel, 'command.prompt', {
      maxLength: 2_000
    }),
    required: record.required,
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireDismissNodeQuestionCommand(
  value: unknown,
  channel: string
): DismissNodeQuestionCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    nodeRunId: requireEntityId(record.nodeRunId, channel, 'command.nodeRunId'),
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
  if (
    ![
      'local',
      'openai_completions',
      'openai_responses',
      'anthropic_messages'
    ].includes(record.type as string)
  ) {
    invalidIpcPayload(channel, 'command.type')
  }
  if (typeof record.enabled !== 'boolean') {
    invalidIpcPayload(channel, 'command.enabled')
  }
  const customHeaders =
    record.customHeaders === undefined
      ? undefined
      : requireModelProviderHeaderDrafts(
          record.customHeaders,
          channel,
          'command.customHeaders'
        )
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
    ...(record.credential === undefined
      ? {}
      : {
          credential: requireString(
            record.credential,
            channel,
            'command.credential',
            { maxLength: 16 * 1024 }
          )
        }),
    ...(customHeaders === undefined ? {} : { customHeaders }),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

function requireModelProviderHeaderDrafts(
  value: unknown,
  channel: string,
  field: string
): Array<{ name: string; value?: string }> {
  if (!Array.isArray(value)) invalidIpcPayload(channel, field)
  const headers = value.map((candidate, index) => {
    const record = requireRecord(candidate, channel, `${field}.${index}`)
    requireAllowedFields(
      record,
      ['name', 'value'],
      channel,
      `${field}.${index}`
    )
    const name = requireString(record.name, channel, `${field}.${index}.name`, {
      maxLength: 240
    }).trim()
    const header = {
      name,
      ...(record.value === undefined
        ? {}
        : {
            value: requireString(
              record.value,
              channel,
              `${field}.${index}.value`,
              { maxLength: 16 * 1024 }
            )
          })
    }
    try {
      normalizeModelProviderHeaders({ [name]: header.value ?? 'retained' })
    } catch {
      invalidIpcPayload(channel, `${field}.${index}.name`)
    }
    return header
  })
  if (
    new Set(headers.map(({ name }) => name.toLocaleLowerCase('en-US'))).size !==
    headers.length
  ) {
    invalidIpcPayload(channel, field)
  }
  return headers
}

export function requireConfigureBuiltinModelProviderCommand(
  value: unknown,
  channel: string
): ConfigureBuiltinModelProviderCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(record, ['catalogId', 'credential'], channel, 'command')
  const catalogId = requireString(
    record.catalogId,
    channel,
    'command.catalogId',
    { maxLength: 80 }
  )
  if (!getConfigurableBuiltinModelProvider(catalogId)) {
    invalidIpcPayload(channel, 'command.catalogId')
  }
  return {
    catalogId: catalogId as ConfigureBuiltinModelProviderCommand['catalogId'],
    credential: requireString(
      record.credential,
      channel,
      'command.credential',
      { maxLength: 16 * 1024 }
    )
  }
}

export function requireSaveConnectorCommand(
  value: unknown,
  channel: string
): SaveConnectorCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'id',
      'name',
      'type',
      'baseUrl',
      'authentication',
      'enabled',
      'timeoutMs',
      'maxRetries',
      'credential',
      'expectedRevision',
      'idempotencyKey'
    ],
    channel,
    'command'
  )
  if (record.type !== 'http') invalidIpcPayload(channel, 'command.type')
  if (typeof record.enabled !== 'boolean') {
    invalidIpcPayload(channel, 'command.enabled')
  }
  const authentication = requireConnectorAuthentication(
    record.authentication,
    channel
  )
  const timeoutMs = requireIntegerValue(
    record.timeoutMs,
    channel,
    'command.timeoutMs'
  )
  if (timeoutMs < 1 || timeoutMs > 600_000) {
    invalidIpcPayload(channel, 'command.timeoutMs')
  }
  const maxRetries = requireIntegerValue(
    record.maxRetries,
    channel,
    'command.maxRetries'
  )
  if (maxRetries < 0 || maxRetries > 10) {
    invalidIpcPayload(channel, 'command.maxRetries')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    name: requireString(record.name, channel, 'command.name', {
      maxLength: 240
    }),
    type: 'http',
    baseUrl: requireString(record.baseUrl, channel, 'command.baseUrl', {
      maxLength: 2_048
    }),
    authentication,
    enabled: record.enabled,
    timeoutMs,
    maxRetries,
    ...(record.credential === undefined
      ? {}
      : {
          credential: requireString(
            record.credential,
            channel,
            'command.credential',
            { maxLength: 16 * 1024 }
          )
        }),
    expectedRevision: requireRevision(record.expectedRevision, channel),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireDeleteConnectorCommand(
  value: unknown,
  channel: string
): DeleteConnectorCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['id', 'expectedRevision', 'idempotencyKey'],
    channel,
    'command'
  )
  const expectedRevision = requireRevision(record.expectedRevision, channel)
  if (expectedRevision < 1) invalidIpcPayload(channel, 'expectedRevision')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision,
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireValidateConnectorCommand(
  value: unknown,
  channel: string
): ValidateConnectorCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['connectorId', 'expectedRevision', 'idempotencyKey'],
    channel,
    'command'
  )
  const expectedRevision = requireRevision(record.expectedRevision, channel)
  if (expectedRevision < 1) invalidIpcPayload(channel, 'expectedRevision')
  return {
    connectorId: requireEntityId(
      record.connectorId,
      channel,
      'command.connectorId'
    ),
    expectedRevision,
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireListScheduleRunsQuery(
  value: unknown,
  channel: string
): ListScheduleRunsQuery {
  const record = requireRecord(value, channel, 'query')
  requireAllowedFields(
    record,
    ['scheduleId', 'status', 'limit'],
    channel,
    'query'
  )
  const query: ListScheduleRunsQuery = {}
  if (record.scheduleId !== undefined) {
    query.scheduleId = requireEntityId(
      record.scheduleId,
      channel,
      'query.scheduleId'
    )
  }
  if (record.status !== undefined) {
    if (
      !['running', 'succeeded', 'failed', 'cancelled', 'interrupted'].includes(
        String(record.status)
      )
    ) {
      invalidIpcPayload(channel, 'query.status')
    }
    query.status = record.status as ListScheduleRunsQuery['status']
  }
  if (record.limit !== undefined) {
    const limit = requirePositiveInteger(record.limit, channel, 'query.limit')
    if (limit > 100) invalidIpcPayload(channel, 'query.limit')
    query.limit = limit
  }
  return query
}

export function requireCreateScheduleCommand(
  value: unknown,
  channel: string
): CreateScheduleCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['definition', 'idempotencyKey'],
    channel,
    'command'
  )
  return {
    definition: requireScheduleDefinition(record.definition, channel),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireUpdateScheduleCommand(
  value: unknown,
  channel: string
): UpdateScheduleCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['id', 'expectedRevision', 'definition', 'idempotencyKey'],
    channel,
    'command'
  )
  const expectedRevision = requireRevision(record.expectedRevision, channel)
  if (expectedRevision < 1) {
    invalidIpcPayload(channel, 'command.expectedRevision')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision,
    definition: requireScheduleDefinition(record.definition, channel),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireTransitionScheduleCommand(
  value: unknown,
  channel: string
): TransitionScheduleCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['id', 'expectedRevision', 'idempotencyKey'],
    channel,
    'command'
  )
  const expectedRevision = requireRevision(record.expectedRevision, channel)
  if (expectedRevision < 1) {
    invalidIpcPayload(channel, 'command.expectedRevision')
  }
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision,
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

export function requireRunScheduleNowCommand(
  value: unknown,
  channel: string
): RunScheduleNowCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(record, ['id', 'idempotencyKey'], channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    idempotencyKey: requireEntityId(
      record.idempotencyKey,
      channel,
      'command.idempotencyKey'
    )
  }
}

function requireScheduleDefinition(
  value: unknown,
  channel: string
): ScheduleDefinition {
  const record = requireRecord(value, channel, 'command.definition')
  requireAllowedFields(
    record,
    [
      'name',
      'description',
      'cronExpression',
      'timeZone',
      'missedRunPolicy',
      'workspaceId',
      'modelProfileId',
      'executionTarget',
      'skillInput',
      'connectorBindings',
      'permissions'
    ],
    channel,
    'command.definition'
  )
  if (
    !Array.isArray(record.connectorBindings) ||
    record.connectorBindings.length > 32 ||
    !Array.isArray(record.permissions) ||
    record.permissions.length > 4
  ) {
    invalidIpcPayload(channel, 'command.definition')
  }
  const services = new Set<string>()
  const connectorBindings = record.connectorBindings.map((value, index) => {
    const field = `command.definition.connectorBindings.${index}`
    const binding = requireRecord(value, channel, field)
    requireAllowedFields(binding, ['service', 'connectorId'], channel, field)
    const service = requireEntityId(
      binding.service,
      channel,
      `${field}.service`
    )
    if (services.has(service)) invalidIpcPayload(channel, `${field}.service`)
    services.add(service)
    return {
      service,
      connectorId: requireEntityId(
        binding.connectorId,
        channel,
        `${field}.connectorId`
      )
    }
  })
  const capabilities = new Set([
    'filesystem.read',
    'filesystem.write',
    'process.execute',
    'repository.modify'
  ])
  const permissions = record.permissions.map((permission, index) => {
    if (!capabilities.has(String(permission))) {
      invalidIpcPayload(channel, `command.definition.permissions.${index}`)
    }
    return permission as ScheduleDefinition['permissions'][number]
  })
  try {
    return normalizeScheduleDefinition({
      name: requireString(record.name, channel, 'command.definition.name', {
        maxLength: 120
      }),
      description: requireString(
        record.description,
        channel,
        'command.definition.description',
        { maxLength: 4_000 }
      ),
      cronExpression: requireString(
        record.cronExpression,
        channel,
        'command.definition.cronExpression',
        { maxLength: 200 }
      ),
      timeZone: requireString(
        record.timeZone,
        channel,
        'command.definition.timeZone',
        { maxLength: 200 }
      ),
      missedRunPolicy: requireMissedRunPolicy(
        record.missedRunPolicy,
        channel,
        'command.definition.missedRunPolicy'
      ),
      workspaceId: requireEntityId(
        record.workspaceId,
        channel,
        'command.definition.workspaceId'
      ),
      modelProfileId: requireEntityId(
        record.modelProfileId,
        channel,
        'command.definition.modelProfileId'
      ),
      executionTarget: normalizeToolDefinitionReference(
        record.executionTarget
      ),
      skillInput: requireBoundedJsonObject(
        record.skillInput,
        channel,
        'command.definition.skillInput'
      ),
      connectorBindings,
      permissions
    })
  } catch {
    invalidIpcPayload(channel, 'command.definition')
  }
}

function requireMissedRunPolicy(
  value: unknown,
  channel: string,
  field: string
): ScheduleDefinition['missedRunPolicy'] {
  if (value !== 'skip' && value !== 'run_once') {
    invalidIpcPayload(channel, field)
  }
  return value
}

function requireBoundedJsonObject(
  value: unknown,
  channel: string,
  field: string
): Record<string, unknown> {
  const record = requireRecord(value, channel, field)
  requireBoundedJsonValue(record, channel, field, 0, new Set())
  let serialized: string
  try {
    serialized = JSON.stringify(record)
  } catch {
    invalidIpcPayload(channel, field)
  }
  if (Buffer.byteLength(serialized, 'utf8') > 256 * 1024) {
    invalidIpcPayload(channel, field)
  }
  return record
}

function requireBoundedJsonValue(
  value: unknown,
  channel: string,
  field: string,
  depth: number,
  ancestors: Set<object>
): void {
  if (depth > 32) invalidIpcPayload(channel, field)
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return
  }
  if (!value || typeof value !== 'object') {
    invalidIpcPayload(channel, field)
  }
  if (ancestors.has(value)) invalidIpcPayload(channel, field)
  ancestors.add(value)
  const entries = Array.isArray(value)
    ? value.map((nested, index) => [String(index), nested] as const)
    : Object.entries(value)
  for (const [key, nested] of entries) {
    requireBoundedJsonValue(
      nested,
      channel,
      `${field}.${key}`,
      depth + 1,
      ancestors
    )
  }
  ancestors.delete(value)
}

function requireConnectorAuthentication(
  value: unknown,
  channel: string
): SaveConnectorCommand['authentication'] {
  const record = requireRecord(value, channel, 'command.authentication')
  if (record.type === 'none' || record.type === 'bearer') {
    requireAllowedFields(record, ['type'], channel, 'command.authentication')
    return { type: record.type }
  }
  if (record.type !== 'api_key_header') {
    invalidIpcPayload(channel, 'command.authentication.type')
  }
  requireAllowedFields(
    record,
    ['type', 'headerName'],
    channel,
    'command.authentication'
  )
  return {
    type: 'api_key_header',
    headerName: requireString(
      record.headerName,
      channel,
      'command.authentication.headerName',
      { maxLength: 256 }
    )
  }
}

export function requireConfigureDiscoveredModelProviderCommand(
  value: unknown,
  channel: string
): ConfigureDiscoveredModelProviderCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(record, ['catalogId'], channel, 'command')
  const catalogId = requireString(
    record.catalogId,
    channel,
    'command.catalogId',
    { maxLength: 80 }
  )
  if (!getConfigurableBuiltinModelProvider(catalogId)) {
    invalidIpcPayload(channel, 'command.catalogId')
  }
  return {
    catalogId: catalogId as ConfigureDiscoveredModelProviderCommand['catalogId']
  }
}

export function requireRotateModelCredentialKeyCommand(
  value: unknown,
  channel: string
): RotateModelCredentialKeyCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    requestId: requireString(record.requestId, channel, 'command.requestId', {
      maxLength: 128
    }).trim()
  }
}

export function requireDeleteModelProviderCommand(
  value: unknown,
  channel: string
): DeleteModelProviderCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireSaveApplicationModelDefaultCommand(
  value: unknown,
  channel: string
): SaveApplicationModelDefaultCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['preference', 'expectedRevision'],
    channel,
    'command'
  )
  const preference = requireRecord(
    record.preference,
    channel,
    'command.preference'
  )
  if (preference.mode === 'auto') {
    requireAllowedFields(preference, ['mode'], channel, 'command.preference')
    return {
      preference: { mode: 'auto' },
      expectedRevision: requireRevision(record.expectedRevision, channel)
    }
  }
  if (preference.mode !== 'profile') {
    invalidIpcPayload(channel, 'command.preference.mode')
  }
  requireAllowedFields(
    preference,
    ['mode', 'providerId', 'profileId'],
    channel,
    'command.preference'
  )
  return {
    preference: {
      mode: 'profile',
      providerId: requireEntityId(
        preference.providerId,
        channel,
        'command.preference.providerId'
      ),
      profileId: requireEntityId(
        preference.profileId,
        channel,
        'command.preference.profileId'
      )
    },
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireRemoveModelProviderCredentialCommand(
  value: unknown,
  channel: string
): RemoveModelProviderCredentialCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['providerId', 'expectedRevision'],
    channel,
    'command'
  )
  return {
    providerId: requireEntityId(
      record.providerId,
      channel,
      'command.providerId'
    ),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireDeleteModelProfileCommand(
  value: unknown,
  channel: string
): DeleteModelProfileCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    id: requireEntityId(record.id, channel, 'command.id'),
    expectedRevision: requireRevision(record.expectedRevision, channel)
  }
}

export function requireSetModelProfilesEnabledCommand(
  value: unknown,
  channel: string
): SetModelProfilesEnabledCommandDto {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['providerId', 'expectedProviderRevision', 'profiles', 'enabled'],
    channel,
    'command'
  )
  if (!Array.isArray(record.profiles)) {
    invalidIpcPayload(channel, 'command.profiles')
  }
  if (typeof record.enabled !== 'boolean') {
    invalidIpcPayload(channel, 'command.enabled')
  }
  const profiles = record.profiles.map((value, index) => {
    const profile = requireRecord(value, channel, `command.profiles.${index}`)
    requireAllowedFields(
      profile,
      ['id', 'expectedRevision'],
      channel,
      `command.profiles.${index}`
    )
    return {
      id: requireEntityId(profile.id, channel, `command.profiles.${index}.id`),
      expectedRevision: requireRevision(profile.expectedRevision, channel)
    }
  })
  if (new Set(profiles.map(({ id }) => id)).size !== profiles.length) {
    invalidIpcPayload(channel, 'command.profiles')
  }
  return {
    providerId: requireEntityId(
      record.providerId,
      channel,
      'command.providerId'
    ),
    expectedProviderRevision: requireRevision(
      record.expectedProviderRevision,
      channel
    ),
    profiles,
    enabled: record.enabled
  }
}

export function requireValidateModelProfileCommand(
  value: unknown,
  channel: string
): ValidateModelProfileCommand {
  const record = requireRecord(value, channel, 'command')
  return {
    profileId: requireEntityId(record.profileId, channel, 'command.profileId'),
    requestId: requireEntityId(record.requestId, channel, 'command.requestId')
  }
}

export function requireModelRouteRequest(
  value: unknown,
  channel: string
): ModelRouteRequest {
  const record = requireRecord(value, channel, 'request')
  if (record.strategy === 'fixed') {
    return {
      strategy: 'fixed',
      profileId: requireEntityId(record.profileId, channel, 'request.profileId')
    }
  }
  if (record.strategy !== 'capability') {
    invalidIpcPayload(channel, 'request.strategy')
  }
  const requiredCapabilities = requireModelCapabilities(
    record.requiredCapabilities,
    channel,
    'request.requiredCapabilities'
  )
  const minimumContextWindow = requirePositiveInteger(
    record.minimumContextWindow,
    channel,
    'request.minimumContextWindow'
  )
  return {
    strategy: 'capability',
    requiredCapabilities,
    minimumContextWindow
  }
}

function requireModelCapabilities(
  value: unknown,
  channel: string,
  field: string
): ModelCapability[] {
  if (!Array.isArray(value)) invalidIpcPayload(channel, field)
  const knownCapabilities = new Set<ModelCapability>([
    'text',
    'vision',
    'toolCalling',
    'structuredOutput'
  ])
  const capabilities = value.map((capability) => {
    if (
      typeof capability !== 'string' ||
      !knownCapabilities.has(capability as ModelCapability)
    ) {
      invalidIpcPayload(channel, field)
    }
    return capability as ModelCapability
  })
  if (new Set(capabilities).size !== capabilities.length) {
    invalidIpcPayload(channel, field)
  }
  return capabilities
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
  const timeoutMs = requireNonNegativeInteger(
    record.timeoutMs,
    channel,
    'command.timeoutMs'
  )
  if (timeoutMs === 0 || timeoutMs > 600_000) {
    invalidIpcPayload(channel, 'command.timeoutMs')
  }
  const maxRetries = requireNonNegativeInteger(
    record.maxRetries,
    channel,
    'command.maxRetries'
  )
  if (maxRetries > 10) {
    invalidIpcPayload(channel, 'command.maxRetries')
  }
  const maxConcurrency = requireNonNegativeInteger(
    record.maxConcurrency,
    channel,
    'command.maxConcurrency'
  )
  if (maxConcurrency === 0 || maxConcurrency > 32) {
    invalidIpcPayload(channel, 'command.maxConcurrency')
  }
  const apiType = record.apiType
  if (
    apiType !== undefined &&
    ![
      'local',
      'openai_completions',
      'openai_responses',
      'anthropic_messages'
    ].includes(apiType as string)
  ) {
    invalidIpcPayload(channel, 'command.apiType')
  }
  const inputTypes =
    record.inputTypes === undefined
      ? undefined
      : (() => {
          if (!Array.isArray(record.inputTypes)) {
            invalidIpcPayload(channel, 'command.inputTypes')
          }
          const values = record.inputTypes.map((inputType) => {
            if (!['text', 'image'].includes(inputType as string)) {
              invalidIpcPayload(channel, 'command.inputTypes')
            }
            return inputType as 'text' | 'image'
          })
          if (new Set(values).size !== values.length || values.length === 0) {
            invalidIpcPayload(channel, 'command.inputTypes')
          }
          return values
        })()
  const maxOutputTokens =
    record.maxOutputTokens === undefined
      ? undefined
      : requirePositiveInteger(
          record.maxOutputTokens,
          channel,
          'command.maxOutputTokens'
        )
  if (maxOutputTokens !== undefined && maxOutputTokens > contextWindow) {
    invalidIpcPayload(channel, 'command.maxOutputTokens')
  }
  for (const field of ['reasoning', 'deepSeekThinking'] as const) {
    if (record[field] !== undefined && typeof record[field] !== 'boolean') {
      invalidIpcPayload(channel, `command.${field}`)
    }
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
    ...(record.icon === undefined
      ? {}
      : {
          icon: requireString(record.icon, channel, 'command.icon', {
            maxLength: 240
          })
        }),
    ...(apiType === undefined
      ? {}
      : { apiType: apiType as SaveModelProfileCommand['apiType'] }),
    ...(record.deepSeekThinking === undefined
      ? {}
      : { deepSeekThinking: record.deepSeekThinking as boolean }),
    ...(record.source === 'catalog' || record.source === 'custom'
      ? { source: record.source }
      : {}),
    ...(record.catalogProviderId === undefined
      ? {}
      : {
          catalogProviderId: requireString(
            record.catalogProviderId,
            channel,
            'command.catalogProviderId',
            { maxLength: 240 }
          )
        }),
    ...(record.catalogModelId === undefined
      ? {}
      : {
          catalogModelId: requireString(
            record.catalogModelId,
            channel,
            'command.catalogModelId',
            { maxLength: 240 }
          )
        }),
    ...(record.catalogVersion === undefined
      ? {}
      : {
          catalogVersion: requirePositiveInteger(
            record.catalogVersion,
            channel,
            'command.catalogVersion'
          )
        }),
    ...(record.defaultEnabled === undefined
      ? {}
      : { defaultEnabled: record.defaultEnabled === true }),
    ...(record.enabledOverride === null
      ? { enabledOverride: null }
      : typeof record.enabledOverride === 'boolean'
        ? { enabledOverride: record.enabledOverride }
        : {}),
    ...(record.lifecycleStatus === 'active' ||
    record.lifecycleStatus === 'retired'
      ? { lifecycleStatus: record.lifecycleStatus }
      : {}),
    enabled: record.enabled,
    capabilities: {
      text: capabilities.text as boolean,
      vision: capabilities.vision as boolean,
      toolCalling: capabilities.toolCalling as boolean,
      structuredOutput: capabilities.structuredOutput as boolean
    },
    contextWindow,
    ...(inputTypes === undefined ? {} : { inputTypes }),
    ...(record.reasoning === undefined
      ? {}
      : { reasoning: record.reasoning as boolean }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    timeoutMs,
    maxRetries,
    maxConcurrency,
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

export function requireModelStatisticsQuery(
  value: unknown,
  channel: string
): ModelStatisticsQuery {
  const record = requireRecord(value, channel, 'query')
  const fields = [
    'from',
    'to',
    'providerId',
    'modelProfileId',
    'workspaceId',
    'requirementId',
    'nodeId',
    'conversationId',
    'groupBy'
  ]
  requireAllowedFields(record, fields, channel, 'query')
  const query: ModelStatisticsQuery = {}
  if (record.from !== undefined) {
    query.from = requireTimestamp(record.from, channel, 'query.from')
  }
  if (record.to !== undefined) {
    query.to = requireTimestamp(record.to, channel, 'query.to')
  }
  for (const key of fields.slice(2, 8)) {
    if (record[key] !== undefined) {
      query[key as keyof ModelStatisticsQuery] = requireEntityId(
        record[key],
        channel,
        `query.${key}`
      ) as never
    }
  }
  if (record.groupBy !== undefined) {
    if (
      typeof record.groupBy !== 'string' ||
      !MODEL_STATISTICS_GROUPS.includes(
        record.groupBy as (typeof MODEL_STATISTICS_GROUPS)[number]
      )
    ) {
      invalidIpcPayload(channel, 'query.groupBy')
    }
    query.groupBy = record.groupBy as ModelStatisticsQuery['groupBy']
  }
  return query
}

export function requireProductAnalyticsQuery(
  value: unknown,
  channel: string
): ProductAnalyticsQuery {
  const record = requireRecord(value, channel, 'query')
  requireAllowedFields(
    record,
    ['workspaceId', 'activityLimit'],
    channel,
    'query'
  )
  const query: ProductAnalyticsQuery = {}
  if (record.workspaceId !== undefined) {
    query.workspaceId = requireEntityId(
      record.workspaceId,
      channel,
      'query.workspaceId'
    )
  }
  if (record.activityLimit !== undefined) {
    const activityLimit = requirePositiveInteger(
      record.activityLimit,
      channel,
      'query.activityLimit'
    )
    if (activityLimit > 20) {
      invalidIpcPayload(channel, 'query.activityLimit')
    }
    query.activityLimit = activityLimit
  }
  return query
}

export function requireOutboundCallQuery(
  value: unknown,
  channel: string
): OutboundCallQuery {
  const record = requireRecord(value, channel, 'query')
  const identifierFields = [
    'ownerId',
    'providerId',
    'modelProfileId',
    'workspaceId',
    'requirementId',
    'nodeId',
    'nodeRunId',
    'conversationId',
    'aiRunId'
  ] as const
  requireAllowedFields(
    record,
    [
      'from',
      'to',
      'callType',
      'status',
      'ownerType',
      ...identifierFields,
      'limit'
    ],
    channel,
    'query'
  )
  const query: OutboundCallQuery = {}
  if (record.from !== undefined) {
    query.from = requireTimestamp(record.from, channel, 'query.from')
  }
  if (record.to !== undefined) {
    query.to = requireTimestamp(record.to, channel, 'query.to')
  }
  if (
    query.from !== undefined &&
    query.to !== undefined &&
    query.from > query.to
  ) {
    invalidIpcPayload(channel, 'query.timeRange')
  }
  const callTypes = [
    'model_completion',
    'model_availability',
    'connector',
    'online_document',
    'remote_repository',
    'app_update',
    'online_help'
  ]
  if (record.callType !== undefined) {
    if (!callTypes.includes(String(record.callType))) {
      invalidIpcPayload(channel, 'query.callType')
    }
    query.callType = record.callType as OutboundCallQuery['callType']
  }
  const statuses = [
    'started',
    'succeeded',
    'failed',
    'cancelled',
    'interrupted'
  ]
  if (record.status !== undefined) {
    if (!statuses.includes(String(record.status))) {
      invalidIpcPayload(channel, 'query.status')
    }
    query.status = record.status as OutboundCallQuery['status']
  }
  const ownerTypes = [
    'ai_run',
    'model_profile',
    'workspace',
    'requirement',
    'node_run',
    'conversation',
    'connector',
    'knowledge_source',
    'application'
  ]
  if (record.ownerType !== undefined) {
    if (!ownerTypes.includes(String(record.ownerType))) {
      invalidIpcPayload(channel, 'query.ownerType')
    }
    query.ownerType = record.ownerType as OutboundCallQuery['ownerType']
  }
  for (const key of identifierFields) {
    if (record[key] !== undefined) {
      query[key] = requireEntityId(record[key], channel, `query.${key}`)
    }
  }
  if (record.limit !== undefined) {
    const limit = requireNonNegativeInteger(
      record.limit,
      channel,
      'query.limit'
    )
    if (limit < 1 || limit > 200) invalidIpcPayload(channel, 'query.limit')
    query.limit = limit
  }
  return query
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

export function requireRequirementExecutionViewQuery(
  value: unknown,
  channel: string
): { requirementId: string; nodeId?: string } {
  const record = requireRecord(value, channel, 'command')
  return {
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    ...(record.nodeId === undefined
      ? {}
      : {
          nodeId: requireEntityId(record.nodeId, channel, 'command.nodeId')
        })
  }
}

export function requireRecentConversationQuery(
  value: unknown,
  channel: string
): RecentConversationQuery {
  const record = requireRecord(value, channel, 'query')
  requireAllowedFields(
    record,
    ['kind', 'workspaceId', 'folderPath', 'updatedAfter'],
    channel,
    'query'
  )
  const kind = record.kind
  if (kind !== undefined && kind !== 'general' && kind !== 'space') {
    invalidIpcPayload(channel, 'query.kind')
  }
  const query: RecentConversationQuery = {
    ...(kind === undefined ? {} : { kind }),
    ...(record.workspaceId === undefined
      ? {}
      : {
          workspaceId: requireEntityId(
            record.workspaceId,
            channel,
            'query.workspaceId'
          )
        }),
    ...(record.folderPath === undefined
      ? {}
      : {
          folderPath: requireString(
            record.folderPath,
            channel,
            'query.folderPath'
          )
        }),
    ...(record.updatedAfter === undefined
      ? {}
      : {
          updatedAfter: requireTimestamp(
            record.updatedAfter,
            channel,
            'query.updatedAfter'
          )
        })
  }
  if (query.workspaceId && query.folderPath) {
    invalidIpcPayload(channel, 'query.workspaceId')
  }
  if (
    (query.kind === 'general' && query.workspaceId) ||
    (query.kind === 'space' && query.folderPath)
  ) {
    invalidIpcPayload(channel, 'query.kind')
  }
  return query
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

export function requireSetWorkflowParallelismCommand(
  value: unknown,
  channel: string
): SetWorkflowParallelismCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'requirementId',
      'maxParallelism',
      'expectedWorkflowRevision',
      'expectedExecutionRevision'
    ],
    channel,
    'command'
  )
  const maxParallelism = requireNonNegativeInteger(
    record.maxParallelism,
    channel,
    'command.maxParallelism'
  )
  if (maxParallelism < 1 || maxParallelism > 8) {
    invalidIpcPayload(channel, 'command.maxParallelism')
  }
  return {
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    maxParallelism,
    expectedWorkflowRevision: requireRevision(
      record.expectedWorkflowRevision,
      channel
    ),
    expectedExecutionRevision: requireRevision(
      record.expectedExecutionRevision,
      channel
    )
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
    expectedExecutionRevision: requireRevision(
      record.expectedExecutionRevision,
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

export function requireRollbackWorkflowToNodeCommand(
  value: unknown,
  channel: string
): RollbackWorkflowToNodeCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    [
      'requestId',
      'requirementId',
      'executionId',
      'targetNodeId',
      'expectedRequirementRevision',
      'expectedWorkflowRevision',
      'expectedExecutionRevision',
      'expectedNodeRunRevision'
    ],
    channel,
    'command'
  )
  return {
    requestId: requireEntityId(record.requestId, channel, 'command.requestId'),
    requirementId: requireEntityId(
      record.requirementId,
      channel,
      'command.requirementId'
    ),
    executionId: requireEntityId(
      record.executionId,
      channel,
      'command.executionId'
    ),
    targetNodeId: requireEntityId(
      record.targetNodeId,
      channel,
      'command.targetNodeId'
    ),
    expectedRequirementRevision: requireRevision(
      record.expectedRequirementRevision,
      channel
    ),
    expectedWorkflowRevision: requireRevision(
      record.expectedWorkflowRevision,
      channel
    ),
    expectedExecutionRevision: requireRevision(
      record.expectedExecutionRevision,
      channel
    ),
    expectedNodeRunRevision: requireRevision(
      record.expectedNodeRunRevision,
      channel
    )
  }
}

export function requirePrepareContextSnapshotCommand(
  value: unknown,
  channel: string
): PrepareContextSnapshotCommand {
  return requireManageWorkflowNodeExecutionCommand(value, channel)
}

export function requireSkipWorkflowNodeCommand(
  value: unknown,
  channel: string
): SkipWorkflowNodeCommand {
  const command = requireManageWorkflowNodeExecutionCommand(value, channel)
  const record = requireRecord(value, channel, 'command')
  return {
    ...command,
    expectedRequirementRevision: requireRevision(
      record.expectedRequirementRevision,
      channel
    ),
    ...(record.reason === undefined
      ? {}
      : {
          reason: requireString(record.reason, channel, 'command.reason', {
            maxLength: 1000
          }).trim()
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
    const allowedFields = new Set([
      'kind',
      'decisionId',
      'expectedApprovalRevision',
      'result',
      'note'
    ])
    for (const field of Object.keys(gate)) {
      if (!allowedFields.has(field)) {
        invalidIpcPayload(channel, `command.gate.${field}`)
      }
    }
    if (gate.result !== 'approved' && gate.result !== 'rejected') {
      invalidIpcPayload(channel, 'command.gate.result')
    }
    const note =
      gate.note === undefined
        ? undefined
        : requireString(gate.note, channel, 'command.gate.note', {
            allowEmpty: true,
            maxLength: 2_000
          })
    return {
      ...common,
      gate: {
        kind: 'approval',
        decisionId: requireEntityId(
          gate.decisionId,
          channel,
          'command.gate.decisionId'
        ),
        expectedApprovalRevision: requireRevision(
          gate.expectedApprovalRevision,
          channel
        ),
        result: gate.result as 'approved' | 'rejected',
        ...(note === undefined ? {} : { note })
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
        gateId: requireEntityId(gate.gateId, channel, 'command.gate.gateId'),
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

export function requireUpdateWorkflowNodeCommand(
  value: unknown,
  channel: string
): UpdateWorkflowNodeCommand {
  const command = requireWorkflowRevisionCommand(value, channel)
  const record = value as Record<string, unknown>
  const changes = requireRecord(record.changes, channel, 'command.changes')
  const allowedFields = new Set([
    'name',
    'description',
    'allowSkip',
    'configuration',
    'executor',
    'completionGate'
  ])
  for (const field of Object.keys(changes)) {
    if (!allowedFields.has(field)) {
      invalidIpcPayload(channel, `command.changes.${field}`)
    }
  }
  if (Object.keys(changes).length === 0) {
    invalidIpcPayload(channel, 'command.changes')
  }
  if (
    changes.allowSkip !== undefined &&
    typeof changes.allowSkip !== 'boolean'
  ) {
    invalidIpcPayload(channel, 'command.changes.allowSkip')
  }

  return {
    ...command,
    nodeId: requireEntityId(record.nodeId, channel, 'command.nodeId'),
    changes: {
      ...(changes.name === undefined
        ? {}
        : {
            name: requireString(changes.name, channel, 'command.changes.name', {
              maxLength: 160
            })
          }),
      ...(changes.description === undefined
        ? {}
        : {
            description: requireString(
              changes.description,
              channel,
              'command.changes.description',
              { allowEmpty: true, maxLength: 4_000 }
            )
          }),
      ...(changes.allowSkip === undefined
        ? {}
        : { allowSkip: changes.allowSkip }),
      ...(changes.configuration === undefined
        ? {}
        : {
            configuration: requireWorkflowNodeConfiguration(
              changes.configuration,
              channel
            )
          }),
      ...(changes.executor === undefined
        ? {}
        : { executor: requireAiGenerateExecutor(changes.executor, channel) }),
      ...(changes.completionGate === undefined
        ? {}
        : {
            completionGate: requireCompletionGate(
              changes.completionGate,
              channel
            )
          })
    }
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
  throw new Error(`Invalid IPC payload for ${channel}: ${field}`)
}

export function requireNoIpcPayload(values: unknown[], channel: string): void {
  if (values.length > 0) invalidIpcPayload(channel, 'payload')
}

export function requireCheckForUpdatesCommand(
  value: unknown,
  channel: string
): CheckForUpdatesCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(record, ['requestId'], channel, 'command')
  return {
    requestId: requireEntityId(record.requestId, channel, 'command.requestId')
  }
}

export function requireOpenSupportLinkCommand(
  value: unknown,
  channel: string
): OpenSupportLinkCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(record, ['requestId', 'target'], channel, 'command')
  if (!isSupportLinkTarget(record.target)) {
    invalidIpcPayload(channel, 'command.target')
  }
  return {
    requestId: requireEntityId(record.requestId, channel, 'command.requestId'),
    target: record.target
  }
}

export function requireChooseBackupDestinationCommand(
  value: unknown,
  channel: string
): ChooseBackupDestinationCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(record, ['requestId'], channel, 'command')
  return {
    requestId: requireUuid(record.requestId, channel, 'command.requestId')
  }
}

export function requirePrepareRestoreCommand(
  value: unknown,
  channel: string
): PrepareRestoreCommand {
  const record = requireRecord(value, channel, 'command')
  requireAllowedFields(
    record,
    ['requestId', 'previewId', 'expectedChecksum'],
    channel,
    'command'
  )
  const expectedChecksum = requireString(
    record.expectedChecksum,
    channel,
    'command.expectedChecksum',
    { maxLength: 71 }
  )
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedChecksum)) {
    invalidIpcPayload(channel, 'command.expectedChecksum')
  }
  return {
    requestId: requireUuid(record.requestId, channel, 'command.requestId'),
    previewId: requireEntityId(record.previewId, channel, 'command.previewId'),
    expectedChecksum
  }
}

function requireUuid(value: unknown, channel: string, field: string): string {
  const id = requireString(value, channel, field, { maxLength: 36 })
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    invalidIpcPayload(channel, field)
  }
  return id
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

export function requireAgentRunRecoveryInput(
  value: unknown,
  channel: string
): { runId: string; action: AgentRunRecoveryAction } {
  const record = requireRecord(value, channel, 'input')
  const runId = requireString(record.runId, channel, 'input.runId', {
    maxLength: 128
  })
  if (
    record.action !== 'resume' &&
    record.action !== 'branch' &&
    record.action !== 'cancel'
  ) {
    invalidIpcPayload(channel, 'input.action')
  }
  return { runId, action: record.action as AgentRunRecoveryAction }
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
  const configuration =
    record.configuration === undefined
      ? undefined
      : requireWorkflowNodeConfiguration(record.configuration, channel)
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
    ...(configuration ? { configuration } : {}),
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

function requireWorkflowEdge(
  value: unknown,
  channel: string,
  field = 'command.edge'
): WorkflowEdge {
  const record = requireRecord(value, channel, field)
  return {
    id: requireEntityId(record.id, channel, `${field}.id`),
    sourceNodeId: requireEntityId(
      record.sourceNodeId,
      channel,
      `${field}.sourceNodeId`
    ),
    targetNodeId: requireEntityId(
      record.targetNodeId,
      channel,
      `${field}.targetNodeId`
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

function requireRepositoryBranch(
  value: unknown,
  channel: string,
  field: string
): string {
  const branch = requireString(value, channel, field, { maxLength: 255 }).trim()
  if (
    !branch ||
    branch.startsWith('-') ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.startsWith('refs/') ||
    branch.endsWith('.lock') ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.includes('@{') ||
    branch.includes('\\') ||
    branch === '@' ||
    branch.split('/').some((segment) => segment.startsWith('.')) ||
    branch.endsWith('.') ||
    /[\u0000-\u0020\u007f~^:?*\[]/.test(branch)
  ) {
    invalidIpcPayload(channel, field)
  }
  return branch
}

function requireRelativePath(
  value: unknown,
  channel: string,
  field: string
): string {
  const path = requireString(value, channel, field, { maxLength: 2048 })
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => !segment || segment === '..' || segment === '.')
  ) {
    invalidIpcPayload(channel, field)
  }
  return path
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

function requirePositiveInteger(
  value: unknown,
  channel: string,
  field: string
): number {
  const integer = requireNonNegativeInteger(value, channel, field)
  if (integer === 0) invalidIpcPayload(channel, field)
  return integer
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

function requireAllowedFields(
  record: Record<string, unknown>,
  allowed: string[],
  channel: string,
  prefix: string
): void {
  const allowedFields = new Set(allowed)
  for (const field of Object.keys(record)) {
    if (!allowedFields.has(field))
      invalidIpcPayload(channel, `${prefix}.${field}`)
  }
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
