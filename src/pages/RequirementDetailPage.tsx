import {
  Braces,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  FlaskConical,
  LoaderCircle,
  RefreshCw,
  Rocket,
  Plus,
  Trash2,
  Pause,
  Play,
  Sparkles,
  Square
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import type { AiRunController } from '../app/hooks/use-ai-run-controller'
import type {
  RequirementNode,
  RequirementWorkflow
} from '../../domain/workflow'
import type { WorkspaceRequirement, WorkspaceSpace } from '../domain/workspace'
import type {
  NodeQuestionDto,
  NodeTodoDto,
  ResolveWorkflowNodeGateCommand,
  WorkflowNodeExecutionDto
} from '../../shared/business'
import { useWorkbench } from '../features/workbench/WorkbenchProvider'
import { NodeGateActions } from '../features/workflow/NodeGateActions'
import {
  legacyStageFromNodeId,
  nodeStatusLabel,
  runStatusLabel,
  selectedWorkflowNodeId
} from '../features/workflow/workflow-view'
import { useModelProfiles } from '../app/hooks/use-model-profiles'
import { useNodeRunSynchronization } from '../app/hooks/use-node-run-synchronization'

type RequirementDetailPageProps = {
  spaces: WorkspaceSpace[]
  requirementsBySpace: Record<string, WorkspaceRequirement[]>
  aiRuns: AiRunController
}

const lifecycleStages = [
  { id: 'analysis', label: '需求分析', status: '当前阶段', icon: FileSearch },
  { id: 'design', label: '技术方案', status: '待开始', icon: ClipboardCheck },
  { id: 'implementation', label: '开发实现', status: '待开始', icon: Braces },
  { id: 'testing', label: '测试验证', status: '待开始', icon: FlaskConical },
  { id: 'release', label: '发布上线', status: '待开始', icon: Rocket },
  {
    id: 'retrospective',
    label: '迭代复盘',
    status: '待开始',
    icon: RefreshCw
  }
] as const

export default function RequirementDetailPage({
  spaces,
  requirementsBySpace,
  aiRuns
}: RequirementDetailPageProps): JSX.Element {
  const { spaceId, requirementId } = useParams()
  const spacePath = `/spaces/${spaceId ?? ''}`
  const space = spaces.find((item) => item.path === spacePath)
  const requirement = requirementsBySpace[spacePath]?.find(
    (item) => item.id === requirementId
  )
  const [activeStage, setActiveStage] = useState<string>('analysis')
  const [workflow, setWorkflow] = useState<RequirementWorkflow>()
  const [nodeExecution, setNodeExecution] = useState<WorkflowNodeExecutionDto>()
  const [nodeTodos, setNodeTodos] = useState<NodeTodoDto[]>([])
  const [nodeQuestions, setNodeQuestions] = useState<NodeQuestionDto[]>([])
  const [questionAnswers, setQuestionAnswers] = useState<
    Record<string, string>
  >({})
  const [addingNode, setAddingNode] = useState(false)
  const [nodeName, setNodeName] = useState('')
  const [gatePending, setGatePending] = useState(false)
  const workbench = useWorkbench()
  const models = useModelProfiles()

  useEffect(() => {
    if (!requirementId || !window.realmflow?.business) return
    let disposed = false
    void window.realmflow.business
      .getRequirementWorkflow({ requirementId })
      .then((nextWorkflow) => {
        if (disposed || !nextWorkflow) return
        setWorkflow(nextWorkflow)
        setActiveStage((current) =>
          nextWorkflow.nodes.some((node) => node.id === current)
            ? current
            : (nextWorkflow.nodes[0]?.id ?? current)
        )
      })
    return () => {
      disposed = true
    }
  }, [requirementId])

  useEffect(() => {
    if (
      !requirementId ||
      !selectedWorkflowNodeId(workflow, activeStage) ||
      !window.realmflow?.business
    ) {
      setNodeExecution(undefined)
      return
    }
    let disposed = false
    void window.realmflow.business
      .getWorkflowNodeExecution({
        requirementId,
        nodeId: selectedWorkflowNodeId(workflow, activeStage) as string
      })
      .then((execution) => {
        if (!disposed) setNodeExecution(execution)
      })
    return () => {
      disposed = true
    }
  }, [activeStage, requirementId, workflow])

  useEffect(() => {
    const business = window.realmflow?.business
    const nodeRunId = nodeExecution?.nodeRun.id
    if (
      !business ||
      !nodeRunId ||
      typeof business.listNodeTodos !== 'function' ||
      typeof business.listNodeQuestions !== 'function'
    ) {
      setNodeTodos([])
      setNodeQuestions([])
      return
    }
    let disposed = false
    void Promise.all([
      business.listNodeTodos({ nodeRunId }),
      business.listNodeQuestions({ nodeRunId })
    ]).then(([todos, questions]) => {
      if (disposed) return
      setNodeTodos(todos)
      setNodeQuestions(questions)
      setQuestionAnswers(
        Object.fromEntries(
          questions
            .filter((question) => question.answer)
            .map((question) => [question.id, question.answer as string])
        )
      )
    })
    return () => {
      disposed = true
    }
  }, [nodeExecution?.nodeRun.id])

  useNodeRunSynchronization({
    requirementId,
    nodeExecution,
    aiRuns,
    setWorkflow,
    setNodeExecution
  })

  if (!space || !requirement) {
    return <Navigate to="/chat/new" replace />
  }
  const displayNodes: RequirementNode[] =
    workflow?.nodes ??
    lifecycleStages.map((stage, order) => ({
      id: stage.id,
      type: 'ai_generate',
      name: stage.label,
      description: '',
      order,
      status: order === 0 ? 'ready' : 'pending',
      allowSkip: false
    }))
  const selectedNode =
    displayNodes.find((node) => node.id === activeStage) ?? displayNodes[0]
  const selectedLegacyStage = selectedNode
    ? legacyStageFromNodeId(selectedNode.id)
    : undefined
  const activeRun = selectedNode
    ? aiRuns.findRun(requirement.id, selectedNode.id)
    : undefined
  const running =
    activeRun?.status === 'created' ||
    activeRun?.status === 'running' ||
    activeRun?.status === 'cancelling'
  const resolveGate = async (
    gate: ResolveWorkflowNodeGateCommand['gate']
  ): Promise<void> => {
    const business = window.realmflow?.business
    if (!business || !nodeExecution || !selectedNode) return
    setGatePending(true)
    try {
      const nextWorkflow = await business.resolveWorkflowNodeGate({
        requirementId: requirement.id,
        nodeRunId: nodeExecution.nodeRun.id,
        expectedNodeRunRevision: nodeExecution.nodeRun.revision,
        gate
      })
      setWorkflow(nextWorkflow)
      const nextExecution = await business.getWorkflowNodeExecution({
        requirementId: requirement.id,
        nodeId: selectedNode.id
      })
      setNodeExecution(nextExecution)
    } finally {
      setGatePending(false)
    }
  }

  return (
    <main className="requirement-detail-page">
      <div className="requirement-detail-content">
        <header className="requirement-detail-header">
          <div className="requirement-breadcrumb" aria-label="需求路径">
            <span>{space.label}</span>
            <ChevronRight size={14} />
            <span>需求详情</span>
          </div>
          <div className="requirement-title-row">
            <div>
              <span className="requirement-status">进行中</span>
              <h1>{requirement.title}</h1>
            </div>
            <div className="requirement-title-actions">
              <span className="requirement-stage">{selectedNode?.name}</span>
            </div>
          </div>
        </header>

        <section
          className="requirement-overview"
          aria-labelledby="requirement-overview-title"
        >
          <div>
            <span>所属空间</span>
            <strong>{space.label}</strong>
          </div>
          <div>
            <span>当前阶段</span>
            <strong>{selectedNode?.name}</strong>
          </div>
          <div>
            <span>交付状态</span>
            <strong>规划中</strong>
          </div>
        </section>

        <section
          className="requirement-brief"
          aria-labelledby="requirement-overview-title"
        >
          <h2 id="requirement-overview-title">需求概述</h2>
          <p>待补充本需求的目标、范围与验收标准。</p>
        </section>

        <section
          className="development-flow"
          aria-labelledby="development-flow-title"
        >
          <div className="development-flow-heading">
            <div>
              <span>DELIVERY PIPELINE</span>
              <h2 id="development-flow-title">软件全流程开发</h2>
            </div>
            <div className="requirement-flow-actions">
              <strong>
                {Math.max(
                  1,
                  displayNodes.findIndex(
                    (node) => node.id === selectedNode?.id
                  ) + 1
                )}{' '}
                / {displayNodes.length}
              </strong>
              {workflow ? (
                <button
                  type="button"
                  aria-label="插入流程节点"
                  title="插入流程节点"
                  onClick={() => setAddingNode(true)}
                >
                  <Plus size={15} />
                </button>
              ) : null}
            </div>
          </div>
          {addingNode && workflow ? (
            <form
              className="workflow-node-editor"
              onSubmit={(event) => {
                event.preventDefault()
                const name = nodeName.trim()
                if (!name) return
                const nodeId = `${requirement.id}:custom:${crypto.randomUUID()}`
                void window.realmflow?.business
                  .insertWorkflowNode({
                    requirementId: requirement.id,
                    expectedRevision: workflow.revision,
                    node: {
                      id: nodeId,
                      type: 'ai_generate',
                      name,
                      description: '',
                      order: displayNodes.length,
                      status: 'pending',
                      allowSkip: true,
                      executor: {
                        kind: 'ai_generate',
                        prompt: `请生成“${name}”节点的交付产物。`,
                        artifact: {
                          relativePath: `artifacts/${nodeId.split(':').at(-1)}.md`,
                          kind: 'markdown'
                        }
                      }
                    },
                    ...(selectedNode ? { afterNodeId: selectedNode.id } : {})
                  })
                  .then((next) => {
                    setWorkflow(next)
                    setNodeName('')
                    setAddingNode(false)
                  })
              }}
            >
              <input
                autoFocus
                aria-label="节点名称"
                placeholder="节点名称"
                value={nodeName}
                onChange={(event) => setNodeName(event.target.value)}
              />
              <button type="submit" disabled={!nodeName.trim()}>
                添加
              </button>
              <button type="button" onClick={() => setAddingNode(false)}>
                取消
              </button>
            </form>
          ) : null}
          <ol className="development-flow-track">
            {displayNodes.map((node, index) => {
              const Icon = iconForNode(node)
              const legacyStage = legacyStageFromNodeId(node.id)
              return (
                <li
                  className={[
                    ['ready', 'running'].includes(node.status) ? 'current' : '',
                    activeStage === node.id ? 'selected' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={node.id}
                >
                  <button
                    type="button"
                    aria-label={`打开${node.name}阶段`}
                    aria-pressed={activeStage === node.id}
                    onClick={() => {
                      setActiveStage(node.id)
                      if (legacyStage) {
                        workbench.openRequirementArtifact(
                          requirement.id,
                          legacyStage,
                          requirement.title
                        )
                      }
                    }}
                  >
                    <div className="development-flow-node">
                      <Icon size={18} strokeWidth={1.8} />
                    </div>
                    <div className="development-flow-copy">
                      <strong>{node.name}</strong>
                      <span>{nodeStatusLabel(node.status)}</span>
                    </div>
                  </button>
                  {workflow &&
                  !['running', 'completed', 'skipped'].includes(node.status) ? (
                    <button
                      type="button"
                      className="workflow-node-delete"
                      aria-label={`删除${node.name}节点`}
                      title={`删除${node.name}节点`}
                      onClick={() =>
                        void window.realmflow?.business
                          .removeWorkflowNode({
                            requirementId: requirement.id,
                            expectedRevision: workflow.revision,
                            nodeId: node.id
                          })
                          .then(setWorkflow)
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ol>
          <div className="stage-run-panel" aria-live="polite">
            <div className="stage-run-heading">
              <div>
                <span>阶段产物</span>
                <strong>{selectedNode?.name}</strong>
              </div>
              {selectedNode?.type === 'ai_generate' ? (
                <label className="select-control model-control">
                  <select
                    aria-label="阶段生成模型"
                    value={models.selectedId}
                    onChange={(event) => models.select(event.target.value)}
                  >
                    {models.options.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
              ) : null}
              <NodeGateActions
                node={selectedNode}
                disabled={!nodeExecution || gatePending}
                onResolve={resolveGate}
              />
              {workflow && selectedNode?.status === 'paused' ? (
                <button
                  type="button"
                  className="stage-run-start"
                  aria-label="继续节点"
                  disabled={!nodeExecution}
                  onClick={() =>
                    nodeExecution
                      ? void window.realmflow?.business
                          .resumeWorkflowNode({
                            requirementId: requirement.id,
                            nodeRunId: nodeExecution.nodeRun.id,
                            expectedWorkflowRevision: workflow.revision,
                            expectedNodeRunRevision:
                              nodeExecution.nodeRun.revision,
                            ...(models.selectedId
                              ? { modelProfileId: models.selectedId }
                              : {})
                          })
                          .then(setWorkflow)
                      : undefined
                  }
                >
                  <Play size={14} />
                  继续
                </button>
              ) : running && activeRun ? (
                <button
                  type="button"
                  className="stage-run-cancel"
                  aria-label="取消生成"
                  disabled={activeRun.status === 'cancelling'}
                  onClick={() => void aiRuns.cancel(activeRun.runId)}
                >
                  <Square size={13} />
                  {activeRun.status === 'cancelling' ? '正在取消' : '取消'}
                </button>
              ) : selectedNode?.type === 'ai_generate' &&
                (selectedNode.executor || selectedLegacyStage) ? (
                <button
                  type="button"
                  className="stage-run-start"
                  aria-label={`生成${selectedNode?.name}产物`}
                  onClick={() => {
                    if (nodeExecution && selectedNode.executor) {
                      void aiRuns.start({
                        requirementId: requirement.id,
                        nodeId: selectedNode.id,
                        nodeRunId: nodeExecution.nodeRun.id,
                        ...(models.selectedId
                          ? { modelProfileId: models.selectedId }
                          : {})
                      })
                      return
                    }
                    if (selectedLegacyStage) {
                      void aiRuns.start({
                        requirementId: requirement.id,
                        stageId: selectedLegacyStage,
                        ...(models.selectedId
                          ? { modelProfileId: models.selectedId }
                          : {})
                      })
                    }
                  }}
                >
                  <Sparkles size={15} />
                  生成产物
                </button>
              ) : null}
              {workflow &&
              selectedNode &&
              selectedNode.type === 'ai_generate' &&
              ['ready', 'running'].includes(selectedNode.status) ? (
                <button
                  type="button"
                  className="stage-run-cancel"
                  aria-label="暂停节点"
                  disabled={!nodeExecution}
                  onClick={() =>
                    nodeExecution
                      ? void window.realmflow?.business
                          .pauseWorkflowNode({
                            requirementId: requirement.id,
                            nodeRunId: nodeExecution.nodeRun.id,
                            expectedWorkflowRevision: workflow.revision,
                            expectedNodeRunRevision:
                              nodeExecution.nodeRun.revision
                          })
                          .then(setWorkflow)
                      : undefined
                  }
                >
                  <Pause size={13} />
                  暂停
                </button>
              ) : null}
            </div>
            {activeRun ? (
              <div className={`stage-run-state ${activeRun.status}`}>
                <div className="stage-run-progress">
                  <div>
                    {running ? (
                      <LoaderCircle className="spinning" size={14} />
                    ) : null}
                    <span>{runStatusLabel(activeRun.status)}</span>
                  </div>
                  <strong>{activeRun.progress}%</strong>
                </div>
                <progress max={100} value={activeRun.progress} />
                {activeRun.content ? <pre>{activeRun.content}</pre> : null}
                {activeRun.error ? <p role="alert">{activeRun.error}</p> : null}
              </div>
            ) : (
              <p className="stage-run-empty">
                生成内容将在此处实时显示，完成校验后写入产物工作区。
              </p>
            )}
            {nodeTodos.length > 0 || nodeQuestions.length > 0 ? (
              <div className="node-work-items">
                {nodeTodos.length > 0 ? (
                  <section aria-labelledby="node-todos-title">
                    <h3 id="node-todos-title">节点待办</h3>
                    <div className="node-todo-list">
                      {nodeTodos.map((todo) => (
                        <label key={todo.id}>
                          <input
                            type="checkbox"
                            aria-label={todo.title}
                            checked={todo.status === 'completed'}
                            disabled={
                              todo.status === 'completed' ||
                              todo.status === 'cancelled'
                            }
                            onChange={() => {
                              const { revision, ...todoRecord } = todo
                              void window.realmflow?.business
                                .saveNodeTodo({
                                  ...todoRecord,
                                  status: 'completed',
                                  expectedRevision: revision
                                })
                                .then((saved) =>
                                  setNodeTodos((current) =>
                                    current.map((item) =>
                                      item.id === saved.id ? saved : item
                                    )
                                  )
                                )
                            }}
                          />
                          <span>{todo.title}</span>
                          {todo.required ? <em>必需</em> : null}
                        </label>
                      ))}
                    </div>
                  </section>
                ) : null}
                {nodeQuestions.length > 0 ? (
                  <section aria-labelledby="node-questions-title">
                    <h3 id="node-questions-title">待确认问题</h3>
                    <div className="node-question-list">
                      {nodeQuestions.map((question) => (
                        <div className="node-question" key={question.id}>
                          <label htmlFor={`node-question-${question.id}`}>
                            {question.prompt}
                            {question.required ? <em>必需</em> : null}
                          </label>
                          {question.status === 'open' ? (
                            <div>
                              <input
                                id={`node-question-${question.id}`}
                                aria-label={`回答：${question.prompt}`}
                                value={questionAnswers[question.id] ?? ''}
                                onChange={(event) =>
                                  setQuestionAnswers((current) => ({
                                    ...current,
                                    [question.id]: event.target.value
                                  }))
                                }
                              />
                              <button
                                type="button"
                                disabled={
                                  !(questionAnswers[question.id] ?? '').trim()
                                }
                                onClick={() =>
                                  void window.realmflow?.business
                                    .answerNodeQuestion({
                                      id: question.id,
                                      nodeRunId: question.nodeRunId,
                                      answer:
                                        questionAnswers[question.id]?.trim() ??
                                        '',
                                      expectedRevision: question.revision
                                    })
                                    .then((saved) =>
                                      setNodeQuestions((current) =>
                                        current.map((item) =>
                                          item.id === saved.id ? saved : item
                                        )
                                      )
                                    )
                                }
                              >
                                提交回答
                              </button>
                            </div>
                          ) : (
                            <p>{question.answer}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}

function iconForNode(node: RequirementNode) {
  const icons = {
    ai_generate: Sparkles,
    human_input: FileSearch,
    tool: Braces,
    approval: ClipboardCheck
  }
  return icons[node.type]
}
