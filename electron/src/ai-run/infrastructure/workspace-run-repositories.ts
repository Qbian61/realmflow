import type { RequirementStageId } from '../../../../domain/requirement'
import type { PersistenceApi } from '../../../../shared/persistence'
import type { WorkspaceService } from '../../workspace/workspace-service'
import type {
  NodeExecutionContext,
  StageContext,
  StageContextRepository
} from '../application/ports'
import type { AiGenerateExecutorConfig } from '../../../../domain/workflow'

export class WorkspaceStageContextRepository
  implements StageContextRepository
{
  constructor(
    private readonly persistence: Pick<PersistenceApi, 'load'>,
    private readonly workspace: Pick<
      WorkspaceService,
      'getBinding' | 'readManifest' | 'readFile'
    >
  ) {}

  async load(
    requirementId: string,
    stageId: RequirementStageId
  ): Promise<StageContext> {
    const [navigation, binding, manifest] = await Promise.all([
      this.persistence.load('workspaceNavigation'),
      this.workspace.getBinding(requirementId),
      this.workspace.readManifest(requirementId)
    ])
    if (navigation.status !== 'loaded' || !binding) {
      throw new Error('Requirement workspace context is unavailable')
    }
    const requirement = findRequirement(navigation.snapshot.value, requirementId)
    if (!requirement) throw new Error('Requirement was not found')

    const existingArtifacts = await Promise.all(
      (manifest.stages[stageId]?.artifacts ?? []).map(async ({ path }) => {
        const file = await this.workspace.readFile(requirementId, path)
        return { path, content: file.content }
      })
    )
    return {
      requirementId,
      requirementTitle: requirement.title,
      stageId,
      workspaceName: binding.rootName,
      existingArtifacts
    }
  }

  async loadNode(input: {
    requirementId: string
    nodeId: string
    nodeRunId: string
    executor: AiGenerateExecutorConfig
    modelProfileId?: string
  }): Promise<NodeExecutionContext> {
    const base = await this.load(
      input.requirementId,
      input.executor.legacyStageId ?? 'analysis'
    )
    return {
      requirementId: base.requirementId,
      requirementTitle: base.requirementTitle,
      nodeId: input.nodeId,
      workspaceName: base.workspaceName,
      prompt: input.executor.prompt,
      artifactPath: input.executor.artifact.relativePath,
      existingArtifacts: input.executor.legacyStageId
        ? base.existingArtifacts
        : []
    }
  }
}

function findRequirement(
  value: unknown,
  requirementId: string
): { title: string } | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined
  if (!isRecord(value.requirementsBySpace)) return undefined
  for (const requirements of Object.values(value.requirementsBySpace)) {
    if (!Array.isArray(requirements)) continue
    const requirement = requirements.find(
      (candidate) =>
        isRecord(candidate) &&
        candidate.id === requirementId &&
        typeof candidate.title === 'string'
    )
    if (isRecord(requirement) && typeof requirement.title === 'string') {
      return { title: requirement.title }
    }
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
