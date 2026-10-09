import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NodeTodoStatus } from "../../../domain/node-todo";
import type { RequirementNode } from "../../../domain/workflow";
import type {
  NodeTodoDto,
  RequirementExecutionViewDto,
  ResolveWorkflowNodeGateCommand,
  WorkflowNodeControlAction,
} from "../../../shared/business";
import { RequirementNodeConversationPanel } from "../conversation/RequirementNodeConversationPanel";
import {
  NodeArtifactPanel,
  type NodeArtifactPanelLabels,
} from "./NodeArtifactPanel";
import { NodeGateActions } from "./NodeGateActions";
import {
  NodeTodoPanel,
  type NodeTodoCompletionSummary,
  type NodeTodoPanelLabels,
} from "./NodeTodoPanel";
import { WorkflowNodeControls } from "./WorkflowNodeControls";

export type RequirementNodeWorkbenchLabels = {
  conversation: string;
  artifacts: string;
  todos: string;
  resizeColumns: string;
  resizeRightPanels: string;
  attempt: (attempt: number) => string;
  status: (status: RequirementNode["status"]) => string;
  noNodeRun: string;
  artifact: NodeArtifactPanelLabels;
  todo: NodeTodoPanelLabels;
};

type RequirementNodeWorkbenchProps = {
  view: RequirementExecutionViewDto;
  selectedNode: RequirementNode;
  renderModelControl?: (node: RequirementNode) => ReactNode;
  renderActionControl?: (node: RequirementNode) => ReactNode;
  controlPending: boolean;
  gatePending: boolean;
  completionSummary: NodeTodoCompletionSummary;
  labels: RequirementNodeWorkbenchLabels;
  todoPendingId?: string;
  onControl: (
    action: WorkflowNodeControlAction,
    reason?: string,
  ) => void;
  onResolveGate: (
    gate: ResolveWorkflowNodeGateCommand["gate"],
  ) => Promise<void>;
  onReloadConversation: (nodeId: string) => Promise<void>;
  onResponseActiveChange?: (nodeId: string, active: boolean) => void;
  onCreateTodo: (input: {
    title: string;
    required: boolean;
  }) => void | Promise<void>;
  onTransitionTodo: (
    todo: NodeTodoDto,
    status: NodeTodoStatus,
  ) => void | Promise<void>;
  onDeleteTodo: (todo: NodeTodoDto) => void | Promise<void>;
  onOpenArtifact: (relativePath: string, label: string) => void;
};

export function RequirementNodeWorkbench({
  view,
  selectedNode,
  renderModelControl,
  renderActionControl,
  controlPending,
  gatePending,
  completionSummary,
  labels,
  todoPendingId,
  onControl,
  onResolveGate,
  onReloadConversation,
  onResponseActiveChange,
  onCreateTodo,
  onTransitionTodo,
  onDeleteTodo,
  onOpenArtifact,
}: RequirementNodeWorkbenchProps): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLElement>(null);
  const resizingColumnsRef = useRef(false);
  const resizingPanelsRef = useRef(false);
  const [leftPercent, setLeftPercent] = useState(56);
  const [artifactHeight, setArtifactHeight] = useState<number>();
  const selected = view.selectedNode;
  const nodeRun = selected.nodeRun;
  const selectedSummary = view.nodes.find(
    (node) => node.id === selectedNode.id,
  );
  const modelControl = renderModelControl?.(selectedNode);
  const actionControl = renderActionControl?.(selectedNode);
  const updateLeftPercent = (clientX: number): void => {
    const bounds = gridRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const next = ((clientX - bounds.left) / bounds.width) * 100;
    setLeftPercent(Math.min(70, Math.max(35, Math.round(next))));
  };
  const updateArtifactHeight = (clientY: number): void => {
    const bounds = rightColumnRef.current?.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;
    const actionsHeight = actionsRef.current?.offsetHeight ?? 0;
    const maxHeight = Math.max(120, bounds.height - actionsHeight - 166);
    const next = clientY - bounds.top - actionsHeight;
    setArtifactHeight(Math.min(maxHeight, Math.max(120, Math.round(next))));
  };
  const finishResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    resizingRef: MutableRefObject<boolean>,
  ): void => {
    resizingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleColumnKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setLeftPercent((current) =>
      Math.min(70, Math.max(35, current + (event.key === "ArrowRight" ? 2 : -2))),
    );
  };
  const handlePanelKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const current = artifactHeight ?? 220;
    const bounds = rightColumnRef.current?.getBoundingClientRect();
    const actionsHeight = actionsRef.current?.offsetHeight ?? 0;
    const maxHeight = bounds
      ? Math.max(120, bounds.height - actionsHeight - 166)
      : Number.POSITIVE_INFINITY;
    setArtifactHeight(
      Math.min(
        maxHeight,
        Math.max(120, current + (event.key === "ArrowDown" ? 8 : -8)),
      ),
    );
  };
  const gridStyle = {
    "--requirement-workbench-left": `${leftPercent}%`,
  } as CSSProperties;
  const rightColumnStyle = artifactHeight
    ? ({
        "--requirement-workbench-artifacts": `${artifactHeight}px`,
      } as CSSProperties)
    : undefined;

  return (
    <section
      className="requirement-node-workbench"
      aria-label={selectedNode.name}
    >
      <div
        ref={gridRef}
        className="requirement-node-workbench__grid"
        data-testid="requirement-node-workbench-grid"
        style={gridStyle}
      >
        <section
          className="requirement-node-workbench__panel requirement-node-workbench__conversation"
          data-testid="requirement-node-workbench-conversation"
        >
          {nodeRun ? (
            <RequirementNodeConversationPanel
              key={nodeRun.id}
              requirementId={view.workflow.requirementId}
              nodeId={selectedNode.id}
              nodeName={selectedNode.name}
              nodeRunId={nodeRun.id}
              conversation={selected.conversation}
              interactive={
                selectedSummary?.active === true &&
                [
                  "ready",
                  "running",
                  "waiting_user",
                  "paused",
                  "blocked",
                ].includes(nodeRun.status)
              }
              questions={selected.questions}
              modelControl={modelControl}
              onReload={onReloadConversation}
              onResponseActiveChange={(active) =>
                onResponseActiveChange?.(selectedNode.id, active)
              }
            />
          ) : (
            <p className="requirement-node-workbench__empty">
              {labels.noNodeRun}
            </p>
          )}
        </section>

        <div
          className="requirement-node-workbench__column-resizer"
          role="separator"
          aria-label={labels.resizeColumns}
          aria-orientation="vertical"
          aria-valuemin={35}
          aria-valuemax={70}
          aria-valuenow={leftPercent}
          tabIndex={0}
          onKeyDown={handleColumnKeyDown}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            resizingColumnsRef.current = true;
          }}
          onPointerMove={(event) => {
            if (resizingColumnsRef.current) updateLeftPercent(event.clientX);
          }}
          onPointerUp={(event) => finishResize(event, resizingColumnsRef)}
          onPointerCancel={() => {
            resizingColumnsRef.current = false;
          }}
        />

        <div
          ref={rightColumnRef}
          className="requirement-node-workbench__right-column"
          data-testid="requirement-node-workbench-right-column"
          style={rightColumnStyle}
        >
          <section
            ref={actionsRef}
            className="requirement-node-workbench__panel requirement-node-workbench__actions"
            data-testid="requirement-node-workbench-actions"
          >
            <header className="requirement-node-workbench__command-bar">
              <div className="requirement-node-workbench__commands">
                {actionControl}
                {nodeRun ? (
                  <>
                    <NodeGateActions
                      node={selectedNode}
                      approval={selected.approval}
                      disabled={gatePending}
                      onResolve={onResolveGate}
                    />
                    <WorkflowNodeControls
                      node={selectedNode}
                      pending={controlPending}
                      onAction={(action, reason) => onControl(action, reason)}
                    />
                  </>
                ) : null}
              </div>
            </header>
          </section>

          <section
            className="requirement-node-workbench__panel requirement-node-workbench__artifacts"
            data-testid="requirement-node-workbench-artifacts"
          >
            <NodeArtifactPanel
              nodeName={selectedNode.name}
              artifacts={selected.artifacts}
              labels={labels.artifact}
              onOpenArtifact={onOpenArtifact}
            />
          </section>

          <div
            className="requirement-node-workbench__row-resizer"
            role="separator"
            aria-label={labels.resizeRightPanels}
            aria-orientation="horizontal"
            aria-valuemin={120}
            aria-valuenow={artifactHeight ?? 220}
            tabIndex={0}
            onKeyDown={handlePanelKeyDown}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              resizingPanelsRef.current = true;
            }}
            onPointerMove={(event) => {
              if (resizingPanelsRef.current) updateArtifactHeight(event.clientY);
            }}
            onPointerUp={(event) => finishResize(event, resizingPanelsRef)}
            onPointerCancel={() => {
              resizingPanelsRef.current = false;
            }}
          />

          <section
            className="requirement-node-workbench__panel requirement-node-workbench__todos"
            data-testid="requirement-node-workbench-todos"
          >
            <NodeTodoPanel
              todos={selected.todos}
              nodeStatus={nodeRun?.status ?? selectedNode.status}
              completionSummary={completionSummary}
              pendingId={todoPendingId}
              labels={labels.todo}
              executionRole={selectedSummary?.executionRole}
              onCreate={onCreateTodo}
              onTransition={onTransitionTodo}
              onDelete={onDeleteTodo}
            />
          </section>
        </div>
      </div>
    </section>
  );
}
