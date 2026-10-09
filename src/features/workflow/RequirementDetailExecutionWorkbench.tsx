import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NodeTodoStatus } from "../../../domain/node-todo";
import type { RequirementNode } from "../../../domain/workflow";
import type {
  NodeTodoDto,
  RequirementExecutionViewDto,
  ResolveWorkflowNodeGateCommand,
  WorkflowNodeControlAction,
} from "../../../shared/business";
import { InlineAlert } from "../../components/ui";
import type { WorkspaceRequirement } from "../../domain/workspace";
import { ModelSelector } from "../conversation/ModelSelector";
import type { useModelProfiles } from "../../app/hooks/use-model-profiles";
import type { Translator } from "../../localization/translate";
import { useToast } from "../toast/ToastProvider";
import { RequirementDagCanvas } from "./RequirementDagCanvas";
import { RequirementExecutionResources } from "./RequirementExecutionSnapshot";
import {
  RequirementNodeWorkbench,
  type RequirementNodeWorkbenchLabels,
} from "./RequirementNodeWorkbench";
import {
  WorkflowNodeActionDialog,
  type WorkflowNodeActionDialogAction,
} from "./WorkflowNodeActionDialog";
import {
  WorkflowNodeActionMenu,
  type WorkflowNodeAction,
} from "./WorkflowNodeActionMenu";
import { nodeStatusLabel } from "./workflow-view";

type Props = {
  requirement: WorkspaceRequirement;
  view: RequirementExecutionViewDto;
  selectedNode: RequirementNode;
  models: ReturnType<typeof useModelProfiles>;
  controlPending: boolean;
  gatePending: boolean;
  executionError: string;
  t: Translator;
  onSelectNode: (nodeId: string) => Promise<void>;
  onReload: (nodeId?: string) => Promise<void>;
  onControl: (
    action: WorkflowNodeControlAction,
    reason?: string,
  ) => Promise<void>;
  onResolveGate: (
    gate: ResolveWorkflowNodeGateCommand["gate"],
  ) => Promise<void>;
  onOpenArtifact: (relativePath: string, label: string) => void;
};

type DialogState = {
  action: WorkflowNodeActionDialogAction;
  nodeId: string;
};

type MenuState = {
  nodeId: string;
  anchor: HTMLButtonElement;
};

const disabledCapability = {
  enabled: false as const,
  reasonCode: "invalid_state" as const,
};

const DEFAULT_DAG_HEIGHT = 180;
const MIN_DAG_HEIGHT = 120;
const MIN_NODE_WORKBENCH_HEIGHT = 340;

export function RequirementDetailExecutionWorkbench({
  requirement,
  view,
  selectedNode,
  models,
  controlPending,
  gatePending,
  executionError,
  t,
  onSelectNode,
  onReload,
  onControl,
  onResolveGate,
  onOpenArtifact,
}: Props): JSX.Element {
  const toast = useToast();
  const workbenchRef = useRef<HTMLDivElement>(null);
  const resizingDagRef = useRef(false);
  const [menu, setMenu] = useState<MenuState>();
  const [dialog, setDialog] = useState<DialogState>();
  const [dagHeight, setDagHeight] = useState(DEFAULT_DAG_HEIGHT);
  const [actionPending, setActionPending] = useState(false);
  const [todoPendingId, setTodoPendingId] = useState<string>();
  const [respondingNodeId, setRespondingNodeId] = useState<string>();
  const summary = view.nodes.find((node) => node.id === selectedNode.id);
  const completionSummary = useMemo(
    () => ({
      required: summary?.todoCounts?.required ?? { completed: 0, total: 0 },
      total: {
        completed:
          (summary?.todoCounts?.required.completed ?? 0) +
          (summary?.todoCounts?.optional.completed ?? 0),
        total:
          (summary?.todoCounts?.required.total ?? 0) +
          (summary?.todoCounts?.optional.total ?? 0),
      },
      blockers: {
        openQuestions: summary?.openQuestionCount ?? 0,
        approvalPending: summary?.approvalStatus === "pending",
        missingArtifact:
          selectedNode.configuration?.artifact.required === true &&
          (summary?.artifactCount ?? 0) === 0,
      },
    }),
    [selectedNode.configuration?.artifact.required, summary],
  );
  const labels = workbenchLabels(t);
  const menuNode = view.workflow.nodes.find((node) => node.id === menu?.nodeId);
  const menuSummary = view.nodes.find((node) => node.id === menu?.nodeId);
  const dialogNode = view.workflow.nodes.find(
    (node) => node.id === dialog?.nodeId,
  );
  const workbenchStyle = {
    "--requirement-dag-height": `${dagHeight}px`,
  } as CSSProperties;
  const updateDagHeight = (clientY: number): void => {
    const bounds = workbenchRef.current?.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;
    const maxHeight = Math.max(
      MIN_DAG_HEIGHT,
      bounds.height - MIN_NODE_WORKBENCH_HEIGHT,
    );
    setDagHeight(
      Math.min(
        maxHeight,
        Math.max(MIN_DAG_HEIGHT, Math.round(clientY - bounds.top)),
      ),
    );
  };
  const handleDagKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const bounds = workbenchRef.current?.getBoundingClientRect();
    const maxHeight = bounds
      ? Math.max(
          MIN_DAG_HEIGHT,
          bounds.height - MIN_NODE_WORKBENCH_HEIGHT,
        )
      : Number.POSITIVE_INFINITY;
    setDagHeight((current) =>
      Math.min(
        maxHeight,
        Math.max(
          MIN_DAG_HEIGHT,
          current + (event.key === "ArrowDown" ? 8 : -8),
        ),
      ),
    );
  };
  const finishDagResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    resizingDagRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const submitAction = async (
    action: WorkflowNodeAction,
    nodeId: string,
    reason?: string,
  ): Promise<void> => {
    const business = window.realmflow?.business;
    const execution = view.execution;
    const nodeSummary = view.nodes.find((node) => node.id === nodeId);
    if (!business || !nodeSummary) return;
    setActionPending(true);
    try {
      if (action === "rollback") {
        if (!execution || !nodeSummary.nodeRunRevision) return;
        const result = await business.rollbackWorkflowToNode({
          requestId: crypto.randomUUID(),
          requirementId: requirement.id,
          executionId: execution.id,
          targetNodeId: nodeId,
          expectedRequirementRevision: requirement.revision ?? 0,
          expectedWorkflowRevision: view.workflow.revision,
          expectedExecutionRevision: execution.revision,
          expectedNodeRunRevision: nodeSummary.nodeRunRevision,
        });
        if (result.outcome === "rejected") {
          throw new Error(result.error.code);
        }
        await onReload(nodeId);
      } else {
        if (!execution || !nodeSummary.nodeRunId || !nodeSummary.nodeRunRevision) {
          return;
        }
        const command = {
          requirementId: requirement.id,
          nodeRunId: nodeSummary.nodeRunId,
          expectedWorkflowRevision: view.workflow.revision,
          expectedExecutionRevision: execution.revision,
          expectedNodeRunRevision: nodeSummary.nodeRunRevision,
        };
        const result =
          action === "retry"
            ? await business.retryWorkflowNode(command)
            : await business.skipWorkflowNode({
                ...command,
                expectedRequirementRevision: requirement.revision ?? 0,
                ...(reason ? { reason } : {}),
              });
        if (result.outcome === "rejected") {
          throw new Error(result.error.code);
        }
        await onReload(nodeId);
      }
      setDialog(undefined);
      setMenu(undefined);
    } catch {
      toast.error("app.persistenceUnavailable", {
        dedupeKey: `workflow-node-${action}-failed`,
      });
      await onReload(nodeId);
    } finally {
      setActionPending(false);
    }
  };

  const requestAction = (action: WorkflowNodeAction): void => {
    if (!menu) return;
    if (action === "retry") {
      void submitAction(action, menu.nodeId);
      return;
    }
    setDialog({ action, nodeId: menu.nodeId });
    setMenu(undefined);
  };

  const saveTodo = async (
    todo: Pick<
      NodeTodoDto,
      "id" | "nodeRunId" | "title" | "required" | "status" | "revision"
    >,
  ): Promise<void> => {
    const business = window.realmflow?.business;
    if (!business) return;
    setTodoPendingId(todo.id);
    try {
      await business.saveNodeTodo({
        id: todo.id,
        nodeRunId: todo.nodeRunId,
        title: todo.title,
        required: todo.required,
        status: todo.status,
        expectedRevision: todo.revision,
      });
      await onReload(selectedNode.id);
    } catch (error) {
      toast.error(
        todo.revision === 0
          ? "requirementDetail.createTodoFailed"
          : "requirementDetail.updateTodoFailed",
        {
          values: { error: t("common.unknownError") },
          dedupeKey:
            todo.revision === 0
              ? "node-todo-create-failed"
              : "node-todo-update-failed",
        },
      );
      throw error;
    } finally {
      setTodoPendingId(undefined);
    }
  };

  const deleteTodo = async (todo: NodeTodoDto): Promise<void> => {
    const business = window.realmflow?.business;
    if (!business) return;
    if (typeof business.deleteNodeTodo !== "function") {
      toast.error("requirementDetail.todoDeleteUnavailable", {
        dedupeKey: "node-todo-delete-unavailable",
      });
      throw new Error("node_todo_delete_unavailable");
    }
    setTodoPendingId(todo.id);
    try {
      await business.deleteNodeTodo({
        id: todo.id,
        nodeRunId: todo.nodeRunId,
        expectedRevision: todo.revision,
      });
      await onReload(selectedNode.id);
    } catch (error) {
      toast.error("app.persistenceUnavailable", {
        dedupeKey: "node-todo-delete-failed",
      });
      throw error;
    } finally {
      setTodoPendingId(undefined);
    }
  };

  return (
    <div
      ref={workbenchRef}
      className="requirement-execution-workbench"
      style={workbenchStyle}
    >
      <section className="requirement-dag-shell">
        <RequirementDagCanvas
          view={view}
          selectedNodeId={selectedNode.id}
          respondingNodeId={respondingNodeId}
          onSelectNode={(nodeId) => void onSelectNode(nodeId)}
          onOpenNodeMenu={(nodeId, anchor) => setMenu({ nodeId, anchor })}
        />
        {menu && menuNode && menuSummary?.capabilities ? (
          <WorkflowNodeActionMenu
            nodeName={menuNode.name}
            capabilities={menuSummary.capabilities}
            pending={actionPending}
            anchor={menu.anchor}
            onAction={requestAction}
            onClose={() => setMenu(undefined)}
          />
        ) : null}
        {executionError ? (
          <InlineAlert
            className="requirement-execution-error"
            tone="danger"
            title={executionError}
            actionLabel={t("workflowExecution.retry")}
            onAction={() => void onReload(selectedNode.id)}
          />
        ) : null}
      </section>

      <div
        className="requirement-execution-workbench__dag-resizer"
        role="separator"
        aria-label={t("requirementWorkbench.resizeDag")}
        aria-orientation="horizontal"
        aria-valuemin={MIN_DAG_HEIGHT}
        aria-valuenow={dagHeight}
        tabIndex={0}
        onKeyDown={handleDagKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          resizingDagRef.current = true;
        }}
        onPointerMove={(event) => {
          if (resizingDagRef.current) updateDagHeight(event.clientY);
        }}
        onPointerUp={finishDagResize}
        onPointerCancel={() => {
          resizingDagRef.current = false;
        }}
      />

      <RequirementNodeWorkbench
        view={view}
        selectedNode={selectedNode}
        renderModelControl={(node) =>
          node.type === "ai_generate" ? (
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
          ) : null
        }
        renderActionControl={(node) =>
          node.type === "ai_generate" ? (
            <RequirementExecutionResources
              view={view}
              modelProfileId={models.selectedId || undefined}
              onReload={async (nodeId) => onReload(nodeId)}
              sections="action"
            />
          ) : null
        }
        controlPending={controlPending}
        gatePending={gatePending}
        completionSummary={completionSummary}
        labels={labels}
        todoPendingId={todoPendingId}
        onControl={(action, reason) => void onControl(action, reason)}
        onResolveGate={onResolveGate}
        onReloadConversation={async (nodeId) => onReload(nodeId)}
        onResponseActiveChange={(nodeId, active) => {
          setRespondingNodeId((current) =>
            active ? nodeId : current === nodeId ? undefined : current,
          );
        }}
        onCreateTodo={async ({ title }) => {
          const nodeRunId = view.selectedNode.nodeRun?.id;
          if (!nodeRunId) return;
          await saveTodo({
            id: crypto.randomUUID(),
            nodeRunId,
            title,
            required: true,
            status: "pending",
            revision: 0,
          });
        }}
        onTransitionTodo={async (todo, status: NodeTodoStatus) =>
          saveTodo({ ...todo, status })
        }
        onDeleteTodo={deleteTodo}
        onOpenArtifact={onOpenArtifact}
      />

      {dialog && dialogNode ? (
        <WorkflowNodeActionDialog
          action={dialog.action}
          labels={dialogLabels(dialog.action, dialogNode.name, t)}
          disabled={actionPending}
          onCancel={() => setDialog(undefined)}
          onConfirm={({ reason }) =>
            void submitAction(dialog.action, dialog.nodeId, reason)
          }
        />
      ) : null}
    </div>
  );
}

function workbenchLabels(t: Translator): RequirementNodeWorkbenchLabels {
  return {
    conversation: t("requirementWorkbench.conversation"),
    artifacts: t("workflowExecution.artifacts"),
    todos: t("requirementDetail.todos"),
    resizeColumns: t("requirementWorkbench.resizeColumns"),
    resizeRightPanels: t("requirementWorkbench.resizeRightPanels"),
    attempt: (attempt) => `#${attempt}`,
    status: (status) => nodeStatusLabel(status, t),
    noNodeRun: t("requirementWorkbench.noNodeRun"),
    artifact: {
      title: t("workflowExecution.artifacts"),
      fileName: t("requirementWorkbench.file"),
      relativePath: t("requirementDetail.path"),
      type: t("resources.column.type"),
      version: t("workflowInspector.version"),
      size: t("settings.backup.summary.size"),
      updatedAt: t("resources.column.updatedAt"),
      empty: t("workflowExecution.emptyArtifacts"),
      open: t("common.open"),
    },
    todo: {
      requiredCompletion: (completed, total) =>
        t("requirementWorkbench.requiredCompletion", { completed, total }),
      totalCompletion: (completed, total) =>
        t("requirementWorkbench.totalCompletion", { completed, total }),
      gateReady: t("requirementWorkbench.gateReady"),
      gateBlocked: t("requirementWorkbench.gateBlocked"),
      unfinishedGroup: t("requirementWorkbench.unfinished"),
      blockedGroup: t("requirementWorkbench.blocked"),
      completedGroup: t("requirementWorkbench.completed"),
      empty: t("requirementWorkbench.emptyTodos"),
      openQuestions: (count) =>
        t("requirementWorkbench.openQuestions", { count }),
      approvalPending: t("requirementWorkbench.approvalPending"),
      missingArtifact: t("requirementWorkbench.missingArtifact"),
    },
  };
}

function dialogLabels(
  action: WorkflowNodeActionDialogAction,
  nodeName: string,
  t: Translator,
) {
  if (action === "skip") {
    return {
      title: t("requirementWorkbench.skipTitle", { name: nodeName }),
      description: t("requirementWorkbench.skipDescription"),
      cancel: t("common.cancel"),
      confirm: t("requirementWorkbench.skipConfirm"),
      reasonLabel: t("requirementWorkbench.skipReason"),
      reasonPlaceholder: t("requirementWorkbench.skipReasonPlaceholder"),
      reasonRequired: t("requirementWorkbench.skipReasonRequired"),
    };
  }
  return {
    title: t("requirementWorkbench.rollbackTitle", { name: nodeName }),
    description: t("requirementWorkbench.rollbackDescription"),
    cancel: t("common.cancel"),
    confirm: t("requirementWorkbench.rollbackConfirm"),
    impactSummaryLabel: t("requirementWorkbench.impactSummary"),
    impactSummary: t("requirementWorkbench.rollbackImpact"),
  };
}
