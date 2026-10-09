import { describe, expect, it, vi } from 'vitest'
import type { WorkflowTemplateDraftDto } from '../../../../shared/business'
import {
  createSessionHistory,
  createSerializedMutationQueue,
  createUniqueStableKey,
  deletionImpact,
  newNodePosition
} from './workflow-canvas-actions'

describe('workflow canvas actions', () => {
  it('places a new node to the right of the selected node', () => {
    expect(newNodePosition({ x: 40, y: 80 })).toEqual({ x: 344, y: 80 })
  })

  it('places a new node at the viewport center when nothing is selected', () => {
    expect(newNodePosition(undefined, { x: 600, y: 400 })).toEqual({
      x: 480,
      y: 348
    })
  })

  it('generates a stable key that does not conflict', () => {
    expect(createUniqueStableKey(['node', 'node-2', 'review'])).toBe('node-3')
  })

  it('counts incoming and outgoing edges deleted with a node', () => {
    expect(deletionImpact(template(), 'review')).toEqual({
      incoming: 1,
      outgoing: 1
    })
  })

  it('runs undo and redo commands in session order', async () => {
    const undo = vi.fn()
    const redo = vi.fn()
    const history = createSessionHistory()
    history.record({ undo, redo })

    await history.undo()
    await history.redo()

    expect(undo).toHaveBeenCalledTimes(1)
    expect(redo).toHaveBeenCalledTimes(1)
    expect(history.snapshot()).toEqual({ canUndo: true, canRedo: false })
  })

  it('clears redo entries after a new command and can reset on conflict', async () => {
    const history = createSessionHistory()
    history.record({ undo: vi.fn(), redo: vi.fn() })
    await history.undo()
    history.record({ undo: vi.fn(), redo: vi.fn() })
    expect(history.snapshot()).toEqual({ canUndo: true, canRedo: false })

    history.clear()
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false })
  })

  it('invalidates redo without dropping earlier undo commands', async () => {
    const history = createSessionHistory()
    history.record({ undo: vi.fn(), redo: vi.fn() })
    history.record({ undo: vi.fn(), redo: vi.fn() })
    await history.undo()

    history.clearRedo()

    expect(history.snapshot()).toEqual({ canUndo: true, canRedo: false })
  })

  it('serializes mutations and passes the latest successful value forward', async () => {
    let releaseFirst: ((value: number) => void) | undefined
    const first = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          releaseFirst = resolve
        })
    )
    const second = vi.fn(async (current: number) => current + 1)
    const queue = createSerializedMutationQueue(1)

    const firstResult = queue.run(first)
    const secondResult = queue.run(second)
    await Promise.resolve()
    expect(second).not.toHaveBeenCalled()

    releaseFirst?.(2)
    await expect(firstResult).resolves.toBe(2)
    await expect(secondResult).resolves.toBe(3)
    expect(second).toHaveBeenCalledWith(2)
  })

  it('keeps the last successful value when a mutation fails', async () => {
    const queue = createSerializedMutationQueue(1)
    await expect(
      queue.run(async () => {
        throw new Error('revision conflict')
      })
    ).rejects.toThrow('revision conflict')

    await expect(queue.run(async (current) => current + 1)).resolves.toBe(2)
  })
})

function template(): WorkflowTemplateDraftDto {
  return {
    id: 'template-1',
    name: 'Delivery',
    description: '',
    status: 'draft',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    currentVersion: {
      id: 'template-1-v1',
      version: 1,
      status: 'draft',
      checksum: 'checksum',
      nodeCount: 3,
      edgeCount: 2,
      nodes: [node('analysis', 0), node('review', 1), node('release', 2)],
      edges: [
        {
          id: 'analysis-review',
          sourceNodeId: 'analysis',
          targetNodeId: 'review'
        },
        {
          id: 'review-release',
          sourceNodeId: 'review',
          targetNodeId: 'release'
        }
      ]
    }
  }
}

function node(id: string, order: number) {
  return {
    id,
    stableKey: id,
    type: 'ai_generate' as const,
    name: id,
    description: '',
    order,
    allowSkip: false
  }
}
