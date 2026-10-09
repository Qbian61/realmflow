import type { Connection, Edge } from '@xyflow/react'

const QUICK_MENU_WIDTH = 192
const QUICK_MENU_HEIGHT = 170

export function clampWorkflowQuickMenuPosition(
  position: { x: number; y: number },
  surface: { width: number; height: number },
  obscuredRight: number
): { x: number; y: number } {
  return {
    x: Math.max(
      0,
      Math.min(position.x, surface.width - obscuredRight - QUICK_MENU_WIDTH)
    ),
    y: Math.max(0, Math.min(position.y, surface.height - QUICK_MENU_HEIGHT))
  }
}

export function isWorkflowCanvasConnectionValid(
  connection: Connection | Edge,
  edges: Edge[]
): boolean {
  if (
    !connection.source ||
    !connection.target ||
    connection.source === connection.target
  ) {
    return false
  }
  return !edges.some(
    (edge) =>
      edge.source === connection.source && edge.target === connection.target
  )
}

export function connectedWorkflowNodeIds(
  nodeId: string,
  edges: Edge[],
  direction: 'upstream' | 'downstream'
): string[] {
  const connected = new Map<string, string[]>()
  for (const edge of edges) {
    const from = direction === 'upstream' ? edge.target : edge.source
    const to = direction === 'upstream' ? edge.source : edge.target
    connected.set(from, [...(connected.get(from) ?? []), to])
  }

  const visited = new Set([nodeId])
  const pending = [nodeId]
  while (pending.length > 0) {
    const current = pending.shift()!
    for (const next of connected.get(current) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      pending.push(next)
    }
  }
  return [...visited].sort()
}
