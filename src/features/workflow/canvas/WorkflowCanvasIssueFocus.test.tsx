import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowCanvasIssueFocus } from "./WorkflowCanvasIssueFocus";

const { fitView } = vi.hoisted(() => ({ fitView: vi.fn() }));

vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  useReactFlow: () => ({ fitView }),
}));

describe("WorkflowCanvasIssueFocus", () => {
  beforeEach(() => fitView.mockReset());

  it("fits all nodes associated with the selected publication issue", async () => {
    render(
      <WorkflowCanvasIssueFocus
        requestId={1}
        nodeIds={["analysis", "review"]}
      />,
    );

    await waitFor(() =>
      expect(fitView).toHaveBeenCalledWith({
        nodes: [{ id: "analysis" }, { id: "review" }],
        duration: 200,
        maxZoom: 1.2,
        padding: 0.35,
      }),
    );
  });
});
