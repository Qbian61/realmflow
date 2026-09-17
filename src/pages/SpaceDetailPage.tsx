import {
  BookOpen,
  Boxes,
  ExternalLink,
  File,
  FileCode2,
  GitBranch,
  Plus,
  Search,
  Trash2,
  Upload
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import type { RealmFlowApi } from '../../shared/types'
import type { BusinessApi } from '../../shared/business'
import type { OpenedSessionFiles } from '../../shared/workspace'
import { Composer } from '../components/Composer'
import type { SpaceResourceRepository } from '../application/ports/repositories'
import type {
  SpaceResource,
  SpaceResourceStore,
  SpaceResourceType
} from '../domain/space-resource'
import type { RequirementStageId } from '../domain/requirement'
import type {
  WorkspaceRequirement,
  WorkspaceSpace
} from '../domain/workspace'
import {
  formatResourceUpdatedAt,
  mapBusinessResource,
  mapLocalFileResource
} from '../features/resources/space-resource-mappers'
import { useWorkbench } from '../features/workbench/WorkbenchProvider'

type ResourceDialog = Exclude<SpaceResourceType, 'file'> | null

type SpaceDetailPageProps = {
  spaces: WorkspaceSpace[]
  requirementsBySpace: Record<string, WorkspaceRequirement[]>
  resourceRepository: SpaceResourceRepository
  api?: RealmFlowApi
  business?: BusinessApi
  onCreateSession?: (spacePath: string, prompt: string) => void
}

const stageLabels: Record<RequirementStageId, string> = {
  analysis: '需求分析',
  design: '技术方案',
  implementation: '开发实现',
  testing: '测试验证',
  release: '发布上线',
  retrospective: '迭代复盘'
}

const resourceLabels: Record<SpaceResourceType, string> = {
  file: '本地文件',
  document: '在线文档',
  repository: '代码仓库'
}

export default function SpaceDetailPage({
  spaces,
  requirementsBySpace,
  resourceRepository,
  api = window.realmflow,
  business = window.realmflow?.business,
  onCreateSession
}: SpaceDetailPageProps): JSX.Element {
  const { spaceId } = useParams()
  const spacePath = `/spaces/${spaceId ?? ''}`
  const space = spaces.find((item) => item.path === spacePath)
  const requirements = requirementsBySpace[spacePath] ?? []
  const workbench = useWorkbench()
  const [activeTab, setActiveTab] = useState<'overview' | 'resources'>('overview')
  const [prompt, setPrompt] = useState('')
  const [submittedPrompt, setSubmittedPrompt] = useState('')
  const [initialResourceSnapshot] = useState(resourceRepository.getSnapshot)
  const [resourceStore, setResourceStore] = useState<SpaceResourceStore>(() =>
    business ? { resourcesBySpace: {} } : initialResourceSnapshot.value
  )
  const [resourceDialog, setResourceDialog] = useState<ResourceDialog>(null)
  const [resourceName, setResourceName] = useState('')
  const [resourceLocator, setResourceLocator] = useState('')
  const [resourceError, setResourceError] = useState('')
  const [resourceFilter, setResourceFilter] = useState<
    'all' | SpaceResourceType
  >('all')
  const [resourceSearch, setResourceSearch] = useState('')
  const [
    resourcePersistenceUnavailable,
    setResourcePersistenceUnavailable
  ] = useState(false)
  const resourceRevisionRef = useRef(initialResourceSnapshot.revision)
  const skipNextResourceSaveRef = useRef(true)
  const resourceSaveQueueRef = useRef<Promise<void> | null>(null)
  const sessionFilesRef = useRef(new Map<string, OpenedSessionFiles>())
  const resources = resourceStore.resourcesBySpace[spacePath] ?? []

  useEffect(() => {
    if (!business || !space?.id) return
    let disposed = false
    void business
      .listSpaceResources({ workspaceId: space.id })
      .then((items) => {
        if (disposed) return
        setResourceStore({
          resourcesBySpace: {
            [spacePath]: items.map(mapBusinessResource)
          }
        })
        setResourcePersistenceUnavailable(false)
      })
      .catch(() => {
        if (!disposed) setResourcePersistenceUnavailable(true)
      })
    return () => {
      disposed = true
    }
  }, [business, space?.id, spacePath])

  useEffect(() => {
    if (business) return
    if (skipNextResourceSaveRef.current) {
      skipNextResourceSaveRef.current = false
      return
    }
    const applySaveResult = (
      result: Awaited<ReturnType<SpaceResourceRepository['save']>>
    ): void => {
      if (result.status === 'saved') {
        setResourcePersistenceUnavailable(false)
        resourceRevisionRef.current = result.snapshot.revision
      } else if (result.status === 'conflict') {
        setResourcePersistenceUnavailable(false)
        resourceRevisionRef.current = result.snapshot.revision
        skipNextResourceSaveRef.current = true
        setResourceStore(result.snapshot.value)
      } else {
        setResourcePersistenceUnavailable(true)
      }
    }
    const saveResources = async (): Promise<void> => {
      applySaveResult(
        await resourceRepository.save(
          resourceStore,
          resourceRevisionRef.current
        )
      )
    }
    const previousSave = resourceSaveQueueRef.current
    const queuedSave = previousSave
      ? previousSave.then(saveResources)
      : saveResources()
    resourceSaveQueueRef.current = queuedSave
    void queuedSave.then(
      () => {
        if (resourceSaveQueueRef.current === queuedSave) {
          resourceSaveQueueRef.current = null
        }
      },
      () => {
        if (resourceSaveQueueRef.current === queuedSave) {
          resourceSaveQueueRef.current = null
        }
        setResourcePersistenceUnavailable(true)
      }
    )
  }, [business, resourceRepository, resourceStore])

  useEffect(
    () => {
      if (business) return
      return resourceRepository.subscribe?.(() => {
        const snapshot = resourceRepository.getSnapshot()
        setResourcePersistenceUnavailable(false)
        resourceRevisionRef.current = snapshot.revision
        skipNextResourceSaveRef.current = true
        setResourceStore(snapshot.value)
      })
    },
    [business, resourceRepository]
  )

  const stageCounts = useMemo(() => {
    const counts = new Map<RequirementStageId, number>()
    for (const requirement of requirements) {
      const stage = requirement.stage ?? 'analysis'
      counts.set(stage, (counts.get(stage) ?? 0) + 1)
    }
    return counts
  }, [requirements])

  const filteredResources = useMemo(() => {
    const query = resourceSearch.trim().toLowerCase()
    return resources.filter(
      (resource) =>
        (resourceFilter === 'all' || resource.type === resourceFilter) &&
        (!query ||
          `${resource.name} ${resource.detail} ${resource.locator}`
            .toLowerCase()
            .includes(query))
    )
  }, [resourceFilter, resourceSearch, resources])

  if (!space) return <Navigate to="/chat/new" replace />

  const updateSpaceResources = (
    update: (resources: SpaceResource[]) => SpaceResource[]
  ): void => {
    setResourceStore((current) => ({
      resourcesBySpace: {
        ...current.resourcesBySpace,
        [spacePath]: update(current.resourcesBySpace[spacePath] ?? [])
      }
    }))
  }

  const saveBusinessResource = (resource: SpaceResource): void => {
    if (!business || !space?.id) return
    const existing = resources.find((item) => item.id === resource.id)
    const now = Date.now()
    void business
      .saveSpaceResource({
        id: resource.id,
        workspaceId: space.id,
        name: resource.name,
        type: resource.type,
        locator: resource.locator,
        detail: resource.detail,
        sortOrder: existing?.sortOrder ?? resources.length,
        expectedRevision: existing?.revision ?? 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      })
      .then((saved) => {
        updateSpaceResources((current) => [
          mapBusinessResource(saved),
          ...current.filter((item) => item.id !== saved.id)
        ])
        setResourcePersistenceUnavailable(false)
      })
      .catch(() => setResourcePersistenceUnavailable(true))
  }

  const addLocalFiles = async (): Promise<void> => {
    const selection = await api?.workspace.chooseFiles()
    if (!selection) return
    const additions = selection.files.map((file, index) => {
      const resource = mapLocalFileResource(selection, file, index)
      sessionFilesRef.current.set(resource.id, {
        binding: selection.binding,
        files: [file]
      })
      return resource
    })
    updateSpaceResources((current) => [...additions, ...current])
    additions.forEach(saveBusinessResource)
  }

  const openResource = async (resource: SpaceResource): Promise<void> => {
    if (resource.type !== 'file') {
      await workbench.openUrl(resource.locator)
      return
    }
    const selection = sessionFilesRef.current.get(resource.id)
    if (selection) {
      workbench.openWorkspaceSelection(selection)
      return
    }
    await addLocalFiles()
  }

  const closeResourceDialog = (): void => {
    setResourceDialog(null)
    setResourceName('')
    setResourceLocator('')
    setResourceError('')
  }

  const submitResource = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!resourceDialog) return
    const name = resourceName.trim()
    const locator = resourceLocator.trim()
    if (!name || !locator) return
    try {
      const url = new URL(
        /^[A-Za-z][A-Za-z\d+.-]*:/.test(locator)
          ? locator
          : `https://${locator}`
      )
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('unsupported protocol')
      }
      const resource = {
          id: `${resourceDialog}-${Date.now()}`,
          name,
          type: resourceDialog,
          locator: url.toString(),
          detail: url.host,
          updatedAt: Date.now()
        }
      updateSpaceResources((current) => [resource, ...current])
      saveBusinessResource(resource)
      closeResourceDialog()
    } catch {
      setResourceError('请输入有效的 HTTP 或 HTTPS 地址')
    }
  }

  const completedCount = requirements.filter(
    (requirement) => requirement.status === 'completed'
  ).length
  const pendingCount = requirements.filter(
    (requirement) => requirement.status === 'pending'
  ).length
  const activeCount = requirements.length - completedCount - pendingCount

  return (
    <main
      className={
        resourcePersistenceUnavailable
          ? 'space-detail-page has-persistence-issue'
          : 'space-detail-page'
      }
    >
      <div className="space-detail-tabs" role="tablist" aria-label="空间详情">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
        >
          {space.label} ({requirements.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'resources'}
          onClick={() => setActiveTab('resources')}
        >
          空间知识库 ({resources.length})
        </button>
      </div>

      {resourcePersistenceUnavailable ? (
        <div
          className="persistence-notice"
          role="status"
          aria-label="空间资源存储状态"
        >
          空间资源的更改暂时无法保存，请检查本地存储权限或可用空间。
        </div>
      ) : null}

      {activeTab === 'overview' ? (
        <div className="space-detail-scroll">
          <div className="space-detail-content">
            <section className="space-chat" aria-label="空间新建对话">
              <Composer
                value={prompt}
                placeholder="描述新的需求、任务或问题，开始当前空间中的对话。"
                labels={{
                  textarea: '空间对话内容',
                  model: '空间对话模型',
                  workspace: '当前空间',
                  permission: '空间权限模式',
                  submit: '发送空间消息',
                  menu: '空间添加内容',
                  openMenu: '打开空间添加菜单',
                  closeMenu: '关闭空间添加菜单'
                }}
                insertions={{
                  mode: '使用合适的执行模式完成：',
                  skill: '调用技能：',
                  connector: '使用连接器：'
                }}
                fileInputId={`space-attachment-${spaceId ?? 'unknown'}`}
                showContext={false}
                onChange={setPrompt}
                onSubmit={() => {
                  const value = prompt.trim()
                  if (!value) return
                  setSubmittedPrompt(value)
                  onCreateSession?.(spacePath, value)
                  setPrompt('')
                }}
              />
              <p className="sr-only" aria-live="polite">
                {submittedPrompt ? `已准备处理：${submittedPrompt}` : ''}
              </p>
            </section>

            <section className="space-requirement-statistics" aria-label="需求统计">
              <div className="space-statistics-summary">
                <div><strong>{requirements.length}</strong><span>全部需求</span></div>
                <div><strong>{activeCount}</strong><span>进行中</span></div>
                <div><strong>{completedCount}</strong><span>已完成</span></div>
                <div><strong>{pendingCount}</strong><span>待处理</span></div>
              </div>

              <div className="space-statistics-grid">
                <section>
                  <header><h2>研发阶段分布</h2><span>共 {requirements.length} 个需求</span></header>
                  <div className="space-stage-list">
                    {(Object.keys(stageLabels) as RequirementStageId[]).map(
                      (stage) => {
                        const count = stageCounts.get(stage) ?? 0
                        const width =
                          requirements.length === 0
                            ? 0
                            : Math.round((count / requirements.length) * 100)
                        return (
                          <div className="space-stage-row" key={stage}>
                            <span>{stageLabels[stage]}</span>
                            <i><b style={{ width: `${width}%` }} /></i>
                            <strong>{count}</strong>
                          </div>
                        )
                      }
                    )}
                  </div>
                </section>

                <section>
                  <header><h2>当前空间需求</h2><span>按最近更新排序</span></header>
                  {requirements.length > 0 ? (
                    <div className="space-requirement-table" role="table">
                      <div role="row">
                        <span role="columnheader">需求</span>
                        <span role="columnheader">当前阶段</span>
                        <span role="columnheader">更新时间</span>
                      </div>
                      {requirements.map((requirement) => (
                        <a
                          href={`#${space.path}/requirements/${requirement.id}`}
                          role="row"
                          key={requirement.id}
                        >
                          <strong role="cell">{requirement.title}</strong>
                          <span role="cell">
                            {stageLabels[requirement.stage ?? 'analysis']}
                          </span>
                          <span role="cell">
                            {formatResourceUpdatedAt(requirement.updatedAt)}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="space-empty-block">
                      <Boxes size={20} />
                      <span>当前空间暂无需求</span>
                    </div>
                  )}
                </section>
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="space-detail-scroll">
          <div className="space-detail-content">
            <section className="space-resource-section" aria-label="空间资源">
              <header className="space-resource-header">
                <div>
                  <p>集中管理当前空间使用的本地文件、在线文档和代码仓库。</p>
                </div>
                <div className="space-resource-actions">
                  <button
                    className="primary"
                    type="button"
                    onClick={() => void addLocalFiles()}
                  >
                    <Upload size={15} />
                    上传本地文件
                  </button>
                  <button type="button" onClick={() => setResourceDialog('document')}>
                    <BookOpen size={15} />
                    添加在线文档
                  </button>
                  <button
                    type="button"
                    onClick={() => setResourceDialog('repository')}
                  >
                    <GitBranch size={15} />
                    关联代码仓库
                  </button>
                </div>
              </header>

              <div className="space-resource-toolbar">
                <div role="group" aria-label="资源类型筛选">
                  {(
                    [
                      ['all', '全部'],
                      ['file', '本地文件'],
                      ['document', '在线文档'],
                      ['repository', '代码仓库']
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      className={resourceFilter === value ? 'active' : ''}
                      type="button"
                      aria-pressed={resourceFilter === value}
                      key={value}
                      onClick={() => setResourceFilter(value)}
                    >
                      {label}
                      <span>
                        {value === 'all'
                          ? resources.length
                          : resources.filter((item) => item.type === value).length}
                      </span>
                    </button>
                  ))}
                </div>
                <label>
                  <Search size={14} />
                  <input
                    type="search"
                    aria-label="搜索空间资源"
                    placeholder="搜索资源"
                    value={resourceSearch}
                    onChange={(event) => setResourceSearch(event.target.value)}
                  />
                </label>
              </div>

              {filteredResources.length > 0 ? (
                <div className="space-resource-table" role="table">
                  <div role="row">
                    <span role="columnheader">资源名称</span>
                    <span role="columnheader">类型</span>
                    <span role="columnheader">关联信息</span>
                    <span role="columnheader">更新时间</span>
                    <span aria-hidden="true" />
                  </div>
                  {filteredResources.map((resource) => {
                    const ResourceIcon =
                      resource.type === 'file'
                        ? File
                        : resource.type === 'repository'
                          ? FileCode2
                          : BookOpen
                    return (
                      <div role="row" key={resource.id}>
                        <div role="cell">
                          <button
                            className="space-resource-name"
                            type="button"
                            aria-label={`打开 ${resource.name}`}
                            onClick={() => void openResource(resource)}
                          >
                            <span><ResourceIcon size={15} /></span>
                            <span><strong>{resource.name}</strong><small>{resource.locator}</small></span>
                          </button>
                        </div>
                        <span role="cell">{resourceLabels[resource.type]}</span>
                        <span role="cell">{resource.detail}</span>
                        <span role="cell">
                          {formatResourceUpdatedAt(resource.updatedAt)}
                        </span>
                        <button
                          type="button"
                          aria-label={`删除 ${resource.name}`}
                          title={`删除 ${resource.name}`}
                          onClick={() =>
                            {
                              updateSpaceResources((current) =>
                                current.filter((item) => item.id !== resource.id)
                              )
                              if (
                                business &&
                                resource.revision !== undefined
                              ) {
                                void business
                                  .deleteSpaceResource({
                                    id: resource.id,
                                    expectedRevision: resource.revision
                                  })
                                  .catch(() =>
                                    setResourcePersistenceUnavailable(true)
                                  )
                              }
                            }
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-empty-block">
                  <File size={21} />
                  <strong>暂无匹配的空间资源</strong>
                  <span>上传文件或关联在线资料后，将在这里统一管理。</span>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {resourceDialog ? (
        <div
          className="space-resource-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeResourceDialog()
          }}
        >
          <form
            className="space-resource-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="space-resource-dialog-title"
            onSubmit={submitResource}
          >
            <header>
              {resourceDialog === 'document' ? (
                <BookOpen size={18} />
              ) : (
                <GitBranch size={18} />
              )}
              <h2 id="space-resource-dialog-title">
                {resourceDialog === 'document'
                  ? '添加在线文档'
                  : '关联代码仓库'}
              </h2>
            </header>
            <label>
              资源名称
              <input
                autoFocus
                aria-label="资源名称"
                value={resourceName}
                onChange={(event) => setResourceName(event.target.value)}
              />
            </label>
            <label>
              {resourceDialog === 'document' ? '文档地址' : '仓库地址'}
              <input
                aria-label={
                  resourceDialog === 'document' ? '文档地址' : '仓库地址'
                }
                value={resourceLocator}
                placeholder="https://"
                onChange={(event) => {
                  setResourceLocator(event.target.value)
                  setResourceError('')
                }}
              />
            </label>
            {resourceError ? <p role="alert">{resourceError}</p> : null}
            <footer>
              <button type="button" onClick={closeResourceDialog}>取消</button>
              <button
                className="primary"
                type="submit"
                disabled={!resourceName.trim() || !resourceLocator.trim()}
              >
                <Plus size={14} />
                确认添加
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  )
}
