import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type { WorkbenchAttachmentApi } from '../../../../shared/workbench-attachments'
import { createEmptyWorkbenchMemoDocument } from '../../../../shared/workbench-memos'
import { LocalizationProvider } from '../../../localization/LocalizationProvider'
import MemoEditorSurface, {
  MemoLinkDialog,
  isAllowedMemoLink,
  sanitizeMemoPastedHtml
} from './MemoEditorSurface'

describe('MemoEditorSurface', () => {
  it('renders the required formatting toolbar and editor', async () => {
    renderEditor(
      <MemoEditorSurface
          memoId="memo-1"
          document={createEmptyWorkbenchMemoDocument()}
          onChange={vi.fn()}
        />
    )

    expect(await screen.findByRole('toolbar', { name: '富文本工具栏' }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: '加粗' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '斜体' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '文本样式' }))
      .toHaveValue('paragraph')
    expect(screen.getByRole('button', { name: '删除线' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '无序列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '有序列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '引用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分隔线' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清除格式' })).toBeInTheDocument()
    expect(screen.getByLabelText('备忘录正文')).toHaveAttribute(
      'contenteditable',
      'true'
    )
  })

  it('keeps the editor selection while pressing toolbar commands', async () => {
    renderEditor(
      <MemoEditorSurface
        memoId="memo-1"
        document={{
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: '待格式化' }]
          }]
        }}
        onChange={vi.fn()}
      />
    )
    const bold = await screen.findByRole('button', { name: '加粗' })

    expect(fireEvent.mouseDown(bold)).toBe(false)
  })

  it('opens the link dialog and restores toolbar focus after cancel', async () => {
    renderEditor(
      <MemoEditorSurface
        memoId="memo-1"
        document={createEmptyWorkbenchMemoDocument()}
        onChange={vi.fn()}
      />
    )
    const linkButton = await screen.findByRole('button', { name: '添加链接' })
    linkButton.focus()

    fireEvent.click(linkButton)

    expect(screen.getByRole('dialog', { name: '添加链接' })).toBeVisible()
    expect(screen.getByLabelText('链接地址')).toHaveValue('https://')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(linkButton).toHaveFocus())
  })

  it('submits a valid link from its initial value', () => {
    const onSubmit = vi.fn()
    renderEditor(
      <MemoLinkDialog
        open
        initialValue="https://realmflow.dev/docs"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    expect(screen.getByLabelText('链接地址')).toHaveValue(
      'https://realmflow.dev/docs'
    )
    fireEvent.change(screen.getByLabelText('链接地址'), {
      target: { value: 'mailto:team@realmflow.dev' }
    })
    fireEvent.click(screen.getByRole('button', { name: '应用' }))

    expect(onSubmit).toHaveBeenCalledWith('mailto:team@realmflow.dev')
  })

  it('submits an empty link to remove the current mark', () => {
    const onSubmit = vi.fn()
    renderEditor(
      <MemoLinkDialog
        open
        initialValue="https://realmflow.dev"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText('链接地址'), {
      target: { value: '   ' }
    })
    fireEvent.click(screen.getByRole('button', { name: '应用' }))

    expect(onSubmit).toHaveBeenCalledWith('')
  })

  it('keeps the link dialog open for an unsafe URL', () => {
    const onSubmit = vi.fn()
    renderEditor(
      <MemoLinkDialog
        open
        initialValue="https://"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText('链接地址'), {
      target: { value: 'javascript:alert(1)' }
    })
    fireEvent.click(screen.getByRole('button', { name: '应用' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '请输入 HTTP(S)、邮件或相对链接'
    )
    expect(screen.getByRole('dialog', { name: '添加链接' })).toBeVisible()
  })

  it('inserts only local attachment references for image uploads', async () => {
    const onChange = vi.fn()
    const attachments = createAttachmentApi({
      pickAndAttach: vi.fn().mockResolvedValue({
        id: 'attachment-1',
        ownerType: 'memo',
        ownerId: 'memo-1',
        fileName: 'diagram.png',
        mimeType: 'image/png',
        sizeBytes: 3,
        checksumSha256: '0'.repeat(64),
        createdAt: 1
      })
    })
    renderEditor(
      <MemoEditorSurface
          memoId="memo-1"
          document={createEmptyWorkbenchMemoDocument()}
          attachmentsApi={attachments}
          onChange={onChange}
        />
    )

    fireEvent.click(await screen.findByRole('button', { name: '添加图片' }))

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'image',
              attrs: expect.objectContaining({
                attachmentId: 'attachment-1'
              })
            })
          ])
        })
      )
    )
    expect(attachments.pickAndAttach).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'memo',
        ownerId: 'memo-1',
        accept: 'image'
      })
    )
  })

  it('renders memo images in a stable lazy contained frame', async () => {
    const attachments = createAttachmentApi({
      readImage: vi.fn().mockResolvedValue('data:image/png;base64,cG5n')
    })
    renderEditor(
      <MemoEditorSurface
        memoId="memo-1"
        document={{
          type: 'doc',
          content: [{
            type: 'image',
            attrs: {
              attachmentId: 'attachment-1',
              alt: '架构图'
            }
          }]
        }}
        attachmentsApi={attachments}
        onChange={vi.fn()}
      />
    )

    const image = await screen.findByRole('img', { name: '架构图' })
    expect(image).toHaveAttribute('width', '16')
    expect(image).toHaveAttribute('height', '9')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('data-media-layout', 'contained')
    expect(image.closest('.workbench-memo-image')).toHaveAttribute(
      'data-media-state',
      'ready'
    )
  })

  it('keeps the memo image frame and retries a failed local read', async () => {
    const readImage = vi.fn()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce('data:image/png;base64,cG5n')
    const attachments = createAttachmentApi({ readImage })
    renderEditor(
      <MemoEditorSurface
        memoId="memo-1"
        document={{
          type: 'doc',
          content: [{
            type: 'image',
            attrs: {
              attachmentId: 'attachment-1',
              alt: '架构图'
            }
          }]
        }}
        attachmentsApi={attachments}
        onChange={vi.fn()}
      />
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('图片加载失败')
    expect(alert.closest('.workbench-memo-image')).toHaveAttribute(
      'data-media-state',
      'error'
    )

    fireEvent.click(screen.getByRole('button', { name: '重试图片' }))

    expect(await screen.findByRole('img', { name: '架构图' })).toBeVisible()
    expect(readImage).toHaveBeenCalledTimes(2)
  })

  it('removes unsupported pasted elements, attributes, and unsafe links', () => {
    const sanitized = sanitizeMemoPastedHtml(
      '<script>alert(1)</script><p style="color:red">Text ' +
        '<a href="javascript:alert(1)" onclick="bad()">link</a></p>'
    )

    expect(sanitized).toBe('<p>Text <a>link</a></p>')
    expect(isAllowedMemoLink('https://realmflow.dev')).toBe(true)
    expect(isAllowedMemoLink('javascript:alert(1)')).toBe(false)
  })
})

function renderEditor(editor: JSX.Element): void {
  render(<LocalizationProvider>{editor}</LocalizationProvider>)
}

function createAttachmentApi(
  overrides: Partial<WorkbenchAttachmentApi> = {}
): WorkbenchAttachmentApi {
  return {
    list: vi.fn().mockResolvedValue([]),
    pickAndAttach: vi.fn(),
    readImage: vi.fn().mockResolvedValue('data:image/png;base64,cG5n'),
    open: vi.fn(),
    reveal: vi.fn(),
    delete: vi.fn(),
    ...overrides
  }
}
