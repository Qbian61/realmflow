import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RequirementExecutionViewDto } from '../../../shared/business'
import { useLocalization } from '../../localization/LocalizationProvider'
import { nodeStatusLabel } from './workflow-view'

type ExecutionNode = RequirementExecutionViewDto['nodes'][number]

type RequirementDagNodeTooltipProps = {
  anchor: HTMLElement
  node: ExecutionNode
  id: string
}

const TOOLTIP_WIDTH = 240
const TOOLTIP_GAP = 8
const VIEWPORT_PADDING = 12

export function RequirementDagNodeTooltip({
  anchor,
  node,
  id
}: RequirementDagNodeTooltipProps): JSX.Element {
  const { locale, t } = useLocalization()
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({
    position: 'fixed',
    visibility: 'hidden'
  })

  useLayoutEffect(() => {
    const updatePosition = (): void => {
      const tooltip = tooltipRef.current
      if (!tooltip) return
      const bounds = anchor.getBoundingClientRect()
      const height = tooltip.scrollHeight
      const openAbove =
        window.innerHeight - bounds.bottom - TOOLTIP_GAP < height &&
        bounds.top - TOOLTIP_GAP >= height
      const maxLeft = window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, bounds.left),
        Math.max(VIEWPORT_PADDING, maxLeft)
      )
      const top = openAbove
        ? bounds.top - TOOLTIP_GAP - height
        : bounds.bottom + TOOLTIP_GAP

      setPosition({
        position: 'fixed',
        top,
        left,
        visibility: 'visible'
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchor])

  const rows = [
    {
      label: t('requirementDetail.nodeTooltip.status'),
      value: tooltipStatusLabel(node.status, t)
    },
    {
      label: t('requirementDetail.nodeTooltip.startedAt'),
      value: formatTimestamp(
        node.status === 'pending' || node.status === 'ready'
          ? undefined
          : node.createdAt,
        locale
      )
    },
    {
      label: t('requirementDetail.nodeTooltip.endedAt'),
      value: formatTimestamp(node.completedAt, locale)
    },
    {
      label: t('requirementDetail.nodeTooltip.executionRole'),
      value: executionRoleLabel(node.executionRole, t)
    }
  ]

  return createPortal(
    <div
      ref={tooltipRef}
      id={id}
      className="requirement-dag-node-tooltip"
      role="tooltip"
      style={position}
    >
      <dl>
        {rows.map((row) => (
          <div
            key={row.label}
            className="requirement-dag-node-tooltip-row"
          >
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>,
    document.body
  )
}

function tooltipStatusLabel(
  status: ExecutionNode['status'],
  t: ReturnType<typeof useLocalization>['t']
): string {
  if (status === 'pending' || status === 'ready') {
    return t('requirementDetail.nodeTooltip.status.notStarted')
  }
  if (status === 'running') {
    return t('requirementDetail.nodeTooltip.status.running')
  }
  if (status === 'skipped') {
    return t('requirementDetail.nodeTooltip.status.skipped')
  }
  if (status === 'completed') {
    return t('requirementDetail.nodeTooltip.status.succeeded')
  }
  return nodeStatusLabel(status, t)
}

function executionRoleLabel(
  role: ExecutionNode['executionRole'],
  t: ReturnType<typeof useLocalization>['t']
): string {
  if (!role) return '--'
  if (role.kind === 'model') return role.label
  return t(
    role.kind === 'user'
      ? 'requirementDetail.nodeTooltip.role.user'
      : 'requirementDetail.nodeTooltip.role.system'
  )
}

function formatTimestamp(value: number | undefined, locale: string): string {
  if (value === undefined) return '--'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(value)
}
