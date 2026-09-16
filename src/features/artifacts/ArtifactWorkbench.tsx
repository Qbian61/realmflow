import {
  Check,
  Code2,
  Eye,
  FolderOpen,
  Link2,
  LoaderCircle,
  PanelRightClose,
  RotateCcw,
  Save,
  X
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import type {
  RequirementManifest,
  RequirementStageId,
  WorkspaceApi,
  WorkspaceBinding,
  WorkspaceEntry,
  WorkspaceFile
} from '../../../shared/workspace'
import WorkspaceTree from './WorkspaceTree'
import './artifact-workbench.css'

const CodeEditor = lazy(() => import('./CodeEditor'))
const EMPTY_FILES: WorkspaceFile[] = []

const STAGE_LABELS: Record<RequirementStageId, string> = {
  analysis: '需求分析',
  design: '技术方案',
  implementation: '开发实现',
  testing: '测试验证',
  release: '发布上线',
  retrospective: '迭代复盘'
}

type OpenDocument = {
  file: WorkspaceFile
  draft: string
}

type ViewMode = 'edit' | 'preview'

type ArtifactWorkbenchProps = {
  requirementId: string
  activeStage?: RequirementStageId
  initialFiles?: WorkspaceFile[]
  workspaceApi?: WorkspaceApi
  onClose?: () => void
}

function defaultViewMode(file: WorkspaceFile): ViewMode {
  return ['markdown', 'html', 'image'].includes(file.kind) ? 'preview' : 'edit'
}

export default function ArtifactWorkbench({
  requirementId,
  activeStage,
  initialFiles = EMPTY_FILES,
  workspaceApi,
  onClose
}: ArtifactWorkbenchProps): JSX.Element {
  const api = workspaceApi ?? window.realmflow?.workspace
  const [binding, setBinding] = useState<WorkspaceBinding | null>(null)
  const [manifest, setManifest] = useState<RequirementManifest | null>(null)
  const [entriesByDirectory, setEntriesByDirectory] = useState<
    Record<string, WorkspaceEntry[]>
  >({})
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
    new Set()
  )
  const [documents, setDocuments] = useState<OpenDocument[]>([])
  const [activePath, setActivePath] = useState<string>()
  const [viewModes, setViewModes] = useState<Record<string, ViewMode>>({})
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const documentsRef = useRef<OpenDocument[]>([])

  const activeDocument = useMemo(
    () => documents.find((document) => document.file.path === activePath),
    [activePath, documents]
  )
  const activeMode = activePath ? viewModes[activePath] ?? 'edit' : 'edit'
  const dirty =
    activeDocument !== undefined &&
    activeDocument.draft !== activeDocument.file.content

  const loadWorkspace = useCallback(
    async (nextBinding: WorkspaceBinding): Promise<void> => {
      if (!api) return
      const [rootEntries, nextManifest] = await Promise.all([
        api.listDirectory(requirementId),
        api.readManifest(requirementId)
      ])
      setBinding(nextBinding)
      setEntriesByDirectory({ '': rootEntries })
      setExpandedDirectories(new Set())
      setManifest(nextManifest)
    },
    [api, requirementId]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setBinding(null)
    setManifest(null)
    setEntriesByDirectory({})
    documentsRef.current = []
    const initialDocuments = initialFiles.map((file) => ({
      file,
      draft: file.content
    }))
    documentsRef.current = initialDocuments
    setDocuments(initialDocuments)
    setActivePath(initialDocuments[0]?.file.path)
    setViewModes(
      Object.fromEntries(
        initialFiles.map((file) => [file.path, defaultViewMode(file)])
      )
    )

    if (!api) {
      setLoading(false)
      return
    }

    void api
      .getBinding(requirementId)
      .then(async (nextBinding) => {
        if (cancelled) return
        if (nextBinding) await loadWorkspace(nextBinding)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '无法加载工作目录')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [api, initialFiles, loadWorkspace, requirementId])

  const openFile = useCallback(
    async (path: string): Promise<void> => {
      if (!api) return
      const existingDocument = documentsRef.current.find(
        (document) => document.file.path === path
      )
      if (existingDocument) {
        setActivePath(path)
        return
      }

      setError('')
      try {
        const file = await api.readFile(requirementId, path)
        const nextDocuments = [
          ...documentsRef.current,
          { file, draft: file.content }
        ]
        documentsRef.current = nextDocuments
        setDocuments(nextDocuments)
        setActivePath(path)
        setViewModes((current) => ({
          ...current,
          [path]: defaultViewMode(file)
        }))
        if (file.kind === 'html' || file.kind === 'image') {
          const previewUrl = await api.getPreviewUrl(requirementId, path)
          setPreviewUrls((current) => ({ ...current, [path]: previewUrl }))
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '无法打开文件')
      }
    },
    [api, requirementId]
  )

  useEffect(() => {
    if (!activeStage) return
    const stageArtifacts = manifest?.stages[activeStage]?.artifacts ?? []
    const primaryArtifact =
      stageArtifacts.find((artifact) => artifact.primary) ?? stageArtifacts[0]
    if (primaryArtifact) void openFile(primaryArtifact.path)
  }, [activeStage, manifest, openFile])

  const chooseDirectory = async (): Promise<void> => {
    if (!api) return
    setError('')
    try {
      const nextBinding = await api.chooseDirectory(requirementId)
      if (nextBinding) await loadWorkspace(nextBinding)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法绑定本地目录')
    }
  }

  const toggleDirectory = async (path: string): Promise<void> => {
    if (!api) return
    if (expandedDirectories.has(path)) {
      setExpandedDirectories((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
      return
    }

    if (!entriesByDirectory[path]) {
      try {
        const entries = await api.listDirectory(requirementId, path)
        setEntriesByDirectory((current) => ({ ...current, [path]: entries }))
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '无法展开目录')
        return
      }
    }
    setExpandedDirectories((current) => new Set(current).add(path))
  }

  const saveActiveFile = useCallback(async (): Promise<void> => {
    if (!api || !activeDocument || !dirty || saving) return
    setSaving(true)
    setError('')
    try {
      const savedFile = await api.writeFile({
        requirementId,
        path: activeDocument.file.path,
        content: activeDocument.draft,
        expectedVersion: activeDocument.file.version
      })
      const nextDocuments = documentsRef.current.map((document) =>
          document.file.path === activeDocument.file.path
            ? { file: savedFile, draft: savedFile.content }
            : document
      )
      documentsRef.current = nextDocuments
      setDocuments(nextDocuments)
      setStatus('已保存')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法保存文件')
    } finally {
      setSaving(false)
    }
  }, [activeDocument, api, dirty, requirementId, saving])

  useEffect(() => {
    const saveOnShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveActiveFile()
      }
    }
    window.addEventListener('keydown', saveOnShortcut)
    return () => window.removeEventListener('keydown', saveOnShortcut)
  }, [saveActiveFile])

  const closeDocument = (path: string): void => {
    const document = documents.find((item) => item.file.path === path)
    if (
      document &&
      document.draft !== document.file.content &&
      !window.confirm(`“${document.file.name}”尚未保存，确定关闭吗？`)
    ) {
      return
    }
    const remainingDocuments = documentsRef.current.filter(
      (item) => item.file.path !== path
    )
    documentsRef.current = remainingDocuments
    setDocuments(remainingDocuments)
    if (activePath === path) {
      setActivePath(remainingDocuments.at(-1)?.file.path)
    }
  }

  const associateWithStage = async (): Promise<void> => {
    if (!api || !activeDocument || !manifest || !activeStage) return
    const existingArtifacts = manifest.stages[activeStage]?.artifacts ?? []
    const nextArtifacts = existingArtifacts
      .filter((artifact) => artifact.path !== activeDocument.file.path)
      .map((artifact) => ({ ...artifact, primary: false }))
    nextArtifacts.push({ path: activeDocument.file.path, primary: true })
    const nextManifest: RequirementManifest = {
      ...manifest,
      stages: {
        ...manifest.stages,
        [activeStage]: { artifacts: nextArtifacts }
      }
    }

    try {
      const savedManifest = await api.writeManifest(
        requirementId,
        nextManifest
      )
      setManifest(savedManifest)
      setStatus(`已关联到${STAGE_LABELS[activeStage]}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法关联阶段产物')
    }
  }

  if (loading) {
    return (
      <aside className="artifact-workbench artifact-workbench-loading">
        <LoaderCircle className="spinning" size={20} />
        <span>正在加载产物工作区</span>
      </aside>
    )
  }

  return (
    <aside className="artifact-workbench" aria-label="需求产物工作区">
      <header className="artifact-workbench-header">
        <div>
          <span>ARTIFACTS</span>
          <strong>产物工作区</strong>
        </div>
        <div className="artifact-workbench-header-actions">
          {binding ? (
            <button
              type="button"
              aria-label="在 Finder 中显示工作目录"
              title="在 Finder 中显示"
              onClick={() => void api?.showItem(requirementId, '')}
            >
              <FolderOpen size={16} />
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              aria-label="关闭产物工作区"
              title="关闭产物工作区"
              onClick={onClose}
            >
              <PanelRightClose size={16} />
            </button>
          ) : null}
        </div>
      </header>

      {!api ? (
        <div className="artifact-empty-state">
          <FolderOpen size={28} strokeWidth={1.5} />
          <strong>请在 RealmFlow 桌面端中打开</strong>
          <p>本地文件编辑能力仅在桌面应用中可用。</p>
        </div>
      ) : !binding ? (
        <div className="artifact-empty-state">
          <FolderOpen size={30} strokeWidth={1.5} />
          <strong>绑定需求工作目录</strong>
          <p>绑定后可浏览并编辑各阶段的本地产物。</p>
          <button type="button" onClick={() => void chooseDirectory()}>
            绑定本地目录
          </button>
        </div>
      ) : (
        <div className="artifact-workbench-body">
          <section className="artifact-file-browser" aria-label="文件列表">
            <div className="artifact-file-browser-heading">
              <span title={binding.rootPath}>{binding.rootName}</span>
              <button
                type="button"
                aria-label="更换本地目录"
                title="更换本地目录"
                onClick={() => void chooseDirectory()}
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <WorkspaceTree
              entriesByDirectory={entriesByDirectory}
              expandedDirectories={expandedDirectories}
              activePath={activePath}
              onToggleDirectory={(path) => void toggleDirectory(path)}
              onOpenFile={(path) => void openFile(path)}
            />
          </section>

          <section className="artifact-editor-pane">
            <div className="artifact-tabs" role="tablist" aria-label="打开的文件">
              {documents.map((document) => {
                const documentDirty =
                  document.draft !== document.file.content
                return (
                  <div
                    className={
                      document.file.path === activePath
                        ? 'artifact-tab active'
                        : 'artifact-tab'
                    }
                    key={document.file.path}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={document.file.path === activePath}
                      title={document.file.path}
                      onClick={() => setActivePath(document.file.path)}
                    >
                      {documentDirty ? <i /> : null}
                      <span>{document.file.name}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`关闭 ${document.file.name}`}
                      onClick={() => closeDocument(document.file.path)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>

            {activeDocument ? (
              <>
                <div className="artifact-editor-toolbar">
                  <div className="artifact-view-switch">
                    {['markdown', 'html'].includes(activeDocument.file.kind) ? (
                      <>
                        <button
                          className={activeMode === 'edit' ? 'active' : ''}
                          type="button"
                          aria-label="编辑文件"
                          onClick={() =>
                            setViewModes((current) => ({
                              ...current,
                              [activeDocument.file.path]: 'edit'
                            }))
                          }
                        >
                          <Code2 size={15} />
                          编辑
                        </button>
                        <button
                          className={activeMode === 'preview' ? 'active' : ''}
                          type="button"
                          aria-label="预览文件"
                          onClick={() =>
                            setViewModes((current) => ({
                              ...current,
                              [activeDocument.file.path]: 'preview'
                            }))
                          }
                        >
                          <Eye size={15} />
                          预览
                        </button>
                      </>
                    ) : null}
                  </div>
                  <div className="artifact-editor-actions">
                    {activeStage ? (
                      <button
                        type="button"
                        aria-label={`关联到${STAGE_LABELS[activeStage]}`}
                        title={`关联到${STAGE_LABELS[activeStage]}`}
                        onClick={() => void associateWithStage()}
                      >
                        <Link2 size={15} />
                        关联阶段
                      </button>
                    ) : null}
                    {activeDocument.file.kind !== 'image' ? (
                      <button
                        type="button"
                        aria-label="保存文件"
                        title="保存文件"
                        disabled={!dirty || saving}
                        onClick={() => void saveActiveFile()}
                      >
                        {saving ? (
                          <LoaderCircle className="spinning" size={15} />
                        ) : status === '已保存' && !dirty ? (
                          <Check size={15} />
                        ) : (
                          <Save size={15} />
                        )}
                        保存
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="artifact-editor-content">
                  {activeDocument.file.kind === 'markdown' &&
                  activeMode === 'preview' ? (
                    <article className="artifact-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                      >
                        {activeDocument.draft}
                      </ReactMarkdown>
                    </article>
                  ) : activeDocument.file.kind === 'html' &&
                    activeMode === 'preview' ? (
                    <iframe
                      title={`HTML 预览: ${activeDocument.file.name}`}
                      sandbox=""
                      src={previewUrls[activeDocument.file.path]}
                    />
                  ) : activeDocument.file.kind === 'image' ? (
                    <div className="artifact-image-preview">
                      <img
                        src={previewUrls[activeDocument.file.path]}
                        alt={activeDocument.file.name}
                      />
                    </div>
                  ) : (
                    <Suspense
                      fallback={
                        <div className="artifact-editor-loading">
                          正在加载编辑器
                        </div>
                      }
                    >
                      <CodeEditor
                        language={activeDocument.file.language}
                        path={activeDocument.file.path}
                        value={activeDocument.draft}
                        onChange={(value) => {
                          setStatus('')
                          const nextDocuments = documentsRef.current.map(
                            (document) =>
                              document.file.path === activeDocument.file.path
                                ? { ...document, draft: value }
                                : document
                          )
                          documentsRef.current = nextDocuments
                          setDocuments(nextDocuments)
                        }}
                      />
                    </Suspense>
                  )}
                </div>
              </>
            ) : (
              <div className="artifact-editor-empty">
                <Code2 size={26} strokeWidth={1.5} />
                <strong>选择一个文件开始工作</strong>
                {activeStage ? <p>当前阶段：{STAGE_LABELS[activeStage]}</p> : null}
              </div>
            )}
          </section>
        </div>
      )}

      {error ? (
        <div className="artifact-message error" role="alert">
          {error}
        </div>
      ) : status ? (
        <div className="artifact-message" role="status">
          {status}
        </div>
      ) : null}
    </aside>
  )
}
