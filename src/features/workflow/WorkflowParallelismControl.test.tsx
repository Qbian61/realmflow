import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { RequirementExecutionViewDto } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { WorkflowParallelismControl } from "./WorkflowParallelismControl";

afterEach(() => {
  delete window.realmflow;
});

it("toasts a safe localized rejection without an inline duplicate", async () => {
  window.realmflow = {
    business: {
      setWorkflowParallelism: vi.fn().mockResolvedValue({
        outcome: "rejected",
        error: {
          code: "revision_conflict",
          message: "Sensitive failure /Users/private/token",
        },
      }),
    },
  } as unknown as typeof window.realmflow;

  render(
    <LocalizationProvider>
      <ToastProvider>
        <WorkflowParallelismControl
          view={viewFixture()}
          selectedNodeId="node-1"
          onReload={vi.fn()}
        />
      </ToastProvider>
    </LocalizationProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "提高并行度" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "调整并行度失败：执行状态已更新，请重试",
  );
  expect(
    screen.queryByText("Sensitive failure /Users/private/token"),
  ).not.toBeInTheDocument();
  expect(document.querySelector(".workflow-parallelism-error")).toBeNull();
});

function viewFixture(): RequirementExecutionViewDto {
  return {
    workflow: {
      requirementId: "requirement-1",
      templateVersionId: "template-v1",
      revision: 2,
      maxParallelism: 1,
      nodes: [],
      edges: [],
    },
    execution: {
      id: "execution-1",
      requirementId: "requirement-1",
      status: "running",
      revision: 3,
      createdAt: 1,
      updatedAt: 1,
    },
    maxParallelism: 1,
    activeNodeIds: [],
    progress: { completedNodes: 0, totalNodes: 0, percent: 0 },
    nodes: [],
    selectedNode: {
      id: "node-1",
      contextSources: [],
      todos: [],
      questions: [],
      artifacts: [],
    },
  };
}
