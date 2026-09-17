import { useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Composer } from '../components/Composer'
import {
  CreateTemplateDialog,
  type TemplateDefinition,
  UseTemplateDialog
} from './TemplateDialogs'
import type { WorkspaceSpace } from '../domain/workspace'
import { useModelProfiles } from '../app/hooks/use-model-profiles'

const templates: TemplateDefinition[] = [
  {
    title: '需求全流程自动化',
    tag: '需求分析',
    description: '从需求调研到发布运维的全流程自动化模板，自动生成各阶段产物文档。',
    prompt: '请分析以下业务需求：{{需求描述}}\n目标用户：{{目标用户}}\n输出完整需求拆解与交付计划。',
    uses: 648
  },
  {
    title: '技术方案生成器',
    tag: '技术方案',
    description: '基于需求文档生成技术方案，覆盖架构图、接口定义、数据模型和选型对比。',
    prompt: '请根据以下需求生成技术方案：{{需求文档}}\n技术约束：{{技术约束}}',
    uses: 326
  },
  {
    title: '测试用例自动生成',
    tag: '测试用例',
    description: '从需求和技术方案生成测试用例，覆盖正常、异常与边界场景。',
    prompt: '请根据以下需求生成测试用例：{{需求内容}}\n重点覆盖范围：{{测试范围}}',
    uses: 154
  },
  {
    title: '代码审查助手',
    tag: '代码审查',
    description: '分析代码变更并识别潜在问题、性能瓶颈和安全风险，生成审查报告。',
    prompt: '请审查以下代码变更：{{代码变更}}\n重点关注：{{审查重点}}',
    uses: 860
  },
  {
    title: '项目日报 / 周报',
    tag: '文档撰写',
    description: '汇总需求进展、任务完成情况和风险项，生成结构化日报或周报。',
    prompt: '请根据以下项目进展生成{{报告类型}}：{{项目进展}}',
    uses: 410
  },
  {
    title: '数据库设计助手',
    tag: '数据库设计',
    description: '根据业务需求设计数据表结构，并生成 ER 图、DDL 和索引建议。',
    prompt: '请根据以下业务实体设计数据库：{{业务实体}}\n数据约束：{{数据约束}}',
    uses: 274
  },
  {
    title: 'API 文档生成器',
    tag: '文档撰写',
    description: '从接口定义和代码注释生成结构化 API 文档、调用示例与错误码说明。',
    prompt: '请根据以下接口定义生成 API 文档：{{接口定义}}\n目标读者：{{目标读者}}',
    uses: 720
  },
  {
    title: '前端组件生成器',
    tag: '应用开发',
    description: '根据产品描述生成可复用的前端组件，并补充状态、交互和测试。',
    prompt: '请开发以下前端组件：{{组件需求}}\n技术栈与限制：{{技术约束}}',
    uses: 531
  },
  {
    title: '缺陷定位助手',
    tag: '问题排查',
    description: '结合日志、调用链和代码上下文定位故障根因，并给出修复建议。',
    prompt: '请定位以下故障：{{问题描述}}\n相关日志：{{错误日志}}',
    uses: 388
  },
  {
    title: '发布检查清单',
    tag: '发布运维',
    description: '生成发布前检查项、回滚方案、监控指标和上线验证步骤。',
    prompt: '请为以下版本生成发布检查清单：{{发布内容}}\n目标环境：{{目标环境}}',
    uses: 221
  },
  {
    title: '性能分析助手',
    tag: '性能优化',
    description: '分析性能数据与关键路径，定位瓶颈并输出可执行的优化方案。',
    prompt: '请分析以下性能问题：{{性能数据}}\n业务场景：{{业务场景}}',
    uses: 186
  },
  {
    title: '数据迁移方案',
    tag: '数据库设计',
    description: '规划数据迁移步骤、校验规则、灰度策略和异常回滚流程。',
    prompt: '请为以下数据生成迁移方案：{{数据范围}}\n源端与目标端：{{迁移环境}}',
    uses: 92
  }
]

type NewChatPageProps = {
  spaces?: WorkspaceSpace[]
  onCreateSession?: (
    spacePath: string,
    prompt: string,
    modelProfileId?: string
  ) => void
}

export function NewChatPage({
  spaces = [],
  onCreateSession
}: NewChatPageProps = {}): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [submittedPrompt, setSubmittedPrompt] = useState('')
  const [selectedWorkspace, setSelectedWorkspace] = useState('none')
  const models = useModelProfiles()
  const [selectedFolder, setSelectedFolder] = useState<{
    value: string
    label: string
  } | null>(null)
  const [activeTemplateTag, setActiveTemplateTag] = useState('全部')
  const [templateSearch, setTemplateSearch] = useState('')
  const [customTemplates, setCustomTemplates] = useState<TemplateDefinition[]>([])
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDefinition | null>(
    null
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const allTemplates = [...templates, ...customTemplates]
  const templatesByUsage = [...allTemplates].sort(
    (left, right) => right.uses - left.uses
  )
  const templateTags = ['全部', ...new Set(allTemplates.map(({ tag }) => tag))]

  const fillPrompt = (value: string): void => {
    setPrompt(value)
    textareaRef.current?.focus()
  }

  const submitPrompt = (): void => {
    const nextPrompt = prompt.trim()
    if (!nextPrompt) return
    if (onCreateSession) {
      onCreateSession(
        selectedWorkspace,
        nextPrompt,
        models.selectedId || undefined
      )
      setPrompt('')
      return
    }
    setSubmittedPrompt(nextPrompt)
  }

  return (
    <main className="new-chat-page">
      <section className="chat-launcher" aria-label="新对话">
        <Composer
          value={prompt}
          textareaRef={textareaRef}
          placeholder="帮你编写代码、调试问题、分析需求，交付可运行的解决方案。"
          labels={{
            textarea: '对话内容',
            model: '对话模型',
            workspace: '工作空间',
            permission: '权限模式',
            submit: '发送消息',
            menu: '添加内容',
            openMenu: '打开添加菜单',
            closeMenu: '关闭添加菜单'
          }}
          insertions={{
            mode: '使用合适的执行模式完成：',
            skill: '调用技能：',
            connector: '使用连接器：'
          }}
          fileInputId="chat-attachment"
          modelOptions={models.options}
          modelProfileId={models.selectedId}
          onModelProfileChange={models.select}
          workspaceOptions={[
            { value: 'none', label: '不绑定工作空间' },
            { value: 'local-folder', label: '选择本地文件夹…' },
            ...(selectedFolder ? [selectedFolder] : []),
            ...spaces.map((space) => ({
              value: space.path,
              label: space.label
            }))
          ]}
          onWorkspaceChange={(value) => {
            if (value !== 'local-folder') {
              setSelectedWorkspace(value)
              return
            }
            void window.realmflow?.workspace.chooseFolder().then((binding) => {
              if (!binding) {
                setSelectedWorkspace('none')
                return
              }
              const option = {
                value: `folder:${binding.rootPath}`,
                label: binding.rootName
              }
              setSelectedFolder(option)
              setSelectedWorkspace(option.value)
            })
          }}
          onChange={setPrompt}
          onSubmit={submitPrompt}
        />

        <p className="sr-only" aria-live="polite">
          {submittedPrompt ? `已准备处理：${submittedPrompt}` : ''}
        </p>
      </section>

      <section className="template-market" aria-label="热门模板">
        <div className="template-filters" role="toolbar" aria-label="模板标签筛选">
          <div className="template-filter-options">
            {templateTags.map((tag) => (
              <button
                className={activeTemplateTag === tag ? 'active' : ''}
                key={tag}
                type="button"
                aria-pressed={activeTemplateTag === tag}
                onClick={() => setActiveTemplateTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <label className="template-filter-search">
            <Search size={17} />
            <input
              type="search"
              value={templateSearch}
              aria-label="搜索模板"
              placeholder="搜索模板"
              onChange={(event) => setTemplateSearch(event.target.value)}
            />
          </label>
        </div>

        <div className="template-grid">
          <article className="create-template">
            <div>
              <h2>创建模板</h2>
              <p>沉淀可复用的指令与经验</p>
            </div>
            <div className="create-template-action-area">
              <button
                className="create-template-trigger"
                type="button"
                aria-label="新建模板"
                title="新建模板"
                onClick={() => setCreateTemplateOpen(true)}
              >
                <Plus size={40} strokeWidth={1.5} />
              </button>
            </div>
          </article>

          {templatesByUsage
            .filter(
              ({ tag }) => activeTemplateTag === '全部' || tag === activeTemplateTag
            )
            .filter(({ title, description, tag }) =>
              `${title} ${description} ${tag}`
                .toLowerCase()
                .includes(templateSearch.trim().toLowerCase())
            )
            .map((template) => (
              <article
                className="template-card"
                key={template.title}
                role="button"
                tabIndex={0}
                aria-label={`打开模板 ${template.title}`}
                onClick={() => setSelectedTemplate(template)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedTemplate(template)
                  }
                }}
              >
                <div>
                  <h2>{template.title}</h2>
                  <p>{template.description}</p>
                </div>
                <footer>
                  <span className="template-footer-tag">{template.tag}</span>
                  <span>· 使用 {template.uses} 次</span>
                </footer>
              </article>
            ))}
        </div>
      </section>

      {createTemplateOpen && (
        <CreateTemplateDialog
          availableTags={templateTags.filter((tag) => tag !== '全部')}
          onClose={() => setCreateTemplateOpen(false)}
          onCreate={(template) => {
            setCustomTemplates((current) => [...current, template])
            setActiveTemplateTag('全部')
            setTemplateSearch('')
            setCreateTemplateOpen(false)
          }}
        />
      )}

      {selectedTemplate && (
        <UseTemplateDialog
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onUse={(resolvedPrompt) => {
            fillPrompt(resolvedPrompt)
            setSelectedTemplate(null)
          }}
        />
      )}
    </main>
  )
}
