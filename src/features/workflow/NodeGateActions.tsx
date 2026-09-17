import { Check, X } from 'lucide-react'
import type { RequirementNode } from '../../../domain/workflow'
import type { ResolveWorkflowNodeGateCommand } from '../../../shared/business'

type NodeGateActionsProps = {
  node: RequirementNode | undefined
  disabled: boolean
  onResolve: (
    gate: ResolveWorkflowNodeGateCommand['gate']
  ) => Promise<void>
}

const resolvableStatuses: RequirementNode['status'][] = [
  'ready',
  'running',
  'waiting_user'
]

export function NodeGateActions({
  node,
  disabled,
  onResolve
}: NodeGateActionsProps): JSX.Element | null {
  if (!node || !resolvableStatuses.includes(node.status)) return null
  const customGateId = node.completionGate?.customGateId

  return (
    <>
      {node.type === 'approval' ||
      node.completionGate?.requireApproval === true ? (
        <div className="stage-run-gate-actions">
          <button
            type="button"
            className="stage-run-start"
            aria-label="批准节点"
            disabled={disabled}
            onClick={() =>
              void onResolve({ kind: 'approval', result: 'approved' })
            }
          >
            <Check size={14} />
            批准
          </button>
          <button
            type="button"
            className="stage-run-cancel"
            aria-label="驳回节点"
            disabled={disabled}
            onClick={() =>
              void onResolve({ kind: 'approval', result: 'rejected' })
            }
          >
            <X size={14} />
            驳回
          </button>
        </div>
      ) : null}
      {customGateId ? (
        <div className="stage-run-gate-actions">
          <button
            type="button"
            className="stage-run-start"
            aria-label="通过自定义门禁"
            disabled={disabled}
            onClick={() =>
              void onResolve({
                kind: 'custom',
                gateId: customGateId,
                passed: true
              })
            }
          >
            <Check size={14} />
            通过
          </button>
          <button
            type="button"
            className="stage-run-cancel"
            aria-label="不通过自定义门禁"
            disabled={disabled}
            onClick={() =>
              void onResolve({
                kind: 'custom',
                gateId: customGateId,
                passed: false
              })
            }
          >
            <X size={14} />
            不通过
          </button>
        </div>
      ) : null}
    </>
  )
}
