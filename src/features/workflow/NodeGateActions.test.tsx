import {
  fireEvent,
  render as testingRender,
  screen,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequirementNode } from "../../../domain/workflow";
import type { NodeApprovalDto } from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { NodeGateActions } from "./NodeGateActions";

function render(
  ui: Parameters<typeof testingRender>[0],
): ReturnType<typeof testingRender> {
  return testingRender(<LocalizationProvider>{ui}</LocalizationProvider>);
}

function approvalNode(
  status: RequirementNode["status"] = "ready",
): RequirementNode {
  return {
    id: "approval",
    type: "approval",
    name: "Release approval",
    description: "",
    order: 0,
    status,
    allowSkip: false,
    completionGate: { requireApproval: true },
  };
}

const rejectedApproval: NodeApprovalDto = {
  nodeRunId: "node-run-approval",
  decisionId: "decision-rejected",
  result: "rejected",
  actorType: "local_user",
  actorId: "local-user",
  note: "Missing release evidence",
  revision: 2,
  createdAt: 90,
  updatedAt: 100,
  decidedAt: 100,
};

describe("NodeGateActions", () => {
  it("submits a trimmed approval note against the current approval revision", () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(
      <NodeGateActions
        node={approvalNode()}
        approval={rejectedApproval}
        disabled={false}
        onResolve={onResolve}
      />,
    );

    fireEvent.change(screen.getByLabelText("审批备注（可选）"), {
      target: { value: "  Evidence attached  " },
    });
    expect(screen.getByLabelText("审批备注（可选）")).toHaveClass(
      "node-approval-note",
    );
    expect(screen.getByRole("button", { name: "批准节点" })).toHaveClass(
      "ui-button--primary",
    );
    expect(screen.getByRole("button", { name: "驳回节点" })).toHaveClass(
      "ui-button--danger",
    );
    fireEvent.click(screen.getByRole("button", { name: "批准节点" }));

    expect(onResolve).toHaveBeenCalledWith({
      kind: "approval",
      decisionId: expect.any(String),
      expectedApprovalRevision: 2,
      result: "approved",
      note: "Evidence attached",
    });
  });

  it("renders a persisted approval summary after the node completes", () => {
    render(
      <NodeGateActions
        node={approvalNode("completed")}
        approval={{
          ...rejectedApproval,
          decisionId: "decision-approved",
          result: "approved",
          note: "Release approved",
          revision: 3,
        }}
        disabled={false}
        onResolve={vi.fn()}
      />,
    );

    expect(screen.getByText("已批准")).toBeInTheDocument();
    expect(screen.getByText("本机用户")).toBeInTheDocument();
    expect(screen.getByText("Release approved")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "批准节点" }),
    ).not.toBeInTheDocument();
  });
});
