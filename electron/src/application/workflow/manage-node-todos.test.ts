import { describe, expect, it, vi } from 'vitest'
import type {
  NodeRunRecord,
  NodeTodoRecord,
  NodeTodoRepository,
  Revisioned,
  UnitOfWork
} from '../ports/business-repositories'
import { ManageNodeTodosUseCase } from './manage-node-todos'

type TodoState = {
  nodeRun: Revisioned<NodeRunRecord>
  todos: Array<Revisioned<NodeTodoRecord>>
}

function createHarness(
  options: { deleteConflict?: boolean; transitionConflict?: boolean } = {}
) {
  const state: TodoState = {
    nodeRun: {
      id: 'node-run-1',
      executionId: 'execution-1',
      nodeId: 'node-1',
      status: 'running',
      attempt: 1,
      revision: 2,
      createdAt: 1,
      updatedAt: 1
    },
    todos: []
  }
  const save = vi.fn(
    async (entity: NodeTodoRecord, expectedRevision: number) => {
      const current = state.todos.find((todo) => todo.id === entity.id)
      if (current && current.revision !== expectedRevision) {
        return { status: 'conflict' as const, entity: current }
      }
      const saved = { ...entity, revision: expectedRevision + 1 }
      state.todos.push(saved)
      return { status: 'saved' as const, entity: saved }
    }
  )
  const transition = vi.fn(
    async (input: {
      todoId: string
      expectedRevision: number
      status: NodeTodoRecord['status']
      reason: string
      triggerSource: 'user' | 'system' | 'recovery'
      transitionedAt: number
    }) => {
      const index = state.todos.findIndex((todo) => todo.id === input.todoId)
      const current = state.todos[index]
      if (!current) throw new Error(`Node todo not found: ${input.todoId}`)
      if (options.transitionConflict) {
        return { status: 'conflict' as const, entity: current }
      }
      const saved = {
        ...current,
        status: input.status,
        updatedAt: input.transitionedAt,
        completedAt:
          input.status === 'completed' ? input.transitionedAt : undefined,
        revision: current.revision + 1
      }
      state.todos[index] = saved
      return { status: 'saved' as const, entity: saved }
    }
  )
  const deleteTodo = vi.fn(
    async (id: string, expectedRevision: number): Promise<boolean> => {
      const index = state.todos.findIndex((todo) => todo.id === id)
      const current = state.todos[index]
      if (
        !current ||
        current.revision !== expectedRevision ||
        options.deleteConflict
      ) {
        return false
      }
      state.todos.splice(index, 1)
      return true
    }
  )
  const execute = vi.fn(async (operation: () => unknown) => operation())
  const unitOfWork: UnitOfWork = {
    execute: execute as UnitOfWork['execute']
  }
  const todos = {
    get: vi.fn(async (id: string) =>
      state.todos.find((todo) => todo.id === id)
    ),
    listByNodeRun: vi.fn(async (nodeRunId: string) =>
      state.todos.filter((todo) => todo.nodeRunId === nodeRunId)
    ),
    save,
    transition,
    delete: deleteTodo,
    listTransitions: vi.fn(async () => [])
  } as unknown as NodeTodoRepository
  const useCase = new ManageNodeTodosUseCase(
    {
      nodeRuns: {
        get: vi.fn(async (id: string) =>
          id === state.nodeRun.id ? state.nodeRun : undefined
        )
      },
      todos,
      unitOfWork
    },
    () => 100
  )
  return { deleteTodo, execute, save, state, transition, useCase }
}

const createInput = {
  id: 'todo-1',
  nodeRunId: 'node-run-1',
  title: '  Confirm acceptance criteria  ',
  required: true,
  status: 'pending' as const,
  expectedRevision: 0
}

describe('ManageNodeTodosUseCase', () => {
  it('creates a trimmed pending todo in a unit of work', async () => {
    const { execute, state, useCase } = createHarness()

    await expect(useCase.save(createInput)).resolves.toMatchObject({
      title: 'Confirm acceptance criteria',
      status: 'pending',
      revision: 1,
      createdAt: 100,
      updatedAt: 100
    })
    expect(state.todos).toHaveLength(1)
    expect(execute).toHaveBeenCalledOnce()
  })

  it('rejects creating an optional todo', async () => {
    const { state, useCase } = createHarness()

    await expect(
      useCase.save({ ...createInput, required: false })
    ).rejects.toThrow('Node todo must be required')
    expect(state.todos).toEqual([])
  })

  it('returns the existing todo for an identical create replay', async () => {
    const { save, state, useCase } = createHarness()
    const created = await useCase.save(createInput)
    state.nodeRun.status = 'completed'

    await expect(useCase.save(createInput)).resolves.toEqual(created)
    expect(save).toHaveBeenCalledOnce()
  })

  it('rejects a duplicate id with different immutable data', async () => {
    const { useCase } = createHarness()
    await useCase.save(createInput)

    await expect(
      useCase.save({ ...createInput, title: 'Different title' })
    ).rejects.toThrow('Node todo id already exists with different data')
  })

  it('rejects creation for a terminal node run', async () => {
    const { state, useCase } = createHarness()
    state.nodeRun.status = 'completed'

    await expect(useCase.save(createInput)).rejects.toThrow(
      'Node run cannot manage todos from completed'
    )
    expect(state.todos).toEqual([])
  })

  it('transitions an existing todo and records user metadata', async () => {
    const { transition, useCase } = createHarness()
    const created = await useCase.save(createInput)

    await expect(
      useCase.save({
        ...createInput,
        title: created.title,
        status: 'blocked',
        expectedRevision: created.revision
      })
    ).resolves.toMatchObject({ status: 'blocked', revision: 2 })
    expect(transition).toHaveBeenCalledWith({
      todoId: 'todo-1',
      expectedRevision: 1,
      status: 'blocked',
      reason: 'todo_status_changed',
      triggerSource: 'user',
      transitionedAt: 100
    })
  })

  it('records completion time when a todo is completed', async () => {
    const { useCase } = createHarness()
    const created = await useCase.save(createInput)

    await expect(
      useCase.save({
        ...createInput,
        title: created.title,
        status: 'completed',
        expectedRevision: created.revision
      })
    ).resolves.toMatchObject({
      status: 'completed',
      completedAt: 100,
      revision: 2
    })
  })

  it('rejects changes to todo ownership or metadata', async () => {
    const { useCase } = createHarness()
    const created = await useCase.save(createInput)

    await expect(
      useCase.save({
        ...createInput,
        title: 'Changed title',
        status: 'completed',
        expectedRevision: created.revision
      })
    ).rejects.toThrow('Node todo immutable data cannot be changed')
  })

  it('rejects illegal status transitions before persistence', async () => {
    const { transition, useCase } = createHarness()
    const created = await useCase.save(createInput)
    const completed = await useCase.save({
      ...createInput,
      title: created.title,
      status: 'completed',
      expectedRevision: created.revision
    })

    await expect(
      useCase.save({
        ...createInput,
        title: created.title,
        status: 'in_progress',
        expectedRevision: completed.revision
      })
    ).rejects.toThrow(
      'Node todo cannot transition from completed to in_progress'
    )
    expect(transition).toHaveBeenCalledTimes(1)
  })

  it('reports revision conflicts without replacing current state', async () => {
    const { state, useCase } = createHarness({ transitionConflict: true })
    const created = await useCase.save(createInput)

    await expect(
      useCase.save({
        ...createInput,
        title: created.title,
        status: 'completed',
        expectedRevision: created.revision
      })
    ).rejects.toThrow('Node todo revision conflict')
    expect(state.todos[0]).toMatchObject({ status: 'pending', revision: 1 })
  })

  it('deletes a revisioned todo in a unit of work', async () => {
    const { deleteTodo, execute, state, useCase } = createHarness()
    const created = await useCase.save(createInput)

    await expect(
      useCase.delete({
        id: created.id,
        nodeRunId: created.nodeRunId,
        expectedRevision: created.revision
      })
    ).resolves.toBe(true)

    expect(deleteTodo).toHaveBeenCalledWith(created.id, created.revision)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(state.todos).toEqual([])
  })

  it('rejects deleting a todo from a terminal node run', async () => {
    const { deleteTodo, state, useCase } = createHarness()
    const created = await useCase.save(createInput)
    state.nodeRun.status = 'completed'

    await expect(
      useCase.delete({
        id: created.id,
        nodeRunId: created.nodeRunId,
        expectedRevision: created.revision
      })
    ).rejects.toThrow('Node run cannot manage todos from completed')
    expect(deleteTodo).not.toHaveBeenCalled()
  })

  it('rejects deleting a todo with a stale revision', async () => {
    const { state, useCase } = createHarness({ deleteConflict: true })
    const created = await useCase.save(createInput)

    await expect(
      useCase.delete({
        id: created.id,
        nodeRunId: created.nodeRunId,
        expectedRevision: created.revision
      })
    ).rejects.toThrow('Node todo revision conflict')
    expect(state.todos).toHaveLength(1)
  })
})
