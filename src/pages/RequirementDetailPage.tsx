import { Plus, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Spinner } from "../components/ui";
import type { AiRunController } from "../app/hooks/use-ai-run-controller";
import type {
  RequirementNode,
  RequirementWorkflow,
} from "../../domain/workflow";
import { getAllowedNodeTodoTransitions } from "../../domain/node-todo";
import type { WorkspaceRequirement, WorkspaceSpace } from "../domain/workspace";
import type {
  NodeQuestionDto,
  NodeTodoDto,
  ResolveWorkflowNodeGateCommand,
  WorkflowNodeControlAction,
  WorkflowNodeExecutionDto,
} from "../../shared/business";
import { useWorkbench } from "../features/workbench/WorkbenchProvider";
import { NodeGateActions } from "../features/workflow/NodeGateActions";
import { NodeQuestionsPanel } from "../features/workflow/NodeQuestionsPanel";
import { RequirementWorkflowNodeEditor } from "../features/workflow/RequirementWorkflowNodeEditor";
import {
  RequirementExecutionResources,
  RequirementExecutionSummary,
} from "../features/workflow/RequirementExecutionSnapshot";
import { WorkflowNodeControls } from "../features/workflow/WorkflowNodeControls";
import {
  legacyStageFromNodeId,
  runStatusLabel,
  selectedWorkflowNodeId,
} from "../features/workflow/workflow-view";
import { useModelProfiles } from "../app/hooks/use-model-profiles";
import { ModelSelector } from "../features/conversation/ModelSelector";
import { useNodeRunSynchronization } from "../app/hooks/use-node-run-synchronization";
import { useRequirementWorkflowRefresh } from "../app/hooks/use-requirement-workflow-refresh";
import { useRequirementExecutionWorkbench } from "../app/hooks/use-requirement-execution-workbench";
import { RequirementDetailHeader } from "../features/navigation/RequirementDetailHeader";
import { RequirementDetailExecutionWorkbench } from "../features/workflow/RequirementDetailExecutionWorkbench";
import { useToast } from "../features/toast/ToastProvider";
import { useLocalization } from "../localization/LocalizationProvider";
import {
  createTodoDraftId,
  lifecycleStages,
  nodeTodoStatusLabel,
  readErrorMessage,
} from "./requirement-detail-config";
type RequirementDetailPageProps = {
  spaces: WorkspaceSpace[];
  requirementsBySpace: Record<string, WorkspaceRequirement[]>;
  aiRuns: AiRunController;
  loading?: boolean;
};
export default function RequirementDetailPage({
  spaces,
  requirementsBySpace,
  aiRuns,
  loading = false,
}: RequirementDetailPageProps): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const { spaceId, requirementId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedNodeId = searchParams.get("node")?.trim();
  const spacePath = `/spaces/${spaceId ?? ""}`;
  const space = spaces.find((item) => item.path === spacePath);
  const requirement = requirementsBySpace[spacePath]?.find(
    (item) => item.id === requirementId,
  );
  const [activeStage, setActiveStage] = useState<string>("analysis");
  const [workflow, setWorkflow] = useState<RequirementWorkflow>();
  const [nodeExecution, setNodeExecution] =
    useState<WorkflowNodeExecutionDto>();
  const [nodeTodos, setNodeTodos] = useState<NodeTodoDto[]>([]);
  const [todoDraftId, setTodoDraftId] = useState(createTodoDraftId);
  const [todoTitle, setTodoTitle] = useState("");
  const [todoRequired, setTodoRequired] = useState(true);
  const [todoPendingId, setTodoPendingId] = useState<string>();
  const [todoError, setTodoError] = useState("");
  const [nodeQuestions, setNodeQuestions] = useState<NodeQuestionDto[]>([]);
  const [gatePending, setGatePending] = useState(false);
  const [gateError, setGateError] = useState("");
  const [controlPending, setControlPending] = useState(false);
  const [controlError, setControlError] = useState("");
  const workbench = useWorkbench();
  const models = useModelProfiles();
  const executionWorkbench =
    useRequirementExecutionWorkbench(requirementId);
  const executionView = executionWorkbench.view;
  const executionViewError = executionWorkbench.error
    ? t("requirementDetail.executionLoadFailed", {
        error: readErrorMessage(executionWorkbench.error),
      })
    : "";

  useEffect(() => {
    if (!requestedNodeId) return;
    void executionWorkbench.select(requestedNodeId);
  }, [executionWorkbench.select, requestedNodeId, requirementId]);

  const loadExecutionView = useCallback(
    async (nodeId?: string): Promise<void> => {
      if (nodeId) {
        await executionWorkbench.select(nodeId);
        return;
      }
      await executionWorkbench.reload();
    },
    [executionWorkbench.reload, executionWorkbench.select],
  );

  useLayoutEffect(() => {
    setWorkflow(undefined);
    setNodeExecution(undefined);
    setNodeTodos([]);
    setNodeQuestions([]);
  }, [requirementId]);

  useEffect(() => {
    const view = executionWorkbench.view;
    if (!view) return;
    setWorkflow(view.workflow);
    setActiveStage(view.selectedNode.id);
    setNodeExecution(
      view.execution && view.selectedNode.nodeRun
        ? {
            execution: view.execution,
            nodeRun: view.selectedNode.nodeRun,
            ...(view.selectedNode.approval
              ? { approval: view.selectedNode.approval }
              : {}),
          }
        : undefined,
    );
    setNodeTodos(view.selectedNode.todos);
    setNodeQuestions(view.selectedNode.questions);
  }, [executionWorkbench.view]);

  useEffect(() => {
    if (!requirementId || !window.realmflow?.business) return;
    if (
      typeof window.realmflow.business.getRequirementExecutionView ===
      "function"
    ) {
      return;
    }
    let disposed = false;
    void window.realmflow.business
      .getRequirementWorkflow({ requirementId })
      .then((nextWorkflow) => {
        if (disposed || !nextWorkflow) return;
        setWorkflow(nextWorkflow);
        setActiveStage((current) =>
          nextWorkflow.nodes.some((node) => node.id === current)
            ? current
            : (nextWorkflow.nodes[0]?.id ?? current),
        );
      });
    return () => {
      disposed = true;
    };
  }, [loadExecutionView, requirementId]);

  useEffect(() => {
    if (
      typeof window.realmflow?.business?.getRequirementExecutionView ===
      "function"
    ) {
      return;
    }
    if (
      !requirementId ||
      !selectedWorkflowNodeId(workflow, activeStage) ||
      !window.realmflow?.business
    ) {
      setNodeExecution(undefined);
      return;
    }
    let disposed = false;
    void window.realmflow.business
      .getWorkflowNodeExecution({
        requirementId,
        nodeId: selectedWorkflowNodeId(workflow, activeStage) as string,
      })
      .then((execution) => {
        if (!disposed) setNodeExecution(execution);
      });
    return () => {
      disposed = true;
    };
  }, [activeStage, requirementId, workflow]);

  useEffect(() => {
    const business = window.realmflow?.business;
    const nodeRunId = nodeExecution?.nodeRun.id;
    if (typeof business?.getRequirementExecutionView === "function") return;
    if (
      !business ||
      !nodeRunId ||
      typeof business.listNodeTodos !== "function" ||
      typeof business.listNodeQuestions !== "function"
    ) {
      setNodeTodos([]);
      setNodeQuestions([]);
      return;
    }
    let disposed = false;
    void Promise.all([
      business.listNodeTodos({ nodeRunId }),
      business.listNodeQuestions({ nodeRunId }),
    ]).then(([todos, questions]) => {
      if (disposed) return;
      setNodeTodos(todos);
      setNodeQuestions(questions);
    });
    return () => {
      disposed = true;
    };
  }, [nodeExecution?.nodeRun.id]);
  useNodeRunSynchronization({
    requirementId,
    nodeExecution,
    activeNodeIds: executionView?.activeNodeIds,
    selectedNodeId: executionView?.selectedNode.id,
    aiRuns,
    setWorkflow,
    setNodeExecution,
    refreshExecutionView: loadExecutionView,
  });
  const { refreshSelectedNodeState, refreshAfterTemplateMigration } =
    useRequirementWorkflowRefresh({
      requirementId,
      activeNodeId: selectedWorkflowNodeId(workflow, activeStage) ?? activeStage,
      loadExecutionView,
      setActiveNodeId: setActiveStage,
      setWorkflow,
      setNodeExecution,
    });

  if ((!space || !requirement) && loading) {
    return <p role="status">{t("requirementDetail.loading")}</p>;
  }
  if (!space || !requirement) {
    return <Navigate to="/chat/new" replace />;
  }
  const displayNodes: RequirementNode[] =
    workflow?.nodes ??
    lifecycleStages.map((stage, order) => ({
      id: stage.id,
      type: "ai_generate",
      name: t(stage.labelKey),
      description: "",
      order,
      status: order === 0 ? "ready" : "pending",
      allowSkip: false,
    }));
  const selectedNode =
    displayNodes.find((node) => node.id === activeStage) ?? displayNodes[0];
  const selectedLegacyStage = selectedNode
    ? legacyStageFromNodeId(selectedNode.id)
    : undefined;
  const activeRun = selectedNode
    ? aiRuns.findRun(requirement.id, selectedNode.id)
    : undefined;
  const running =
    activeRun?.status === "created" ||
    activeRun?.status === "running" ||
    activeRun?.status === "cancelling";
  const resolveGate = async (
    gate: ResolveWorkflowNodeGateCommand["gate"],
  ): Promise<void> => {
    const business = window.realmflow?.business;
    if (!business || !nodeExecution || !selectedNode) return;
    setGatePending(true);
    setGateError("");
    try {
      const nextWorkflow = await business.resolveWorkflowNodeGate({
        requirementId: requirement.id,
        nodeRunId: nodeExecution.nodeRun.id,
        expectedNodeRunRevision: nodeExecution.nodeRun.revision,
        gate,
      });
      setWorkflow(nextWorkflow);
      if (typeof business.getRequirementExecutionView === "function") {
        await loadExecutionView(selectedNode.id);
        return;
      }
      const nextExecution = await business.getWorkflowNodeExecution({
        requirementId: requirement.id,
        nodeId: selectedNode.id,
      });
      setNodeExecution(nextExecution);
    } catch (error) {
      toast.error("requirementDetail.gateUpdateFailed", {
        values: { error: t("common.unknownError") },
        dedupeKey: "requirement-gate-update-failed",
      });
    } finally {
      setGatePending(false);
    }
  };
  const controlNode = async (
    action: WorkflowNodeControlAction,
    reason?: string,
  ): Promise<void> => {
    const business = window.realmflow?.business;
    if (!business || !workflow || !nodeExecution || !selectedNode) return;
    const command = {
      requirementId: requirement.id,
      nodeRunId: nodeExecution.nodeRun.id,
      expectedWorkflowRevision: workflow.revision,
      expectedExecutionRevision: nodeExecution.execution.revision,
      expectedNodeRunRevision: nodeExecution.nodeRun.revision,
      ...(models.selectedId ? { modelProfileId: models.selectedId } : {}),
    };
    setControlPending(true);
    setControlError("");
    try {
      const result =
        action === "start"
          ? await business.startWorkflowNode(command)
          : action === "pause"
            ? await business.pauseWorkflowNode(command)
            : action === "resume"
              ? await business.resumeWorkflowNode(command)
              : action === "cancel"
                ? await business.cancelWorkflowNode(command)
                : action === "retry"
                  ? await business.retryWorkflowNode(command)
                  : await business.skipWorkflowNode({
                      ...command,
                      expectedRequirementRevision: requirement.revision ?? 0,
                      ...(reason ? { reason } : {}),
                    });
      if (result.outcome === "rejected") {
        toast.error("app.persistenceUnavailable", {
          dedupeKey: `workflow-node-${action}-failed`,
        });
        return;
      }
      if (typeof business.getRequirementExecutionView === "function") {
        await loadExecutionView(selectedNode.id);
        return;
      }
      setWorkflow(result.workflow);
      setNodeExecution({
        execution: result.execution,
        nodeRun: result.nodeRun,
        ...(nodeExecution.approval ? { approval: nodeExecution.approval } : {}),
      });
    } catch (error) {
      toast.error("app.persistenceUnavailable", {
        dedupeKey: `workflow-node-${action}-failed`,
      });
    } finally {
      setControlPending(false);
    }
  };
  if (executionView && selectedNode) {
    return (
      <div className="requirement-detail-page">
        <h1 className="sr-only">{requirement.title}</h1>
        <RequirementDetailHeader title={requirement.title} />
        <div className="requirement-detail-content">
          <RequirementDetailExecutionWorkbench
            requirement={requirement}
            view={executionView}
            selectedNode={selectedNode}
            models={models}
            controlPending={controlPending}
            gatePending={gatePending}
            executionError={executionViewError}
            t={t}
            onSelectNode={loadExecutionView}
            onReload={loadExecutionView}
            onControl={controlNode}
            onResolveGate={resolveGate}
            onOpenArtifact={(relativePath, label) =>
              workbench.openRequirementArtifact(
                requirement.id,
                relativePath,
                label,
              )
            }
          />
        </div>
      </div>
    );
  }
  return (
    <div className="requirement-detail-page">
      <h1 className="sr-only">{requirement.title}</h1>
      <RequirementDetailHeader title={requirement.title} />

      <div className="requirement-detail-content">
        <RequirementExecutionSummary
          view={executionView}
          error={executionViewError}
          onRetry={() => void loadExecutionView(activeStage)}
        />

        <section
          className="development-flow"
          aria-labelledby="development-flow-title"
        >
          <RequirementWorkflowNodeEditor
            requirementId={requirement.id}
            workflow={workflow}
            nodes={displayNodes}
            selectedNode={selectedNode}
            activeNodeId={activeStage}
            executionView={executionView}
            onReloadExecutionView={loadExecutionView}
            onWorkflowChange={setWorkflow}
            onTemplateMigrationApplied={(nextWorkflow) =>
              void refreshAfterTemplateMigration(nextWorkflow)
            }
            onSelectNode={(node) => {
              setActiveStage(node.id);
              if (
                typeof window.realmflow?.business
                  ?.getRequirementExecutionView === "function"
              ) {
                void loadExecutionView(node.id);
              }
              const legacyStage = legacyStageFromNodeId(node.id);
              if (legacyStage) {
                workbench.openRequirementArtifact(
                  requirement.id,
                  legacyStage,
                  requirement.title,
                );
              }
            }}
          />
          <div className="stage-run-panel" aria-live="polite">
            <div className="stage-run-heading">
              <div>
                <span>{t("requirementDetail.stageArtifact")}</span>
                <strong>{selectedNode?.name}</strong>
              </div>
              {selectedNode?.type === "ai_generate" ? (
                <ModelSelector
                  ariaLabel={t("requirementDetail.generationModel")}
                  autoLabel={t("model.autoSelect")}
                  configureLabel={t("model.configure")}
                  emptyLabel={t("model.noMatches")}
                  searchPlaceholder={t("model.search")}
                  groups={models.groups}
                  value={models.selectedId}
                  effectiveValue={models.effectiveId}
                  onOpen={() => void models.refresh()}
                  onChange={models.select}
                  onConfigure={() => {
                    window.location.hash = "/settings?section=models";
                  }}
                />
              ) : null}
              <NodeGateActions
                node={selectedNode}
                approval={nodeExecution?.approval}
                disabled={!nodeExecution || gatePending}
                onResolve={resolveGate}
              />
              {workflow && selectedNode && nodeExecution ? (
                <WorkflowNodeControls
                  node={selectedNode}
                  pending={controlPending}
                  onAction={(action, reason) =>
                    void controlNode(action, reason)
                  }
                />
              ) : running && activeRun ? (
                <button
                  type="button"
                  className="stage-run-cancel"
                  aria-label={t("requirementDetail.cancelGeneration")}
                  disabled={activeRun.status === "cancelling"}
                  onClick={() => void aiRuns.cancel(activeRun.runId)}
                >
                  <Square size={13} />
                  {activeRun.status === "cancelling"
                    ? t("requirementDetail.cancelling")
                    : t("requirementDetail.cancel")}
                </button>
              ) : selectedNode?.type === "ai_generate" &&
                selectedLegacyStage ? (
                <button
                  type="button"
                  className="stage-run-start"
                  aria-label={t("requirementDetail.generateAria", {
                    name: selectedNode?.name ?? "",
                  })}
                  onClick={() => {
                    void aiRuns.start({
                      requirementId: requirement.id,
                      stageId: selectedLegacyStage,
                      ...(models.selectedId
                        ? { modelProfileId: models.selectedId }
                        : {}),
                    });
                  }}
                >
                  <Sparkles size={15} />
                  {t("requirementDetail.generate")}
                </button>
              ) : null}
            </div>
            {gateError || controlError ? (
              <p role="alert">{gateError || controlError}</p>
            ) : null}
            {activeRun ? (
              <div className={`stage-run-state ${activeRun.status}`}>
                <div className="stage-run-progress">
                  <div>
                    {running ? (
                      <Spinner size={14} />
                    ) : null}
                    <span>{runStatusLabel(activeRun.status, t)}</span>
                  </div>
                  <strong>{activeRun.progress}%</strong>
                </div>
                <progress max={100} value={activeRun.progress} />
                {activeRun.content ? <pre>{activeRun.content}</pre> : null}
                {activeRun.error ? <p role="alert">{activeRun.error}</p> : null}
              </div>
            ) : (
              <p className="stage-run-empty">
                {t("requirementDetail.generationEmpty")}
              </p>
            )}
            {executionView ? (
              <RequirementExecutionResources
                view={executionView}
                modelProfileId={models.selectedId || undefined}
                onReload={loadExecutionView}
              />
            ) : null}
            {nodeExecution || nodeQuestions.length > 0 ? (
              <div className="node-work-items">
                {nodeExecution ? (
                  <section aria-labelledby="node-todos-title">
                    <h3 id="node-todos-title">
                      {t("requirementDetail.todos")}
                    </h3>
                    <form
                      className="node-todo-create"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const title = todoTitle.trim();
                        const nodeRunId = nodeExecution.nodeRun.id;
                        const business = window.realmflow?.business;
                        if (!title || !business) return;
                        setTodoPendingId(todoDraftId);
                        setTodoError("");
                        void business
                          .saveNodeTodo({
                            id: todoDraftId,
                            nodeRunId,
                            title,
                            required: todoRequired,
                            status: "pending",
                            expectedRevision: 0,
                          })
                          .then((saved) => {
                            setNodeTodos((current) => [...current, saved]);
                            setTodoTitle("");
                            setTodoRequired(true);
                            setTodoDraftId(createTodoDraftId());
                          })
                          .catch((error: unknown) => {
                            setTodoError(
                              t("requirementDetail.createTodoFailed", {
                                error: t("common.unknownError"),
                              }),
                            );
                          })
                          .finally(() => setTodoPendingId(undefined));
                      }}
                    >
                      <input name="requirement-detail-new-todo" autoComplete="off"
                        aria-label={t("requirementDetail.newTodo")}
                        maxLength={500}
                        placeholder={t("requirementDetail.todoPlaceholder")}
                        value={todoTitle}
                        onChange={(event) => setTodoTitle(event.target.value)}
                      />
                      <label>
                        <input name="requirement-detail-page-todo-required" autoComplete="off"
                          type="checkbox"
                          checked={todoRequired}
                          onChange={(event) =>
                            setTodoRequired(event.target.checked)
                          }
                        />
                        {t("requirementDetail.required")}
                      </label>
                      <button
                        type="submit"
                        disabled={
                          !todoTitle.trim() ||
                          Boolean(todoPendingId) ||
                          nodeExecution.nodeRun.status === "completed" ||
                          nodeExecution.nodeRun.status === "skipped"
                        }
                      >
                        <Plus size={14} />
                        {t("requirementDetail.addTodo")}
                      </button>
                    </form>
                    {todoError ? <p role="alert">{todoError}</p> : null}
                    <div className="node-todo-list">
                      {nodeTodos.map((todo) => (
                        <div key={todo.id} className="node-todo">
                          <span>{todo.title}</span>
                          {todo.required ? (
                            <em>{t("requirementDetail.required")}</em>
                          ) : null}
                          {getAllowedNodeTodoTransitions(todo.status).length >
                          0 ? (
                            <select name={`requirement-todo-${todo.id}-status`} autoComplete="off"
                              aria-label={t(
                                "requirementDetail.updateTodoAria",
                                { title: todo.title },
                              )}
                              disabled={todoPendingId === todo.id}
                              value={todo.status}
                              onChange={(event) => {
                                const status = event.target
                                  .value as NodeTodoDto["status"];
                                const business = window.realmflow?.business;
                                if (!business) return;
                                setTodoPendingId(todo.id);
                                setTodoError("");
                                void business
                                  .saveNodeTodo({
                                    id: todo.id,
                                    nodeRunId: todo.nodeRunId,
                                    title: todo.title,
                                    required: todo.required,
                                    status,
                                    expectedRevision: todo.revision,
                                  })
                                  .then((saved) =>
                                    setNodeTodos((current) =>
                                      current.map((item) =>
                                        item.id === saved.id ? saved : item,
                                      ),
                                    ),
                                  )
                                  .catch((error: unknown) => {
                                    setTodoError(
                                      t("requirementDetail.updateTodoFailed", {
                                        error: t("common.unknownError"),
                                      }),
                                    );
                                  })
                                  .finally(() => setTodoPendingId(undefined));
                              }}
                            >
                              <option value={todo.status}>
                                {nodeTodoStatusLabel(t, todo.status)}
                              </option>
                              {getAllowedNodeTodoTransitions(todo.status).map(
                                (status) => (
                                  <option key={status} value={status}>
                                    {nodeTodoStatusLabel(t, status)}
                                  </option>
                                ),
                              )}
                            </select>
                          ) : (
                            <span className={`node-todo-status ${todo.status}`}>
                              {nodeTodoStatusLabel(t, todo.status)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                <NodeQuestionsPanel
                  requirementId={requirement.id}
                  execution={nodeExecution}
                  questions={nodeQuestions}
                  onQuestionsChange={setNodeQuestions}
                  onRefresh={refreshSelectedNodeState}
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
