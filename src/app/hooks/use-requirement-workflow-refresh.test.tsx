import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequirementWorkflow } from "../../../domain/workflow";
import { useRequirementWorkflowRefresh } from "./use-requirement-workflow-refresh";

describe("useRequirementWorkflowRefresh", () => {
  afterEach(() => {
    delete window.realmflow;
  });

  it("waits for the authoritative workflow before updating migration state", async () => {
    const pending = deferred<RequirementWorkflow | undefined>();
    const authoritative = workflow(8);
    window.realmflow = {
      business: {
        getRequirementWorkflow: vi.fn().mockReturnValue(pending.promise),
        getWorkflowNodeExecution: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.realmflow;
    const setWorkflow = vi.fn();
    const setActiveNodeId = vi.fn();
    const setNodeExecution = vi.fn();
    const { result } = renderHook(() =>
      useRequirementWorkflowRefresh({
        requirementId: "requirement-1",
        activeNodeId: "node-1",
        loadExecutionView: vi.fn(),
        setActiveNodeId,
        setWorkflow,
        setNodeExecution,
      }),
    );

    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refreshAfterTemplateMigration(workflow(7));
    });
    expect(setWorkflow).not.toHaveBeenCalled();
    expect(setActiveNodeId).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(authoritative);
      await refresh;
    });
    expect(setWorkflow).toHaveBeenCalledWith(authoritative);
    expect(setActiveNodeId).toHaveBeenCalledWith("node-1");
  });
});

function workflow(revision: number): RequirementWorkflow {
  return {
    requirementId: "requirement-1",
    templateVersionId: "template-1",
    revision,
    maxParallelism: 1,
    nodes: [
      {
        id: "node-1",
        type: "ai_generate",
        name: "Node",
        description: "",
        order: 0,
        status: "ready",
        allowSkip: false,
      },
    ],
    edges: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
