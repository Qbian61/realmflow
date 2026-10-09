import {
  Copy,
  Focus,
  GitFork,
  Trash2
} from 'lucide-react'
import { useReactFlow, type Edge } from '@xyflow/react'
import { Menu, MenuContent, MenuItem } from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'
import { connectedWorkflowNodeIds } from './workflow-canvas-graph'

type Props = {
  nodeId: string
  position: { x: number; y: number }
  readOnly: boolean
  edges: Edge[]
  onCopy: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  onClose: () => void
}

export function WorkflowNodeQuickMenu({
  nodeId,
  position,
  readOnly,
  edges,
  onCopy,
  onDelete,
  onClose
}: Props): JSX.Element {
  const { fitView } = useReactFlow()
  const { t } = useLocalization()

  function focus(nodeIds: string[], padding: number): void {
    void fitView({
      nodes: nodeIds.map((id) => ({ id })),
      padding,
      duration: 220
    })
  }

  return (
    <Menu
      open
      onOpenChange={onClose}
    >
      <MenuContent
        className="workflow-node-quick-menu"
        style={{ left: position.x, top: position.y }}
      >
        <MenuItem onSelect={() => focus([nodeId], 0.35)}>
          <Focus size={16} />
          {t('workflowCanvas.focusNode')}
        </MenuItem>
        <MenuItem
          onSelect={() =>
            focus(connectedWorkflowNodeIds(nodeId, edges, 'upstream'), 0.25)
          }
        >
          <GitFork size={16} />
          {t('workflowCanvas.showUpstream')}
        </MenuItem>
        <MenuItem
          onSelect={() =>
            focus(connectedWorkflowNodeIds(nodeId, edges, 'downstream'), 0.25)
          }
        >
          <GitFork size={16} />
          {t('workflowCanvas.showDownstream')}
        </MenuItem>
        {!readOnly ? (
          <>
            <MenuItem onSelect={() => onCopy(nodeId)}>
              <Copy size={16} />
              {t('workflowCanvas.copyNode')}
            </MenuItem>
            <MenuItem
              variant="danger"
              onSelect={() => onDelete(nodeId)}
            >
              <Trash2 size={16} />
              {t('workflowCanvas.deleteNode')}
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  )
}
