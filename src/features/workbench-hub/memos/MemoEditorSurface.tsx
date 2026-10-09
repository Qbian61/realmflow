import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Eraser,
  FilePlus2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  Unlink
} from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import type { Ref } from 'react'
import type {
  WorkbenchAttachment,
  WorkbenchAttachmentApi
} from '../../../../shared/workbench-attachments'
import type { WorkbenchMemoDocument } from '../../../../shared/workbench-memos'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field
} from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'
import type { MemoEditorSurfaceProps } from './MemoWorkbenchPage'

const MemoAttachmentContext = createContext<{
  memoId: string
  api?: WorkbenchAttachmentApi
  imageLoading: string
  imageFailed: string
  retryImage: string
  attachmentFallback: string
}>({
  memoId: '',
  imageLoading: '',
  imageFailed: '',
  retryImage: '',
  attachmentFallback: ''
})

const MemoImage = Image.extend({
  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-attachment-id'),
        renderHTML: ({ attachmentId }) => ({
          'data-attachment-id': attachmentId
        })
      },
      alt: { default: null },
      title: { default: null }
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(MemoImageView)
  }
}).configure({
  allowBase64: false
})

const FileAttachment = Node.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-attachment-id'),
        renderHTML: ({ attachmentId }) => ({
          'data-attachment-id': attachmentId
        })
      }
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-memo-file-attachment]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-memo-file-attachment': ''
      })
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(MemoFileView)
  }
})

export default function MemoEditorSurface({
  memoId,
  document,
  attachmentsApi,
  onChange
}: MemoEditorSurfaceProps): JSX.Element {
  const { t } = useLocalization()
  const [linkDialog, setLinkDialog] = useState<{
    initialValue: string
    from: number
    to: number
  }>()
  const linkButtonRef = useRef<HTMLButtonElement>(null)
  const restoreLinkFocusRef = useRef(false)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        heading: {
          levels: [1, 2]
        },
        link: false,
        underline: false
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        isAllowedUri: isAllowedMemoLink
      }),
      MemoImage,
      FileAttachment
    ],
    content: document as JSONContent,
    editorProps: {
      attributes: {
        class: 'workbench-memo-editor-content',
        'aria-label': t('workbenchHub.memo.body')
      },
      transformPastedHTML: sanitizeMemoPastedHtml
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.getJSON() as WorkbenchMemoDocument)
    }
  }, [t])

  useEffect(() => {
    if (!editor) return
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(document)) {
      editor.commands.setContent(document as JSONContent, {
        emitUpdate: false
      })
    }
  }, [document, editor, memoId])

  useLayoutEffect(() => {
    if (linkDialog || !restoreLinkFocusRef.current) return
    restoreLinkFocusRef.current = false
    linkButtonRef.current?.focus()
  }, [linkDialog])

  const attach = async (accept: 'image' | 'any'): Promise<void> => {
    if (!editor || !attachmentsApi) return
    const attachment = await attachmentsApi.pickAndAttach({
      requestId: requestId(),
      ownerType: 'memo',
      ownerId: memoId,
      accept
    })
    if (!attachment) return
    editor
      .chain()
      .focus()
      .insertContent({
        type: accept === 'image' ? 'image' : 'fileAttachment',
        attrs: { attachmentId: attachment.id }
      })
      .run()
  }

  if (!editor) return <div className="workbench-memo-editor-loading" />
  const setLink = (): void => {
    const previous = editor.getAttributes('link').href as string | undefined
    setLinkDialog({
      initialValue: previous ?? 'https://',
      from: editor.state.selection.from,
      to: editor.state.selection.to
    })
  }
  const applyLink = (href: string): void => {
    if (!linkDialog) return
    const chain = editor
      .chain()
      .focus()
      .setTextSelection({ from: linkDialog.from, to: linkDialog.to })
    if (!href.trim()) {
      chain.extendMarkRange('link').unsetLink().run()
      closeLinkDialog()
      return
    }
    chain
      .extendMarkRange('link')
      .setLink({ href })
      .run()
    closeLinkDialog()
  }
  const closeLinkDialog = (): void => {
    restoreLinkFocusRef.current = true
    setLinkDialog(undefined)
  }

  return (
    <MemoAttachmentContext.Provider
      value={{
        memoId,
        api: attachmentsApi,
        imageLoading: t('workbenchHub.memo.imageLoading'),
        imageFailed: t('workbenchHub.memo.imageFailed'),
        retryImage: t('workbenchHub.memo.retryImage'),
        attachmentFallback: t('workbenchHub.memo.attachmentFallback')
      }}
    >
      <div className="workbench-memo-editor">
      <div
        className="workbench-memo-toolbar"
        role="toolbar"
        aria-label={t('workbenchHub.memo.toolbar.aria')}
      >
        <label className="workbench-memo-toolbar-text-style">
          <span className="sr-only">
            {t('workbenchHub.memo.toolbar.textStyle')}
          </span>
          <select name="workbench-hub-memo-toolbar-text-style" autoComplete="off"
            aria-label={t('workbenchHub.memo.toolbar.textStyle')}
            value={
              editor.isActive('heading', { level: 1 })
                ? 'heading-1'
                : editor.isActive('heading', { level: 2 })
                  ? 'heading-2'
                  : 'paragraph'
            }
            onChange={(event) => {
              const chain = editor.chain().focus()
              if (event.target.value === 'heading-1') {
                chain.setHeading({ level: 1 }).run()
              } else if (event.target.value === 'heading-2') {
                chain.setHeading({ level: 2 }).run()
              } else {
                chain.setParagraph().run()
              }
            }}
          >
            <option value="paragraph">
              {t('workbenchHub.memo.toolbar.paragraph')}
            </option>
            <option value="heading-1">
              {t('workbenchHub.memo.toolbar.heading1')}
            </option>
            <option value="heading-2">
              {t('workbenchHub.memo.toolbar.heading2')}
            </option>
          </select>
        </label>
        <ToolButton
          label={t('workbenchHub.memo.toolbar.bold')}
          active={editor.isActive('bold')}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          icon={<Bold size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.italic')}
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          icon={<Italic size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.strike')}
          active={editor.isActive('strike')}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          icon={<Strikethrough size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.bulletList')}
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          icon={<List size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.orderedList')}
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          icon={<ListOrdered size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.quote')}
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          icon={<Quote size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.horizontalRule')}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          icon={<Minus size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.clearFormatting')}
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
          icon={<Eraser size={16} />}
        />
        <span className="workbench-memo-toolbar-separator" />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.link')}
          active={editor.isActive('link')}
          buttonRef={linkButtonRef}
          onClick={setLink}
          icon={<Link2 size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.unlink')}
          disabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().unsetLink().run()}
          icon={<Unlink size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.image')}
          disabled={!attachmentsApi}
          onClick={() => void attach('image')}
          icon={<ImagePlus size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.file')}
          disabled={!attachmentsApi}
          onClick={() => void attach('any')}
          icon={<FilePlus2 size={16} />}
        />
        <span className="workbench-memo-toolbar-separator" />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.undo')}
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
          icon={<Undo2 size={16} />}
        />
        <ToolButton
          label={t('workbenchHub.memo.toolbar.redo')}
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
          icon={<Redo2 size={16} />}
        />
      </div>
        <EditorContent editor={editor} />
      </div>
      <MemoLinkDialog
        open={Boolean(linkDialog)}
        initialValue={linkDialog?.initialValue ?? ''}
        onCancel={closeLinkDialog}
        onSubmit={applyLink}
      />
    </MemoAttachmentContext.Provider>
  )
}

export function MemoLinkDialog({
  open,
  initialValue,
  onCancel,
  onSubmit
}: {
  open: boolean
  initialValue: string
  onCancel: () => void
  onSubmit: (href: string) => void
}): JSX.Element {
  const { t } = useLocalization()
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    setError('')
  }, [initialValue, open])

  return (
    <Dialog
      open={open}
      size="compact"
      aria-label={t('workbenchHub.memo.linkDialog.title')}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const href = value.trim()
          if (href && !isAllowedMemoLink(href)) {
            setError(t('workbenchHub.memo.linkDialog.invalid'))
            return
          }
          onSubmit(href)
        }}
      >
        <DialogHeader>
          <h2>{t('workbenchHub.memo.linkDialog.title')}</h2>
        </DialogHeader>
        <DialogBody>
          <Field name="workbench-hub-memo-toolbar-link-prompt"
            label={t('workbenchHub.memo.toolbar.linkPrompt')}
            error={error}
          >
            <input
              data-autofocus
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setError('')
              }}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('workbenchHub.memo.linkDialog.apply')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

function ToolButton({
  label,
  icon,
  buttonRef,
  active = false,
  disabled = false,
  onClick
}: {
  label: string
  icon: JSX.Element
  buttonRef?: Ref<HTMLButtonElement>
  active?: boolean
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      data-active={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

function MemoImageView({ node }: NodeViewProps): JSX.Element {
  const attachmentId = node.attrs.attachmentId as string
  const {
    api,
    imageLoading,
    imageFailed,
    retryImage
  } = useContext(MemoAttachmentContext)
  const [source, setSource] = useState<string>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setSource(undefined)
    setFailed(false)
    if (!api) {
      setFailed(true)
      return
    }
    let active = true
    void api
      .readImage(attachmentId)
      .then((value) => {
        if (active) setSource(value)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [api, attachmentId, attempt])
  return (
    <NodeViewWrapper
      className="workbench-memo-image"
      data-media-state={failed ? 'error' : source ? 'ready' : 'loading'}
    >
      {source ? (
        <img
          src={source}
          alt={(node.attrs.alt as string | undefined) ?? ''}
          width={16}
          height={9}
          loading="lazy"
          decoding="async"
          data-media-layout="contained"
          onError={() => {
            setSource(undefined)
            setFailed(true)
          }}
        />
      ) : failed ? (
        <span className="workbench-memo-image-error" role="alert">
          <span>{imageFailed}</span>
          <Button
            size="compact"
            variant="ghost"
            onClick={() => setAttempt((current) => current + 1)}
          >
            {retryImage}
          </Button>
        </span>
      ) : (
        <span role="status">{imageLoading}</span>
      )}
    </NodeViewWrapper>
  )
}

function MemoFileView({ node }: NodeViewProps): JSX.Element {
  const attachmentId = node.attrs.attachmentId as string
  const { api, memoId, attachmentFallback } = useContext(
    MemoAttachmentContext
  )
  const [attachment, setAttachment] = useState<WorkbenchAttachment>()
  useEffect(() => {
    let active = true
    void api
      ?.list({ ownerType: 'memo', ownerId: memoId })
      .then((items) => {
        if (active) setAttachment(items.find(({ id }) => id === attachmentId))
      })
    return () => {
      active = false
    }
  }, [api, attachmentId, memoId])
  return (
    <NodeViewWrapper className="workbench-memo-file">
      <button type="button" onClick={() => void api?.open(attachmentId)}>
        <FilePlus2 size={16} />
        <span>{attachment?.fileName ?? attachmentFallback}</span>
      </button>
    </NodeViewWrapper>
  )
}

export function isAllowedMemoLink(value: string): boolean {
  try {
    const url = new URL(value)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
  } catch {
    return false
  }
}

export function sanitizeMemoPastedHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const allowed = new Set([
    'P',
    'STRONG',
    'B',
    'EM',
    'I',
    'UL',
    'OL',
    'LI',
    'BLOCKQUOTE',
    'A',
    'BR'
  ])
  for (const element of [...document.body.querySelectorAll('*')]) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...element.childNodes)
      continue
    }
    for (const attribute of [...element.attributes]) {
      if (element.tagName !== 'A' || attribute.name !== 'href') {
        element.removeAttribute(attribute.name)
      }
    }
    if (
      element.tagName === 'A' &&
      !isAllowedMemoLink(element.getAttribute('href') ?? '')
    ) {
      element.removeAttribute('href')
    }
  }
  return document.body.innerHTML
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `memo-attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
