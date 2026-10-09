import { describe, expect, it, vi } from "vitest";
import type {
  BusinessApi,
  WorkflowTemplateDraftDto,
} from "../../../../shared/business";
import type { CanvasHistoryCommand } from "./workflow-canvas-actions";
import { removeEdgeWithHistory } from "./workflow-canvas-history";

describe("workflow canvas history commands", () => {
  it("restores a removed edge through the latest queued template revision", async () => {
    let current = template();
    const removed = template();
    removed.revision = 2;
    removed.currentVersion.edges = [];
    removed.currentVersion.edgeCount = 0;
    const restored = template();
    restored.revision = 3;
    const business = {
      removeWorkflowTemplateEdge: vi.fn().mockResolvedValue(removed),
      addWorkflowTemplateEdge: vi.fn().mockResolvedValue(restored),
    } as unknown as BusinessApi;
    let command: CanvasHistoryCommand | undefined;
    const runMutation = async (
      operation: (
        value: WorkflowTemplateDraftDto,
      ) => Promise<WorkflowTemplateDraftDto>,
    ) => {
      current = await operation(current);
      return current;
    };

    await removeEdgeWithHistory({
      business,
      runMutation,
      edgeId: "analysis-review",
      sourceNodeId: "analysis",
      targetNodeId: "review",
      record: (recorded) => {
        command = recorded;
      },
    });
    await command?.undo();

    expect(business.addWorkflowTemplateEdge).toHaveBeenCalledWith({
      id: "template-1",
      expectedRevision: 2,
      sourceNodeId: "analysis",
      targetNodeId: "review",
    });
  });
});

function template(): WorkflowTemplateDraftDto {
  return {
    id: "template-1",
    name: "Delivery",
    description: "",
    status: "draft",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    currentVersion: {
      id: "template-1-v1",
      version: 1,
      status: "draft",
      checksum: "checksum",
      nodeCount: 2,
      edgeCount: 1,
      nodes: [
        {
          id: "analysis",
          stableKey: "analysis",
          type: "ai_generate",
          name: "Analysis",
          description: "",
          order: 0,
          allowSkip: false,
        },
        {
          id: "review",
          stableKey: "review",
          type: "approval",
          name: "Review",
          description: "",
          order: 1,
          allowSkip: false,
        },
      ],
      edges: [
        {
          id: "analysis-review",
          sourceNodeId: "analysis",
          targetNodeId: "review",
        },
      ],
    },
  };
}
