import { render, screen } from '@testing-library/react'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { LocalizationProvider } from '../../../localization/LocalizationProvider'
import type { WorkflowCanvasNode } from './workflow-canvas-model'
import { WorkflowCanvasNodeView } from './WorkflowCanvasNode'

describe('WorkflowCanvasNodeView', () => {
  it('renders an accessible typed node with connection handles', () => {
    const props = {
      id: 'analysis',
      type: 'workflowNode',
      selected: true,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: true,
      isConnectable: true,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      zIndex: 0,
      data: {
        node: {
          id: 'analysis',
          stableKey: 'analysis',
          type: 'ai_generate',
          name: '需求分析',
          description: '明确需求范围',
          order: 0,
          allowSkip: false,
          configuration: {
            input: {
              includeRequirementBody: true,
              predecessorArtifacts: 'direct',
              includeSpaceKnowledge: false,
              attachments: []
            },
            prompt: '分析需求',
            model: { strategy: 'inherit' },
            connectorIds: [],
            permissions: [],
            artifact: {
              required: true,
              relativePath: 'analysis.md',
              kind: 'markdown'
            },
            todos: [],
            completionGate: { requireApproval: false },
            retry: { maxAttempts: 1, backoffMs: 0 },
            skip: { allowed: false, requireReason: false }
          }
        }
      }
    } as NodeProps<WorkflowCanvasNode>

    render(
      <LocalizationProvider>
        <ReactFlowProvider>
          <WorkflowCanvasNodeView {...props} />
        </ReactFlowProvider>
      </LocalizationProvider>
    )

    expect(
      screen.getByRole('button', { name: '需求分析，AI 生成' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('配置完整')).toBeVisible()
    expect(screen.getByTestId('workflow-node-input')).toBeInTheDocument()
    expect(screen.getByTestId('workflow-node-output')).toBeInTheDocument()
  })

  it('hides editing handles for a read-only version', () => {
    const props = {
      id: 'analysis',
      type: 'workflowNode',
      selected: false,
      dragging: false,
      draggable: false,
      selectable: true,
      deletable: false,
      isConnectable: false,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      zIndex: 0,
      data: {
        readOnly: true,
        node: {
          id: 'analysis',
          stableKey: 'analysis',
          type: 'ai_generate',
          name: '需求分析',
          description: '',
          order: 0,
          allowSkip: false
        }
      }
    } as NodeProps<WorkflowCanvasNode>

    render(
      <LocalizationProvider>
        <ReactFlowProvider>
          <WorkflowCanvasNodeView {...props} />
        </ReactFlowProvider>
      </LocalizationProvider>
    )

    expect(screen.queryByTestId('workflow-node-input')).toBeNull()
    expect(screen.queryByTestId('workflow-node-output')).toBeNull()
  })

  it('shows a publication issue with an icon and text', () => {
    const props = {
      id: 'analysis',
      type: 'workflowNode',
      selected: false,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: true,
      isConnectable: true,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      zIndex: 0,
      data: {
        issues: ['Initial prompt is required'],
        node: {
          id: 'analysis',
          stableKey: 'analysis',
          type: 'ai_generate',
          name: '需求分析',
          description: '',
          order: 0,
          allowSkip: false
        }
      }
    } as NodeProps<WorkflowCanvasNode>

    render(
      <LocalizationProvider>
        <ReactFlowProvider>
          <WorkflowCanvasNodeView {...props} />
        </ReactFlowProvider>
      </LocalizationProvider>
    )

    expect(screen.getByText('发布问题')).toBeVisible()
    expect(
      screen.getByRole('button', { name: '需求分析，AI 生成，发布问题' })
    ).toHaveAttribute('data-issue', 'true')
  })
})
