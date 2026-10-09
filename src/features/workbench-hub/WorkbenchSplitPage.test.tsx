import { fireEvent, render, screen } from "@testing-library/react";
import { LocalizationProvider } from "../../localization/LocalizationProvider";
import { WorkbenchSplitPage } from "./WorkbenchSplitPage";

describe("WorkbenchSplitPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps independent navigation and content regions", () => {
    render(
      <LocalizationProvider>
        <WorkbenchSplitPage
          navigation={<div>会话列表</div>}
          onCreate={vi.fn()}
          createLabel="新建会话"
        >
          <div>终端内容</div>
        </WorkbenchSplitPage>
      </LocalizationProvider>,
    );

    expect(
      screen.getByRole("navigation", { name: "工具列表" }),
    ).toHaveTextContent("会话列表");
    expect(screen.getByRole("region", { name: "工具内容" })).toHaveTextContent(
      "终端内容",
    );
    expect(screen.getByRole("button", { name: "新建会话" })).toBeInTheDocument();
  });

  it("renders optional navigation actions in the fixed footer", () => {
    render(
      <LocalizationProvider>
        <WorkbenchSplitPage
          navigation={<div>备忘录列表</div>}
          navigationActions={
            <button type="button" aria-label="最近删除">
              最近删除
            </button>
          }
          onCreate={vi.fn()}
          createLabel="新增备忘录"
        >
          <div>备忘录内容</div>
        </WorkbenchSplitPage>
      </LocalizationProvider>,
    );

    expect(screen.getByRole("button", { name: "最近删除" })).toBeInTheDocument();
  });

  it("keeps contextual accessible names and action-only add tooltips", () => {
    render(
      <LocalizationProvider>
        <WorkbenchSplitPage
          navigation={<div>备忘录列表</div>}
          onCreate={vi.fn()}
          createLabel="新增备忘录"
          createIconOnly
          floatingActionLabel="新增网站"
          onFloatingAction={vi.fn()}
        >
          <div>备忘录内容</div>
        </WorkbenchSplitPage>
      </LocalizationProvider>,
    );

    expect(screen.getByRole("button", { name: "新增备忘录" })).toHaveAttribute(
      "title",
      "新增",
    );
    expect(screen.getByRole("button", { name: "新增网站" })).toHaveAttribute(
      "title",
      "新增",
    );
  });

  it("collapses to the compact rail and restores the navigation", () => {
    render(
      <LocalizationProvider>
        <WorkbenchSplitPage
          navigation={<div>会话列表</div>}
          onCreate={vi.fn()}
          createLabel="新建会话"
        >
          <div>终端内容</div>
        </WorkbenchSplitPage>
      </LocalizationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "收起列表" }));
    expect(screen.queryByText("会话列表")).toBeNull();
    expect(screen.getByTestId("workbench-split-page")).toHaveAttribute(
      "data-collapsed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "展开列表" }));
    expect(screen.getByText("会话列表")).toBeInTheDocument();
  });

  it("resizes the shared navigation width with pointer input and persists it", () => {
    const { unmount } = render(
      <LocalizationProvider>
        <WorkbenchSplitPage
          navigation={<div>会话列表</div>}
          onCreate={vi.fn()}
          createLabel="新建会话"
        >
          <div>终端内容</div>
        </WorkbenchSplitPage>
      </LocalizationProvider>,
    );

    const page = screen.getByTestId("workbench-split-page");
    expect(page).toHaveStyle({ "--workbench-split-width": "184px" });
    const separator = screen.getByRole("separator", {
      name: "调整列表宽度",
    });
    separator.setPointerCapture = vi.fn();
    const pointerDown = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 184,
    });
    Object.defineProperty(pointerDown, "pointerId", { value: 1 });
    fireEvent(separator, pointerDown);
    fireEvent(
      separator,
      new MouseEvent("pointermove", { bubbles: true, clientX: 280 }),
    );

    expect(page).toHaveStyle({ "--workbench-split-width": "280px" });
    expect(
      window.localStorage.getItem("realmflow:workbench-split-width"),
    ).toBe("280");

    unmount();
    render(
      <LocalizationProvider>
        <WorkbenchSplitPage
          navigation={<div>网站分组</div>}
          onCreate={vi.fn()}
          createLabel="新建分组"
        >
          <div>网站内容</div>
        </WorkbenchSplitPage>
      </LocalizationProvider>,
    );
    expect(screen.getByTestId("workbench-split-page")).toHaveStyle({
      "--workbench-split-width": "280px",
    });
  });

  it("supports keyboard resizing, clamps bounds, and hides the separator when collapsed", () => {
    render(
      <LocalizationProvider>
        <WorkbenchSplitPage
          navigation={<div>会话列表</div>}
          onCreate={vi.fn()}
          createLabel="新建会话"
        >
          <div>终端内容</div>
        </WorkbenchSplitPage>
      </LocalizationProvider>,
    );

    const page = screen.getByTestId("workbench-split-page");
    const separator = screen.getByRole("separator", {
      name: "调整列表宽度",
    });
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(page).toHaveStyle({ "--workbench-split-width": "176px" });

    separator.setPointerCapture = vi.fn();
    const pointerDown = new MouseEvent("pointerdown", { bubbles: true });
    Object.defineProperty(pointerDown, "pointerId", { value: 1 });
    fireEvent(separator, pointerDown);
    fireEvent(
      separator,
      new MouseEvent("pointermove", { bubbles: true, clientX: 999 }),
    );
    expect(page).toHaveStyle({ "--workbench-split-width": "360px" });
    fireEvent(
      separator,
      new MouseEvent("pointermove", { bubbles: true, clientX: 20 }),
    );
    expect(page).toHaveStyle({ "--workbench-split-width": "120px" });

    fireEvent.click(screen.getByRole("button", { name: "收起列表" }));
    expect(
      screen.queryByRole("separator", { name: "调整列表宽度" }),
    ).toBeNull();
    expect(page).toHaveAttribute("data-collapsed", "true");
  });
});
