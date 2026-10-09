import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkflowCanvasKeyboardShortcuts } from './WorkflowCanvasKeyboardShortcuts'

const fitView = vi.hoisted(() => vi.fn())

vi.mock('@xyflow/react', async (loadOriginal) => ({
  ...(await loadOriginal<typeof import('@xyflow/react')>()),
  useReactFlow: () => ({ fitView })
}))

describe('WorkflowCanvasKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('supports copy, select all, fit view, and deletion shortcuts', () => {
    const onCopy = vi.fn()
    const onDelete = vi.fn()
    const onSelectAll = vi.fn()

    render(
      <WorkflowCanvasKeyboardShortcuts
        readOnly={false}
        hasNodeSelection
        hasSelection
        onCopy={onCopy}
        onDelete={onDelete}
        onSelectAll={onSelectAll}
      />
    )

    fireEvent.keyDown(window, { key: 'c', metaKey: true })
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    fireEvent.keyDown(window, { key: '0', metaKey: true })
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onCopy).toHaveBeenCalledOnce()
    expect(onSelectAll).toHaveBeenCalledOnce()
    expect(fitView).toHaveBeenCalledWith({ padding: 0.2 })
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('does not trigger canvas commands from an editable control', () => {
    const onCopy = vi.fn()
    const onDelete = vi.fn()
    const onSelectAll = vi.fn()
    const { getByRole } = render(
      <>
        <WorkflowCanvasKeyboardShortcuts
          readOnly={false}
          hasNodeSelection
          hasSelection
          onCopy={onCopy}
          onDelete={onDelete}
          onSelectAll={onSelectAll}
        />
        <textarea aria-label="editor" />
      </>
    )

    const editor = getByRole('textbox', { name: 'editor' })
    fireEvent.keyDown(editor, { key: 'c', metaKey: true })
    fireEvent.keyDown(editor, { key: 'a', metaKey: true })
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(onCopy).not.toHaveBeenCalled()
    expect(onSelectAll).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })
})
