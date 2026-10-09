import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  getAllowedNodeTodoTransitions,
  type NodeTodoStatus,
} from "../../../domain/node-todo";
import type { NodeRunStatus } from "../../../domain/workflow";
import type {
  NodeTodoDto,
  RequirementExecutionViewDto,
} from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";
import { NodeTodoDeleteDialog } from "./NodeTodoDeleteDialog";
import { NodeTodoTooltip } from "./NodeTodoTooltip";

export type NodeTodoCompletionSummary = {
  required: {
    completed: number;
    total: number;
  };
  total: {
    completed: number;
    total: number;
  };
  blockers: {
    openQuestions: number;
    approvalPending: boolean;
    missingArtifact: boolean;
  };
};

export type NodeTodoPanelLabels = {
  requiredCompletion: (completed: number, total: number) => string;
  totalCompletion: (completed: number, total: number) => string;
  gateReady: string;
  gateBlocked: string;
  unfinishedGroup: string;
  blockedGroup: string;
  completedGroup: string;
  empty: string;
  openQuestions: (count: number) => string;
  approvalPending: string;
  missingArtifact: string;
};

type ExecutionRole =
  RequirementExecutionViewDto["nodes"][number]["executionRole"];

type NodeTodoPanelProps = {
  todos: NodeTodoDto[];
  nodeStatus: NodeRunStatus;
  completionSummary: NodeTodoCompletionSummary;
  pendingId?: string;
  labels: NodeTodoPanelLabels;
  executionRole?: ExecutionRole;
  onCreate: (input: {
    title: string;
    required: boolean;
  }) => void | Promise<void>;
  onTransition: (
    todo: NodeTodoDto,
    status: NodeTodoStatus,
  ) => void | Promise<void>;
  onDelete: (todo: NodeTodoDto) => void | Promise<void>;
};

const readOnlyNodeStatuses = new Set<NodeRunStatus>(["completed", "skipped"]);

export function NodeTodoPanel({
  todos,
  nodeStatus,
  completionSummary,
  pendingId,
  labels,
  executionRole,
  onCreate,
  onTransition,
  onDelete,
}: NodeTodoPanelProps): JSX.Element {
  const { t } = useLocalization();
  const [title, setTitle] = useState("");
  const [deleteTodo, setDeleteTodo] = useState<NodeTodoDto>();
  const [tooltip, setTooltip] = useState<{
    todo: NodeTodoDto;
    anchor: HTMLElement;
  }>();
  const readOnly = readOnlyNodeStatuses.has(nodeStatus);
  const creationPending =
    pendingId !== undefined && !todos.some((todo) => todo.id === pendingId);
  const blockers = [
    completionSummary.blockers.openQuestions > 0
      ? labels.openQuestions(completionSummary.blockers.openQuestions)
      : undefined,
    completionSummary.blockers.approvalPending
      ? labels.approvalPending
      : undefined,
    completionSummary.blockers.missingArtifact
      ? labels.missingArtifact
      : undefined,
  ].filter((blocker): blocker is string => blocker !== undefined);
  const sortedTodos = [...todos].sort(
    (left, right) =>
      left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );

  return (
    <section
      className="node-todo-panel"
      aria-label={t("requirementDetail.todos")}
    >
      {blockers.length > 0 ? (
        <ul className="node-todo-blockers">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}

      {!readOnly ? (
        <form
          className="node-todo-create"
          onSubmit={(event) => {
            event.preventDefault();
            const normalizedTitle = title.trim();
            if (!normalizedTitle || creationPending) return;
            try {
              void Promise.resolve(
                onCreate({ title: normalizedTitle, required: true }),
              )
                .then(() => setTitle(""))
                .catch(() => undefined);
            } catch {
              // The owner supplies the visible error and authoritative data.
            }
          }}
        >
          <input name="requirement-detail-new-todo" autoComplete="off"
            aria-label={t("requirementDetail.newTodo")}
            maxLength={500}
            placeholder={t("requirementDetail.todoPlaceholder")}
            value={title}
            disabled={creationPending}
            onChange={(event) => setTitle(event.target.value)}
          />
          <button type="submit" disabled={!title.trim() || creationPending}>
            <Plus size={14} />
            {t("requirementDetail.addTodo")}
          </button>
        </form>
      ) : null}

      {todos.length === 0 ? (
        <p className="node-workbench-empty-state">{labels.empty}</p>
      ) : (
        <ul className="node-todo-list">
          {sortedTodos.map((todo) => {
            const completed = todo.status === "completed";
            const canComplete = getAllowedNodeTodoTransitions(
              todo.status,
            ).includes("completed");
            return (
              <li
                className="node-todo"
                key={todo.id}
                tabIndex={0}
                aria-describedby={
                  tooltip?.todo.id === todo.id
                    ? `node-todo-tooltip-${todo.id}`
                    : undefined
                }
                onMouseEnter={(event) =>
                  setTooltip({ todo, anchor: event.currentTarget })
                }
                onMouseLeave={() => setTooltip(undefined)}
                onFocus={(event) =>
                  setTooltip({ todo, anchor: event.currentTarget })
                }
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setTooltip(undefined);
                  }
                }}
              >
                <input name={`node-todo-${todo.id}-completed`} autoComplete="off"
                  type="checkbox"
                  checked={completed}
                  disabled={
                    readOnly ||
                    completed ||
                    !canComplete ||
                    pendingId === todo.id
                  }
                  aria-label={t(
                    completed
                      ? "requirementDetail.todoCompletedAria"
                      : "requirementDetail.completeTodoAria",
                    { title: todo.title },
                  )}
                  onChange={() => {
                    if (!completed && canComplete) {
                      void Promise.resolve(
                        onTransition(todo, "completed"),
                      ).catch(() => undefined);
                    }
                  }}
                />
                <span
                  className={
                    completed ? "node-todo__title--completed" : undefined
                  }
                >
                  {todo.title}
                </span>
                {!readOnly ? (
                  <button
                    type="button"
                    className="node-todo__delete"
                    aria-label={t("requirementDetail.deleteTodoAria", {
                      title: todo.title,
                    })}
                    title={t("tooltip.delete")}
                    disabled={pendingId === todo.id}
                    onClick={() => setDeleteTodo(todo)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {tooltip ? (
        <NodeTodoTooltip
          anchor={tooltip.anchor}
          todo={tooltip.todo}
          executionRole={executionRole}
          id={`node-todo-tooltip-${tooltip.todo.id}`}
        />
      ) : null}
      {deleteTodo ? (
        <NodeTodoDeleteDialog
          todo={deleteTodo}
          disabled={pendingId === deleteTodo.id}
          onCancel={() => setDeleteTodo(undefined)}
          onConfirm={() => {
            const todo = deleteTodo;
            setDeleteTodo(undefined);
            try {
              void Promise.resolve(onDelete(todo)).catch(() => undefined);
            } catch {
              // The owner supplies the visible error and authoritative data.
            }
          }}
        />
      ) : null}
    </section>
  );
}
