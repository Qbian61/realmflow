import { useState } from 'react'
import type {
  BusinessApi,
  WorkflowTemplateDraftDto
} from '../../../../shared/business'
import { useToast } from '../../toast/ToastProvider'

type Options = {
  business?: BusinessApi
  template?: WorkflowTemplateDraftDto
  versionId?: string
  copyName: string
}

export function useWorkflowCanvasVersionActions({
  business,
  template,
  versionId,
  copyName
}: Options) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function run(
    operation: () => Promise<{ id: string }>
  ): Promise<void> {
    setLoading(true)
    try {
      const saved = await operation()
      window.location.hash = `/templates/${saved.id}/edit`
    } catch {
      toast.error('workflowTemplates.createVersionFailed')
    } finally {
      setLoading(false)
    }
  }

  function copyVersion(): void {
    if (!business || !template || !versionId) return
    void run(() =>
      business.copyWorkflowTemplate({
        id: crypto.randomUUID(),
        sourceTemplateId: template.id,
        sourceVersionId: versionId,
        name: copyName,
        description: template.description
      })
    )
  }

  function createNextVersion(): void {
    if (!business || !template || !versionId) return
    void run(() =>
      business.createWorkflowTemplateVersion({
        id: template.id,
        sourceVersionId: versionId,
        expectedRevision: template.revision
      })
    )
  }

  return { loading, copyVersion, createNextVersion }
}
