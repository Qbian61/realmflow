import {
  Ban,
  Check,
  CircleAlert,
  CirclePause,
  Clock3,
  Ellipsis,
  LoaderCircle,
  SkipForward
} from 'lucide-react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  memo,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  useRef,
  useState
} from 'react'
import { useLocalization } from '../../localization/LocalizationProvider'
import { nodeStatusLabel } from './workflow-view'
import type {
  RequirementDagNode,
  RequirementDagNodeData
} from './requirement-dag-model'
import { RequirementDagNodeTooltip } from './RequirementDagNodeTooltip'

export type RequirementDagNodeViewData = RequirementDagNodeData & {
  responding?: boolean
  onOpenMenu?: (nodeId: string, anchor: HTMLButtonElement) => void
  onSelect?: (nodeId: string) => void
  onNavigate?: (
    nodeId: string,
    key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
  ) => void
}

type RequirementDagNodeViewNode = Omit<RequirementDagNode, 'data'> & {
  data: RequirementDagNodeViewData
}

const STATUS_ICONS = {
  pending: Clock3,
  ready: Clock3,
  running: LoaderCircle,
  waiting_user: CirclePause,
  paused: CirclePause,
  blocked: CircleAlert,
  completed: Check,
  failed: CircleAlert,
  skipped: SkipForward,
  cancelled: Ban,
  interrupted: Ban
} as const

function RequirementDagNodeComponent({
  id,
  data,
  selected
}: NodeProps<RequirementDagNodeViewNode>): JSX.Element {
  const { t } = useLocalization()
  const statusLabel = nodeStatusLabel(data.status, t)
  const StatusIcon = STATUS_ICONS[data.status]
  const isSelected = selected || data.selected
  const duration = formatNodeDuration(data)
  const nodeRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const tooltipOpen = hovered || focused
  const tooltipId = `requirement-dag-node-tooltip-${id}`
  const accessibleDetails = [
    data.name,
    statusLabel,
    duration,
    data.attempt ? `#${data.attempt}` : undefined,
    data.active ? t('requirementDetail.parallelismActive') : undefined,
    data.current ? t('requirementDetail.stage.current') : undefined,
    data.focused ? t('workflowCanvas.focusNode') : undefined
  ].filter(Boolean)

  const openMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    data.onOpenMenu?.(id, event.currentTarget)
  }

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="requirement-dag-node-handle"
      />
      <div
        ref={nodeRef}
        className="requirement-dag-node"
        role="group"
        tabIndex={0}
        aria-label={accessibleDetails.join(', ')}
        aria-describedby={tooltipOpen ? tooltipId : undefined}
        data-status={data.status}
        data-active={data.active}
        data-current={data.current}
        data-focused={data.focused}
        data-selected={isSelected}
        data-responding={data.responding === true}
        onMouseEnter={(event) => setHovered(!isNodeMenuTarget(event.target))}
        onMouseMove={(event) => setHovered(!isNodeMenuTarget(event.target))}
        onMouseLeave={() => setHovered(false)}
        onFocus={(event) => {
          if (event.target === event.currentTarget) setFocused(true)
        }}
        onBlur={(event: FocusEvent<HTMLDivElement>) => {
          if (event.currentTarget.contains(event.relatedTarget)) return
          setFocused(false)
        }}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            data.onSelect?.(id)
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            event.currentTarget.blur()
            return
          }
          if (
            event.key === 'ArrowLeft' ||
            event.key === 'ArrowRight' ||
            event.key === 'ArrowUp' ||
            event.key === 'ArrowDown'
          ) {
            event.preventDefault()
            data.onNavigate?.(id, event.key)
          }
        }}
      >
        <span className="requirement-dag-node-status">
          <StatusIcon size={14} strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="requirement-dag-node-copy">
          <strong title={data.name}>{data.name}</strong>
          <span className="requirement-dag-node-duration">{duration}</span>
        </div>
        <span
          className="requirement-dag-node-menu-region nodrag nopan"
          onMouseEnter={() => setHovered(false)}
        >
          <button
            type="button"
            className="requirement-dag-node-menu"
            aria-label={t('requirement.itemActions', { name: data.name })}
            title={t("tooltip.moreActions")}
            aria-haspopup="menu"
            onFocus={() => setFocused(false)}
            onClick={openMenu}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.stopPropagation()
              }
            }}
          >
            <Ellipsis size={14} aria-hidden="true" />
          </button>
        </span>
      </div>
      {tooltipOpen && nodeRef.current ? (
        <RequirementDagNodeTooltip
          anchor={nodeRef.current}
          node={data}
          id={tooltipId}
        />
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="requirement-dag-node-handle"
      />
    </>
  )
}

export const RequirementDagNodeView = memo(RequirementDagNodeComponent)

function isNodeMenuTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('.requirement-dag-node-menu-region') !== null
  )
}

function formatNodeDuration(data: RequirementDagNodeViewData): string {
  if (data.createdAt === undefined) return '0s'
  const end = data.completedAt ?? data.updatedAt ?? data.createdAt
  const seconds = Math.max(0, Math.floor((end - data.createdAt) / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h${remainingMinutes}m`
}
