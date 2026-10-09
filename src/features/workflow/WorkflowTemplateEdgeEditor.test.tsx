import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BusinessApi,
  WorkflowTemplateDraftDto,
} from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { WorkflowTemplateEdgeEditor } from "./WorkflowTemplateEdgeEditor";

const rawError = "provider credential=secret-edge-error";

const template: WorkflowTemplateDraftDto = {
  id: "template-1",
  name: "交付流程",
  description: "",
  status: "draft",
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
  currentVersion: {
    id: "template-1-v1",
    version: 1,
    status: "draft",
    checksum: "draft",
    nodeCount: 2,
    edgeCount: 1,
    nodes: [
      {
        id: "analysis",
        stableKey: "analysis",
        type: "ai_generate",
        name: "分析",
        description: "",
        order: 0,
        allowSkip: false,
      },
      {
        id: "delivery",
        stableKey: "delivery",
        type: "human_input",
        name: "交付",
        description: "",
        order: 1,
        allowSkip: false,
      },
    ],
    edges: [
      {
        id: "analysis-delivery",
        sourceNodeId: "analysis",
        targetNodeId: "delivery",
      },
    ],
  },
};

function renderEditor(business: Partial<BusinessApi>): void {
  render(
    <LocalizationProvider>
      <ToastProvider>
        <WorkflowTemplateEdgeEditor
          business={business as BusinessApi}
          template={template}
          onChange={vi.fn()}
        />
      </ToastProvider>
    </LocalizationProvider>,
  );
}

async function expectSafeToast(message: string): Promise<void> {
  const alert = (await screen.findAllByRole("alert")).find((candidate) =>
    candidate.classList.contains("toast-message"),
  );
  expect(alert).toBeDefined();
  expect(alert).toHaveTextContent(message);
  expect(alert).toHaveAttribute("data-toast-level", "error");
  expect(screen.queryByText(rawError)).not.toBeInTheDocument();
}

describe("WorkflowTemplateEdgeEditor transient command failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses shared fields and buttons for edge editing", () => {
    renderEditor({});

    expect(screen.getByLabelText("起点").closest(".ui-field")).not.toBeNull();
    expect(screen.getByLabelText("终点").closest(".ui-field")).not.toBeNull();
    expect(screen.getByRole("button", { name: "新增连线" })).toHaveClass(
      "ui-button--comfortable",
      "ui-button--primary",
    );
    expect(
      screen.getByRole("button", { name: "删除连线 分析 到 交付" }),
    ).toHaveClass(
      "ui-icon-button",
      "ui-button--default",
      "ui-button--ghost",
    );
  });

  it("publishes a safe Toast when adding an edge fails", async () => {
    const addWorkflowTemplateEdge = vi
      .fn()
      .mockRejectedValue(new Error(rawError));
    renderEditor({ addWorkflowTemplateEdge });

    fireEvent.click(screen.getByRole("button", { name: "新增连线" }));

    await waitFor(() =>
      expect(addWorkflowTemplateEdge).toHaveBeenCalledOnce(),
    );
    await expectSafeToast("连线创建失败");
  });

  it("publishes a safe Toast when deleting an edge fails", async () => {
    const removeWorkflowTemplateEdge = vi
      .fn()
      .mockRejectedValue(new Error(rawError));
    renderEditor({ removeWorkflowTemplateEdge });

    fireEvent.click(
      screen.getByRole("button", { name: "删除连线 分析 到 交付" }),
    );
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "删除连线" }));

    await waitFor(() =>
      expect(removeWorkflowTemplateEdge).toHaveBeenCalledOnce(),
    );
    await expectSafeToast("连线删除失败");
  });
});
