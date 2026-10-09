import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import { vi } from 'vitest'
import type {
  WorkbenchMemo,
  WorkbenchMemoApi,
  WorkbenchMemoDocument
} from '../../../../shared/workbench-memos'
import { LocalizationProvider } from '../../../localization/LocalizationProvider'
import {
  MemoWorkbenchPage,
  type MemoEditorSurfaceProps
} from './MemoWorkbenchPage'

const TestEditor: ComponentType<MemoEditorSurfaceProps> = ({
  document,
  onChange
}) => (
  <textarea
    aria-label="备忘录正文"
    value={document.content?.[0]?.content?.[0]?.text ?? ''}
    onChange={(event) =>
      onChange({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: event.target.value }]
          }
        ]
      })
    }
  />
)

describe('MemoWorkbenchPage', () => {
  it('retries a failed memo load through the shared alert', async () => {
    const retry = deferred<WorkbenchMemo[]>()
    const api = createMemoApi({
      getMemos: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockReturnValueOnce(retry.promise)
    })
    renderPage(api)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('ui-inline-alert', 'ui-inline-alert--danger')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(api.getMemos).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '重试' })).toBeDisabled()
    retry.resolve([memo('memo-1', '计划', '')])
    expect(await screen.findByRole('button', { name: /^计划 / }))
      .toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('creates a memo only after Main confirms creation', async () => {
    let resolveCreate: ((memo: WorkbenchMemo) => void) | undefined
    const api = createMemoApi({
      createMemo: vi.fn(
        () =>
          new Promise<WorkbenchMemo>((resolve) => {
            resolveCreate = resolve
          })
      )
    })
    renderPage(api)
    await screen.findByRole('button', { name: /^计划 / })

    fireEvent.click(screen.getByRole('button', { name: '新增备忘录' }))
    expect(screen.queryByRole('button', { name: /^未命名备忘录 / })).toBeNull()

    await waitFor(() => expect(api.createMemo).toHaveBeenCalledOnce())
    await act(async () => {
      resolveCreate?.(memo('memo-2', '未命名备忘录', ''))
      await Promise.resolve()
    })
    expect(await screen.findByRole('button', { name: /^未命名备忘录 / }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^未命名备忘录 / })
      .closest('.workbench-navigation-item')).toHaveAttribute(
        'data-active',
        'true'
      )
  })

  it('reorders memos from a hover drag handle', async () => {
    const items = [
      memo('memo-1', '计划', ''),
      { ...memo('memo-2', '记录', ''), position: 20 }
    ]
    const api = createMemoApi({
      getMemos: vi.fn().mockResolvedValue(items),
      updateMemo: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...items[1], position: 0, revision: 1 }
      })
    })
    renderPage(api)
    const source = await screen.findByLabelText('拖拽排序 记录')
    const target = screen.getByRole('button', { name: /^计划 / })
      .closest('.workbench-navigation-item')!

    fireEvent.dragStart(source)
    fireEvent.dragOver(target)
    fireEvent.drop(target)

    await waitFor(() =>
      expect(api.updateMemo).toHaveBeenCalledWith(
        expect.objectContaining({
          memoId: 'memo-2',
          expectedRevision: 0,
          position: 0
        })
      )
    )
  })

  it('does not open a reorder menu when the drag handle is clicked', async () => {
    const items = [
      memo('memo-1', '计划', ''),
      { ...memo('memo-2', '记录', ''), position: 20 }
    ]
    const api = createMemoApi({
      getMemos: vi.fn().mockResolvedValue(items),
      updateMemo: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...items[0], position: 1, revision: 1 }
      })
    })
    renderPage(api)
    const handle = await screen.findByLabelText('拖拽排序 计划')

    fireEvent.click(handle)

    expect(handle.tagName).toBe('SPAN')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(api.updateMemo).not.toHaveBeenCalled()
  })

  it('debounces autosave by 600ms and shows the saved state', async () => {
    vi.useFakeTimers()
    const api = createMemoApi({
      updateMemo: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...memo('memo-1', '计划', '更新'), revision: 1 }
      })
    })
    renderPage(api)
    await act(async () => Promise.resolve())

    fireEvent.change(screen.getByLabelText('备忘录正文'), {
      target: { value: '更新' }
    })
    expect(screen.getByText('正在保存')).toBeInTheDocument()
    expect(api.updateMemo).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(600)
      await Promise.resolve()
    })

    expect(api.updateMemo).toHaveBeenCalledWith(
      expect.objectContaining({
        memoId: 'memo-1',
        expectedRevision: 0,
        document: expect.objectContaining({ type: 'doc' })
      })
    )
    expect(screen.getByText('已自动保存')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('flushes pending content before switching memos', async () => {
    vi.useFakeTimers()
    const api = createMemoApi({
      getMemos: vi.fn().mockResolvedValue([
        memo('memo-1', '计划', ''),
        memo('memo-2', '记录', '')
      ]),
      updateMemo: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...memo('memo-1', '计划', '待保存'), revision: 1 }
      })
    })
    renderPage(api)
    await act(async () => Promise.resolve())
    fireEvent.change(screen.getByLabelText('备忘录正文'), {
      target: { value: '待保存' }
    })
    fireEvent.click(screen.getByRole('button', { name: /^记录 / }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.updateMemo).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('备忘录正文')).toHaveValue('')
    vi.useRealTimers()
  })

  it('keeps local content and retries with the current revision after a conflict', async () => {
    vi.useFakeTimers()
    const api = createMemoApi({
      updateMemo: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          code: 'revision_conflict',
          currentRevision: 3
        })
        .mockResolvedValueOnce({
          ok: true,
          value: { ...memo('memo-1', '计划', '本地内容'), revision: 4 }
        })
    })
    renderPage(api)
    await act(async () => Promise.resolve())
    fireEvent.change(screen.getByLabelText('备忘录正文'), {
      target: { value: '本地内容' }
    })
    await act(async () => {
      vi.advanceTimersByTime(600)
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole('button', { name: '重试保存' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.updateMemo).toHaveBeenCalledTimes(2)
    expect(api.updateMemo).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRevision: 3 })
    )
    expect(screen.getByLabelText('备忘录正文')).toHaveValue('本地内容')
    vi.useRealTimers()
  })

  it('shows all memos without a navigation search control', async () => {
    const api = createMemoApi({
      getMemos: vi.fn().mockResolvedValue([
        memo('memo-1', '发布计划', '桌面版本安排'),
        memo('memo-2', '会议记录', '讨论搜索体验')
      ])
    })
    renderPage(api)
    await screen.findByRole('button', { name: /^发布计划 / })

    expect(screen.queryByRole('searchbox', { name: '搜索备忘录' })).toBeNull()
    expect(screen.getByRole('button', { name: /^会议记录 / }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^发布计划 / }))
      .toBeInTheDocument()
    expect(api.getMemos).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: '最近删除' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: '重命名发布计划' })
    ).toBeNull()
  })

  it('renames by double clicking the menu name and uses icon-only create', async () => {
    renderPage(createMemoApi())
    const memoButton = await screen.findByRole('button', { name: /^计划 / })

    fireEvent.doubleClick(memoButton)

    expect(screen.getByRole('textbox', { name: '重命名备忘录' }))
      .toHaveValue('计划')
    expect(screen.getByRole('button', { name: '新增备忘录' }))
      .toHaveTextContent(/^$/)
  })

  it('focuses the next memo after deleting the active memo', async () => {
    const api = createMemoApi({
      getMemos: vi.fn().mockResolvedValue([
        memo('memo-1', '计划', ''),
        memo('memo-2', '记录', '')
      ]),
      deleteMemo: vi.fn().mockResolvedValue({
        ok: true,
        value: memo('memo-1', '计划', '')
      })
    })
    renderPage(api)
    await screen.findByRole('button', { name: /^计划 / })

    const remove = screen.getByRole('button', { name: '删除计划' })
    expect(remove).toHaveAttribute('title', '删除')
    fireEvent.click(remove)
    const dialog = screen.getByRole('dialog', { name: '删除备忘录' })
    const confirm = screen.getByRole('button', { name: '确认删除备忘录' })
    expect(dialog).toHaveClass('ui-dialog', 'ui-dialog--compact')
    expect(confirm).toBeVisible()
    expect(confirm).toHaveClass('ui-button', 'ui-button--danger')
    expect(screen.getByRole('button', { name: '删除计划' }))
      .toHaveClass('danger')
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^记录 / })).toHaveFocus()
    )
  })

})

function renderPage(api: WorkbenchMemoApi): void {
  render(
    <LocalizationProvider>
      <MemoWorkbenchPage memosApi={api} EditorSurface={TestEditor} />
    </LocalizationProvider>
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createMemoApi(
  overrides: Partial<WorkbenchMemoApi> = {}
): WorkbenchMemoApi {
  return {
    getMemos: vi.fn().mockResolvedValue([memo('memo-1', '计划', '')]),
    getDeletedMemos: vi.fn().mockResolvedValue([]),
    createMemo: vi.fn(),
    updateMemo: vi.fn(),
    deleteMemo: vi.fn(),
    restoreMemo: vi.fn(),
    ...overrides
  }
}

function memo(id: string, title: string, text: string): WorkbenchMemo {
  return {
    id,
    title,
    document: document(text),
    plainText: text,
    position: 10,
    revision: 0,
    createdAt: 1,
    updatedAt: 1
  }
}

function document(text: string): WorkbenchMemoDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        ...(text ? { content: [{ type: 'text', text }] } : {})
      }
    ]
  }
}
