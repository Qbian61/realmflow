import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BusinessApi,
  WorkflowTemplateDraftDto,
} from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { WorkflowTemplateNodeEditor } from "./WorkflowTemplateNodeEditor";

const rawError = "sqlite /Users/private/template.db unavailable";

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
    edgeCount: 0,
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
    edges: [],
  },
};

function renderEditor(business: Partial<BusinessApi>): void {
  render(
    <LocalizationProvider>
      <ToastProvider>
        <WorkflowTemplateNodeEditor
          business={business as BusinessApi}
          initialTemplate={template}
          onChange={vi.fn()}
          onClose={vi.fn()}
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

describe("WorkflowTemplateNodeEditor transient command failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a shared workspace dialog with a single scroll body", () => {
    renderEditor({});

    const dialog = screen.getByRole("dialog", {
      name: "编辑节点 交付流程",
    });
    const scrollBody = dialog.querySelector('[data-dialog-scroll="true"]');

    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--workspace");
    expect(dialog.querySelector(".ui-dialog__header")).toBeInTheDocument();
    expect(scrollBody).toHaveClass("ui-dialog__body");
    expect(scrollBody).toContainElement(screen.getByText("2 个节点"));
    expect(dialog.querySelector(".ui-tabs--segmented")).toBeInTheDocument();
    expect(dialog.querySelector(".ui-document-tabs")).toBeNull();
    expect(dialog.querySelectorAll('[data-dialog-scroll="true"]')).toHaveLength(
      1,
    );
  });

  it("uses shared dialog, field, and button primitives for the node form", () => {
    renderEditor({});

    fireEvent.click(screen.getByRole("button", { name: "新增节点" }));

    const dialog = screen.getByRole("dialog", { name: "新增流程节点" });

    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--default");
    expect(dialog.querySelector(".ui-dialog__body")).toBeInTheDocument();
    expect(dialog.querySelectorAll(".ui-field")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "创建节点" })).toHaveClass(
      "ui-button",
      "ui-button--primary",
    );
  });

  it("does not ask users to select a Skill for a workflow node", () => {
    renderEditor({});

    fireEvent.click(screen.getByRole("button", { name: "配置节点 分析" }));

    expect(screen.queryByText("Skill 版本")).not.toBeInTheDocument();
  });

  it("keeps the long node configuration inside the shared dialog scroll body", () => {
    renderEditor({});

    fireEvent.click(screen.getByRole("button", { name: "配置节点 分析" }));

    const dialog = screen.getByRole("dialog", { name: "配置节点 分析" });
    const scrollBody = dialog.querySelector('[data-dialog-scroll="true"]');

    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--wide");
    expect(scrollBody).toHaveClass("ui-dialog__body");
    expect(scrollBody).toContainElement(screen.getByText("输入上下文"));
    expect(dialog.querySelectorAll('[data-dialog-scroll="true"]')).toHaveLength(
      1,
    );
  });

  it("publishes a safe Toast when adding a node fails", async () => {
    const addWorkflowTemplateNode = vi
      .fn()
      .mockRejectedValue(new Error(rawError));
    renderEditor({ addWorkflowTemplateNode });

    fireEvent.click(screen.getByRole("button", { name: "新增节点" }));
    fireEvent.change(screen.getByLabelText("稳定键"), {
      target: { value: "review" },
    });
    fireEvent.change(screen.getByLabelText("节点名称"), {
      target: { value: "复核" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建节点" }));

    await waitFor(() =>
      expect(addWorkflowTemplateNode).toHaveBeenCalledOnce(),
    );
    await expectSafeToast("节点保存失败");
  });

  it("publishes a safe Toast when updating a node fails", async () => {
    const updateWorkflowTemplateNode = vi
      .fn()
      .mockRejectedValue(new Error(rawError));
    renderEditor({ updateWorkflowTemplateNode });

    fireEvent.click(screen.getByRole("button", { name: "编辑节点 分析" }));
    fireEvent.change(screen.getByLabelText("节点名称"), {
      target: { value: "分析更新" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存节点" }));

    await waitFor(() =>
      expect(updateWorkflowTemplateNode).toHaveBeenCalledOnce(),
    );
    await expectSafeToast("节点保存失败");
  });

  it("publishes a safe Toast when deleting a node fails", async () => {
    const removeWorkflowTemplateNode = vi
      .fn()
      .mockRejectedValue(new Error(rawError));
    renderEditor({ removeWorkflowTemplateNode });

    fireEvent.click(screen.getByRole("button", { name: "删除节点 分析" }));
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() =>
      expect(removeWorkflowTemplateNode).toHaveBeenCalledOnce(),
    );
    await expectSafeToast("节点删除失败");
  });

  it("publishes a safe Toast when reordering nodes fails", async () => {
    const reorderWorkflowTemplateNodes = vi
      .fn()
      .mockRejectedValue(new Error(rawError));
    renderEditor({ reorderWorkflowTemplateNodes });

    fireEvent.click(screen.getByRole("button", { name: "下移节点 分析" }));

    await waitFor(() =>
      expect(reorderWorkflowTemplateNodes).toHaveBeenCalledOnce(),
    );
    await expectSafeToast("节点排序失败");
  });
});
