import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type {
  BusinessApi,
  RequirementExecutionViewDto,
} from "../../../shared/business";
import { useRequirementExecutionWorkbench } from "./use-requirement-execution-workbench";

function Harness({
  requirementId = "requirement-1",
}: {
  requirementId?: string;
}): JSX.Element {
  const controller = useRequirementExecutionWorkbench(requirementId);

  return (
    <>
      <output aria-label="state">
        {controller.selectedNodeId}|{controller.view?.selectedNode.id}|
        {String(controller.loading)}|{controller.error?.message ?? ""}
      </output>
      <button onClick={() => void controller.select("a")}>select-a</button>
      <button onClick={() => void controller.select("c")}>select-c</button>
      <button onClick={() => void controller.reload()}>reload</button>
      <button onClick={() => void controller.afterDelete("b")}>
        delete-b
      </button>
      <button onClick={() => void controller.afterDelete("c")}>
        delete-c
      </button>
      <button onClick={() => void controller.afterRollback("a")}>
        rollback-a
      </button>
    </>
  );
}

describe("useRequirementExecutionWorkbench", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the authoritative view and adopts its selected node", async () => {
    const getRequirementExecutionView = installBusiness(
      vi.fn().mockResolvedValue(executionView("b")),
    );

    render(<Harness />);

    expect(screen.getByLabelText("state")).toHaveTextContent("||true|");
    await waitFor(() =>
      expect(screen.getByLabelText("state")).toHaveTextContent("b|b|false|"),
    );
    expect(getRequirementExecutionView).toHaveBeenCalledWith({
      requirementId: "requirement-1",
    });
  });

  it("accepts only the latest response during rapid node selection", async () => {
    const firstSelection = deferred<RequirementExecutionViewDto>();
    const lastSelection = deferred<RequirementExecutionViewDto>();
    installBusiness(
      vi
        .fn()
        .mockResolvedValueOnce(executionView("b"))
        .mockReturnValueOnce(firstSelection.promise)
        .mockReturnValueOnce(lastSelection.promise),
    );
    render(<Harness />);
    await selected("b");

    fireEvent.click(screen.getByRole("button", { name: "select-a" }));
    fireEvent.click(screen.getByRole("button", { name: "select-c" }));

    await act(async () => {
      lastSelection.resolve(executionView("c"));
      await lastSelection.promise;
    });
    await selected("c");

    await act(async () => {
      firstSelection.resolve(executionView("a"));
      await firstSelection.promise;
    });
    expect(screen.getByLabelText("state")).toHaveTextContent("c|c|false|");
  });

  it("hides the previous requirement snapshot immediately when the route changes", async () => {
    const nextRequirement = deferred<RequirementExecutionViewDto>();
    installBusiness(
      vi
        .fn()
        .mockResolvedValueOnce(executionView("b"))
        .mockReturnValueOnce(nextRequirement.promise),
    );
    const result = render(<Harness />);
    await selected("b");

    result.rerender(<Harness requirementId="requirement-2" />);

    expect(screen.getByLabelText("state")).toHaveTextContent("||true|");
  });

  it("keeps the last successful snapshot and selection when reload fails", async () => {
    const getRequirementExecutionView = installBusiness(
      vi
        .fn()
        .mockResolvedValueOnce(executionView("b"))
        .mockRejectedValueOnce(new Error("refresh failed")),
    );
    render(<Harness />);
    await selected("b");

    fireEvent.click(screen.getByRole("button", { name: "reload" }));

    await waitFor(() =>
      expect(screen.getByLabelText("state")).toHaveTextContent(
        "b|b|false|refresh failed",
      ),
    );
    expect(getRequirementExecutionView).toHaveBeenLastCalledWith({
      requirementId: "requirement-1",
      nodeId: "b",
    });
  });

  it.each([
    {
      label: "delete-b",
      initial: "b",
      remaining: ["a", "c"],
      expected: "c",
    },
    {
      label: "delete-c",
      initial: "c",
      remaining: ["a", "b"],
      expected: "b",
    },
  ])(
    "selects the stable neighbor after $label",
    async ({ label, initial, remaining, expected }) => {
      const getRequirementExecutionView = installBusiness(
        vi
          .fn()
          .mockResolvedValueOnce(executionView(initial))
          .mockResolvedValueOnce(executionView(expected, remaining)),
      );
      render(<Harness />);
      await selected(initial);

      fireEvent.click(screen.getByRole("button", { name: label }));

      await selected(expected);
      expect(getRequirementExecutionView).toHaveBeenLastCalledWith({
        requirementId: "requirement-1",
        nodeId: expected,
      });
    },
  );

  it("selects and reloads the rollback target without invoking a command", async () => {
    const getRequirementExecutionView = installBusiness(
      vi
        .fn()
        .mockResolvedValueOnce(executionView("b"))
        .mockResolvedValueOnce(executionView("a")),
    );
    render(<Harness />);
    await selected("b");

    fireEvent.click(screen.getByRole("button", { name: "rollback-a" }));

    await selected("a");
    expect(getRequirementExecutionView).toHaveBeenLastCalledWith({
      requirementId: "requirement-1",
      nodeId: "a",
    });
    expect(Object.keys(window.realmflow?.business ?? {})).toEqual([
      "getRequirementExecutionView",
    ]);
  });
});

function selected(nodeId: string): Promise<void> {
  return waitFor(() =>
    expect(screen.getByLabelText("state")).toHaveTextContent(
      `${nodeId}|${nodeId}|false|`,
    ),
  );
}

function installBusiness(
  getRequirementExecutionView: ReturnType<typeof vi.fn>,
): ReturnType<typeof vi.fn> {
  vi.stubGlobal("realmflow", {
    business: { getRequirementExecutionView } as unknown as BusinessApi,
  });
  return getRequirementExecutionView;
}

function executionView(
  selectedNodeId: string,
  nodeIds = ["a", "b", "c"],
): RequirementExecutionViewDto {
  const nodes = nodeIds.map((id, order) => ({
    id,
    type: "ai_generate" as const,
    name: id.toUpperCase(),
    description: "",
    order,
    status: id === selectedNodeId ? ("ready" as const) : ("pending" as const),
    allowSkip: false,
  }));
  return {
    workflow: {
      requirementId: "requirement-1",
      templateVersionId: "template-1",
      revision: 1,
      maxParallelism: 1,
      nodes,
      edges: [],
    },
    maxParallelism: 1,
    activeNodeIds: [selectedNodeId],
    progress: {
      completedNodes: 0,
      totalNodes: nodes.length,
      percent: 0,
    },
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      status: node.status,
      current: node.id === selectedNodeId,
      active: node.id === selectedNodeId,
      focused: node.id === selectedNodeId,
    })),
    selectedNode: {
      id: selectedNodeId,
      contextSources: [],
      todos: [],
      questions: [],
      artifacts: [],
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
