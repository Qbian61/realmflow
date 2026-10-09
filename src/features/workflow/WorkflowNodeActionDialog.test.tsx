import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  WorkflowNodeActionDialog,
  type WorkflowNodeActionDialogLabels,
} from "./WorkflowNodeActionDialog";

const commonLabels = {
  cancel: "取消",
  confirm: "确认",
};

function renderDialog(
  input: Partial<React.ComponentProps<typeof WorkflowNodeActionDialog>> = {},
) {
  const onCancel = input.onCancel ?? vi.fn();
  const onConfirm = input.onConfirm ?? vi.fn();
  const result = render(
    <WorkflowNodeActionDialog
      action="rollback"
      labels={{
        ...commonLabels,
        title: "回退到节点",
        description: "将从此节点重新执行。",
      }}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...input}
    />,
  );

  return { ...result, onCancel, onConfirm };
}

describe("WorkflowNodeActionDialog", () => {
  it("uses shared dialog, field, and button primitives", () => {
    renderDialog({
      action: "skip",
      labels: {
        ...commonLabels,
        title: "跳过节点",
        description: "此节点将标记为已跳过。",
        reasonLabel: "跳过原因",
      },
    });

    const dialog = screen.getByRole("dialog", { name: "跳过节点" });

    expect(dialog).toHaveClass("ui-dialog", "ui-dialog--compact");
    expect(dialog.querySelector(".ui-dialog__body")).toBeInTheDocument();
    expect(dialog.querySelector(".ui-field")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toHaveClass(
      "ui-button",
      "ui-button--primary",
    );
  });

  it("collects and trims a required skip reason", () => {
    const labels: WorkflowNodeActionDialogLabels = {
      ...commonLabels,
      title: "跳过节点",
      description: "此节点将标记为已跳过。",
      reasonLabel: "跳过原因",
      reasonPlaceholder: "请输入跳过原因",
      reasonRequired: "请填写跳过原因",
    };
    const { onConfirm } = renderDialog({ action: "skip", labels });
    const confirm = screen.getByRole("button", { name: "确认" });

    expect(screen.getByLabelText("跳过原因")).toHaveFocus();
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("跳过原因"), {
      target: { value: "  当前节点不再需要  " },
    });
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({
      reason: "当前节点不再需要",
    });
  });

  it("shows the rollback impact summary supplied through labels", () => {
    renderDialog({
      action: "rollback",
      labels: {
        ...commonLabels,
        title: "回退到需求分析",
        description: "将从此节点重新执行。",
        impactSummaryLabel: "影响范围",
        impactSummary: "3 个节点将创建新的运行记录，历史产物仍保留。",
      },
    });

    expect(screen.getByText("影响范围")).toBeVisible();
    expect(
      screen.getByText("3 个节点将创建新的运行记录，历史产物仍保留。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "确认" })).toHaveClass(
      "ui-button--danger",
    );
  });

  it("disables dangerous actions while pending", () => {
    const { onCancel, onConfirm } = renderDialog({ disabled: true });

    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels with Escape and returns focus to the opening control", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "打开操作";
    document.body.append(trigger);
    trigger.focus();
    const { onCancel } = renderDialog();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("traps forward and reverse Tab navigation inside the dialog", () => {
    renderDialog();
    const cancel = screen.getByRole("button", { name: "取消" });
    const confirm = screen.getByRole("button", { name: "确认" });

    expect(cancel).toHaveFocus();
    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();

    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it("confirms rollback and cancels without invoking browser dialogs", () => {
    const prompt = vi.spyOn(window, "prompt");
    const confirmDialog = vi.spyOn(window, "confirm");
    const { onCancel, onConfirm } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(onConfirm).toHaveBeenCalledWith({});
    expect(prompt).not.toHaveBeenCalled();
    expect(confirmDialog).not.toHaveBeenCalled();
  });
});
