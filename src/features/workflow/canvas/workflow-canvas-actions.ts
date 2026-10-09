import type { WorkflowTemplateDraftDto } from '../../../../shared/business'
import type { WorkflowNodePosition } from '../../../../domain/workflow'
import {
  WORKFLOW_CANVAS_NODE_HEIGHT,
  WORKFLOW_CANVAS_NODE_WIDTH
} from './workflow-canvas-model'

const NODE_PLACEMENT_GAP = 64
const COPY_OFFSET = 32
const CANVAS_COORDINATE_LIMIT = 1_000_000

export type CanvasHistoryCommand = {
  undo: () => Promise<void>
  redo: () => Promise<void>
}

export function createSerializedMutationQueue<T>(initialValue: T): {
  run: (operation: (current: T) => Promise<T>) => Promise<T>
  replace: (value: T) => void
  current: () => T
} {
  let value = initialValue
  let tail = Promise.resolve()

  return {
    run(operation) {
      const result = tail.then(async () => {
        const next = await operation(value)
        value = next
        return next
      })
      tail = result.then(
        () => undefined,
        () => undefined
      )
      return result
    },
    replace(next) {
      value = next
    },
    current() {
      return value
    }
  }
}

export function newNodePosition(
  selected?: WorkflowNodePosition,
  viewportCenter: WorkflowNodePosition = { x: 0, y: 0 }
): WorkflowNodePosition {
  return selected
    ? clampPosition({
        x: selected.x + WORKFLOW_CANVAS_NODE_WIDTH + NODE_PLACEMENT_GAP,
        y: selected.y
      })
    : clampPosition({
        x: viewportCenter.x - WORKFLOW_CANVAS_NODE_WIDTH / 2,
        y: viewportCenter.y - WORKFLOW_CANVAS_NODE_HEIGHT / 2
      })
}

export function copiedNodePosition(
  source: WorkflowNodePosition
): WorkflowNodePosition {
  return clampPosition({
    x: source.x + COPY_OFFSET,
    y: source.y + COPY_OFFSET
  })
}

export function createUniqueStableKey(
  existingKeys: string[],
  base = 'node'
): string {
  const keys = new Set(existingKeys)
  if (!keys.has(base)) return base
  let suffix = 2
  while (keys.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function deletionImpact(
  template: WorkflowTemplateDraftDto,
  nodeId: string
): { incoming: number; outgoing: number } {
  let incoming = 0
  let outgoing = 0
  for (const edge of template.currentVersion.edges) {
    if (edge.targetNodeId === nodeId) incoming += 1
    if (edge.sourceNodeId === nodeId) outgoing += 1
  }
  return { incoming, outgoing }
}

export function createSessionHistory(): {
  record: (command: CanvasHistoryCommand) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  clearRedo: () => void
  clear: () => void
  snapshot: () => { canUndo: boolean; canRedo: boolean }
} {
  const undoStack: CanvasHistoryCommand[] = []
  const redoStack: CanvasHistoryCommand[] = []

  return {
    record(command) {
      undoStack.push(command)
      redoStack.length = 0
    },
    async undo() {
      const command = undoStack.pop()
      if (!command) return
      try {
        await command.undo()
        redoStack.push(command)
      } catch (error) {
        undoStack.push(command)
        throw error
      }
    },
    async redo() {
      const command = redoStack.pop()
      if (!command) return
      try {
        await command.redo()
        undoStack.push(command)
      } catch (error) {
        redoStack.push(command)
        throw error
      }
    },
    clearRedo() {
      redoStack.length = 0
    },
    clear() {
      undoStack.length = 0
      redoStack.length = 0
    },
    snapshot() {
      return {
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0
      }
    }
  }
}

export function invalidateSessionRedo(
  history: ReturnType<typeof createSessionHistory>,
  notify: () => void
): void {
  history.clearRedo()
  notify()
}

function clampPosition(position: WorkflowNodePosition): WorkflowNodePosition {
  return {
    x: Math.max(
      -CANVAS_COORDINATE_LIMIT,
      Math.min(CANVAS_COORDINATE_LIMIT, Math.round(position.x))
    ),
    y: Math.max(
      -CANVAS_COORDINATE_LIMIT,
      Math.min(CANVAS_COORDINATE_LIMIT, Math.round(position.y))
    )
  }
}
