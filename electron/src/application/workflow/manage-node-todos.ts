import { transitionNodeTodoStatus } from '../../../../domain/node-todo'
import type { NodeTodoStatus } from '../../../../domain/node-todo'
import type { WorkflowNodeConfiguration } from '../../../../domain/workflow'
import type {
  NodeRunRepository,
  NodeTodoRecord,
  NodeTodoRepository,
  Revisioned,
  UnitOfWork
} from '../ports/business-repositories'

type Dependencies = {
  nodeRuns: Pick<NodeRunRepository, 'get'>
  todos: NodeTodoRepository
  unitOfWork: UnitOfWork
}

export type SaveNodeTodoInput = {
  id: string
  nodeRunId: string
  title: string
  required: boolean
  status: NodeTodoStatus
  expectedRevision: number
  reason?: string
}

export type DeleteNodeTodoInput = {
  id: string
  nodeRunId: string
  expectedRevision: number
}

export async function initializeConfiguredNodeTodos(
  todos: Pick<NodeTodoRepository, 'save'>,
  input: {
    nodeRunId: string
    configuredTodos?: WorkflowNodeConfiguration['todos']
    timestamp: number
  }
): Promise<Array<Revisioned<NodeTodoRecord>>> {
  const created: Array<Revisioned<NodeTodoRecord>> = []
  for (const [index, configuredTodo] of (
    input.configuredTodos ?? []
  ).entries()) {
    const result = await todos.save(
      {
        id: `${input.nodeRunId}:todo:${index + 1}`,
        nodeRunId: input.nodeRunId,
        title: configuredTodo.title.trim(),
        required: true,
        status: 'pending',
        createdAt: input.timestamp,
        updatedAt: input.timestamp
      },
      0
    )
    if (result.status === 'conflict') {
      throw new Error(`Configured node todo already exists: ${result.entity.id}`)
    }
    created.push(result.entity)
  }
  return created
}

export class ManageNodeTodosUseCase {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now
  ) {}

  async save(input: SaveNodeTodoInput): Promise<Revisioned<NodeTodoRecord>> {
    const title = input.title.trim()
    if (!title) throw new Error('Node todo title is required')
    if (title.length > 500) {
      throw new Error('Node todo title must be at most 500 characters')
    }
    if (!input.required) throw new Error('Node todo must be required')

    const nodeRun = await this.dependencies.nodeRuns.get(input.nodeRunId)
    if (!nodeRun) throw new Error(`Node run not found: ${input.nodeRunId}`)

    const existing = await this.dependencies.todos.get(input.id)
    if (!existing) {
      if (nodeRun.status === 'completed' || nodeRun.status === 'skipped') {
        throw new Error(`Node run cannot manage todos from ${nodeRun.status}`)
      }
      if (input.expectedRevision !== 0) {
        throw new Error(`Node todo not found: ${input.id}`)
      }
      if (input.status !== 'pending') {
        throw new Error('New node todo must start as pending')
      }
      const timestamp = this.now()
      const result = await this.dependencies.unitOfWork.execute(() =>
        this.dependencies.todos.save(
          {
            id: input.id,
            nodeRunId: input.nodeRunId,
            title,
            required: input.required,
            status: 'pending',
            createdAt: timestamp,
            updatedAt: timestamp
          },
          0
        )
      )
      if (result.status === 'conflict') {
        throw new Error('Node todo revision conflict')
      }
      return result.entity
    }

    if (
      existing.nodeRunId !== input.nodeRunId ||
      existing.title !== title ||
      existing.required !== input.required
    ) {
      if (input.expectedRevision === 0) {
        throw new Error('Node todo id already exists with different data')
      }
      throw new Error('Node todo immutable data cannot be changed')
    }
    if (input.expectedRevision === 0) return existing
    if (nodeRun.status === 'completed' || nodeRun.status === 'skipped') {
      throw new Error(`Node run cannot manage todos from ${nodeRun.status}`)
    }

    const transition = transitionNodeTodoStatus(existing.status, input.status)
    if (!transition.changed) return existing
    const result = await this.dependencies.unitOfWork.execute(() =>
      this.dependencies.todos.transition({
        todoId: existing.id,
        expectedRevision: input.expectedRevision,
        status: transition.status,
        reason: input.reason?.trim() || 'todo_status_changed',
        triggerSource: 'user',
        transitionedAt: this.now()
      })
    )
    if (result.status === 'conflict') {
      throw new Error('Node todo revision conflict')
    }
    return result.entity
  }

  async delete(input: DeleteNodeTodoInput): Promise<boolean> {
    const nodeRun = await this.dependencies.nodeRuns.get(input.nodeRunId)
    if (!nodeRun) throw new Error(`Node run not found: ${input.nodeRunId}`)
    if (nodeRun.status === 'completed' || nodeRun.status === 'skipped') {
      throw new Error(`Node run cannot manage todos from ${nodeRun.status}`)
    }

    const existing = await this.dependencies.todos.get(input.id)
    if (!existing) throw new Error(`Node todo not found: ${input.id}`)
    if (existing.nodeRunId !== input.nodeRunId) {
      throw new Error('Node todo ownership mismatch')
    }

    const deleted = await this.dependencies.unitOfWork.execute(() =>
      this.dependencies.todos.delete(input.id, input.expectedRevision)
    )
    if (!deleted) throw new Error('Node todo revision conflict')
    return true
  }
}
