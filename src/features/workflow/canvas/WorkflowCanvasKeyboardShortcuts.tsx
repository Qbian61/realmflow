import { useReactFlow } from '@xyflow/react'
import { useEffect } from 'react'
import { useWorkspacePageActive } from '../../navigation/WorkspaceRouteCache'

type Props = {
  readOnly: boolean
  hasNodeSelection: boolean
  hasSelection: boolean
  onCopy: () => void
  onDelete: () => void
  onSelectAll: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function WorkflowCanvasKeyboardShortcuts({
  readOnly,
  hasNodeSelection,
  hasSelection,
  onCopy,
  onDelete,
  onSelectAll
}: Props): null {
  const { fitView } = useReactFlow()
  const pageActive = useWorkspacePageActive()

  useEffect(() => {
    if (!pageActive) return
    function handleKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return
      const command = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (command && key === '0') {
        event.preventDefault()
        void fitView({ padding: 0.2 })
      } else if (command && key === 'a') {
        event.preventDefault()
        onSelectAll()
      } else if (!readOnly && command && key === 'c' && hasNodeSelection) {
        event.preventDefault()
        onCopy()
      } else if (
        !readOnly &&
        hasSelection &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        event.preventDefault()
        onDelete()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    fitView,
    hasNodeSelection,
    hasSelection,
    onCopy,
    onDelete,
    onSelectAll,
    pageActive,
    readOnly
  ])

  return null
}
