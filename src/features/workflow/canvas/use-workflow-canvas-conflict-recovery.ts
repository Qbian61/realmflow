import { useCallback, useState, type RefObject } from 'react'
import type {
  BusinessApi,
  WorkflowTemplateDraftDto
} from '../../../../shared/business'
import type { WorkflowNodeInspectorHandle } from './WorkflowNodeInspector'

export function useWorkflowCanvasConflictRecovery(
  business: BusinessApi | undefined,
  templateId: string | undefined,
  inspectorRef: RefObject<WorkflowNodeInspectorHandle>,
  onLoaded: (template: WorkflowTemplateDraftDto) => void,
  onError: (reason: unknown) => void
) {
  const [revisionConflict, setRevisionConflict] = useState(false)
  const [recoveryText, setRecoveryText] = useState('')
  const [loading, setLoading] = useState(false)
  const markConflict = useCallback(() => setRevisionConflict(true), [])
  const clearConflict = useCallback(() => setRevisionConflict(false), [])

  const reloadLatest = useCallback(() => {
    if (!business || !templateId) return
    setRecoveryText(inspectorRef.current?.getRecoveryText() ?? '')
    setLoading(true)
    void business
      .getWorkflowTemplateDraft({ templateId })
      .then((loaded) => {
        onLoaded(loaded)
        setRevisionConflict(false)
      })
      .catch(onError)
      .finally(() => setLoading(false))
  }, [business, inspectorRef, onError, onLoaded, templateId])

  return {
    revisionConflict,
    recoveryText,
    loading,
    markConflict,
    clearConflict,
    reloadLatest
  }
}
