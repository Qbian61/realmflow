import {
  Bot,
  CircleUserRound,
  ShieldCheck,
  TriangleAlert,
  Wrench
} from 'lucide-react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { useLocalization } from '../../../localization/LocalizationProvider'
import type { WorkflowCanvasNode } from './workflow-canvas-model'

const TYPE_ICONS = {
  ai_generate: Bot,
  human_input: CircleUserRound,
  tool: Wrench,
  approval: ShieldCheck
} as const

function WorkflowCanvasNodeComponent({
  data,
  selected,
  isConnectable
}: NodeProps<WorkflowCanvasNode>): JSX.Element {
  const { t } = useLocalization()
  const node = data.node
  const typeLabel = t(`workflowEditor.type.${node.type}`)
  const Icon = TYPE_ICONS[node.type]
  const hasIssue = Boolean(data.issues?.length)
  const configured =
    node.configuration !== undefined &&
    (node.type !== 'ai_generate' || node.configuration.prompt.trim().length > 0)

  return (
    <>
      {!data.readOnly ? (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          data-testid="workflow-node-input"
        />
      ) : null}
      <div
        className="workflow-canvas-node"
        data-node-type={node.type}
        data-selected={selected}
        data-issue={hasIssue}
        role="button"
        tabIndex={0}
        aria-label={`${node.name}，${typeLabel}${
          hasIssue ? `，${t('workflowCanvas.publicationIssue')}` : ''
        }`}
        aria-pressed={selected}
      >
        <div className="workflow-canvas-node-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={1.8} />
        </div>
        <div className="workflow-canvas-node-copy">
          <strong title={node.name}>{node.name}</strong>
          <span>{typeLabel}</span>
        </div>
        <span className="workflow-canvas-node-status" data-complete={configured}>
          {hasIssue ? (
            <>
              <TriangleAlert size={12} aria-hidden="true" />
              {t('workflowCanvas.publicationIssue')}
            </>
          ) : (
            t(
              configured
                ? 'workflowCanvas.nodeConfigured'
                : 'workflowCanvas.nodeIncomplete'
            )
          )}
        </span>
      </div>
      {!data.readOnly ? (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          data-testid="workflow-node-output"
        />
      ) : null}
    </>
  )
}

export const WorkflowCanvasNodeView = memo(WorkflowCanvasNodeComponent)
