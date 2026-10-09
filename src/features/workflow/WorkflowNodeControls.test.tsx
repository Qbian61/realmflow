import {
  fireEvent,
  render as testingRender,
  screen,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequirementNode } from "../../../domain/workflow";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { WorkflowNodeControls } from "./WorkflowNodeControls";

function render(
  ui: Parameters<typeof testingRender>[0],
  storage?: Storage,
): ReturnType<typeof testingRender> {
  return testingRender(
    <LocalizationProvider storage={storage}>{ui}</LocalizationProvider>,
  );
}

const node: RequirementNode = {
  id: "node-1",
  type: "ai_generate",
  name: "Analysis",
  description: "",
  order: 0,
  status: "ready",
  allowSkip: true,
  executor: {
    kind: "ai_generate",
    prompt: "Analyze.",
    artifact: {
      relativePath: "artifacts/analysis.md",
      kind: "markdown",
    },
  },
};

describe("WorkflowNodeControls", () => {
  it("offers only direct lifecycle controls for a ready node", () => {
    const onAction = vi.fn();
    render(
      <WorkflowNodeControls node={node} pending={false} onAction={onAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "启动节点" }));

    expect(screen.getByRole("button", { name: "启动节点" })).toHaveClass(
      "workflow-node-control",
      "is-primary",
    );
    expect(screen.queryByRole("button", { name: "暂停节点" })).toBeNull();
    expect(onAction.mock.calls).toEqual([["start"]]);
    expect(screen.queryByRole("button", { name: "跳过节点" })).toBeNull();
  });

  it.each([
    ["running", ["暂停节点", "取消节点"]],
    ["waiting_user", ["暂停节点", "取消节点"]],
    ["paused", ["启动节点", "取消节点"]],
    ["failed", []],
    ["cancelled", []],
    ["interrupted", []],
  ] as const)("shows valid controls for %s", (status, labels) => {
    render(
      <WorkflowNodeControls
        node={{ ...node, status }}
        pending={false}
        onAction={vi.fn()}
      />,
    );

    expect(
      screen.queryAllByRole("button").map((button) => button.ariaLabel),
    ).toEqual(labels);
  });

  it("disables every command while another command is pending", () => {
    render(<WorkflowNodeControls node={node} pending onAction={vi.fn()} />);

    expect(screen.getAllByRole("button")).toSatisfy((buttons: HTMLElement[]) =>
      buttons.every((button) => button.hasAttribute("disabled")),
    );
  });

  it("shows resume as a primary start control while dispatching resume", () => {
    const onAction = vi.fn();
    const result = render(
      <WorkflowNodeControls
        node={{ ...node, status: "paused" }}
        pending={false}
        onAction={onAction}
      />,
    );

    const resume = screen.getByRole("button", { name: "启动节点" });
    expect(resume).toHaveClass(
      "is-primary",
    );
    fireEvent.click(resume);
    expect(onAction).toHaveBeenCalledWith("resume");
    expect(screen.getByRole("button", { name: "取消节点" })).toHaveClass(
      "is-danger",
    );
    result.unmount();
  });

  it("renders node controls in Japanese", () => {
    render(
      <WorkflowNodeControls node={node} pending={false} onAction={vi.fn()} />,
      storageWithLocale("ja"),
    );

    expect(
      screen.getAllByRole("button").map((button) => button.ariaLabel),
    ).toEqual(["ノードを開始"]);
  });
});

function storageWithLocale(locale: "en" | "ja"): Storage {
  return {
    getItem: vi.fn(() => JSON.stringify({ version: 1, locale })),
    setItem: vi.fn(),
  } as unknown as Storage;
}
