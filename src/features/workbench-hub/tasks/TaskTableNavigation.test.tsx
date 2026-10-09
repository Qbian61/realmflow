import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocalizationProvider } from "../../../localization/LocalizationProvider";
import { TaskTableNavigation } from "./TaskTableNavigation";

const tables = [
  {
    id: "table-1",
    name: "发布计划",
    position: 0,
    recordCount: 3,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "table-2",
    name: "内容排期",
    position: 10,
    recordCount: 8,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
  },
];

function renderNavigation(
  overrides: Partial<React.ComponentProps<typeof TaskTableNavigation>> = {},
) {
  const props: React.ComponentProps<typeof TaskTableNavigation> = {
    tables,
    selectedTableId: "table-1",
    onSelect: vi.fn(),
    onRename: vi.fn().mockResolvedValue(true),
    onDuplicate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
    onMove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(
    <LocalizationProvider>
      <TaskTableNavigation {...props} />
    </LocalizationProvider>,
  );
  return props;
}

describe("TaskTableNavigation", () => {
  it("shows names without record counts and saves a rename on blur", async () => {
    const props = renderNavigation();

    expect(screen.getByRole("button", { name: "发布计划" })).not.toHaveTextContent(
      "3",
    );
    fireEvent.doubleClick(screen.getByRole("button", { name: "发布计划" }));
    const input = screen.getByRole("textbox", { name: "编辑发布计划" });
    fireEvent.change(input, { target: { value: "发布安排" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(props.onRename).toHaveBeenCalledWith(tables[0], "发布安排"),
    );
  });

  it("cancels inline rename on Escape", () => {
    const props = renderNavigation();

    fireEvent.doubleClick(screen.getByRole("button", { name: "发布计划" }));
    const input = screen.getByRole("textbox", { name: "编辑发布计划" });
    fireEvent.change(input, { target: { value: "不保存" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "发布计划" })).toBeInTheDocument();
  });

  it("offers both copy modes and exposes a separate delete action", async () => {
    const props = renderNavigation();

    fireEvent.click(screen.getByRole("button", { name: "复制发布计划" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "复制结构+数据" }));
    expect(props.onDuplicate).toHaveBeenCalledWith(
      tables[0],
      "structure_and_data",
    );

    fireEvent.click(screen.getByRole("button", { name: "删除发布计划" }));
    expect(props.onDelete).toHaveBeenCalledWith(tables[0]);
  });

  it("right-aligns compact drag, copy, and delete actions after the name", () => {
    renderNavigation();

    const name = screen.getByRole("button", { name: "发布计划" });
    const drag = screen.getByLabelText("拖拽排序 发布计划");
    const copy = screen.getByRole("button", { name: "复制发布计划" });
    const remove = screen.getByRole("button", { name: "删除发布计划" });

    expect(
      name.compareDocumentPosition(drag) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(drag.parentElement).toHaveClass("workbench-task-table-actions");
    expect(drag.nextElementSibling).toBe(copy);
    expect(copy.nextElementSibling).toBe(remove);
  });

  it("uses the complete row for inline rename without operation buttons", () => {
    renderNavigation();

    fireEvent.doubleClick(screen.getByRole("button", { name: "发布计划" }));

    expect(screen.getByRole("textbox", { name: "编辑发布计划" })).toBeVisible();
    expect(
      screen.queryByLabelText("拖拽排序 发布计划"),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "复制发布计划" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "删除发布计划" }),
    ).toBeNull();
  });

  it("closes the copy menu when the pointer moves outside it", () => {
    renderNavigation();

    fireEvent.click(screen.getByRole("button", { name: "复制发布计划" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves a table by dropping its drag handle on a target row", () => {
    const props = renderNavigation();
    let draggedId = "";
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: (_type: string, value: string) => {
        draggedId = value;
      },
      getData: () => draggedId,
    };

    fireEvent.dragStart(
      screen.getByLabelText("拖拽排序 发布计划"),
      { dataTransfer },
    );
    fireEvent.drop(screen.getByRole("button", { name: "内容排期" }).parentElement!, {
      dataTransfer,
    });

    expect(props.onMove).toHaveBeenCalledWith(tables[0], 1);
  });

  it("does not open a reorder menu when the drag handle is clicked", () => {
    const props = renderNavigation();
    const handle = screen.getByLabelText("拖拽排序 发布计划");

    fireEvent.click(handle);

    expect(handle.tagName).toBe("SPAN");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(props.onMove).not.toHaveBeenCalled();
  });
});
