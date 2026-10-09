import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  NodeQuestionDto,
  WorkflowNodeExecutionDto,
} from "../../../shared/business";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { NodeQuestionsPanel } from "./NodeQuestionsPanel";

const execution = {
  nodeRun: {
    id: "node-run-1",
    status: "running",
  },
} as WorkflowNodeExecutionDto;

const questions: NodeQuestionDto[] = [
  {
    id: "required-question",
    nodeRunId: "node-run-1",
    prompt: "Which rollout strategy?",
    required: true,
    status: "open",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "optional-question",
    nodeRunId: "node-run-1",
    prompt: "Add an optional note?",
    required: false,
    status: "open",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  },
];

function renderPanel(): void {
  render(
    <LocalizationProvider>
      <ToastProvider>
        <NodeQuestionsPanel
          requirementId="requirement-1"
          execution={execution}
          questions={questions}
          onQuestionsChange={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
        />
      </ToastProvider>
    </LocalizationProvider>,
  );
}

describe("NodeQuestionsPanel", () => {
  it("uses shared fields and button variants for question actions", () => {
    renderPanel();

    const createInput = screen.getByLabelText("新建节点问题");
    const answerInput = screen.getByLabelText("回答：Which rollout strategy?");
    expect(createInput.closest(".ui-field")).not.toBeNull();
    expect(answerInput.closest(".ui-field")).not.toBeNull();
    expect(screen.getByRole("button", { name: "添加问题" })).toHaveClass(
      "ui-button--primary",
    );
    expect(screen.getAllByRole("button", { name: "提交回答" })[0]).toHaveClass(
      "ui-button--primary",
    );
    expect(
      screen.getByRole("button", { name: "关闭问题：Add an optional note?" }),
    ).toHaveClass("ui-button--ghost");
  });
});
