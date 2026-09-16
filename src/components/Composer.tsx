import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState
} from 'react'
import {
  AudioLines,
  Blocks,
  ChevronDown,
  ChevronRight,
  Folder,
  Link2,
  Mic,
  Paperclip,
  Plus,
  ShieldCheck,
  WandSparkles,
  X
} from 'lucide-react'

type ComposerLabels = {
  textarea: string
  model: string
  workspace: string
  permission: string
  submit: string
  menu: string
  openMenu: string
  closeMenu: string
}

type ComposerInsertions = {
  mode: string
  skill: string
  connector: string
}

type ComposerProps = {
  value: string
  placeholder: string
  labels: ComposerLabels
  insertions: ComposerInsertions
  fileInputId: string
  workspaceOptions?: Array<{ value: string; label: string }>
  defaultWorkspace?: string
  showContext?: boolean
  autoFocus?: boolean
  textareaRef?: RefObject<HTMLTextAreaElement>
  onChange: (value: string) => void
  onWorkspaceChange?: (value: string) => void
  onSubmit: () => void
}

export function Composer({
  value,
  placeholder,
  labels,
  insertions,
  fileInputId,
  workspaceOptions = [
    { value: 'none', label: '选择工作空间' },
    { value: 'realmflow', label: 'realmflow' },
    { value: 'xxx', label: 'xxx 空间' }
  ],
  defaultWorkspace = 'none',
  showContext = true,
  autoFocus = false,
  textareaRef,
  onChange,
  onWorkspaceChange,
  onSubmit
}: ComposerProps): JSX.Element {
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const attachmentAreaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null)
  const resolvedTextareaRef = textareaRef ?? internalTextareaRef

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!attachmentAreaRef.current?.contains(event.target as Node)) {
        setAttachmentMenuOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setAttachmentMenuOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    if (autoFocus) resolvedTextareaRef.current?.focus()
  }, [autoFocus, resolvedTextareaRef])

  const fillPrompt = (nextValue: string): void => {
    onChange(nextValue)
    setAttachmentMenuOpen(false)
    resolvedTextareaRef.current?.focus()
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!value.trim()) return
    onSubmit()
  }

  return (
    <form
      className={showContext ? 'composer' : 'composer without-context'}
      onSubmit={submit}
    >
      <div className="composer-input">
        <textarea
          ref={resolvedTextareaRef}
          value={value}
          aria-label={labels.textarea}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="composer-actions">
          <div className="composer-actions-left">
            <div className="attachment-area" ref={attachmentAreaRef}>
              {attachmentMenuOpen && (
                <div className="attachment-menu" role="menu" aria-label={labels.menu}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAttachmentMenuOpen(false)
                      fileInputRef.current?.click()
                    }}
                  >
                    <Paperclip size={20} />
                    <span>添加文件</span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => fillPrompt(insertions.mode)}
                  >
                    <WandSparkles size={20} />
                    <span>模式</span>
                    <ChevronRight size={17} />
                  </button>
                  <div className="attachment-menu-rule" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => fillPrompt(insertions.skill)}
                  >
                    <Blocks size={20} />
                    <span>技能</span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => fillPrompt(insertions.connector)}
                  >
                    <Link2 size={20} />
                    <span>连接器</span>
                    <ChevronRight size={17} />
                  </button>
                </div>
              )}
              <button
                className="icon-action"
                type="button"
                aria-label={
                  attachmentMenuOpen ? labels.closeMenu : labels.openMenu
                }
                aria-haspopup="menu"
                aria-expanded={attachmentMenuOpen}
                onClick={() => setAttachmentMenuOpen((open) => !open)}
              >
                {attachmentMenuOpen ? <X size={22} /> : <Plus size={22} />}
              </button>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                hidden
                multiple
              />
            </div>
          </div>
          <div className="composer-actions-right">
            <label className="select-control model-control">
              <select aria-label={labels.model} defaultValue="realmflow">
                <option value="realmflow">RealmFlow Agent</option>
                <option value="local">本地模型</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="icon-action"
              type="button"
              aria-label="语音输入"
              title="语音输入"
            >
              <Mic size={20} />
            </button>
            <button
              className="send-action"
              type="submit"
              aria-label={labels.submit}
              disabled={!value.trim()}
            >
              <AudioLines size={20} />
            </button>
          </div>
        </div>
      </div>

      {showContext ? (
        <div className="composer-context">
          <label className="select-control">
            <Folder size={18} />
            <select
              aria-label={labels.workspace}
              defaultValue={defaultWorkspace}
              onChange={(event) => onWorkspaceChange?.(event.target.value)}
            >
              {workspaceOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <label className="select-control">
            <ShieldCheck size={18} />
            <select aria-label={labels.permission} defaultValue="default">
              <option value="default">默认权限</option>
              <option value="ask">每次询问</option>
              <option value="allow">允许执行</option>
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
      ) : null}
    </form>
  )
}
