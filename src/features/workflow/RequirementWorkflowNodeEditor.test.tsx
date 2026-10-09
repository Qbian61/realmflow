import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RequirementNode,
  RequirementWorkflow,
} from "../../../domain/workflow";
import type { BusinessApi } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { RequirementWorkflowNodeEditor } from "./RequirementWorkflowNodeEditor";

const rawError = "database /Users/private/workflow.sqlite failed";

const nodes: RequirementNode[] = [
  {
    id: "requirement-1:analysis",
    type: "ai_generate",
    name: "分析",
    description: "",
    order: 0,
    status: "pending",
    allowSkip: true,
  },
  {
    id: "requirement-1:delivery",
    type: "human_input",
    name: "交付",
    description: "",
    order: 1,
    status: "pending",
    allowSkip: false,
  },
];

const workflow: RequirementWorkflow = {
  requirementId: "requirement-1",
  templateVersionId: "template-1-v1",
  revision: 1,
  maxParallelism: 1,
  nodes,
  edges: [
    {
      id: "analysis-delivery",
      sourceNodeId: nodes[0].id,
      targetNodeId: nodes[1].id,
    },
  ],
};

function renderEditor(business: Partial<BusinessApi>): void {
  window.realmflow = { business } as typeof window.realmflow;
  render(
    <LocalizationProvider>
      <ToastProvider>
        <RequirementWorkflowNodeEditor
          requirementId={workflow.requirementId}
          workflow={workflow}
          nodes={nodes}
          selectedNode={nodes[0]}
          activeNodeId={nodes[0].id}
          onSelectNode={vi.fn()}
          onWorkflowChange={vi.fn()}
        />
      </ToastProvider>
    </LocalizationProvider>,
  );
}

async function expectSafeToast(message: string): Promise<void> {
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByText(rawError)).not.toBeInTheDocument();
}

describe("RequirementWorkflowNodeEditor transient command failures", () => {
  afterEach(() => {
    delete window.realmflow;
    vi.restoreAllMocks();
  });

  it("publishes a safe Toast when adding a node fails", async () => {
    const insertWorkflowNode = vi.fn().mockRejectedValue(new Error(rawError));
    renderEditor({ insertWorkflowNode } as Partial<BusinessApi>);

    fireEvent.click(screen.getByRole("button", { name: "插入流程节点" }));
    fireEvent.change(screen.getByRole("textbox", { name: "节点名称" }), {
      target: { value: "复核" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(insertWorkflowNode).toHaveBeenCalledOnce());
    await expectSafeToast("添加节点失败：未知错误");
  });

  it("publishes a safe Toast when updating a node fails", async () => {
    const updateWorkflowNode = vi.fn().mockRejectedValue(new Error(rawError));
    renderEditor({ updateWorkflowNode } as Partial<BusinessApi>);

    fireEvent.click(screen.getByRole("button", { name: "编辑分析节点" }));
    fireEvent.change(screen.getByRole("textbox", { name: "编辑节点名称" }), {
      target: { value: "分析更新" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存节点" }));

    await waitFor(() => expect(updateWorkflowNode).toHaveBeenCalledOnce());
    await expectSafeToast("保存节点失败：未知错误");
  });

  it("publishes a safe Toast when deleting a node fails", async () => {
    const removeWorkflowNode = vi.fn().mockRejectedValue(new Error(rawError));
    renderEditor({ removeWorkflowNode } as Partial<BusinessApi>);

    fireEvent.click(screen.getByRole("button", { name: "删除分析节点" }));

    await waitFor(() => expect(removeWorkflowNode).toHaveBeenCalledOnce());
    await expectSafeToast("删除节点失败：未知错误");
  });

  it("publishes a safe Toast when reordering nodes fails", async () => {
    const reorderWorkflowNodes = vi.fn().mockRejectedValue(new Error(rawError));
    renderEditor({ reorderWorkflowNodes } as Partial<BusinessApi>);

    fireEvent.click(screen.getByRole("button", { name: "后移分析节点" }));

    await waitFor(() => expect(reorderWorkflowNodes).toHaveBeenCalledOnce());
    await expectSafeToast("调整顺序失败：未知错误");
  });

  it("publishes a safe Toast when saving an edge fails", async () => {
    const updateWorkflowEdge = vi.fn().mockRejectedValue(new Error(rawError));
    renderEditor({ updateWorkflowEdge } as Partial<BusinessApi>);

    fireEvent.click(screen.getByRole("button", { name: "编辑流程连线" }));
    fireEvent.click(screen.getByRole("button", { name: "保存连线" }));

    await waitFor(() => expect(updateWorkflowEdge).toHaveBeenCalledOnce());
    await expectSafeToast("保存连线失败：未知错误");
  });
});
