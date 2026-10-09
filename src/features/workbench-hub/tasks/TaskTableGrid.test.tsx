import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  TaskGroupNode,
  WorkbenchTaskField,
  WorkbenchTaskFieldType,
  WorkbenchTaskRecord,
} from "../../../../shared/workbench-tasks";
import { LocalizationProvider } from "../../../localization/LocalizationProvider";
import { TaskTableGrid } from "./TaskTableGrid";

function field(
  id: string,
  name: string,
  fieldType: WorkbenchTaskFieldType,
  position: number,
): WorkbenchTaskField {
  return {
    id,
    tableId: "table-1",
    name,
    fieldType,
    config:
      fieldType === "single_select" || fieldType === "multi_select"
        ? {
            options: [
              { id: "todo", label: "待处理", color: "gray" },
              { id: "done", label: "完成", color: "green" },
            ],
          }
        : {},
    position,
    createdAt: 1,
    updatedAt: 1,
  };
}

const titleField = field("field-title", "标题", "text", 0);
const statusField = field("field-status", "状态", "single_select", 1);

const fieldsWithAllTypes: WorkbenchTaskField[] = [
  titleField,
  field("field-date", "日期", "date", 1),
  statusField,
  field("field-tags", "标签", "multi_select", 2),
  field("field-url", "链接", "url", 3),
  field("field-attachment", "附件", "attachment", 4),
];

const recordOne: WorkbenchTaskRecord = {
  id: "record-1",
  tableId: "table-1",
  position: 0,
  values: { "field-title": "准备发布", "field-status": "todo" },
  revision: 0,
  createdAt: 1,
  updatedAt: 1,
};

const recordTwo: WorkbenchTaskRecord = {
  id: "record-2",
  tableId: "table-1",
  values: { "field-title": "发布复盘", "field-status": "done" },
  position: 10,
  revision: 0,
  createdAt: 1,
  updatedAt: 1,
};

const records: WorkbenchTaskRecord[] = [recordOne, recordTwo];

function renderGrid(
  overrides: Partial<React.ComponentProps<typeof TaskTableGrid>> = {},
) {
  const props: React.ComponentProps<typeof TaskTableGrid> = {
    name: "发布计划",
    fields: [titleField],
    records,
    groupTree: [],
    ungroupedLabel: "未分组",
    selectedRecordIds: new Set(),
    selectAllLabel: "选择全部",
    getSelectRecordLabel: (record) => `选择${record.values["field-title"]}`,
    getRecordName: (record) => String(record.values["field-title"]),
    getResizeColumnLabel: () => "调整标题列宽",
    onToggleRecord: vi.fn(),
    onToggleAll: vi.fn(),
    onUpdateCell: vi.fn().mockResolvedValue(true),
    onMoveRecord: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const result = render(
    <LocalizationProvider>
      <TaskTableGrid {...props} />
    </LocalizationProvider>,
  );
  return { ...props, ...result };
}

describe("TaskTableGrid", () => {
  it("does not render the deprecated per-row open record button", () => {
    const { container } = renderGrid();

    expect(
      screen.queryByRole("button", { name: "打开准备发布" }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector("col.workbench-task-open-column"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".workbench-task-record-open"),
    ).not.toBeInTheDocument();
  });

  it("moves a record only by dragging its handle", () => {
    const props = renderGrid();
    const handle = screen.getByLabelText("拖拽排序 准备发布");
    const target = screen
      .getByRole("button", { name: "发布复盘" })
      .closest("tr")!;
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setDragImage: vi.fn(),
    };

    fireEvent.click(handle);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(props.onMoveRecord).not.toHaveBeenCalled();

    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(props.onMoveRecord).toHaveBeenCalledWith(records[0], records[1]);
  });

  it("keeps the leading drag and selection columns fixed within the original compact width", () => {
    const { container } = renderGrid();
    const table = screen.getByRole("table", { name: "发布计划" });
    const dragColumn = container.querySelector<HTMLTableColElement>(
      "col.workbench-task-drag-column",
    );
    const selectColumn = container.querySelector<HTMLTableColElement>(
      "col.workbench-task-select-column",
    );
    const fillColumn = container.querySelector<HTMLTableColElement>(
      "col.workbench-task-fill-column",
    );

    expect(table).toHaveStyle({ width: "max(100%, 224px)" });
    expect(dragColumn).toHaveStyle({ width: "20px" });
    expect(selectColumn).toHaveStyle({ width: "24px" });
    expect(fillColumn).not.toHaveAttribute("style");
  });

  it("shows the group-local record number until row interaction reveals selection", () => {
    const groupTree: TaskGroupNode[] = [
      {
        fieldId: statusField.id,
        value: "todo",
        count: 1,
        children: [],
        recordIds: [recordOne.id],
      },
      {
        fieldId: statusField.id,
        value: "done",
        count: 1,
        children: [],
        recordIds: [recordTwo.id],
      },
    ];
    const { container } = renderGrid({
      fields: [titleField, statusField],
      groupTree,
    });

    expect(
      Array.from(
        container.querySelectorAll(".workbench-task-record-index"),
      ).map((item) => item.textContent),
    ).toEqual(["1", "1"]);
    expect(
      container.querySelectorAll(".workbench-task-select-control"),
    ).toHaveLength(2);
  });

  it("renders a field-type icon before each supported column header", () => {
    const { container } = renderGrid({ fields: fieldsWithAllTypes });

    for (const field of fieldsWithAllTypes) {
      const header = screen.getByRole("columnheader", { name: field.name });
      const icon = header.querySelector(".workbench-task-field-type-icon");

      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute("data-field-type", field.fieldType);
    }
    expect(
      container.querySelectorAll(".workbench-task-field-type-icon"),
    ).toHaveLength(fieldsWithAllTypes.length);
  });

  it("extends the active column-resize indicator through body cells", () => {
    renderGrid({ fields: [titleField, statusField] });
    const titleHeader = screen.getByRole("columnheader", { name: "标题" });
    const statusHeader = screen.getByRole("columnheader", { name: "状态" });
    const titleSeparator = within(titleHeader).getByRole("separator", {
      name: "调整标题列宽",
    });

    fireEvent.pointerEnter(titleSeparator);

    expect(titleHeader).toHaveAttribute("data-resize-active", "true");
    expect(statusHeader).not.toHaveAttribute("data-resize-active");
    expect(
      screen
        .getByRole("button", { name: "准备发布" })
        .closest("td"),
    ).toHaveAttribute("data-resize-active", "true");
    expect(
      screen
        .getByRole("button", { name: "待处理" })
        .closest("td"),
    ).not.toHaveAttribute("data-resize-active");
  });

  it("opens the inline cell editor from the cell button", () => {
    renderGrid();

    fireEvent.click(screen.getByRole("button", { name: "准备发布" }));

    const editor = screen.getByRole("textbox", {
      name: "准备发布 · 标题",
    });
    expect(editor).toHaveValue("准备发布");
    expect(editor).toHaveAttribute(
      "name",
      "task-record-record-1-field-title",
    );
    expect(editor).toHaveAttribute("autocomplete", "off");
  });
});
