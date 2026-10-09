import type { ContextAssembler } from '../context/context-assembler'
import type {
  NodeRunRepository,
  RequirementRepository,
  RequirementWorkflowRepository,
  WorkflowExecutionRepository
} from '../ports/business-repositories'

const allowedStatuses = new Set([
  'ready',
  'running',
  'waiting_user',
  'paused',
  'blocked'
])

type Dependencies = {
  requirements: Pick<RequirementRepository, 'get'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  executions: Pick<WorkflowExecutionRepository, 'getLatestByRequirement'>
  nodeRuns: Pick<NodeRunRepository, 'get'>
  assembler: Pick<ContextAssembler, 'assemble'>
  workspace: {
    readRequirementBody: (requirementId: string) => Promise<string>
  }
  maxCharacters?: number
}

export class RequirementNodeConversationContextAssembler {
  constructor(private readonly dependencies: Dependencies) {}

  async assemble(input: {
    requirementId: string
    nodeRunId: string
    query: string
    pendingQuestion?: { prompt: string; answer: string }
  }): Promise<{
    context: string
    workspaceId: string
    requirementId: string
    nodeId: string
  }> {
    const [requirement, workflow, execution, nodeRun] = await Promise.all([
      this.dependencies.requirements.get(input.requirementId),
      this.dependencies.workflows.get(input.requirementId),
      this.dependencies.executions.getLatestByRequirement(input.requirementId),
      this.dependencies.nodeRuns.get(input.nodeRunId)
    ])
    const node = workflow?.nodes.find(
      (candidate) => candidate.id === nodeRun?.nodeId
    )
    if (!requirement || !workflow || !execution || !nodeRun || !node) {
      throw new Error('Node context dependencies are unavailable')
    }
    if (
      execution.requirementId !== requirement.id ||
      nodeRun.executionId !== execution.id ||
      execution.currentNodeId !== nodeRun.nodeId ||
      !allowedStatuses.has(nodeRun.status)
    ) {
      throw new Error('当前节点不支持继续对话')
    }

    const inputPolicy = node.configuration?.input
    const includeRequirementBody =
      inputPolicy?.includeRequirementBody ?? true
    const body = includeRequirementBody
      ? await this.dependencies.workspace.readRequirementBody(requirement.id)
      : ''
    const prompt =
      node.configuration?.prompt ??
      (node.executor?.kind === 'ai_generate' ? node.executor.prompt : '')
    const artifact =
      node.configuration?.artifact ??
      (node.executor?.kind === 'ai_generate'
        ? node.executor.artifact
        : undefined)
    const pending = input.pendingQuestion
      ? `\n## Pending node answer\n${input.pendingQuestion.prompt}: ${input.pendingQuestion.answer}\n`
      : ''
    const maxCharacters = this.dependencies.maxCharacters ?? 100_000
    const assembled = await this.dependencies.assembler.assemble({
      requirement: {
        id: requirement.id,
        version: requirement.revision,
        title: requirement.title,
        description: body,
        scope: '',
        acceptanceCriteria: []
      },
      node: {
        id: node.id,
        version: workflow.revision,
        name: node.name,
        description: node.description,
        prompt,
        artifactSpecification: artifact
          ? `${artifact.kind}: ${artifact.relativePath}`
          : ''
      },
      nodeRunId: nodeRun.id,
      knowledgeQuery: input.query,
      attachmentPaths: inputPolicy?.attachments ?? [],
      includeRequirementBody,
      predecessorArtifacts: inputPolicy?.predecessorArtifacts ?? 'direct',
      includeSpaceKnowledge: inputPolicy?.includeSpaceKnowledge ?? true,
      maxCharacters: Math.max(1, maxCharacters - pending.length)
    })
    return {
      context: `${assembled.content}${pending}`.slice(0, maxCharacters),
      workspaceId: requirement.workspaceId,
      requirementId: requirement.id,
      nodeId: node.id
    }
  }
}
