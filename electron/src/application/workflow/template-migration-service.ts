import {
  createTemplateMigrationDiff,
  type TemplateMigrationDiff
} from '../../../../domain/template-migration'
import type {
  RequirementWorkflow,
  WorkflowTemplateSnapshot
} from '../../../../domain/workflow'
import type {
  NodeRunRepository,
  NodeTodoRepository,
  RequirementRecord,
  RequirementRepository,
  RequirementWorkflowRepository,
  Revisioned,
  TemplateMigrationRecord,
  TemplateMigrationRecordRepository,
  UnitOfWork,
  WorkflowExecutionRecord,
  WorkflowExecutionRepository,
  WorkflowTemplateRecord,
  WorkflowTemplateRepository,
  WorkflowTemplateVersionRecord
} from '../ports/business-repositories'
import { initializeConfiguredNodeTodos } from './manage-node-todos'
import type { StartedNodeProtection } from './started-node-protection'

export type TemplateMigrationErrorCode =
  | 'requirement_not_found'
  | 'workflow_not_found'
  | 'execution_not_found'
  | 'source_not_found'
  | 'template_not_found'
  | 'target_not_found'
  | 'target_unavailable'
  | 'different_template'
  | 'not_newer'
  | 'workflow_started'
  | 'revision_conflict'
  | 'request_conflict'
  | 'persistence_failed'

export type TemplateMigrationCurrentRevisions = {
  requirementRevision: number
  workflowRevision: number
  executionRevision: number
}

export class TemplateMigrationServiceError extends Error {
  readonly name = 'TemplateMigrationServiceError'

  constructor(
    readonly code: TemplateMigrationErrorCode,
    message: string,
    readonly currentRevisions?: TemplateMigrationCurrentRevisions
  ) {
    super(message)
  }
}

export type TemplateMigrationVersionSummary = {
  id: string
  version: number
  checksum: string
  nodeCount: number
  edgeCount: number
  publishedAt?: number
}

export type TemplateMigrationCandidateList = {
  currentVersion: TemplateMigrationVersionSummary
  candidates: TemplateMigrationVersionSummary[]
}

export type TemplateMigrationPreview = {
  requirementId: string
  sourceVersion: TemplateMigrationVersionSummary
  targetVersion: TemplateMigrationVersionSummary
  requirementRevision: number
  workflowRevision: number
  executionRevision: number
  diff: TemplateMigrationDiff
}

export type ApplyTemplateMigrationCommand = {
  requestId: string
  requirementId: string
  targetTemplateVersionId: string
  expectedRequirementRevision: number
  expectedWorkflowRevision: number
  expectedExecutionRevision: number
}

export type TemplateMigrationResult = {
  outcome: 'applied' | 'idempotent'
  migrationRecordId: string
  requirementRevision: number
  executionRevision: number
  targetVersion: TemplateMigrationVersionSummary
  workflow: RequirementWorkflow
  diff: TemplateMigrationDiff
}

type Dependencies = {
  requirements: Pick<RequirementRepository, 'get'> &
    Partial<Pick<RequirementRepository, 'save'>>
  workflows: Pick<RequirementWorkflowRepository, 'get'> &
    Partial<Pick<RequirementWorkflowRepository, 'save'>>
  executions: Pick<WorkflowExecutionRepository, 'getActiveByRequirement'> &
    Partial<Pick<WorkflowExecutionRepository, 'save'>>
  templates: Pick<
    WorkflowTemplateRepository,
    'getVersion' | 'listVersions' | 'getTemplate'
  >
  nodeProtection: Pick<StartedNodeProtection, 'assertUnstarted'>
  nodeRuns?: Pick<NodeRunRepository, 'deleteByNode' | 'save'>
  todos?: Pick<NodeTodoRepository, 'save'>
  migrationRecords?: TemplateMigrationRecordRepository
  unitOfWork?: UnitOfWork
  now?: () => number
  createId?: (kind: 'migration' | 'node_run') => string
}

type MigrationContext = {
  requirement: Revisioned<RequirementRecord>
  workflow: RequirementWorkflow
  execution: Revisioned<WorkflowExecutionRecord>
  sourceVersion: WorkflowTemplateVersionRecord
  template: Revisioned<WorkflowTemplateRecord>
}

export class TemplateMigrationService {
  private readonly now: () => number
  private readonly createId: NonNullable<Dependencies['createId']>

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
    this.createId =
      dependencies.createId ??
      (() => globalThis.crypto.randomUUID())
  }

  async listCandidates(
    requirementId: string
  ): Promise<TemplateMigrationCandidateList> {
    const context = await this.loadContext(requirementId)
    this.assertTemplateAvailable(context.template)
    const versions = await this.dependencies.templates.listVersions(
      context.sourceVersion.templateId
    )

    return {
      currentVersion: toVersionSummary(context.sourceVersion),
      candidates: versions
        .filter(
          (version) =>
            version.templateId === context.sourceVersion.templateId &&
            version.status === 'published' &&
            version.version > context.sourceVersion.version
        )
        .sort((left, right) => right.version - left.version)
        .map(toVersionSummary)
    }
  }

  async preview(
    requirementId: string,
    targetTemplateVersionId: string
  ): Promise<TemplateMigrationPreview> {
    const context = await this.loadContext(requirementId)
    this.assertTemplateAvailable(context.template)
    if (context.execution.status !== 'created') {
      throw serviceError(
        'workflow_started',
        'Requirement workflow has already started'
      )
    }

    const target = await this.dependencies.templates.getVersion(
      targetTemplateVersionId
    )
    if (!target) {
      throw serviceError(
        'target_not_found',
        'Target workflow template version was not found'
      )
    }
    this.assertTargetAvailable(context.sourceVersion, target)

    try {
      await this.dependencies.nodeProtection.assertUnstarted(
        requirementId,
        context.workflow.nodes.map((node) => node.id)
      )
    } catch {
      throw serviceError(
        'workflow_started',
        'Requirement workflow has already started'
      )
    }

    return {
      requirementId,
      sourceVersion: toVersionSummary(context.sourceVersion),
      targetVersion: toVersionSummary(target),
      requirementRevision: context.requirement.revision,
      workflowRevision: context.workflow.revision,
      executionRevision: context.execution.revision,
      diff: createTemplateMigrationDiff(
        context.workflow,
        toTemplateSnapshot(target)
      )
    }
  }

  async apply(
    command: ApplyTemplateMigrationCommand
  ): Promise<TemplateMigrationResult> {
    const commandDependencies = this.requireCommandDependencies()
    try {
      return await commandDependencies.unitOfWork.execute(async () => {
      const existing =
        await commandDependencies.migrationRecords.getByRequestId(
          command.requestId
        )
      if (existing) {
        if (!matchesCommand(existing, command)) {
          throw serviceError(
            'request_conflict',
            'Template migration request id has different input'
          )
        }
        const target = await this.dependencies.templates.getVersion(
          existing.targetTemplateVersionId
        )
        if (!target) {
          throw serviceError(
            'persistence_failed',
            'Persisted template migration target was not found'
          )
        }
        return resultFromRecord(existing, target)
      }

      const preview = await this.preview(
        command.requirementId,
        command.targetTemplateVersionId
      )
      if (
        preview.requirementRevision !==
          command.expectedRequirementRevision ||
        preview.workflowRevision !== command.expectedWorkflowRevision ||
        preview.executionRevision !== command.expectedExecutionRevision
      ) {
        throw new TemplateMigrationServiceError(
          'revision_conflict',
          'Template migration preview is stale',
          {
            requirementRevision: preview.requirementRevision,
            workflowRevision: preview.workflowRevision,
            executionRevision: preview.executionRevision
          }
        )
      }

      const context = await this.loadContext(command.requirementId)
      const timestamp = this.now()
      for (const node of context.workflow.nodes) {
        await commandDependencies.nodeRuns.deleteByNode(
          context.execution.id,
          node.id
        )
      }

      const workflowResult = await commandDependencies.saveWorkflow(
        preview.diff.targetWorkflow,
        command.expectedWorkflowRevision,
        { reason: 'template_migrated', triggerSource: 'user' }
      )
      if (workflowResult.status === 'conflict') {
        throw serviceError(
          'revision_conflict',
          'Requirement workflow revision conflict'
        )
      }
      const { revision: _requirementRevision, ...requirementRecord } =
        context.requirement
      const requirementResult = await commandDependencies.saveRequirement(
        {
          ...requirementRecord,
          workflowTemplateVersionId: command.targetTemplateVersionId,
          updatedAt: timestamp
        },
        command.expectedRequirementRevision
      )
      if (requirementResult.status === 'conflict') {
        throw serviceError(
          'revision_conflict',
          'Requirement revision conflict'
        )
      }

      const currentNodeId = workflowResult.entity.nodes
        .slice()
        .sort((left, right) => left.order - right.order)
        .find((node) => node.status === 'ready')?.id
        const {
          revision: _executionRevision,
          ...executionRecord
        } = context.execution
        const executionResult = await commandDependencies.saveExecution(
          {
            ...executionRecord,
            currentNodeId,
            updatedAt: timestamp
          },
          command.expectedExecutionRevision
        )
      if (executionResult.status === 'conflict') {
        throw serviceError(
          'revision_conflict',
          'Workflow execution revision conflict'
        )
      }

      for (const node of workflowResult.entity.nodes) {
        const nodeRunResult = await commandDependencies.nodeRuns.save(
          {
            id: this.createId('node_run'),
            executionId: executionResult.entity.id,
            nodeId: node.id,
            status: node.status,
            attempt: 1,
            createdAt: timestamp,
            updatedAt: timestamp
          },
          0
        )
        if (nodeRunResult.status === 'conflict') {
          throw new Error('Template migration node run already exists')
        }
        await initializeConfiguredNodeTodos(commandDependencies.todos, {
          nodeRunId: nodeRunResult.entity.id,
          configuredTodos: node.configuration?.todos,
          timestamp
        })
      }

      const migrationRecord: TemplateMigrationRecord = {
        id: this.createId('migration'),
        requestId: command.requestId,
        requirementId: command.requirementId,
        sourceTemplateVersionId: preview.sourceVersion.id,
        targetTemplateVersionId: preview.targetVersion.id,
        beforeRequirementRevision: command.expectedRequirementRevision,
        afterRequirementRevision: requirementResult.entity.revision,
        beforeWorkflowRevision: command.expectedWorkflowRevision,
        afterWorkflowRevision: workflowResult.entity.revision,
        beforeExecutionRevision: command.expectedExecutionRevision,
        afterExecutionRevision: executionResult.entity.revision,
        diff: preview.diff,
        createdAt: timestamp
      }
      await commandDependencies.migrationRecords.append(migrationRecord)

      return {
        outcome: 'applied',
        migrationRecordId: migrationRecord.id,
        requirementRevision: requirementResult.entity.revision,
        executionRevision: executionResult.entity.revision,
        targetVersion: preview.targetVersion,
        workflow: workflowResult.entity,
        diff: preview.diff
      }
      })
    } catch (error) {
      if (error instanceof TemplateMigrationServiceError) throw error
      throw serviceError(
        'persistence_failed',
        'Template migration could not be persisted'
      )
    }
  }

  private async loadContext(requirementId: string): Promise<MigrationContext> {
    const requirement = await this.dependencies.requirements.get(requirementId)
    if (!requirement) {
      throw serviceError('requirement_not_found', 'Requirement was not found')
    }
    const [workflow, execution] = await Promise.all([
      this.dependencies.workflows.get(requirementId),
      this.dependencies.executions.getActiveByRequirement(requirementId)
    ])
    if (!workflow) {
      throw serviceError(
        'workflow_not_found',
        'Requirement workflow was not found'
      )
    }
    if (!execution) {
      throw serviceError(
        'execution_not_found',
        'Active workflow execution was not found'
      )
    }

    const sourceVersionId = requirement.workflowTemplateVersionId
    const sourceVersion = sourceVersionId
      ? await this.dependencies.templates.getVersion(sourceVersionId)
      : undefined
    if (
      !sourceVersion ||
      workflow.templateVersionId !== sourceVersion.id
    ) {
      throw serviceError(
        'source_not_found',
        'Current workflow template version was not found'
      )
    }
    const template = await this.dependencies.templates.getTemplate(
      sourceVersion.templateId
    )
    if (!template) {
      throw serviceError(
        'template_not_found',
        'Workflow template was not found'
      )
    }
    return {
      requirement,
      workflow,
      execution,
      sourceVersion,
      template
    }
  }

  private assertTemplateAvailable(
    template: Revisioned<WorkflowTemplateRecord>
  ): void {
    if (template.status === 'archived') {
      throw serviceError(
        'target_unavailable',
        'Workflow template is archived'
      )
    }
  }

  private assertTargetAvailable(
    source: WorkflowTemplateVersionRecord,
    target: WorkflowTemplateVersionRecord
  ): void {
    if (target.templateId !== source.templateId) {
      throw serviceError(
        'different_template',
        'Target version belongs to a different workflow template'
      )
    }
    if (target.version <= source.version) {
      throw serviceError(
        'not_newer',
        'Target workflow template version must be newer'
      )
    }
    if (target.status !== 'published') {
      throw serviceError(
        'target_unavailable',
        'Target workflow template version is not published'
      )
    }
  }

  private requireCommandDependencies() {
    const {
      nodeRuns,
      todos,
      migrationRecords,
      unitOfWork
    } = this.dependencies
    const saveRequirement = this.dependencies.requirements.save
    const saveWorkflow = this.dependencies.workflows.save
    const saveExecution = this.dependencies.executions.save
    if (
      !nodeRuns ||
      !todos ||
      !migrationRecords ||
      !unitOfWork ||
      !saveRequirement ||
      !saveWorkflow ||
      !saveExecution
    ) {
      throw serviceError(
        'persistence_failed',
        'Template migration persistence is unavailable'
      )
    }
    return {
      nodeRuns,
      todos,
      migrationRecords,
      unitOfWork,
      saveRequirement: (
        ...input: Parameters<NonNullable<typeof saveRequirement>>
      ) => this.dependencies.requirements.save!(...input),
      saveWorkflow: (
        ...input: Parameters<NonNullable<typeof saveWorkflow>>
      ) => this.dependencies.workflows.save!(...input),
      saveExecution: (
        ...input: Parameters<NonNullable<typeof saveExecution>>
      ) => this.dependencies.executions.save!(...input)
    }
  }
}

function toVersionSummary(
  version: WorkflowTemplateVersionRecord
): TemplateMigrationVersionSummary {
  return {
    id: version.id,
    version: version.version,
    checksum: version.checksum,
    nodeCount: version.nodes.length,
    edgeCount: version.edges.length,
    ...(version.publishedAt === undefined
      ? {}
      : { publishedAt: version.publishedAt })
  }
}

function toTemplateSnapshot(
  version: WorkflowTemplateVersionRecord
): WorkflowTemplateSnapshot {
  return {
    id: version.id,
    nodes: version.nodes.map(({ position: _position, ...node }) => node),
    edges: version.edges
  }
}

function serviceError(
  code: TemplateMigrationErrorCode,
  message: string
): TemplateMigrationServiceError {
  return new TemplateMigrationServiceError(code, message)
}

function matchesCommand(
  record: TemplateMigrationRecord,
  command: ApplyTemplateMigrationCommand
): boolean {
  return (
    record.requirementId === command.requirementId &&
    record.targetTemplateVersionId === command.targetTemplateVersionId &&
    record.beforeRequirementRevision ===
      command.expectedRequirementRevision &&
    record.beforeWorkflowRevision === command.expectedWorkflowRevision &&
    record.beforeExecutionRevision === command.expectedExecutionRevision
  )
}

function resultFromRecord(
  record: TemplateMigrationRecord,
  target: WorkflowTemplateVersionRecord
): TemplateMigrationResult {
  return {
    outcome: 'idempotent',
    migrationRecordId: record.id,
    requirementRevision: record.afterRequirementRevision,
    executionRevision: record.afterExecutionRevision,
    targetVersion: toVersionSummary(target),
    workflow: {
      ...record.diff.targetWorkflow,
      revision: record.afterWorkflowRevision
    },
    diff: record.diff
  }
}
