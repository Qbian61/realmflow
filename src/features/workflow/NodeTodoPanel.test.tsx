import { fireEvent, render as testingRender, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NodeTodoDto } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import {
  NodeTodoPanel,
  type NodeTodoPanelLabels,
} from "./NodeTodoPanel";

const labels: NodeTodoPanelLabels = {
  requiredCompletion: (completed, total) =>
    `Required ${completed} / ${total}`,
  totalCompletion: (completed, total) => `Total ${completed} / ${total}`,
  gateReady: "Completion gate ready",
  gateBlocked: "Completion gate blocked",
  unfinishedGroup: "Unfinished",
  blockedGroup: "Blocked",
  completedGroup: "Completed",
  empty: "No tasks",
  openQuestions: (count) => `${count} open questions`,
  approvalPending: "Approval pending",
  missingArtifact: "Required artifact missing",
};

const completionSummary = {
  required: { completed: 1, total: 2 },
  total: { completed: 1, total: 2 },
  blockers: {
    openQuestions: 0,
    approvalPending: false,
    missingArtifact: false,
  },
};

function todo(
  id: string,
  status: NodeTodoDto["status"],
  createdAt: number,
  title = id,
): NodeTodoDto {
  return {
    id,
    nodeRunId: "node-run-1",
    title,
    required: true,
    status,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    ...(status === "completed" ? { completedAt: createdAt + 1_000 } : {}),
  };
}

function render(
  props: Partial<React.ComponentProps<typeof NodeTodoPanel>> = {},
): ReturnType<typeof testingRender> {
  return testingRender(
    <LocalizationProvider>
      <NodeTodoPanel
        todos={[]}
        nodeStatus="running"
        completionSummary={completionSummary}
        labels={labels}
        executionRole={{ kind: "model", label: "DeepSeek V4 Pro" }}
        onCreate={vi.fn()}
        onTransition={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </LocalizationProvider>,
  );
}

describe("NodeTodoPanel", () => {
  it("creates required todos without exposing a required option", () => {
    const onCreate = vi.fn();
    render({ onCreate });

    expect(screen.queryByText("必需")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("新建节点待办"), {
      target: { value: "  Review release notes  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加待办" }));

    expect(onCreate).toHaveBeenCalledWith({
      title: "Review release notes",
      required: true,
    });
  });

  it("renders one stable flat list without status groups, badges, or selects", () => {
    render({
      todos: [
        todo("completed", "completed", 30),
        todo("blocked", "blocked", 20),
        todo("pending", "pending", 10),
      ],
    });

    expect(screen.queryByRole("group", { name: "Unfinished" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Blocked" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Completed" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("必需")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("pending"),
      expect.stringContaining("blocked"),
      expect.stringContaining("completed"),
    ]);
  });

  it("completes a todo from its checkbox and styles completed copy", () => {
    const onTransition = vi.fn();
    render({
      todos: [
        todo("pending", "pending", 10, "Pending task"),
        todo("completed", "completed", 20, "Completed task"),
      ],
      onTransition,
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "完成待办：Pending task" }),
    );
    expect(onTransition).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pending" }),
      "completed",
    );
    expect(screen.getByText("Completed task")).toHaveClass(
      "node-todo__title--completed",
    );
    expect(
      screen.getByRole("checkbox", { name: "已完成：Completed task" }),
    ).toBeChecked();
  });

  it("requires confirmation before deleting and supports cancellation", () => {
    const onDelete = vi.fn();
    render({
      todos: [todo("todo-1", "pending", 10, "Review release")],
      onDelete,
    });

    const deleteButton = screen.getByRole("button", {
      name: "删除待办：Review release",
    });
    expect(deleteButton).toHaveClass("node-todo__delete");
    fireEvent.click(deleteButton);
    expect(screen.getByRole("dialog", { name: "删除待办" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "todo-1" }),
    );
  });

  it("closes the confirmation immediately when deletion later fails", async () => {
    let rejectDelete: (error: Error) => void = () => undefined;
    const onDelete = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectDelete = reject;
        }),
    );
    render({
      todos: [todo("todo-1", "pending", 10, "Review release")],
      onDelete,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "删除待办：Review release" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(screen.queryByRole("dialog", { name: "删除待办" })).toBeNull();
    expect(screen.getByText("Review release")).toBeInTheDocument();
    rejectDelete(new Error("Delete failed"));
    await expect(onDelete.mock.results[0].value).rejects.toThrow(
      "Delete failed",
    );
  });

  it("shows start, end, and execution role in a viewport-safe portal tooltip", () => {
    const startedAt = new Date(2026, 9, 1, 12, 12, 12).getTime();
    const completed = {
      ...todo("todo-1", "completed", startedAt, "Review release"),
      completedAt: new Date(2026, 9, 1, 12, 12, 20).getTime(),
    };
    render({ todos: [completed] });

    fireEvent.mouseEnter(screen.getByRole("listitem"));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveTextContent("开始时间2026/10/01 12:12:12");
    expect(tooltip).toHaveTextContent("结束时间2026/10/01 12:12:20");
    expect(tooltip).toHaveTextContent("执行角色DeepSeek V4 Pro");
    expect(tooltip).toHaveStyle({ position: "fixed" });
  });

  it("shows a missing end time and localizes a user execution role", () => {
    render({
      todos: [todo("todo-1", "pending", 10)],
      executionRole: { kind: "user" },
    });

    fireEvent.focus(screen.getByRole("listitem"));

    expect(screen.getByRole("tooltip")).toHaveTextContent("结束时间--");
    expect(screen.getByRole("tooltip")).toHaveTextContent("执行角色用户");
  });

  it.each(["completed", "skipped"] as const)(
    "is read-only when the node is %s",
    (nodeStatus) => {
      render({
        nodeStatus,
        todos: [todo("todo-1", "pending", 1, "Read-only task")],
      });

      expect(screen.queryByLabelText("新建节点待办")).not.toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "完成待办：Read-only task" }),
      ).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "删除待办：Read-only task" }),
      ).not.toBeInTheDocument();
    },
  );
});
