import type {
  RequirementExecutionViewDto,
  RequirementNodeActionCapabilityDto
} from '../../../../shared/business'
import { getWorkflowExecutionProjection } from '../../../../domain/workflow'
import type { RequirementNode } from '../../../../domain/workflow'
import type {
  ArtifactMetadataRepository,
  ChatSessionRepository,
  ContextSnapshotRepository,
  NodeApprovalRepository,
  NodeApprovalRecord,
  NodeQuestionRecord,
  NodeQuestionRepository,
  NodeRunRecord,
  NodeRunRepository,
  NodeTodoRecord,
  NodeTodoRepository,
  RequirementWorkflowRepository,
  Revisioned,
  UnitOfWork,
  WorkflowExecutionRepository
} from '../ports/business-repositories'

type Dependencies = {
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  executions: Pick<WorkflowExecutionRepository, 'getLatestByRequirement'>
  nodeRuns: Pick<NodeRunRepository, 'getLatestByNode'>
  todos: Pick<NodeTodoRepository, 'listByNodeRun'>
  questions: Pick<NodeQuestionRepository, 'listByNodeRun'>
  approvals: Pick<NodeApprovalRepository, 'getByNodeRun'>
  artifacts: Pick<ArtifactMetadataRepository, 'listByRequirement'>
  contextSnapshots: Pick<ContextSnapshotRepository, 'getByNodeRun'>
  models: {
    getProfile: (
      profileId: string
    ) => Promise<{ displayName: string } | undefined>
  }
  conversations: Pick<ChatSessionRepository, 'listByNodeRun'>
  unitOfWork: UnitOfWork
}

const completedStatuses = new Set<NodeRunRecord['status']>([
  'completed',
  'skipped'
])
const retryableStatuses = new Set<NodeRunRecord['status']>([
  'failed',
  'cancelled',
  'interrupted'
])
const skippableStatuses = new Set<NodeRunRecord['status']>(['pending', 'ready'])

type NodeCompletion = {
  todos: Array<Revisioned<NodeTodoRecord>>
  questions: Array<Revisioned<NodeQuestionRecord>>
  approval: Revisioned<NodeApprovalRecord> | undefined
}

export class GetRequirementExecutionViewUseCase {
  constructor(private readonly dependencies: Dependencies) {}

  execute(input: {
    requirementId: string
    nodeId?: string
  }): Promise<RequirementExecutionViewDto> {
    return this.dependencies.unitOfWork.execute(async () => {
      const workflow = await this.dependencies.workflows.get(input.requirementId)
      if (!workflow) throw new Error('Requirement workflow was not found')

      const execution =
        await this.dependencies.executions.getLatestByRequirement(
          input.requirementId
        )
      const selectedNodeId =
        input.nodeId ?? execution?.currentNodeId ?? workflow.nodes[0]?.id
      const selectedNode = workflow.nodes.find(
        (node) => node.id === selectedNodeId
      )
      if (!selectedNode) throw new Error('Workflow node was not found')

      const nodeRuns = new Map<
        string,
        Revisioned<NodeRunRecord> | undefined
      >()
      if (execution) {
        await Promise.all(
          workflow.nodes.map(async (node) => {
            nodeRuns.set(
              node.id,
              await this.dependencies.nodeRuns.getLatestByNode(
                execution.id,
                node.id
              )
            )
          })
        )
      }

      const selectedRun = nodeRuns.get(selectedNode.id)
      const [artifacts, completionEntries, contextSnapshotEntries] =
        await Promise.all([
          this.dependencies.artifacts.listByRequirement(input.requirementId),
          Promise.all(
            workflow.nodes.map(async (node): Promise<
              readonly [string, NodeCompletion]
            > => {
              const nodeRun = nodeRuns.get(node.id)
              if (!nodeRun) {
                return [node.id, emptyNodeCompletion()]
              }
              const [todos, questions, approval] = await Promise.all([
                this.dependencies.todos.listByNodeRun(nodeRun.id),
                this.dependencies.questions.listByNodeRun(nodeRun.id),
                this.dependencies.approvals.getByNodeRun(nodeRun.id)
              ])
              return [node.id, { todos, questions, approval }] as const
            })
          ),
          Promise.all(
            workflow.nodes.map(async (node) => {
              const nodeRun = nodeRuns.get(node.id)
              return [
                node.id,
                nodeRun
                  ? await this.dependencies.contextSnapshots.getByNodeRun(
                      nodeRun.id
                    )
                  : undefined
              ] as const
            })
          )
        ])
      const completionByNode = new Map<string, NodeCompletion>(completionEntries)
      const contextSnapshotByNode = new Map(contextSnapshotEntries)
      const modelProfileIds = new Set(
        contextSnapshotEntries.flatMap(([, snapshot]) =>
          snapshot ? [snapshot.modelProfileId] : []
        )
      )
      const modelProfileEntries = await Promise.all(
        Array.from(modelProfileIds, async (profileId) => [
          profileId,
          await this.dependencies.models.getProfile(profileId)
        ] as const)
      )
      const modelProfilesById = new Map(modelProfileEntries)
      const selectedCompletion =
        completionByNode.get(selectedNode.id) ?? emptyNodeCompletion()
      const contextSnapshot = contextSnapshotByNode.get(selectedNode.id)
      const conversations = selectedRun
        ? await this.dependencies.conversations.listByNodeRun(selectedRun.id)
        : []
      const projectedWorkflow = {
        ...workflow,
        nodes: workflow.nodes.map((node) => ({
          ...node,
          status: nodeRuns.get(node.id)?.status ?? node.status
        }))
      }
      const projection = getWorkflowExecutionProjection(projectedWorkflow)
      const activeNodeIds = new Set(projection.activeNodeIds)
      const nodes = projectedWorkflow.nodes.map((node) => {
        const nodeRun = nodeRuns.get(node.id)
        const completion =
          completionByNode.get(node.id) ?? emptyNodeCompletion()
        const nodeArtifacts = artifacts.filter(
          (artifact) => artifact.isPrimary && artifact.nodeId === node.id
        )
        const executionRole = getExecutionRole(
          node,
          contextSnapshotByNode.get(node.id),
          modelProfilesById
        )
        return {
          id: node.id,
          name: node.name,
          type: node.type,
          status: nodeRun?.status ?? node.status,
          current: execution?.currentNodeId === node.id,
          active: activeNodeIds.has(node.id),
          focused: projection.focusedNodeId === node.id,
          todoCounts: summarizeTodos(completion.todos),
          openQuestionCount: completion.questions.filter(
            (question) => question.status === 'open'
          ).length,
          approvalStatus: getApprovalStatus(node, completion.approval?.result),
          artifactCount: nodeArtifacts.length,
          capabilities: getNodeCapabilities(node, nodeRun, nodeArtifacts.length),
          ...(executionRole ? { executionRole } : {}),
          ...(nodeRun
            ? {
                nodeRunId: nodeRun.id,
                nodeRunRevision: nodeRun.revision,
                attempt: nodeRun.attempt,
                createdAt: nodeRun.createdAt,
                updatedAt: nodeRun.updatedAt,
                ...(nodeRun.completedAt
                  ? { completedAt: nodeRun.completedAt }
                  : {}),
                ...(safeErrorSummary(nodeRun.error)
                  ? { errorSummary: safeErrorSummary(nodeRun.error) }
                  : {})
              }
            : {})
        }
      })
      const completedNodes = nodes.filter((node) =>
        completedStatuses.has(node.status)
      ).length
      const totalNodes = nodes.length

      return {
        workflow: projectedWorkflow,
        ...(execution ? { execution } : {}),
        maxParallelism: projectedWorkflow.maxParallelism,
        activeNodeIds: projection.activeNodeIds,
        ...(projection.focusedNodeId
          ? { focusedNodeId: projection.focusedNodeId }
          : {}),
        progress: {
          completedNodes,
          totalNodes,
          percent:
            totalNodes === 0 ? 0 : Math.round((completedNodes / totalNodes) * 100)
        },
        nodes,
        selectedNode: {
          id: selectedNode.id,
          ...(selectedRun ? { nodeRun: selectedRun } : {}),
          ...(contextSnapshot
            ? {
                contextSnapshot: {
                  id: contextSnapshot.id,
                  providerId: contextSnapshot.providerId,
                  modelProfileId: contextSnapshot.modelProfileId,
                  modelId: contextSnapshot.modelId,
                  modelParameters: contextSnapshot.modelParameters,
                  policyVersion: contextSnapshot.policyVersion,
                  content: contextSnapshot.content,
                  sources: contextSnapshot.sources,
                  plan: contextSnapshot.plan,
                  insufficientKnowledge:
                    contextSnapshot.insufficientKnowledge,
                  characterCount: contextSnapshot.characterCount,
                  estimatedTokens: contextSnapshot.estimatedTokens,
                  checksum: contextSnapshot.checksum,
                  createdAt: contextSnapshot.createdAt
                }
              }
            : {}),
          contextSources: contextSnapshot?.sources ?? [],
          todos: selectedCompletion.todos,
          questions: selectedCompletion.questions,
          ...(conversations[0] ? { conversation: conversations[0] } : {}),
          ...(selectedCompletion.approval
            ? { approval: selectedCompletion.approval }
            : {}),
          artifacts: artifacts
            .filter(
              (artifact) =>
                artifact.isPrimary && artifact.nodeId === selectedNode.id
            )
            .map((artifact) => ({
              id: artifact.id,
              ...(artifact.nodeId ? { nodeId: artifact.nodeId } : {}),
              relativePath: artifact.relativePath,
              kind: artifact.kind,
              version: artifact.version,
              byteSize: artifact.byteSize,
              isPrimary: true as const,
              updatedAt: artifact.updatedAt
            }))
        }
      }
    })
  }
}

function getExecutionRole(
  node: RequirementNode,
  snapshot: Awaited<
    ReturnType<ContextSnapshotRepository['getByNodeRun']>
  >,
  modelProfiles: Map<
    string,
    Awaited<ReturnType<Dependencies['models']['getProfile']>>
  >
): RequirementExecutionViewDto['nodes'][number]['executionRole'] {
  if (node.type === 'human_input' || node.type === 'approval') {
    return { kind: 'user' }
  }
  if (node.type === 'tool') return { kind: 'system' }
  if (!snapshot) return undefined
  return {
    kind: 'model',
    label:
      modelProfiles.get(snapshot.modelProfileId)?.displayName ??
      snapshot.modelId
  }
}

function summarizeTodos(
  todos: Awaited<ReturnType<NodeTodoRepository['listByNodeRun']>>
) {
  const required = todos.filter((todo) => todo.required)
  const optional = todos.filter((todo) => !todo.required)
  return {
    required: {
      completed: required.filter((todo) => todo.status === 'completed').length,
      total: required.length
    },
    optional: {
      completed: optional.filter((todo) => todo.status === 'completed').length,
      total: optional.length
    }
  }
}

function emptyNodeCompletion(): NodeCompletion {
  return { todos: [], questions: [], approval: undefined }
}

function getApprovalStatus(
  node: RequirementNode,
  result?: 'approved' | 'rejected'
): 'not_required' | 'pending' | 'approved' | 'rejected' {
  if (result) return result
  const required =
    node.type === 'approval' ||
    node.configuration?.completionGate.requireApproval === true ||
    node.completionGate?.requireApproval === true
  return required ? 'pending' : 'not_required'
}

function getNodeCapabilities(
  node: RequirementNode,
  nodeRun: Revisioned<NodeRunRecord> | undefined,
  artifactCount: number
): NonNullable<RequirementExecutionViewDto['nodes'][number]['capabilities']> {
  return {
    retry: getRetryCapability(node, nodeRun),
    skip: getSkipCapability(node, nodeRun),
    delete: getDeleteCapability(node, nodeRun, artifactCount),
    rollback: getRollbackCapability(nodeRun)
  }
}

function getRetryCapability(
  node: RequirementNode,
  nodeRun: Revisioned<NodeRunRecord> | undefined
): RequirementNodeActionCapabilityDto {
  if (!nodeRun) return disabled('node_run_missing')
  if (!retryableStatuses.has(nodeRun.status)) return disabled('invalid_state')
  if (node.type !== 'ai_generate' || !node.executor) {
    return disabled('not_executable')
  }
  if (nodeRun.attempt >= (node.configuration?.retry.maxAttempts ?? 1)) {
    return disabled('retry_limit_reached')
  }
  return { enabled: true }
}

function getSkipCapability(
  node: RequirementNode,
  nodeRun: Revisioned<NodeRunRecord> | undefined
): RequirementNodeActionCapabilityDto {
  if (!nodeRun) return disabled('node_run_missing')
  if (!skippableStatuses.has(nodeRun.status)) return disabled('invalid_state')
  if (!node.allowSkip || node.configuration?.skip.allowed === false) {
    return disabled('skip_not_allowed')
  }
  return { enabled: true }
}

function getDeleteCapability(
  node: RequirementNode,
  nodeRun: Revisioned<NodeRunRecord> | undefined,
  artifactCount: number
): RequirementNodeActionCapabilityDto {
  if (node.status !== 'pending') return disabled('invalid_state')
  if ((nodeRun && hasStartedEvidence(nodeRun)) || artifactCount > 0) {
    return disabled('node_already_started')
  }
  return { enabled: true }
}

function getRollbackCapability(
  nodeRun: Revisioned<NodeRunRecord> | undefined
): RequirementNodeActionCapabilityDto {
  return nodeRun && hasStartedEvidence(nodeRun)
    ? { enabled: true }
    : disabled('no_execution_history')
}

function hasStartedEvidence(nodeRun: Revisioned<NodeRunRecord>): boolean {
  return (
    !skippableStatuses.has(nodeRun.status) ||
    nodeRun.attempt > 1 ||
    nodeRun.aiRunId !== undefined ||
    nodeRun.checkpoint !== undefined ||
    nodeRun.error !== undefined ||
    nodeRun.completedAt !== undefined
  )
}

function disabled(
  reasonCode: Exclude<
    RequirementNodeActionCapabilityDto,
    { enabled: true }
  >['reasonCode']
): RequirementNodeActionCapabilityDto {
  return { enabled: false, reasonCode }
}

function safeErrorSummary(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  return value
    .replace(
      /(?:\/Users\/|\/home\/|\/var\/|\/tmp\/)[^\s]+|[A-Za-z]:\\[^\s]+/g,
      '[redacted-path]'
    )
    .replace(/Authorization:\s*[^\r\n]+/gi, 'Authorization: [redacted]')
    .replace(
      /\b(token|secret|password|api[_-]?key)\s*=\s*\S+/gi,
      '$1=[redacted]'
    )
    .trim()
    .slice(0, 240)
}
