import {
  ArrowRight,
  Bot,
  CircleUserRound,
  Copy,
  LayoutDashboard,
  Link2,
  Maximize2,
  Plus,
  Redo2,
  ShieldCheck,
  Trash2,
  Undo2,
  Wrench,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useState } from 'react'
import type { WorkflowNodeType } from '../../../../domain/workflow'
import {
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  Toolbar
} from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'

const NODE_TYPE_ICONS = {
  ai_generate: Bot,
  human_input: CircleUserRound,
  tool: Wrench,
  approval: ShieldCheck
} as const

export function WorkflowCanvasToolbar({
  readOnly,
  hasSelection,
  canUndo,
  canRedo,
  onAdd,
  onCopy,
  onDelete,
  connectionTargets,
  onConnect,
  onAutoLayout,
  onUndo,
  onRedo
}: {
  readOnly: boolean
  hasSelection: boolean
  canUndo: boolean
  canRedo: boolean
  onAdd: (
    type: WorkflowNodeType,
    viewportCenter: { x: number; y: number }
  ) => void
  onCopy: () => void
  onDelete: () => void
  connectionTargets: Array<{ id: string; name: string }>
  onConnect: (targetNodeId: string) => void
  onAutoLayout: () => void
  onUndo: () => void
  onRedo: () => void
}): JSX.Element {
  const { fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow()
  const { t } = useLocalization()
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [connectMenuOpen, setConnectMenuOpen] = useState(false)

  function requestNode(type: WorkflowNodeType): void {
    const surface = document.querySelector('.react-flow')
    const bounds = surface?.getBoundingClientRect()
    const viewportCenter = screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 0) / 2
    })
    onAdd(type, viewportCenter)
  }

  return (
    <Toolbar
      className="workflow-canvas-toolbar"
      aria-label={t('workflowCanvas.toolbar')}
    >
      {!readOnly ? (
        <>
          <div className="workflow-canvas-add">
            <IconButton
              size="compact"
              variant="ghost"
              aria-label={t('workflowCanvas.addNode')}
              title={t('workflowCanvas.addNode')}
              aria-expanded={addMenuOpen}
              onClick={() => setAddMenuOpen((open) => !open)}
            >
              <Plus size={16} />
            </IconButton>
            <Menu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
              <MenuContent className="workflow-canvas-add-menu" size="compact">
                {(
                  ['ai_generate', 'human_input', 'tool', 'approval'] as const
                ).map((type) => {
                  const Icon = NODE_TYPE_ICONS[type]
                  return (
                    <MenuItem
                      key={type}
                      onSelect={() => requestNode(type)}
                    >
                      <Icon
                        size={16}
                        data-testid="workflow-node-type-icon"
                      />
                      <span>{t(`workflowEditor.type.${type}`)}</span>
                    </MenuItem>
                  )
                })}
              </MenuContent>
            </Menu>
          </div>
          <IconButton
            size="compact"
            variant="ghost"
            aria-label={t('workflowCanvas.copyNode')}
            title={t('workflowCanvas.copyNode')}
            disabled={!hasSelection}
            onClick={onCopy}
          >
            <Copy size={16} />
          </IconButton>
          <IconButton
            size="compact"
            variant="ghost"
            aria-label={t('workflowCanvas.deleteNode')}
            title={t('workflowCanvas.deleteNode')}
            disabled={!hasSelection}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </IconButton>
          <div className="workflow-canvas-add">
            <IconButton
              size="compact"
              variant="ghost"
              aria-label={t('workflowCanvas.addEdge')}
              title={t('workflowCanvas.addEdge')}
              disabled={!hasSelection || connectionTargets.length === 0}
              aria-expanded={connectMenuOpen}
              onClick={() => setConnectMenuOpen((open) => !open)}
            >
              <Link2 size={16} />
            </IconButton>
            <Menu open={connectMenuOpen} onOpenChange={setConnectMenuOpen}>
              <MenuContent className="workflow-canvas-add-menu" size="compact">
                {connectionTargets.map((target) => (
                  <MenuItem
                    key={target.id}
                    onSelect={() => onConnect(target.id)}
                  >
                    <ArrowRight
                      size={16}
                      data-testid="workflow-connect-target-icon"
                    />
                    <span>
                      {t('workflowCanvas.connectTo', { name: target.name })}
                    </span>
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </div>
          <IconButton
            size="compact"
            variant="ghost"
            aria-label={t('workflowCanvas.autoLayout')}
            title={t('workflowCanvas.autoLayout')}
            onClick={onAutoLayout}
          >
            <LayoutDashboard size={16} />
          </IconButton>
          <IconButton
            size="compact"
            variant="ghost"
            aria-label={t('workflowCanvas.undo')}
            title={t('workflowCanvas.undo')}
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={16} />
          </IconButton>
          <IconButton
            size="compact"
            variant="ghost"
            aria-label={t('workflowCanvas.redo')}
            title={t('workflowCanvas.redo')}
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={16} />
          </IconButton>
        </>
      ) : null}
      <IconButton
        size="compact"
        variant="ghost"
        aria-label={t('workflowCanvas.zoomIn')}
        title={t('workflowCanvas.zoomIn')}
        onClick={() => void zoomIn()}
      >
        <ZoomIn size={16} />
      </IconButton>
      <IconButton
        size="compact"
        variant="ghost"
        aria-label={t('workflowCanvas.zoomOut')}
        title={t('workflowCanvas.zoomOut')}
        onClick={() => void zoomOut()}
      >
        <ZoomOut size={16} />
      </IconButton>
      <IconButton
        size="compact"
        variant="ghost"
        aria-label={t('workflowCanvas.fitView')}
        title={t('workflowCanvas.fitView')}
        onClick={() => void fitView({ padding: 0.2 })}
      >
        <Maximize2 size={16} />
      </IconButton>
    </Toolbar>
  )
}
