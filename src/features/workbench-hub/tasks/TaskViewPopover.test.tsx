import { createRef } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  TaskViewState,
  WorkbenchTaskField,
} from "../../../../shared/workbench-tasks";
import { LocalizationProvider } from "../../../localization/LocalizationProvider";
import { TaskViewPopover, type TaskViewPopoverMode } from "./TaskViewPopover";

const fields: WorkbenchTaskField[] = [
  {
    id: "title",
    tableId: "table-1",
    name: "标题",
    fieldType: "text",
    config: {},
    position: 0,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "status",
    tableId: "table-1",
    name: "状态",
    fieldType: "single_select",
    config: {
      options: [
        { id: "todo", label: "待处理", color: "gray" },
        { id: "done", label: "完成", color: "green" },
      ],
    },
    position: 10,
    createdAt: 1,
    updatedAt: 1,
  },
];

const emptyView: TaskViewState = {
  filters: [],
  filterJoin: "and",
  groups: [],
  sorts: [],
};

function renderPopover(
  mode: TaskViewPopoverMode,
  viewState: TaskViewState = emptyView,
) {
  const anchorRef = createRef<HTMLButtonElement>();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <LocalizationProvider>
      <button ref={anchorRef}>anchor</button>
      <TaskViewPopover
        mode={mode}
        anchorRef={anchorRef}
        fields={fields}
        viewState={viewState}
        saving={false}
        onClose={onClose}
        onSave={onSave}
      />
    </LocalizationProvider>,
  );
  return { onClose, onSave };
}

describe("TaskViewPopover", () => {
  it("shows one local filter placeholder and saves it once complete", async () => {
    const { onSave } = renderPopover("filter");
    const dialog = screen.getByRole("dialog", { name: "设置筛选条件" });

    expect(dialog).toHaveClass("ui-popover", "workbench-task-view-popover");
    expect(within(dialog).getByLabelText("筛选字段 1")).toHaveValue("");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("筛选字段 1"), {
      target: { value: "title" },
    });
    fireEvent.change(within(dialog).getByLabelText("筛选值 1"), {
      target: { value: "发布" },
    });

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        filters: [{ fieldId: "title", operator: "contains", value: "发布" }],
        filterJoin: "and",
        groups: [],
        sorts: [],
      }),
    );
  });

  it("shows one local sort placeholder without persisting it", () => {
    const { onSave } = renderPopover("sort");
    const dialog = screen.getByRole("dialog", { name: "设置排序条件" });

    expect(within(dialog).getByLabelText("排序字段 1")).toHaveValue("");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves multiple ordered group fields with independent directions", async () => {
    const { onSave } = renderPopover("group");
    const dialog = screen.getByRole("dialog", { name: "设置分组条件" });

    fireEvent.change(within(dialog).getByLabelText("分组字段 1"), {
      target: { value: "status" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "添加分组条件" }),
    );
    fireEvent.click(
      within(dialog).getAllByRole("button", { name: "选项倒序" })[0],
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith({
        filters: [],
        filterJoin: "and",
        groups: [
          { fieldId: "status", direction: "desc" },
          { fieldId: "title", direction: "asc" },
        ],
        sorts: [],
      }),
    );
  });

  it("reorders persisted sort priority from drag handles", async () => {
    const { onSave } = renderPopover("sort", {
      filters: [],
      filterJoin: "and",
      groups: [],
      sorts: [
        { fieldId: "title", direction: "asc" },
        { fieldId: "status", direction: "desc" },
      ],
    });
    let dragged = "";
    const dataTransfer = {
      effectAllowed: "none",
      setData: (_type: string, value: string) => {
        dragged = value;
      },
      getData: () => dragged,
    };
    const firstHandle = screen.getByRole("button", {
      name: "拖拽调整排序条件 1",
    });
    const secondHandle = screen.getByRole("button", {
      name: "拖拽调整排序条件 2",
    });

    fireEvent.dragStart(firstHandle, { dataTransfer });
    fireEvent.drop(secondHandle.parentElement!, { dataTransfer });

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        filters: [],
        filterJoin: "and",
        groups: [],
        sorts: [
          { fieldId: "status", direction: "desc" },
          { fieldId: "title", direction: "asc" },
        ],
      }),
    );
  });

  it("closes when the pointer moves outside the popover and anchor", () => {
    const { onClose } = renderPopover("group");
    const dialog = screen.getByRole("dialog", { name: "设置分组条件" });

    fireEvent.pointerDown(within(dialog).getByText("设置分组条件"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
