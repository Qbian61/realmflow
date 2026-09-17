import type { NodeRunStatus, RequirementWorkflow } from '../../../../domain/workflow'
import type {
  NodeQuestionRepository,
  NodeRunRecord,
  NodeRunRepository,
  NodeTodoRepository,
  RequirementRecord,
  RequirementRepository,
  RequirementWorkflowRepository,
  Revisioned,
  UnitOfWork,
  WorkflowExecutionRecord,
  WorkflowExecutionRepository,
  WorkflowDispatchRepository
} from '../ports/business-repositories'
import { WorkflowRuntime } from './workflow-runtime'

export type NodeExecutionDependencies = {
  requirements: RequirementRepository
  workflows: RequirementWorkflowRepository
  executions: WorkflowExecutionRepository
  nodeRuns: NodeRunRepository
  dispatches: Pick<WorkflowDispatchRepository, 'enqueue'>
  todos: NodeTodoRepository
  questions: NodeQuestionRepository
  unitOfWork: UnitOfWork
  knowledgeSync: {
    execute: (requirementId: string) => Promise<{
      synced: number
      skipped: number
      failed: number
    }>
  }
}

export class ManageNodeExecutionUseCase {
  private readonly runtime: WorkflowRuntime

  constructor(
    private readonly dependencies: NodeExecutionDependencies,
    private readonly now: () => number = Date.now
  ) {
    this.runtime = new WorkflowRuntime(dependencies.workflows)
  }

  async startNode(input: {
    requirementId: string
    nodeRunId: string
    aiRunId: string
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.transitionCurrentExecution({
      ...input,
      allowedStatuses: ['ready', 'interrupted', 'failed', 'cancelled'],
      status: 'running'
    })
  }

  async reserveNode(input: {
    requirementId: string
    nodeRunId: string
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.transitionCurrentExecution({
      ...input,
      allowedStatuses: ['ready', 'interrupted', 'failed', 'cancelled'],
      status: 'running'
    })
  }

  async bindAiRun(input: {
    nodeRunId: string
    aiRunId: string
    expectedNodeRunRevision: number
  }): Promise<Revisioned<NodeRunRecord>> {
    const nodeRun = await this.getNodeRun(input.nodeRunId)
    if (nodeRun.status !== 'running') {
      throw new Error(`Node run cannot bind from ${nodeRun.status}`)
    }
    if (nodeRun.aiRunId && nodeRun.aiRunId !== input.aiRunId) {
      throw new Error('Node run is already bound to another AI run')
    }
    const result = await this.dependencies.nodeRuns.save(
      {
        ...nodeRun,
        aiRunId: input.aiRunId,
        updatedAt: this.now()
      },
      input.expectedNodeRunRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Node run revision conflict')
    }
    return result.entity
  }

  async waitForUser(input: {
    requirementId: string
    nodeRunId: string
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.transitionCurrentExecution({
      ...input,
      allowedStatuses: ['running'],
      status: 'waiting_user'
    })
  }

  async finishNode(input: {
    requirementId: string
    nodeRunId: string
    status: 'failed' | 'cancelled'
    error?: string
  }): Promise<
    | {
        workflow: RequirementWorkflow
        nodeRun: Revisioned<NodeRunRecord>
      }
    | undefined
  > {
    const current = await this.getNodeRun(input.nodeRunId)
    if (current.status === 'paused') return undefined
    return this.transitionCurrentExecution({
      ...input,
      allowedStatuses: ['ready', 'running', 'waiting_user', 'interrupted'],
      status: input.status
    })
  }

  async completeTodo(input: {
    nodeRunId: string
    todoId: string
    expectedRevision: number
  }): Promise<void> {
    const todos = await this.dependencies.todos.listByNodeRun(input.nodeRunId)
    const todo = todos.find((item) => item.id === input.todoId)
    if (!todo) throw new Error(`Node todo not found: ${input.todoId}`)
    if (todo.status === 'cancelled') {
      throw new Error('Cancelled node todo cannot be completed')
    }
    const result = await this.dependencies.todos.save(
      { ...todo, status: 'completed', updatedAt: this.now() },
      input.expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Node todo revision conflict')
    }
  }

  async answerQuestion(input: {
    nodeRunId: string
    questionId: string
    expectedRevision: number
    answer: string
  }): Promise<void> {
    const answer = input.answer.trim()
    if (!answer) throw new Error('Question answer is required')
    const questions = await this.dependencies.questions.listByNodeRun(
      input.nodeRunId
    )
    const question = questions.find((item) => item.id === input.questionId)
    if (!question) throw new Error(`Node question not found: ${input.questionId}`)
    if (question.status !== 'open') {
      throw new Error(`Node question cannot be answered from ${question.status}`)
    }
    const timestamp = this.now()
    const result = await this.dependencies.questions.save(
      {
        ...question,
        status: 'answered',
        answer,
        updatedAt: timestamp,
        answeredAt: timestamp
      },
      input.expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Node question revision conflict')
    }
  }

  async pauseNode(input: {
    requirementId: string
    nodeRunId: string
    expectedNodeRunRevision: number
    expectedWorkflowRevision: number
  }): Promise<void> {
    await this.changeExecutionStatus(input, ['running', 'ready'], 'paused')
  }

  async resumeNode(input: {
    requirementId: string
    nodeRunId: string
    expectedNodeRunRevision: number
    expectedWorkflowRevision: number
  }): Promise<void> {
    await this.changeExecutionStatus(input, ['paused'], 'ready')
  }

  async completeNode(input: {
    requirementId: string
    nodeRunId: string
    expectedNodeRunRevision: number
    expectedWorkflowRevision: number
    expectedRequirementRevision: number
    executionFinished: boolean
    requiredArtifactsValid: boolean
    approvalPassed: boolean
    customGatePassed: boolean
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
    requirementCompleted: boolean
    knowledgeSyncFailed: boolean
  }> {
    const committed = await this.dependencies.unitOfWork.execute(async () => {
      const nodeRun = await this.getNodeRun(input.nodeRunId)
      const [todos, questions] = await Promise.all([
        this.dependencies.todos.listByNodeRun(input.nodeRunId),
        this.dependencies.questions.listByNodeRun(input.nodeRunId)
      ])
      const workflow = await this.runtime.completeNode({
        requirementId: input.requirementId,
        nodeId: nodeRun.nodeId,
        expectedRevision: input.expectedWorkflowRevision,
        gates: {
          executionFinished: input.executionFinished,
          requiredArtifactsValid: input.requiredArtifactsValid,
          requiredTodosComplete: todos
            .filter((todo) => todo.required)
            .every((todo) => todo.status === 'completed'),
          openRequiredQuestions: questions.filter(
            (question) => question.required && question.status === 'open'
          ).length,
          approvalPassed: input.approvalPassed,
          customGatePassed: input.customGatePassed
        }
      })
      const timestamp = this.now()
      const nodeRunResult = await this.dependencies.nodeRuns.save(
        {
          ...nodeRun,
          status: 'completed',
          updatedAt: timestamp,
          completedAt: timestamp
        },
        input.expectedNodeRunRevision
      )
      if (nodeRunResult.status === 'conflict') {
        throw new Error('Node run revision conflict')
      }

      const requirementCompleted = workflow.nodes.every(
        (node) => node.status === 'completed' || node.status === 'skipped'
      )
      const nextNode = requirementCompleted
        ? undefined
        : workflow.nodes.find((node) => node.status === 'ready')
      if (requirementCompleted) {
        await this.completeRequirement(
          input.requirementId,
          input.expectedRequirementRevision,
          timestamp
        )
      } else if (nextNode) {
        const nextNodeRun = await this.dependencies.nodeRuns.getLatestByNode(
          nodeRun.executionId,
          nextNode.id
        )
        if (!nextNodeRun) {
          throw new Error(`Ready node run not found: ${nextNode.id}`)
        }
        if (nextNodeRun.status === 'pending') {
          const nextNodeRunResult = await this.dependencies.nodeRuns.save(
            {
              ...nextNodeRun,
              status: 'ready',
              updatedAt: timestamp
            },
            nextNodeRun.revision
          )
          if (nextNodeRunResult.status === 'conflict') {
            throw new Error('Next node run revision conflict')
          }
        } else if (nextNodeRun.status !== 'ready') {
          throw new Error(
            `Next node run cannot become ready from ${nextNodeRun.status}`
          )
        }
        if (nextNode.type === 'ai_generate' && nextNode.executor) {
          await this.dependencies.dispatches.enqueue({
            id: `${nodeRun.executionId}:${nodeRun.id}:${nextNode.id}`,
            executionId: nodeRun.executionId,
            requirementId: input.requirementId,
            nodeId: nextNode.id,
            nodeRunId: nextNodeRun.id,
            triggerNodeRunId: nodeRun.id,
            status: 'pending',
            attempts: 0,
            createdAt: timestamp,
            updatedAt: timestamp
          })
        }
      }
      await this.updateExecution({
        requirementId: input.requirementId,
        executionId: nodeRun.executionId,
        status: requirementCompleted ? 'completed' : 'running',
        currentNodeId: nextNode?.id,
        updatedAt: timestamp,
        completedAt: requirementCompleted ? timestamp : undefined
      })
      return {
        workflow,
        nodeRun: nodeRunResult.entity,
        requirementCompleted
      }
    })

    let knowledgeSyncFailed = false
    if (committed.requirementCompleted) {
      try {
        const result =
          await this.dependencies.knowledgeSync.execute(input.requirementId)
        knowledgeSyncFailed = result.failed > 0
      } catch {
        knowledgeSyncFailed = true
      }
    }
    return { ...committed, knowledgeSyncFailed }
  }

  private async changeExecutionStatus(
    input: {
      requirementId: string
      nodeRunId: string
      expectedNodeRunRevision: number
      expectedWorkflowRevision: number
    },
    allowedStatuses: NodeRunStatus[],
    status: NodeRunStatus
  ): Promise<void> {
    await this.dependencies.unitOfWork.execute(async () => {
      const nodeRun = await this.getNodeRun(input.nodeRunId)
      if (!allowedStatuses.includes(nodeRun.status)) {
        throw new Error(`Node run cannot transition from ${nodeRun.status}`)
      }
      if (status === 'paused') {
        await this.runtime.pauseNode({
          requirementId: input.requirementId,
          nodeId: nodeRun.nodeId,
          expectedRevision: input.expectedWorkflowRevision
        })
      } else {
        await this.runtime.resumeNode({
          requirementId: input.requirementId,
          nodeId: nodeRun.nodeId,
          expectedRevision: input.expectedWorkflowRevision
        })
      }
      const result = await this.dependencies.nodeRuns.save(
        { ...nodeRun, status, updatedAt: this.now() },
        input.expectedNodeRunRevision
      )
      if (result.status === 'conflict') {
        throw new Error('Node run revision conflict')
      }
      await this.updateExecution({
        requirementId: input.requirementId,
        executionId: nodeRun.executionId,
        status: status === 'paused' ? 'paused' : 'running',
        currentNodeId: nodeRun.nodeId,
        updatedAt: this.now()
      })
    })
  }

  private async transitionCurrentExecution(input: {
    requirementId: string
    nodeRunId: string
    allowedStatuses: NodeRunStatus[]
    status: 'running' | 'waiting_user' | 'failed' | 'cancelled'
    aiRunId?: string
    error?: string
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.dependencies.unitOfWork.execute(async () => {
      const [nodeRun, workflow] = await Promise.all([
        this.getNodeRun(input.nodeRunId),
        this.dependencies.workflows.get(input.requirementId)
      ])
      if (!workflow) {
        throw new Error(
          `Requirement workflow not found: ${input.requirementId}`
        )
      }
      if (!input.allowedStatuses.includes(nodeRun.status)) {
        throw new Error(`Node run cannot transition from ${nodeRun.status}`)
      }

      const nextWorkflow =
        input.status === 'running'
          ? await this.runtime.startNode({
              requirementId: input.requirementId,
              nodeId: nodeRun.nodeId,
              expectedRevision: workflow.revision
            })
          : input.status === 'waiting_user'
            ? await this.runtime.waitForUser({
                requirementId: input.requirementId,
                nodeId: nodeRun.nodeId,
                expectedRevision: workflow.revision
              })
            : await this.runtime.finishNode({
                requirementId: input.requirementId,
                nodeId: nodeRun.nodeId,
                expectedRevision: workflow.revision,
                status: input.status as 'failed' | 'cancelled'
              })
      const timestamp = this.now()
      const result = await this.dependencies.nodeRuns.save(
        {
          ...nodeRun,
          ...(input.aiRunId ? { aiRunId: input.aiRunId } : {}),
          status: input.status,
          ...(input.error ? { error: input.error } : { error: undefined }),
          updatedAt: timestamp,
          ...(['failed', 'cancelled'].includes(input.status)
            ? { completedAt: timestamp }
            : {})
        },
        nodeRun.revision
      )
      if (result.status === 'conflict') {
        throw new Error('Node run revision conflict')
      }
      await this.updateExecution({
        requirementId: input.requirementId,
        executionId: nodeRun.executionId,
        status: input.status,
        currentNodeId: nodeRun.nodeId,
        updatedAt: timestamp,
        completedAt: ['failed', 'cancelled'].includes(input.status)
          ? timestamp
          : undefined
      })
      if (input.status === 'running') {
        const requirement = await this.dependencies.requirements.get(
          input.requirementId
        )
        if (!requirement) {
          throw new Error(`Requirement not found: ${input.requirementId}`)
        }
        if (requirement.status === 'pending') {
          const requirementResult = await this.dependencies.requirements.save(
            { ...requirement, status: 'active', updatedAt: timestamp },
            requirement.revision
          )
          if (requirementResult.status === 'conflict') {
            throw new Error('Requirement revision conflict')
          }
        }
      }
      return { workflow: nextWorkflow, nodeRun: result.entity }
    })
  }

  private async updateExecution(input: {
    requirementId: string
    executionId: string
    status: WorkflowExecutionRecord['status']
    currentNodeId?: string
    updatedAt: number
    completedAt?: number
  }): Promise<void> {
    const execution =
      await this.dependencies.executions.getActiveByRequirement(
        input.requirementId
      )
    if (!execution || execution.id !== input.executionId) {
      throw new Error('Active workflow execution does not match node run')
    }
    const result = await this.dependencies.executions.save(
      {
        ...execution,
        status: input.status,
        currentNodeId: input.currentNodeId,
        updatedAt: input.updatedAt,
        completedAt: input.completedAt
      },
      execution.revision
    )
    if (result.status === 'conflict') {
      throw new Error('Workflow execution revision conflict')
    }
  }

  private async getNodeRun(id: string): Promise<Revisioned<NodeRunRecord>> {
    const nodeRun = await this.dependencies.nodeRuns.get(id)
    if (!nodeRun) throw new Error(`Node run not found: ${id}`)
    return nodeRun
  }

  private async completeRequirement(
    requirementId: string,
    expectedRevision: number,
    updatedAt: number
  ): Promise<Revisioned<RequirementRecord>> {
    const requirement = await this.dependencies.requirements.get(requirementId)
    if (!requirement) throw new Error(`Requirement not found: ${requirementId}`)
    const result = await this.dependencies.requirements.save(
      { ...requirement, status: 'completed', updatedAt },
      expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Requirement revision conflict')
    }
    return result.entity
  }
}
