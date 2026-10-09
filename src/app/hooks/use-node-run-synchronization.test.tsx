import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiRunController } from "./use-ai-run-controller";
import { useNodeRunSynchronization } from "./use-node-run-synchronization";

describe("useNodeRunSynchronization", () => {
  afterEach(() => {
    delete window.realmflow;
  });

  it("reloads the full execution view when an attached AI run terminates", async () => {
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi.fn(),
        getRequirementWorkflow: vi.fn().mockResolvedValue(undefined),
        getWorkflowNodeExecution: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.realmflow;
    const refreshExecutionView = vi.fn().mockResolvedValue(undefined);
    const aiRuns = controller("running");
    const { rerender } = renderHook<void, {
      status: "running" | "completed";
    }>(
      ({ status }: { status: "running" | "completed" }) => {
        aiRuns.runs["ai-run-1"] = { status } as never;
        useNodeRunSynchronization({
          requirementId: "requirement-1",
          nodeExecution: {
            execution: {
              id: "execution-1",
              requirementId: "requirement-1",
              status: "running",
              currentNodeId: "node-1",
              revision: 1,
              createdAt: 1,
              updatedAt: 1,
            },
            nodeRun: {
              id: "node-run-1",
              executionId: "execution-1",
              nodeId: "node-1",
              aiRunId: "ai-run-1",
              status: "running",
              attempt: 1,
              revision: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
          aiRuns,
          setWorkflow: vi.fn(),
          setNodeExecution: vi.fn(),
          refreshExecutionView,
        });
      },
      {
        initialProps: {
          status: "running",
        },
      },
    );

    rerender({ status: "completed" });

    await waitFor(() =>
      expect(refreshExecutionView).toHaveBeenCalledWith("node-1"),
    );
  });

  it("reloads the selected view when a non-selected active branch terminates", async () => {
    window.realmflow = {
      business: {
        getRequirementExecutionView: vi.fn(),
      },
    } as unknown as typeof window.realmflow;
    const refreshExecutionView = vi.fn().mockResolvedValue(undefined);
    const aiRuns = controller("running");
    aiRuns.runs["ai-run-2"] = { status: "running" } as never;
    aiRuns.findRun = vi.fn((_requirementId, nodeId) =>
      nodeId === "node-2" ? aiRuns.runs["ai-run-2"] : undefined,
    );
    const { rerender } = renderHook<void, {
      status: "running" | "completed";
    }>(
      ({ status }) => {
        aiRuns.runs["ai-run-2"] = { status } as never;
        useNodeRunSynchronization({
          requirementId: "requirement-1",
          activeNodeIds: ["node-1", "node-2"],
          aiRuns,
          setWorkflow: vi.fn(),
          setNodeExecution: vi.fn(),
          refreshExecutionView,
          selectedNodeId: "node-1",
        });
      },
      { initialProps: { status: "running" } },
    );

    rerender({ status: "completed" });

    await waitFor(() =>
      expect(refreshExecutionView).toHaveBeenCalledWith("node-1"),
    );
  });
});

function controller(status: "running" | "completed"): AiRunController {
  return {
    runs: { "ai-run-1": { status } as never },
    start: vi.fn(),
    attach: vi.fn(),
    cancel: vi.fn(),
    findRun: vi.fn(),
  };
}
