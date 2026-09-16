import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { Plus, X } from 'lucide-react'

export type TemplateDefinition = {
  title: string
  tag: string
  description: string
  prompt: string
  uses: number
}

type CreateTemplateDialogProps = {
  availableTags: string[]
  onClose: () => void
  onCreate: (template: TemplateDefinition) => void
}

type UseTemplateDialogProps = {
  template: TemplateDefinition
  onClose: () => void
  onUse: (prompt: string) => void
}

function getPlaceholders(prompt: string): string[] {
  const names = [...prompt.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(
    (match) => match[1]
  )
  return [...new Set(names)]
}

function DialogFrame({
  title,
  onClose,
  children
}: {
  title: string
  onClose: () => void
  children: ReactNode
}): JSX.Element {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div
      className="template-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
      >
        <header>
          <h2 id="template-dialog-title">{title}</h2>
          <button type="button" aria-label="关闭弹窗" title="关闭弹窗" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

export function CreateTemplateDialog({
  availableTags,
  onClose,
  onCreate
}: CreateTemplateDialogProps): JSX.Element {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [prompt, setPrompt] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const placeholders = useMemo(() => getPlaceholders(prompt), [prompt])

  const addPlaceholder = (): void => {
    const normalizedName = placeholder.trim().replace(/\s+/g, '_')
    if (!normalizedName) return
    setPrompt((current) => `${current}${current ? ' ' : ''}{{${normalizedName}}}`)
    setPlaceholder('')
    promptRef.current?.focus()
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!name.trim() || !tag.trim() || !prompt.trim()) return
    onCreate({
      title: name.trim(),
      tag: tag.trim(),
      description: `自定义模板，包含 ${placeholders.length} 个占位符。`,
      prompt: prompt.trim(),
      uses: 0
    })
  }

  return (
    <DialogFrame title="创建模板" onClose={onClose}>
      <form className="template-dialog-form" onSubmit={submit}>
        <div className="template-dialog-column">
          <div className="dialog-section-heading">
            <strong>编写模板提示词</strong>
            <span>使用双花括号标记需要用户填写的内容</span>
          </div>
          <div className="template-meta-fields">
            <label>
              <span>模板名称</span>
              <input
                value={name}
                aria-label="模板名称"
                placeholder="例如：接口设计助手"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span>所属标签</span>
              <input
                list="existing-template-tags"
                value={tag}
                aria-label="所属标签"
                placeholder="选择已有标签或输入新标签"
                onChange={(event) => setTag(event.target.value)}
              />
              <datalist id="existing-template-tags">
                {availableTags.map((existingTag) => (
                  <option key={existingTag} value={existingTag} />
                ))}
              </datalist>
            </label>
          </div>
          <label className="template-prompt-field">
            <span>提示词</span>
            <textarea
              ref={promptRef}
              value={prompt}
              aria-label="模板提示词"
              placeholder="例如：请根据 {{需求文档}} 生成一份技术方案。"
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
        </div>

        <div className="template-dialog-column parameter-column">
          <div className="dialog-section-heading">
            <strong>占位符配置</strong>
            <span>添加后将自动插入提示词</span>
          </div>
          <div className="placeholder-adder">
            <input
              value={placeholder}
              aria-label="占位符名称"
              placeholder="输入占位符名称"
              onChange={(event) => setPlaceholder(event.target.value)}
            />
            <button type="button" aria-label="添加占位符" onClick={addPlaceholder}>
              <Plus size={18} />
            </button>
          </div>
          <div className="placeholder-list" aria-label="已添加占位符">
            {placeholders.length > 0 ? (
              placeholders.map((name) => <span key={name}>{`{{${name}}}`}</span>)
            ) : (
              <div className="parameter-empty">
                <strong>暂无占位符</strong>
                <span>在左侧输入提示词或添加占位符</span>
              </div>
            )}
          </div>
        </div>

        <footer className="template-dialog-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={!name.trim() || !tag.trim() || !prompt.trim()}>
            保存模板
          </button>
        </footer>
      </form>
    </DialogFrame>
  )
}

export function UseTemplateDialog({
  template,
  onClose,
  onUse
}: UseTemplateDialogProps): JSX.Element {
  const placeholders = useMemo(() => getPlaceholders(template.prompt), [template.prompt])
  const [values, setValues] = useState<Record<string, string>>({})
  const canUse = placeholders.every((name) => values[name]?.trim())

  const useTemplate = (): void => {
    if (!canUse) return
    const resolvedPrompt = template.prompt.replace(
      /\{\{\s*([^{}]+?)\s*\}\}/g,
      (_, name: string) => values[name.trim()]?.trim() ?? ''
    )
    onUse(resolvedPrompt)
  }

  return (
    <DialogFrame title={template.title} onClose={onClose}>
      <div className="template-dialog-summary">
        <span>{template.tag}</span>
        <p>{template.description}</p>
      </div>
      <div className="template-use-body">
        <div className="template-dialog-column">
          <div className="dialog-section-heading">
            <strong>模板提示词</strong>
            <span>占位符将在使用时替换为右侧填写的内容</span>
          </div>
          <div className="template-prompt-preview">
            {template.prompt.split(/(\{\{\s*[^{}]+?\s*\}\})/g).map((part, index) =>
              part.startsWith('{{') ? (
                <mark key={`${part}-${index}`}>{part}</mark>
              ) : (
                <span key={`${part}-${index}`}>{part}</span>
              )
            )}
          </div>
        </div>

        <div className="template-dialog-column parameter-column">
          <div className="dialog-section-heading">
            <strong>填写任务信息</strong>
            <span>输入内容将替换模板中的对应占位符</span>
          </div>
          <div className="template-parameter-fields">
            {placeholders.map((name) => (
              <label key={name}>
                <span>{name}</span>
                <textarea
                  value={values[name] ?? ''}
                  aria-label={`占位符 ${name}`}
                  placeholder={`请输入${name}`}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [name]: event.target.value
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      </div>
      <footer className="template-dialog-footer">
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button type="button" disabled={!canUse} onClick={useTemplate}>
          使用
        </button>
      </footer>
    </DialogFrame>
  )
}
