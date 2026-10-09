import { describe, expect, it } from 'vitest'
import {
  clampWorkflowQuickMenuPosition,
  connectedWorkflowNodeIds,
  isWorkflowCanvasConnectionValid
} from './workflow-canvas-graph'

const edges = [
  { id: 'a-b', source: 'a', target: 'b' },
  { id: 'b-c', source: 'b', target: 'c' },
  { id: 'd-b', source: 'd', target: 'b' }
]

describe('connectedWorkflowNodeIds', () => {
  it('returns all transitive upstream nodes with the selected node', () => {
    expect(connectedWorkflowNodeIds('c', edges, 'upstream')).toEqual([
      'a',
      'b',
      'c',
      'd'
    ])
  })

  it('returns all transitive downstream nodes with the selected node', () => {
    expect(connectedWorkflowNodeIds('a', edges, 'downstream')).toEqual([
      'a',
      'b',
      'c'
    ])
  })
})

describe('isWorkflowCanvasConnectionValid', () => {
  it('rejects self loops and duplicate directed edges', () => {
    expect(
      isWorkflowCanvasConnectionValid(
        { source: 'a', target: 'a', sourceHandle: null, targetHandle: null },
        edges
      )
    ).toBe(false)
    expect(
      isWorkflowCanvasConnectionValid(
        { source: 'a', target: 'b', sourceHandle: null, targetHandle: null },
        edges
      )
    ).toBe(false)
  })

  it('accepts a new directed edge with both endpoints', () => {
    expect(
      isWorkflowCanvasConnectionValid(
        { source: 'a', target: 'd', sourceHandle: null, targetHandle: null },
        edges
      )
    ).toBe(true)
  })
})

describe('clampWorkflowQuickMenuPosition', () => {
  it('keeps the menu out of the narrow-window inspector drawer', () => {
    expect(
      clampWorkflowQuickMenuPosition(
        { x: 243, y: 235 },
        { width: 654, height: 686 },
        360
      )
    ).toEqual({ x: 102, y: 235 })
  })

  it('preserves a position that already fits the visible canvas', () => {
    expect(
      clampWorkflowQuickMenuPosition(
        { x: 300, y: 200 },
        { width: 814, height: 826 },
        0
      )
    ).toEqual({ x: 300, y: 200 })
  })
})
