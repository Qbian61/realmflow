import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequirementNode } from "../../../domain/workflow";
import type {
  RequirementExecutionViewDto,
} from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import {
  RequirementNodeWorkbench,
  type RequirementNodeWorkbenchLabels,
} from "./RequirementNodeWorkbench";

const selectedNode: RequirementNode = {
  id: "implementation",
  type: "ai_generate",
  name: "Implementation",
  description: "",
  order: 1,
  status: "ready",
  allowSkip: false,
  executor: {
    kind: "ai_generate",
    prompt: "Implement.",
    artifact: {
      relativePath: "artifacts/implementation.md",
      kind: "markdown",
    },
  },
};

const labels: RequirementNodeWorkbenchLabels = {
  conversation: "Conversation",
  artifacts: "Artifacts",
  todos: "Todos",
  resizeColumns: "Resize conversation and details",
  resizeRightPanels: "Resize artifacts and todos",
  attempt: (attempt) => `Attempt ${attempt}`,
  status: (status) => `Status ${status}`,
  noNodeRun: "No execution attempt",
  artifact: {
    title: "Artifacts",
    fileName: "File",
    relativePath: "Path",
    type: "Type",
    version: "Version",
    size: "Size",
    updatedAt: "Updated",
    empty: "No artifacts",
    open: "Open",
  },
  todo: {
    requiredCompletion: (completed, total) =>
      `Required ${completed} / ${total}`,
    totalCompletion: (completed, total) => `Total ${completed} / ${total}`,
    gateReady: "Ready",
    gateBlocked: "Blocked",
    unfinishedGroup: "Unfinished",
    blockedGroup: "Blocked",
    completedGroup: "Completed",
    empty: "No todos",
    openQuestions: (count) => `${count} open questions`,
    approvalPending: "Approval pending",
    missingArtifact: "Artifact missing",
  },
};

describe("RequirementNodeWorkbench", () => {
  it("composes the selected node command area and three work panels", () => {
    const onControl = vi.fn();
    const onOpenArtifact = vi.fn();
    const renderModelControl = vi.fn(() => (
      <button data-testid="model-control">Model</button>
    ));
    const renderActionControl = vi.fn(() => (
      <button data-testid="action-control">Preview</button>
    ));

    renderWorkbench({
      onControl,
      onOpenArtifact,
      renderModelControl,
      renderActionControl,
    });

    expect(
      screen.getByRole("region", { name: "Implementation" }),
    ).toBeVisible();
    expect(
      document.querySelector(".requirement-node-workbench__identity"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Status ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Attempt 2")).not.toBeInTheDocument();
    expect(screen.getByTestId("model-control")).toBeVisible();
    expect(renderModelControl).toHaveBeenCalledWith(selectedNode);
    expect(renderActionControl).toHaveBeenCalledWith(selectedNode);
    expect(screen.queryByText("节点对话")).not.toBeInTheDocument();
    expect(screen.queryByText("此节点还没有对话记录。")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Implementation Artifacts" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Implementation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Artifacts")).not.toBeInTheDocument();
    expect(screen.queryByText("Required 0 / 1")).not.toBeInTheDocument();

    const conversation = screen.getByTestId(
      "requirement-node-workbench-conversation",
    );
    const actions = screen.getByTestId("requirement-node-workbench-actions");
    expect(conversation).toContainElement(screen.getByTestId("model-control"));
    expect(actions).not.toContainElement(screen.getByTestId("model-control"));
    expect(actions).toContainElement(screen.getByTestId("action-control"));
    expect(conversation).not.toContainElement(
      screen.getByTestId("action-control"),
    );

    fireEvent.click(screen.getByRole("button", { name: "启动节点" }));
    fireEvent.click(screen.getByRole("button", { name: "Open output.md" }));

    expect(onControl).toHaveBeenCalledWith("start", undefined);
    expect(onOpenArtifact).toHaveBeenCalledWith(
      "artifacts/output.md",
      "output.md",
    );
  });

  it("keeps context, questions, and approval details out of the artifact operation area", () => {
    renderWorkbench();

    expect(screen.queryByText("Context", { selector: "summary" })).not.toBeInTheDocument();
    expect(screen.queryByText("Questions", { selector: "summary" })).not.toBeInTheDocument();
    expect(screen.queryByText("Approval", { selector: "summary" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("context-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("questions-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("approval-panel")).not.toBeInTheDocument();

    const workbench = screen.getByRole("region", { name: "Implementation" });
    expect(
      workbench.querySelectorAll(".requirement-node-workbench__panel"),
    ).toHaveLength(4);
  });

  it("keeps chat on the left and stacks actions, artifacts, and todos on the right", () => {
    renderWorkbench();

    const conversation = screen.getByTestId(
      "requirement-node-workbench-conversation",
    );
    const rightColumn = screen.getByTestId(
      "requirement-node-workbench-right-column",
    );
    const actions = screen.getByTestId("requirement-node-workbench-actions");
    const artifacts = screen.getByTestId(
      "requirement-node-workbench-artifacts",
    );
    const todos = screen.getByTestId("requirement-node-workbench-todos");

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(Array.from(rightColumn.children)).toEqual([
      actions,
      artifacts,
      screen.getByRole("separator", {
        name: "Resize artifacts and todos",
      }),
      todos,
    ]);
  });

  it("resizes the conversation and right panels with pointer and keyboard input", () => {
    renderWorkbench();

    const grid = screen.getByTestId("requirement-node-workbench-grid");
    const rightColumn = screen.getByTestId(
      "requirement-node-workbench-right-column",
    );
    const columnSeparator = screen.getByRole("separator", {
      name: "Resize conversation and details",
    });
    const panelSeparator = screen.getByRole("separator", {
      name: "Resize artifacts and todos",
    });
    Object.defineProperty(grid, "getBoundingClientRect", {
      value: () => ({ left: 100, width: 1000 }),
    });
    Object.defineProperty(rightColumn, "getBoundingClientRect", {
      value: () => ({ top: 100, height: 600 }),
    });
    Object.defineProperty(
      screen.getByTestId("requirement-node-workbench-actions"),
      "offsetHeight",
      { value: 100 },
    );
    Object.defineProperty(columnSeparator, "setPointerCapture", {
      value: vi.fn(),
    });
    Object.defineProperty(columnSeparator, "releasePointerCapture", {
      value: vi.fn(),
    });
    Object.defineProperty(panelSeparator, "setPointerCapture", {
      value: vi.fn(),
    });
    Object.defineProperty(panelSeparator, "releasePointerCapture", {
      value: vi.fn(),
    });

    fireEvent.pointerDown(columnSeparator, { pointerId: 1 });
    fireEvent(
      columnSeparator,
      new MouseEvent("pointermove", { bubbles: true, clientX: 750 }),
    );
    fireEvent.pointerUp(columnSeparator, { pointerId: 1 });
    expect(grid.style.getPropertyValue("--requirement-workbench-left")).toBe(
      "65%",
    );
    fireEvent.keyDown(columnSeparator, { key: "ArrowLeft" });
    expect(grid.style.getPropertyValue("--requirement-workbench-left")).toBe(
      "63%",
    );

    fireEvent.pointerDown(panelSeparator, { pointerId: 2 });
    fireEvent(
      panelSeparator,
      new MouseEvent("pointermove", { bubbles: true, clientY: 420 }),
    );
    fireEvent.pointerUp(panelSeparator, { pointerId: 2 });
    expect(
      rightColumn.style.getPropertyValue("--requirement-workbench-artifacts"),
    ).toBe("220px");
    fireEvent.keyDown(panelSeparator, { key: "ArrowDown" });
    expect(
      rightColumn.style.getPropertyValue("--requirement-workbench-artifacts"),
    ).toBe("228px");
  });

  it("clears an unsubmitted conversation draft when the selected node changes", () => {
    const result = renderWorkbench();
    const composer = screen.getByRole("textbox", { name: "节点对话内容" });
    fireEvent.change(composer, { target: { value: "Draft for implementation" } });
    expect(composer).toHaveValue("Draft for implementation");

    const nextNode = {
      ...selectedNode,
      id: "verification",
      name: "Verification",
    };
    result.rerender(workbench(nextNode, { view: executionView(nextNode) }));

    expect(screen.getByRole("textbox", { name: "节点对话内容" })).toHaveValue(
      "",
    );
  });

  it("keeps an active parallel node conversation interactive when it is not current", () => {
    const view = executionView();
    view.nodes[0] = {
      ...view.nodes[0],
      current: false,
      active: true,
    };

    renderWorkbench({ view });

    expect(
      screen.getByRole("textbox", { name: "节点对话内容" }),
    ).toBeEnabled();
    expect(screen.queryByText("此节点当前为只读")).not.toBeInTheDocument();
  });
});

function renderWorkbench(
  overrides: Partial<React.ComponentProps<typeof RequirementNodeWorkbench>> = {},
): ReturnType<typeof render> {
  return render(workbench(selectedNode, overrides));
}

function workbench(
  node: RequirementNode,
  overrides: Partial<React.ComponentProps<typeof RequirementNodeWorkbench>> = {},
): JSX.Element {
  return (
    <LocalizationProvider>
      <ToastProvider>
        <RequirementNodeWorkbench
          view={executionView(node)}
          selectedNode={node}
          renderModelControl={() => (
            <button data-testid="model-control">Model</button>
          )}
          controlPending={false}
          gatePending={false}
          completionSummary={{
            required: { completed: 0, total: 1 },
            total: { completed: 0, total: 1 },
            blockers: {
              openQuestions: 1,
              approvalPending: true,
              missingArtifact: false,
            },
          }}
          labels={labels}
          onControl={vi.fn()}
          onResolveGate={vi.fn(async () => undefined)}
          onReloadConversation={vi.fn(async () => undefined)}
          onCreateTodo={vi.fn()}
          onTransitionTodo={vi.fn()}
          onDeleteTodo={vi.fn()}
          onOpenArtifact={vi.fn()}
          {...overrides}
        />
      </ToastProvider>
    </LocalizationProvider>
  );
}

function executionView(node = selectedNode): RequirementExecutionViewDto {
  const nodeRun = {
    id: `node-run-${node.id}`,
    executionId: "execution-1",
    nodeId: node.id,
    status: node.status,
    attempt: 2,
    revision: 3,
    createdAt: 1,
    updatedAt: 2,
  };
  return {
    workflow: {
      requirementId: "requirement-1",
      templateVersionId: "template-1",
      revision: 1,
      maxParallelism: 1,
      nodes: [node],
      edges: [],
    },
    execution: {
      id: "execution-1",
      requirementId: "requirement-1",
      status: "running",
      currentNodeId: node.id,
      revision: 1,
      createdAt: 1,
      updatedAt: 2,
    },
    maxParallelism: 1,
    activeNodeIds: [node.id],
    focusedNodeId: node.id,
    progress: { completedNodes: 0, totalNodes: 1, percent: 0 },
    nodes: [
      {
        id: node.id,
        name: node.name,
        type: node.type,
        status: node.status,
        current: true,
        active: true,
        focused: true,
        nodeRunId: nodeRun.id,
        nodeRunRevision: nodeRun.revision,
        attempt: nodeRun.attempt,
      },
    ],
    selectedNode: {
      id: node.id,
      nodeRun,
      contextSources: [],
      todos: [],
      questions: [],
      artifacts: [
        {
          id: "artifact-1",
          nodeId: node.id,
          relativePath: "artifacts/output.md",
          kind: "markdown",
          version: 1,
          byteSize: 128,
          isPrimary: true,
          updatedAt: 2,
        },
      ],
    },
  };
}
