import { render, screen } from "@testing-library/react";
import { WorkbenchNavigationItem } from "./WorkbenchNavigationItem";

describe("WorkbenchNavigationItem", () => {
  it("exposes shared active and drag states while keeping actions available", () => {
    render(
      <WorkbenchNavigationItem
        active
        dragging
        dropTarget
        primary={<button type="button">项目 A</button>}
        actions={<button type="button">删除</button>}
      />,
    );

    const item = screen.getByTestId("workbench-navigation-item");
    expect(item).toHaveAttribute("data-active", "true");
    expect(item).toHaveAttribute("data-dragging", "true");
    expect(item).toHaveAttribute("data-drop-target", "before");
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("uses the editing surface without rendering hover actions", () => {
    render(
      <WorkbenchNavigationItem
        editing
        primary={<input aria-label="重命名" />}
        actions={<button type="button">删除</button>}
      />,
    );

    expect(screen.getByLabelText("重命名")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
  });
});
